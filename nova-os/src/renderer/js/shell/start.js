// Startmenü: Nova-Apps, installierte Programme, zuletzt verwendet – mit Suche.

import { h, clear, esc } from '../core/dom.js';
import { icon, fileGlyph } from '../core/icons.js';
import { store } from '../core/store.js';
import { listApps, appIconSpan } from '../core/registry.js';
import { openApp } from '../core/wm.js';
import { getWinApps, loadAppIcon, launchWinApp, recentFiles } from '../core/winapps.js';
import { openPath } from '../core/open.js';
import { sysInfo } from './state.js';
import { powerMenu } from './topbar.js';

let wrap, input, body, tabsEl;
let tab = 'nova';
let kbIndex = 0;
let items = []; // aktuell sichtbare, ausführbare Einträge

export function initStart() {
  wrap = document.getElementById('start-wrap');
  wrap.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('scrim')) closeStart(); });
}

export function isStartOpen() { return wrap && wrap.classList.contains('open'); }

export function toggleStart() { isStartOpen() ? closeStart() : openStart(); }

export function closeStart() {
  if (!wrap) return;
  wrap.classList.remove('open');
  clear(wrap);
}

export function openStart(initialTab) {
  if (initialTab) tab = initialTab;
  clear(wrap);
  input = h('input.input', { placeholder: 'Apps, Programme und Dateien durchsuchen …', spellcheck: false });
  input.addEventListener('input', () => { kbIndex = 0; render(); });
  input.addEventListener('keydown', onKey);
  tabsEl = h('div.start-tabs');
  body = h('div.start-body');

  const info = sysInfo();
  const name = store.get('userName') || (info && info.user) || 'Nova';
  const panel = h('div#start.glass',
    h('div.start-top', h('div.search-field', { html: icon('search') }, input)),
    tabsEl,
    body,
    h('div.start-foot',
      h('div.avatar', name.slice(0, 1).toUpperCase()),
      h('div.user.grow', h('b', name), h('small', info ? `${info.hostname} · ${info.cpuModel}` : '')),
      h('button.icon-btn', { title: 'Dateien', html: icon('folder'), onclick: () => { closeStart(); openApp('files'); } }),
      h('button.icon-btn', { title: 'Einstellungen', html: icon('settings'), onclick: () => { closeStart(); openApp('settings'); } }),
      h('button.icon-btn', { title: 'Energie', html: icon('power'), onclick: (e) => powerMenu(e.currentTarget) }),
    ),
  );
  wrap.append(h('div.scrim'), panel);
  wrap.classList.add('open');
  renderTabs();
  render();
  input.focus();
}

function renderTabs() {
  clear(tabsEl);
  for (const [id, label, ic] of [['nova', 'NovaOS-Apps', 'sparkles'], ['win', 'Programme', 'apps'], ['recent', 'Zuletzt', 'history']]) {
    tabsEl.append(h('button.chip', { class: tab === id ? 'on' : '', html: `${icon(ic)} ${label}`, onclick: () => { tab = id; kbIndex = 0; renderTabs(); render(); input.focus(); } }));
  }
}

function match(q, ...fields) {
  if (!q) return true;
  const hay = fields.join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
}

async function render() {
  const q = input.value.trim();
  clear(body);
  items = [];
  if (q) return renderSearch(q);
  if (tab === 'nova') {
    const grid = h('div.app-grid');
    for (const app of listApps()) grid.append(appTile(app));
    body.append(grid);
  } else if (tab === 'win') {
    body.append(h('div.empty', h('div.spinner')));
    const apps = await getWinApps();
    if (tab !== 'win' || input.value.trim()) return;
    clear(body);
    if (!apps.length) { body.append(h('div.empty', { html: `${icon('apps')}<b>Keine Programme gefunden</b><span>Startmenü-Verknüpfungen konnten nicht gelesen werden.</span>` })); return; }
    let letter = '';
    for (const a of apps) {
      const l = /[a-z]/i.test(a.name[0]) ? a.name[0].toUpperCase() : '#';
      if (l !== letter) { letter = l; body.append(h('div.letter-head', l)); }
      body.append(winRow(a));
    }
  } else if (tab === 'recent') {
    const files = recentFiles();
    if (!files.length) { body.append(h('div.empty', { html: `${icon('history')}<b>Noch nichts geöffnet</b><span>Zuletzt verwendete Dateien erscheinen hier.</span>` })); return; }
    for (const f of files) body.append(fileRow(f));
  }
  highlight();
}

async function renderSearch(q) {
  const nova = listApps().filter((a) => match(q, a.name, a.desc, a.keywords));
  if (nova.length) {
    body.append(h('div.section-title', { style: { margin: '6px 0 6px' } }, 'NovaOS-Apps'));
    const grid = h('div.app-grid');
    nova.forEach((a) => grid.append(appTile(a)));
    body.append(grid);
  }
  const files = recentFiles().filter((f) => match(q, f.name));
  const winApps = (await getWinApps()).filter((a) => match(q, a.name, a.folder)).slice(0, 30);
  if (input.value.trim() !== q) return;
  if (winApps.length) {
    body.append(h('div.section-title', { style: { margin: '14px 0 6px' } }, 'Programme'));
    winApps.forEach((a) => body.append(winRow(a)));
  }
  if (files.length) {
    body.append(h('div.section-title', { style: { margin: '14px 0 6px' } }, 'Zuletzt geöffnet'));
    files.slice(0, 8).forEach((f) => body.append(fileRow(f)));
  }
  if (!nova.length && !winApps.length && !files.length) {
    body.append(h('div.empty', { html: `${icon('search')}<b>Keine Treffer für „${esc(q)}“</b><span>Tipp: Strg+K durchsucht auch Dateien und Einstellungen.</span>` }));
  }
  highlight();
}

function register(el, run) {
  items.push({ el, run });
  el.addEventListener('click', run);
  return el;
}

function appTile(app) {
  return register(h('button.app-tile', { html: `${appIconSpan(app)}<span>${esc(app.name)}</span>`, title: app.desc }), () => { closeStart(); openApp(app.id); });
}

function winRow(a) {
  const ico = h('span');
  const row = h('button.list-row', {}, ico, h('div.meta', h('b', a.name), h('small', a.folder)));
  loadAppIcon(a, ico);
  return register(row, () => { closeStart(); launchWinApp(a); });
}

function fileRow(f) {
  const row = h('button.list-row', { html: `${fileGlyph(f.ext)}<div class="meta"><b>${esc(f.name)}</b><small>${esc(f.path)}</small></div>` });
  return register(row, () => { closeStart(); openPath(f.path); });
}

function highlight(force = false) {
  const show = force || !!input.value.trim();
  items.forEach((it, i) => it.el.classList.toggle('kb', show && i === kbIndex));
  const cur = items[kbIndex];
  if (cur && show) cur.el.scrollIntoView({ block: 'nearest' });
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeStart(); return; }
  if (e.key === 'Enter') { e.preventDefault(); const it = items[kbIndex]; if (it) it.run(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); kbIndex = Math.min(items.length - 1, kbIndex + 1); highlight(true); }
  if (e.key === 'ArrowUp') { e.preventDefault(); kbIndex = Math.max(0, kbIndex - 1); highlight(true); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const order = ['nova', 'win', 'recent'];
    tab = order[(order.indexOf(tab) + (e.shiftKey ? 2 : 1)) % 3];
    kbIndex = 0; renderTabs(); render();
  }
}
