// Statusleiste oben + Popover (Schnelleinstellungen, Mitteilungen, Kalender).

import { h, clear, bus, pad, rate, timeAgo, esc } from '../core/dom.js';
import { icon, logoSvg } from '../core/icons.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { activeWindow, switchWorkspace, getWorkspace, allWindows, openApp } from '../core/wm.js';
import { getNotifications, clearNotifications, dismissNotification, notifIconHtml, contextMenu, confirmDialog } from '../core/ui.js';
import { ACCENTS, WALLPAPERS } from './theme.js';
import { toggleStart } from './start.js';
import { openPalette } from './palette.js';
import { sysInfo, overlayHide } from './state.js';

let bar, appNameEl, clockEl, cpuEl, memEl, netEl, batEl, bellEl, wsEl;
let openPop = null; // { name, el, btn }

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function initTopbar() {
  bar = document.getElementById('topbar');
  const item = (cls, html, title, onclick) => h('button.tb-item' + cls, { html, title, onclick });

  const logo = item('.tb-logo', `${logoSvg(18)}<span>Nova</span>`, 'Startmenü (Strg+Leertaste)', () => toggleStart());
  appNameEl = h('span.tb-item.tb-app-name.ellipsis', 'Schreibtisch');
  wsEl = h('div.ws-dots');

  clockEl = item('.tb-clock', '', 'Kalender & Termine', (e) => togglePop('cal', e.currentTarget));

  cpuEl = item('.tb-meter', '', 'Prozessor – klicken für Systemmonitor', () => openApp('monitor'));
  memEl = item('.tb-meter', '', 'Arbeitsspeicher – klicken für Systemmonitor', () => openApp('monitor'));
  netEl = item('.tb-meter', '', 'Netzwerk');
  batEl = item('.tb-meter.hidden', '', 'Akku');
  const search = item('', icon('search'), 'Suchen (Strg+K)', () => openPalette());
  const clip = item('', icon('clipboard'), 'Zwischenablage', () => openApp('clipboard'));
  bellEl = item('.tb-dot', icon('bell'), 'Mitteilungen', (e) => togglePop('nc', e.currentTarget));
  const qs = item('', icon('sliders'), 'Schnelleinstellungen', (e) => togglePop('qs', e.currentTarget));
  const hide = item('', icon('eyeOff'), 'NovaOS ausblenden (Alt+Leertaste)', () => overlayHide());
  const power = item('', icon('power'), 'Energie', (e) => powerMenu(e.currentTarget));

  bar.append(
    h('div.tb-section.tb-left', logo, h('div.tb-sep'), appNameEl, wsEl),
    h('div.tb-section.tb-center', clockEl),
    h('div.tb-section.tb-right', cpuEl, memEl, netEl, batEl, h('div.tb-sep'), search, clip, bellEl, qs, hide, power),
  );

  bus.on('wm:focus', (w) => { appNameEl.textContent = w ? w.title : 'Schreibtisch'; });
  bus.on('wm:change', () => { const w = activeWindow(); appNameEl.textContent = w ? w.title : 'Schreibtisch'; renderWs(); });
  bus.on('notifications', updateBell);
  store.on('showMeters', updateMeterVisibility);
  store.on('workspaces', renderWs);

  renderWs();
  updateBell();
  updateMeterVisibility();
  tickClock();
  setInterval(tickClock, 1000);
  pollStats();
  setInterval(pollStats, 2000);
  initBattery();

  addEventListener('pointerdown', (e) => {
    if (openPop && !openPop.el.contains(e.target) && !openPop.btn.contains(e.target)) closePop();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPop) closePop(); });
}

function renderWs() {
  clear(wsEl);
  const n = store.get('workspaces');
  if (n <= 1) return;
  const used = new Set(allWindows().map((w) => w.ws));
  for (let i = 0; i < n; i++) {
    wsEl.append(h('button.ws-dot', {
      class: (i === getWorkspace() ? 'on ' : '') + (used.has(i) ? 'has-win' : ''),
      title: `Arbeitsfläche ${i + 1} (Alt+${i + 1})`,
      onclick: () => switchWorkspace(i),
    }, String(i + 1)));
  }
}

