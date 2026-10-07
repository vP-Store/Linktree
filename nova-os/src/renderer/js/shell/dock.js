// Dock: angeheftete und laufende Apps.

import { h, clear, bus } from '../core/dom.js';
import { icon, appIconSvg, fileGlyph, fileKind } from '../core/icons.js';
import { api, fileUrl } from '../core/api.js';
import { openPath } from '../core/open.js';
import { store } from '../core/store.js';
import { listApps, getApp, appIconSpan } from '../core/registry.js';
import { allWindows, activeWindow, activateApp, openApp, windowsOf, focus, setLaunchOrigin } from '../core/wm.js';
import { contextMenu } from '../core/ui.js';
import { toggleStart } from './start.js';
import { getOpenWindows, focusWindow, loadExeIcon, loadAppIcon, launchWinApp, dockPinMenuItem } from '../core/winapps.js';
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
      if (!running) { btn.classList.add('bounce'); setTimeout(() => btn.classList.remove('bounce'), 700); setLaunchOrigin(btn.getBoundingClientRect()); }
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
          dockPinMenuItem(a),
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
  }), h('button.dock-item.dock-stack', {
    title: 'Downloads',
    html: `<span class="app-icon">${appIconSvg('download', '#22d3ee', '#2563eb')}</span><span class="dock-tip">Downloads</span>`,
    onclick: (e) => toggleStack(e.currentTarget),
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
  closeStack();
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

// ---------- Downloads-Stapel: neueste Dateien fächern sich als 3D-Bogen auf ----------
let stack = null;
function closeStack() { if (stack) { const s = stack; stack = null; dock.classList.remove('stack-open'); s.classList.add('out'); setTimeout(() => s.remove(), 220); } }
let stackToken = 0;
async function toggleStack(btn) {
  if (stack || stackToken) { stackToken = 0; return closeStack(); }
  closeWinList();
  const token = stackToken = Date.now(); // schneller Doppelklick: nur ein Fächer
  let dir = '', files = [];
  try {
    const places = await api.fs.places();
    dir = places.downloads || places.home;
    files = (await api.fs.list(dir)).filter((f) => !f.dir).sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  } catch (_) { /* Ordner fehlt */ }
  if (token !== stackToken) return;
  stackToken = 0;
  const r = btn.getBoundingClientRect();
  const el = h('div.stack-fan', { style: { left: r.left + r.width / 2 + 'px', bottom: innerHeight - r.top + 8 + 'px' } });
  const items = [
    ...files.map((f) => ({ label: f.name, f })),
    { label: 'Im Ordner öffnen', folder: true },
  ];
  items.forEach((it, i) => {
    let ico;
    if (it.folder) ico = `<span class="app-icon">${appIconSvg('folder', '#60a5fa', '#2563eb')}</span>`;
    else if (fileKind(it.f.ext) === 'image' && fileUrl(it.f.path)) ico = `<img class="stack-thumb" alt="" src="${esc(fileUrl(it.f.path))}">`;
    else ico = fileGlyph(it.f.ext);
    // Bogen: je höher, desto weiter nach rechts und stärker gedreht
    const y = -(i * 60) - 14, x = i * i * 2.2, rot = i * 2.4;
    const b = h('button.stack-item', {
      style: { '--x': x + 'px', '--y': y + 'px', '--rot': rot + 'deg', animationDelay: i * 28 + 'ms', zIndex: String(50 - i) },
      title: it.folder ? dir : it.f.path,
      html: `<span class="stack-label">${esc(it.label)}</span>${ico}`,
      onclick: () => { closeStack(); it.folder ? openApp('files', { path: dir }) : openPath(it.f.path); },
    });
    el.append(b);
  });
  if (!files.length) el.prepend(h('div.stack-empty.glass', 'Noch keine Downloads'));
  document.getElementById('os').append(el);
  dock.classList.add('stack-open');
  stack = el;
}
addEventListener('pointerdown', (e) => { if (stack && !stack.contains(e.target) && !e.target.closest('.dock-stack')) closeStack(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStack(); });

function launcherIcon() {
  return `<svg viewBox="0 0 64 64"><defs><linearGradient id="dl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-2)"/></linearGradient></defs>
    <path d="M32 2c17 0 23.5 0 26.8 3.2S62 15 62 32s0 23.5-3.2 26.8S49 62 32 62s-23.5 0-26.8-3.2S2 49 2 32 2 8.5 5.2 5.2 15 2 32 2Z" fill="url(#dl)"/>
    ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${17 + c * 11}" y="${17 + r * 11}" width="8" height="8" rx="2.5" fill="#fff" opacity="${0.95 - (r + c) * 0.08}"/>`).join('')).join('')}
  </svg>`;
}

export { listApps };
