// Dock: angeheftete und laufende Apps.

import { h, clear, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { listApps, getApp, appIconSpan } from '../core/registry.js';
import { allWindows, activeWindow, activateApp, openApp, windowsOf, focus } from '../core/wm.js';
import { contextMenu } from '../core/ui.js';
import { toggleStart } from './start.js';
import { getOpenWindows, focusWindow, loadExeIcon, loadAppIcon, launchWinApp } from '../core/winapps.js';
import { esc, isoDate } from '../core/dom.js';
import { getTasks } from '../core/tasks.js';
import { getNotifications } from '../core/ui.js';

let dock, wrap;
let lastDay = new Date().getDate();

export function initDock() {
  wrap = document.getElementById('dock-wrap');
  dock = document.getElementById('dock');
  render();
  bus.on('wm:change', render);
  store.on('dockPinned', render);
  store.on('dockWinApps', render);
  bus.on('tasks', render);
  // Kalender-Icon um Mitternacht aktualisieren
  setInterval(() => { const d = new Date().getDate(); if (d !== lastDay) { lastDay = d; render(); } }, 60000);
  store.on('dockAutohide', applyAutohide);
  applyAutohide();

  // Auto-Ausblenden: unten anstoßen zeigt das Dock
  const hot = document.getElementById('dock-hot');
  let hideT;
  const show = () => { clearTimeout(hideT); wrap.classList.remove('tucked'); };
  const hideLater = () => { if (!store.get('dockAutohide')) return; clearTimeout(hideT); hideT = setTimeout(() => wrap.classList.add('tucked'), 600); };
  hot.addEventListener('pointerenter', show);
  dock.addEventListener('pointerenter', show);
  dock.addEventListener('pointerleave', hideLater);
}

function applyAutohide() {
  const on = store.get('dockAutohide');
  wrap.classList.toggle('autohide', on);
  wrap.classList.toggle('tucked', on);
  document.getElementById('dock-hot').classList.toggle('hidden', !on);
}

function badgeFor(id) {
  if (id === 'tasks') { const n = getTasks().filter((t) => !t.done && t.due && t.due <= isoDate()).length; return n || null; }
  if (id === 'clipboard') return null;
  return null;
}

function item(app, { running, active }) {
  const badge = badgeFor(app.id);
  const btn = h('button.dock-item', {
    class: (running ? 'running ' : '') + (active ? 'active' : ''),
    dataset: { app: app.id },
    html: `${appIconSpan(app)}<span class="run-dot"></span><span class="dock-tip">${app.name}</span>${badge ? `<span class="dock-badge">${badge > 99 ? '99+' : badge}</span>` : ''}`,
    onclick: () => {
      if (!running) { btn.classList.add('bounce'); setTimeout(() => btn.classList.remove('bounce'), 700); }
      activateApp(app.id);
    },
    oncontextmenu: (e) => { e.preventDefault(); menu(app, e.clientX, e.clientY); },
  });
  return btn;
}

function menu(app, x, y) {
  const pinned = store.get('dockPinned');
  const isPinned = pinned.includes(app.id);
  const wins = windowsOf(app.id);
  contextMenu(x, y - 10, [
    wins.length ? { label: 'Fenster', header: true } : null,
    ...wins.map((w) => ({ label: w.title, icon: 'layout', action: () => { w.min && w.unminimize(); focus(w.id); } })),
    wins.length ? '-' : null,
    { label: 'Neues Fenster', icon: 'plus', disabled: app.singleton && wins.length > 0, action: () => openApp(app.id) },
    { label: isPinned ? 'Vom Dock lösen' : 'Im Dock behalten', icon: 'pin', action: () => store.set('dockPinned', isPinned ? pinned.filter((p) => p !== app.id) : [...pinned, app.id]) },
    wins.length ? '-' : null,
    wins.length ? { label: wins.length > 1 ? 'Alle schließen' : 'Schließen', icon: 'x', danger: true, action: () => wins.forEach((w) => w.close()) } : null,
  ]);
}

function render() {
  clear(dock);
  const pinned = store.get('dockPinned').filter((id) => getApp(id));
  const wins = allWindows();
  const runningIds = new Set(wins.map((w) => w.appId));
  const act = activeWindow();

  dock.append(h('button.dock-item', {
    title: 'Alle Apps',
    html: `<span class="app-icon">${launcherIcon()}</span><span class="dock-tip">Alle Apps</span>`,
    onclick: () => toggleStart(),
  }));
  dock.append(h('div.dock-sep'));

  for (const id of pinned) {
    dock.append(item(getApp(id), { running: runningIds.has(id), active: act && act.appId === id }));
  }
  const winPinned = store.get('dockWinApps', []) || [];
  if (winPinned.length) {
    dock.append(h('div.dock-sep'));
    for (const a of winPinned) {
      const ico = h('span.dock-exe');
      loadAppIcon(a, ico);
      const btn = h('button.dock-item.win-app', { title: a.name, onclick: () => { btn.classList.add('bounce'); setTimeout(() => btn.classList.remove('bounce'), 700); launchWinApp(a); } },
        ico, h('span.dock-tip', a.name));
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenu(e.clientX, e.clientY - 10, [
          { label: 'Starten', icon: 'rocket', action: () => launchWinApp(a) },
          { label: 'Vom Dock lösen', icon: 'pin', action: () => store.set('dockWinApps', (store.get('dockWinApps', []) || []).filter((x) => x.path !== a.path)) },
        ]);
      });
      dock.append(btn);
    }
  }
  const extra = [...runningIds].filter((id) => !pinned.includes(id));
  dock.append(h('div.dock-sep'), h('button.dock-item', {
    title: 'Laufende Windows-Programme',
    html: `<span class="app-icon">${winIcon()}</span><span class="dock-tip">Windows-Programme</span>`,
    onclick: (e) => toggleWinList(e.currentTarget),
  }));
  if (extra.length) {
    dock.append(h('div.dock-sep'));
    for (const id of extra) dock.append(item(getApp(id), { running: true, active: act && act.appId === id }));
  }
}