function tickClock() {
  const d = new Date();
  const h24 = store.get('clock24');
  let hh = d.getHours();
  let suffix = '';
  if (!h24) { suffix = hh >= 12 ? ' PM' : ' AM'; hh = hh % 12 || 12; }
  const time = `${pad(hh)}:${pad(d.getMinutes())}${store.get('showSeconds') ? ':' + pad(d.getSeconds()) : ''}${suffix}`;
  clockEl.innerHTML = `<span class="date">${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}.</span><span>${time}</span>`;
}

function meterHtml(ic, pct, label) {
  const cls = pct > 90 ? 'hot' : pct > 75 ? 'warn' : '';
  return `${icon(ic)}<span class="mini-bar ${cls}"><i style="width:${Math.round(pct)}%"></i></span><span>${label}</span>`;
}

async function pollStats() {
  if (document.body.classList.contains('overlay-hidden')) return;
  try {
    const s = await api.sys.stats();
    bus.emit('sys:stats', s);
    if (!store.get('showMeters')) return;
    cpuEl.innerHTML = meterHtml('cpu', s.cpu, Math.round(s.cpu) + '%');
    const used = (s.totalmem - s.freemem) / s.totalmem * 100;
    memEl.innerHTML = meterHtml('memory', used, Math.round(used) + '%');
  } catch (_) {}
  try {
    const n = await api.sys.net();
    bus.emit('sys:net', n);
    if (!store.get('showMeters')) return;
    const online = navigator.onLine;
    netEl.innerHTML = `${icon(online ? 'wifi' : 'wifiOff')}${n.rate ? `<span>↓ ${rate(n.rate.down)}</span>` : ''}`;
    netEl.title = online ? `Online${n.ifaces[0] ? ' · ' + n.ifaces.map((i) => `${i.name}: ${i.address}`).join(', ') : ''}` : 'Offline';
  } catch (_) {}
}

function updateMeterVisibility() {
  const on = store.get('showMeters');
  [cpuEl, memEl, netEl].forEach((el) => el.classList.toggle('hidden', !on));
}

async function initBattery() {
  if (!navigator.getBattery) return;
  try {
    const b = await navigator.getBattery();
    const upd = () => {
      // Desktop-PCs melden 100 % + lädt + unendlich → ausblenden
      const isDesktop = b.charging && b.level === 1 && b.dischargingTime === Infinity && b.chargingTime === 0;
      batEl.classList.toggle('hidden', isDesktop);
      const pct = Math.round(b.level * 100);
      batEl.innerHTML = `${icon(b.charging ? 'batteryCharging' : 'battery')}<span>${pct}%</span>`;
      batEl.title = `Akku ${pct}%${b.charging ? ' – lädt' : ''}`;
    };
    ['levelchange', 'chargingchange', 'dischargingtimechange'].forEach((ev) => b.addEventListener(ev, upd));
    upd();
  } catch (_) {}
}

