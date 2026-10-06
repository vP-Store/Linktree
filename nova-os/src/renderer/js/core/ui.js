// Gemeinsame UI-Bausteine: Kontextmenü, Dialoge, Toasts, Mitteilungen.

import { h, clear, bus, esc } from './dom.js';
import { icon, appIconSvg } from './icons.js';
import { store } from './store.js';

// ---------------------------------------------------------------------------
// Kontextmenü
// ---------------------------------------------------------------------------
let ctxEl = null;

export function closeContextMenu() {
  if (ctxEl) { ctxEl.remove(); ctxEl = null; }
}

/**
 * items: [{ label, icon, key, danger, disabled, action }, '-', { label: 'Gruppe', header: true }]
 */
export function contextMenu(x, y, items) {
  closeContextMenu();
  const root = document.getElementById('ctx-root');
  const menu = h('div.ctx.glass', { role: 'menu' });
  for (const it of items.filter(Boolean)) {
    if (it === '-') { menu.append(h('div.ctx-sep')); continue; }
    if (it.header) { menu.append(h('div.ctx-label', it.label)); continue; }
    const btn = h('button.ctx-item', {
      class: it.danger ? 'danger' : '', disabled: !!it.disabled, role: 'menuitem',
      html: `${icon(it.icon || 'circle')}<span>${esc(it.label)}</span>${it.key ? `<span class="ctx-key">${esc(it.key)}</span>` : ''}`,
      onclick: (e) => { e.stopPropagation(); closeContextMenu(); it.action && it.action(); },
    });
    if (!it.icon) btn.querySelector('.icon').style.visibility = 'hidden';
    menu.append(btn);
  }
  root.append(menu);
  ctxEl = menu;
  const r = menu.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;
  menu.style.left = Math.min(x, vw - r.width - 8) + 'px';
  menu.style.top = (y + r.height > vh - 8 ? Math.max(8, y - r.height) : y) + 'px';
  return menu;
}

addEventListener('pointerdown', (e) => { if (ctxEl && !ctxEl.contains(e.target)) closeContextMenu(); }, true);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeContextMenu(); });
addEventListener('blur', closeContextMenu);

// ---------------------------------------------------------------------------
// Dialoge
// ---------------------------------------------------------------------------
function modal(build) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const scrim = h('div.modal-scrim');
    const box = h('div.modal.glass', { role: 'dialog' });
    const done = (v) => { scrim.remove(); resolve(v); };
    build(box, done);
    scrim.append(box);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) done(null); });
    scrim.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null); }
    });
    root.append(scrim);
    setTimeout(() => (box.querySelector('input, textarea, .btn.primary') || box).focus(), 30);
  });
}

export function promptDialog({ title, message = '', value = '', placeholder = '', ok = 'OK', select = true }) {
  return modal((box, done) => {
    const input = h('input.input', { value, placeholder, spellcheck: false });
    const submit = () => done(input.value.trim() || null);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    box.append(
      h('h3', title),
      message ? h('p', message) : null,
      input,
      h('div.actions', h('button.btn', { onclick: () => done(null) }, 'Abbrechen'), h('button.btn.primary', { onclick: submit }, ok)),
    );
    if (select) setTimeout(() => {
      const dot = value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : value.length);
    }, 40);
  });
}

export function confirmDialog({ title, message = '', ok = 'OK', danger = false }) {
  return modal((box, done) => {
    box.append(
      h('h3', title),
      message ? h('p', message) : null,
      h('div.actions',
        h('button.btn', { onclick: () => done(false) }, 'Abbrechen'),
        h('button.btn' + (danger ? '.danger' : '.primary'), { onclick: () => done(true) }, ok)),
    );
  }).then((v) => !!v);
}

export function alertDialog({ title, message = '' }) {
  return modal((box, done) => {
    box.append(h('h3', title), message ? h('p', message) : null, h('div.actions', h('button.btn.primary', { onclick: () => done(true) }, 'OK')));
  });
}

// ---------------------------------------------------------------------------
// Toasts & Mitteilungszentrale
// ---------------------------------------------------------------------------
const KIND = {
  info: ['info', '#60a5fa', '#2563eb'],
  ok: ['check', '#34d399', '#059669'],
  warn: ['alert', '#fbbf24', '#d97706'],
  error: ['x', '#f87171', '#dc2626'],
};

let notifications = null;
function loadNotifs() {
  if (!notifications) notifications = store.get('notifications', []) || [];
  return notifications;
}

export function getNotifications() { return loadNotifs(); }

export function clearNotifications() {
  notifications = [];
  store.set('notifications', notifications);
  bus.emit('notifications');
}

export function dismissNotification(id) {
  notifications = loadNotifs().filter((n) => n.id !== id);
  store.set('notifications', notifications);
  bus.emit('notifications');
}

function iconFor(opts) {
  if (opts.appIcon) return opts.appIcon;
  const [g, a, b] = KIND[opts.kind || 'info'] || KIND.info;
  return `<span class="app-icon">${appIconSvg(opts.icon || g, a, b)}</span>`;
}

/**
 * Kurz eingeblendete Meldung. notify(...) speichert zusätzlich in der Mitteilungszentrale.
 */
export function toast(title, text = '', opts = {}) {
  if (store.get('dnd') && !opts.force) return;
  const root = document.getElementById('toasts');
  const el = h('div.toast.glass', {
    html: `<div class="n-ico">${iconFor(opts)}</div><div class="grow"><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`,
    onclick: () => { opts.onClick && opts.onClick(); dismiss(); },
  });
  root.append(el);
  while (root.children.length > 4) root.firstChild.remove();
  const dismiss = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  setTimeout(dismiss, opts.duration || 4200);
}

export function notify(title, text = '', opts = {}) {
  const list = loadNotifs();
  const n = { id: Date.now() + Math.random(), title, text, kind: opts.kind || 'info', icon: opts.icon, app: opts.app || 'NovaOS', time: Date.now() };
  list.unshift(n);
  if (list.length > 60) list.length = 60;
  store.set('notifications', list);
  bus.emit('notifications');
  toast(title, text, opts);
  return n;
}

export function notifIconHtml(n) { return iconFor(n); }

/** Fehler freundlich anzeigen */
export function showError(err, title = 'Etwas ist schiefgelaufen') {
  const msg = String((err && err.message) || err || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  toast(title, msg, { kind: 'error', force: true, duration: 6000 });
  console.error(err);
}

export { clear };