function winIcon() {
  return `<svg viewBox="0 0 64 64"><defs><linearGradient id="dw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
    <path d="M32 2c17 0 23.5 0 26.8 3.2S62 15 62 32s0 23.5-3.2 26.8S49 62 32 62s-23.5 0-26.8-3.2S2 49 2 32 2 8.5 5.2 5.2 15 2 32 2Z" fill="url(#dw)"/>
    <rect x="17" y="17" width="14" height="14" rx="2" fill="#fff"/><rect x="33" y="17" width="14" height="14" rx="2" fill="#fff" opacity=".85"/>
    <rect x="17" y="33" width="14" height="14" rx="2" fill="#fff" opacity=".85"/><rect x="33" y="33" width="14" height="14" rx="2" fill="#fff" opacity=".7"/></svg>`;
}

let winPop = null;
function closeWinList() { if (winPop) { winPop.remove(); winPop = null; dock.classList.remove('pop-open'); } }
async function toggleWinList(btn) {
  if (winPop) return closeWinList();
  const r = btn.getBoundingClientRect();
  winPop = h('div.glass.dock-pop', { style: { left: Math.max(10, r.left + r.width / 2 - 170) + 'px', bottom: innerHeight - r.top + 14 + 'px' } },
    h('div.section-title', 'Geöffnet in Windows'), h('div.empty', h('div.spinner')));
  document.getElementById('os').append(winPop);
  dock.classList.add('pop-open');
  const pop = winPop;
  const list = await getOpenWindows();
  if (pop !== winPop) return;
  pop.lastChild.remove();
  if (!list.length) { pop.append(h('div.faint', { style: { fontSize: '12.5px', padding: '6px 4px' } }, 'Keine Programmfenster geöffnet.')); return; }
  for (const w of list) {
    const ico = h('span');
    loadExeIcon(w, ico);
    pop.append(h('button.list-row', { title: w.title, onclick: () => { closeWinList(); focusWindow(w); } }, ico,
      h('div.meta', h('b', w.title), h('small', w.name))));
  }
}
addEventListener('pointerdown', (e) => { if (winPop && !winPop.contains(e.target) && !e.target.closest('.dock-item')) closeWinList(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWinList(); });

function launcherIcon() {
  return `<svg viewBox="0 0 64 64"><defs><linearGradient id="dl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-2)"/></linearGradient></defs>
    <path d="M32 2c17 0 23.5 0 26.8 3.2S62 15 62 32s0 23.5-3.2 26.8S49 62 32 62s-23.5 0-26.8-3.2S2 49 2 32 2 8.5 5.2 5.2 15 2 32 2Z" fill="url(#dl)"/>
    ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${17 + c * 11}" y="${17 + r * 11}" width="8" height="8" rx="2.5" fill="#fff" opacity="${0.95 - (r + c) * 0.08}"/>`).join('')).join('')}
  </svg>`;
}

export { listApps };
