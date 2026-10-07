// Gemeinsame UI-Bausteine: Kontextmenü, Dialoge, Toasts, Mitteilungen.

import { play } from './sound.js';
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
    // Esc schließt immer den obersten Dialog – auch wenn der Fokus (noch) woanders liegt
    const onKey = (e) => {
      if (e.key !== 'Escape' || root.lastElementChild !== scrim) return;
      e.preventDefault();
      e.stopPropagation();
      done(null);
    };
    const done = (v) => { removeEventListener('keydown', onKey, true); scrim.remove(); resolve(v); };
    build(box, done);
    scrim.append(box);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) done(null); });
    addEventListener('keydown', onKey, true);
    root.append(scrim);
    box.tabIndex = -1;
    (box.querySelector('input, textarea, .btn.primary') || box).focus();
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

/**
 * Formular-Dialog. fields: [{ name, label, type: 'text'|'date'|'time'|'textarea'|'select'|'color', value, options, placeholder }]
 * Liefert ein Objekt mit den Werten oder null. extra: [{ label, danger, value }] → zusätzliche Knöpfe.
 */
export function formDialog({ title, fields, ok = 'Speichern', extra = [] }) {
  return modal((box, done) => {
    const inputs = {};
    const form = h('div.col', { style: { gap: '12px' } });
    for (const f of fields) {
      let input;
      if (f.type === 'textarea') input = h('textarea.input', { rows: f.rows || 3, value: f.value || '', placeholder: f.placeholder || '' });
      else if (f.type === 'select') input = h('select.input', ...f.options.map((o) => h('option', { value: o.value, selected: o.value === f.value }, o.label)));
      else if (f.type === 'color') {
        input = h('div.accent-row');
        input.value = f.value || f.options[0];
        for (const c of f.options) {
          const b = h('button.accent-swatch', { type: 'button', style: { background: c }, class: c === input.value ? 'on' : '', onclick: () => { input.value = c; input.querySelectorAll('.accent-swatch').forEach((x) => x.classList.toggle('on', x === b)); } });
          input.append(b);
        }
      } else input = h('input.input', { type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', spellcheck: false });
      inputs[f.name] = input;
      if (f.type !== 'textarea' && f.type !== 'color') input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      form.append(h('label.col', { style: { gap: '5px' } }, h('span.faint', { style: { fontSize: '12px', fontWeight: 600 } }, f.label), input));
    }
    const submit = () => {
      const out = {};
      for (const [k, el] of Object.entries(inputs)) out[k] = typeof el.value === 'string' ? el.value.trim() : el.value;
      const req = fields.find((f) => f.required && !out[f.name]);
      if (req) { inputs[req.name].focus(); inputs[req.name].classList.add('invalid'); return; }
      done(out);
    };
    box.append(h('h3', { style: { marginBottom: '14px' } }, title), form,
      h('div.actions',
        ...extra.map((x) => h('button.btn' + (x.danger ? '.danger' : ''), { style: { marginRight: 'auto' }, onclick: () => done({ __action: x.value }) }, x.label)),
        h('button.btn', { onclick: () => done(null) }, 'Abbrechen'),
        h('button.btn.primary', { onclick: submit }, ok)));
  });
}

export function alertDialog({ title, message = '', content = null, className = '' }) {
  return modal((box, done) => {
    if (className) box.classList.add(className);
    box.append(h('h3', title), message ? h('p', message) : null, content, h('div.actions', h('button.btn.primary', { onclick: () => done(true) }, 'OK')));
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
  if (!store.get('dnd')) play(opts.kind === 'error' ? 'error' : 'notify');
  toast(title, text, opts);
  return n;
}

export function notifIconHtml(n) { return iconFor(n); }

/** Fehler freundlich anzeigen */
export function showError(err, title = 'Etwas ist schiefgelaufen') {
  const msg = String((err && err.message) || err || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  play('error');
  toast(title, msg, { kind: 'error', force: true, duration: 6000 });
  console.error(err);
}

export { clear };