function updateBell() {
  const n = getNotifications().length;
  bellEl.dataset.count = n > 9 ? '9+' : String(n);
  bellEl.innerHTML = icon(store.get('dnd') ? 'bellOff' : 'bell');
  if (openPop && openPop.name === 'nc') renderNc(openPop.el);
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------
export function closePop() {
  if (!openPop) return;
  openPop.btn.classList.remove('open');
  openPop.el.remove();
  openPop = null;
}

export function togglePop(name, btn) {
  if (openPop && openPop.name === name) return closePop();
  closePop();
  const el = h('div.popover.glass.layer-popover.' + name);
  if (name === 'qs') renderQs(el);
  if (name === 'nc') renderNc(el);
  if (name === 'cal') { el.classList.add('calpop'); renderCal(el); }
  document.getElementById('os').append(el);
  btn.classList.add('open');
  openPop = { name, el, btn };
}

function tile(ic, title, sub, on, onclick) {
  return h('button.qs-tile', { class: on ? 'on' : '', onclick },
    h('span.ic', { html: icon(ic) }), h('span', h('b', title), h('small', sub)));
}

function slider(ic, value, min, max, oninput, title) {
  const r = h('input.range', { type: 'range', min, max, value, title });
  const upd = () => r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%');
  r.addEventListener('input', () => { upd(); oninput(+r.value); });
  upd();
  return h('div.qs-slider', { html: icon(ic) }, r);
}

function renderQs(el) {
  clear(el);
  const dark = document.documentElement.dataset.theme === 'dark';
  const re = () => renderQs(el);
  const grid = h('div.qs-grid',
    tile(dark ? 'moon' : 'sun', dark ? 'Dunkel' : 'Hell', 'Erscheinungsbild', true, () => { store.set('theme', dark ? 'light' : 'dark'); re(); }),
    tile('bellOff', 'Nicht stören', store.get('dnd') ? 'An' : 'Aus', store.get('dnd'), () => { store.set('dnd', !store.get('dnd')); updateBell(); re(); }),
    tile('focus', 'Fokus-Modus', store.get('focusMode') ? 'Widgets aus' : 'Aus', store.get('focusMode'), () => { store.set('focusMode', !store.get('focusMode')); re(); }),
    tile('sparkles', 'Animation', store.get('animatedWallpaper') ? 'Wallpaper bewegt' : 'Statisch', store.get('animatedWallpaper'), () => { store.set('animatedWallpaper', !store.get('animatedWallpaper')); re(); }),
    tile('grid', 'Widgets', store.get('showWidgets') ? 'Sichtbar' : 'Versteckt', store.get('showWidgets'), () => { store.set('showWidgets', !store.get('showWidgets')); re(); }),
    tile('dock', 'Dock', store.get('dockAutohide') ? 'Automatisch' : 'Immer', store.get('dockAutohide'), () => { store.set('dockAutohide', !store.get('dockAutohide')); re(); }),
  );
  const accents = h('div.accent-row', ACCENTS.map((a) => h('button.accent-swatch', {
    title: a.name, class: store.get('accent') === a.color ? 'on' : '', style: { background: `linear-gradient(135deg, ${a.color}, ${a.alt})` },
    onclick: () => { store.set('accent', a.color); re(); },
  })));
  const wps = h('div.accent-row', Object.entries(WALLPAPERS).map(([k, w]) => h('button.accent-swatch', {
    title: w.name, class: store.get('wallpaper') === k ? 'on' : '',
    style: { background: w.see ? 'repeating-conic-gradient(#666 0 25%, #333 0 50%) 0 0/8px 8px' : (w.blobs[0] ? `radial-gradient(circle at 30% 30%, ${w.blobs[0][0]}, transparent 70%), ${w.bg}` : w.bg) },
    onclick: () => { store.set('wallpaper', k); re(); },
  })));
  const info = sysInfo();
  const name = store.get('userName') || (info && info.user) || 'Nova';
  el.append(
    grid,
    h('div.section-title', 'Sichtbarkeit des Hintergrunds'),
    slider('eye', store.get('overlayOpacity'), 0, 100, (v) => store.set('overlayOpacity', v), 'Deckkraft – bei 0 siehst du Windows dahinter'),
    h('div.section-title', 'Akzentfarbe'),
    accents,
    h('div.section-title', 'Hintergrund'),
    wps,
    h('div.qs-foot',
      h('div.avatar', name.slice(0, 1).toUpperCase()),
      h('div.grow', h('b', name), h('div.faint', { style: { fontSize: '11.5px' } }, info ? info.hostname : '')),
      h('button.icon-btn', { title: 'Einstellungen', html: icon('settings'), onclick: () => { closePop(); openApp('settings'); } }),
      h('button.icon-btn', { title: 'Energie', html: icon('power'), onclick: (e) => powerMenu(e.currentTarget) }),
    ),
  );
}

function renderNc(el) {
  clear(el);
  const list = getNotifications();
  el.append(h('div.nc-head',
    h('h3', 'Mitteilungen'),
    h('div.row',
      h('button.btn.sm.ghost', { onclick: () => { store.set('dnd', !store.get('dnd')); updateBell(); renderNc(el); }, html: `${icon(store.get('dnd') ? 'bellOff' : 'bell')} ${store.get('dnd') ? 'Nicht stören an' : 'Nicht stören'}` }),
      list.length ? h('button.btn.sm', { onclick: () => clearNotifications() }, 'Alle löschen') : null)));
  if (!list.length) {
    el.append(h('div.empty', { html: `${icon('inbox')}<b>Alles erledigt</b><span>Keine neuen Mitteilungen</span>` }));
    return;
  }
  for (const n of list) {
    el.append(h('div.notif', {
      html: `<div class="n-ico">${notifIconHtml(n)}</div><div class="n-body"><div class="n-title">${esc(n.title)}<time>${timeAgo(n.time)}</time></div>${n.text ? `<div class="n-text">${esc(n.text)}</div>` : ''}</div>`,
    }, h('button.icon-btn.sm.n-x', { html: icon('x'), title: 'Entfernen', onclick: () => dismissNotification(n.id) })));
  }
}

function renderCal(el) {
  let view = new Date();
  view.setDate(1);
  const draw = () => {
    clear(el);
    const today = new Date();
    const events = store.get('calendarEvents', []) || [];
    const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const evDays = new Set(events.map((e) => e.date));
    const big = h('div', { style: { padding: '4px 4px 12px' } },
      h('div', { style: { font: '300 34px var(--font-display)' } }, `${pad(today.getHours())}:${pad(today.getMinutes())}`),
      h('div.muted', `${['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][today.getDay()]}, ${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`));
    const head = h('div.row', { style: { marginBottom: '8px' } },
      h('b.grow', `${MONTHS[view.getMonth()]} ${view.getFullYear()}`),
      h('button.icon-btn.sm', { html: icon('chevronLeft'), onclick: () => { view.setMonth(view.getMonth() - 1); draw(); } }),
      h('button.icon-btn.sm', { html: icon('chevronRight'), onclick: () => { view.setMonth(view.getMonth() + 1); draw(); } }));
    const grid = h('div.mini-cal');
    ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach((d) => grid.append(h('div.dow', d)));
    const start = new Date(view);
    start.setDate(1 - ((view.getDay() + 6) % 7));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const isToday = key(d) === key(today);
      grid.append(h('div.d', {
        class: (d.getMonth() !== view.getMonth() ? 'other ' : '') + (isToday ? 'today' : ''),
        style: { position: 'relative', fontWeight: evDays.has(key(d)) ? '700' : '' },
        title: evDays.has(key(d)) ? events.filter((e) => e.date === key(d)).map((e) => e.title).join(', ') : '',
      }, String(d.getDate()), evDays.has(key(d)) && !isToday ? h('i', { style: { position: 'absolute', bottom: '2px', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)' } }) : null));
    }
    const upcoming = events.filter((e) => e.date >= key(today)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 4);
    const evList = h('div.col', { style: { marginTop: '12px', gap: '6px' } },
      h('div.section-title', 'Demnächst'),
      upcoming.length ? upcoming.map((e) => h('div.row', { style: { fontSize: '12.5px' } },
        h('i', { style: { width: '4px', height: '28px', borderRadius: '3px', background: e.color || 'var(--accent)', flex: 'none' } }),
        h('div.grow', h('div.ellipsis', { style: { fontWeight: 600 } }, e.title), h('div.faint', `${new Date(e.date + 'T00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}${e.time ? ' · ' + e.time : ''}`)))) : h('div.faint', { style: { fontSize: '12.5px' } }, 'Keine Termine geplant.'),
      h('button.btn.sm', { style: { marginTop: '6px' }, onclick: () => { closePop(); openApp('calendar'); }, html: `${icon('calendar')} Kalender öffnen` }));
    el.append(big, h('div.w-cal', head, grid), evList);
  };
  draw();
}

export function powerMenu(btn) {
  const r = btn.getBoundingClientRect();
  const act = async (a, label, danger) => {
    if (danger && !(await confirmDialog({ title: label + '?', message: 'Nicht gespeicherte Arbeit in anderen Programmen kann verloren gehen.', ok: label, danger: true }))) return;
    try { await api.power.action(a); } catch (e) { (await import('../core/ui.js')).showError(e); }
  };
  contextMenu(r.right - 220, r.bottom + 6, [
    { label: 'NovaOS ausblenden', icon: 'eyeOff', key: 'Alt+Leer', action: () => overlayHide() },
    { label: 'NovaOS neu laden', icon: 'refresh', action: () => api.overlay.reload() },
    '-',
    { label: 'Sperren', icon: 'lock', action: () => act('lock') },
    { label: 'Energie sparen', icon: 'moon', action: () => act('sleep') },
    { label: 'Abmelden', icon: 'logOut', action: () => act('logoff', 'Abmelden', true) },
    { label: 'Neu starten', icon: 'refresh', action: () => act('restart', 'Neu starten', true) },
    { label: 'Herunterfahren', icon: 'power', danger: true, action: () => act('shutdown', 'Herunterfahren', true) },
    '-',
    { label: 'NovaOS beenden', icon: 'x', action: () => act('quit') },
  ]);
}
