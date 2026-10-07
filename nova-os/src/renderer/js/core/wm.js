// NovaOS Fenstermanager: Öffnen, Fokus, Ziehen, Größe ändern, Einrasten,
// Minimieren/Maximieren, Arbeitsflächen und Sitzungswiederherstellung.

import { h, bus, clamp, debounce } from './dom.js';
import { icon } from './icons.js';
import { store } from './store.js';
import { getApp, appIconHtml } from './registry.js';
import { showError, contextMenu } from './ui.js';

const windows = new Map(); // id → Win
let zTop = 20;
let seq = 0;
let activeId = null;
let currentWs = 0;
let layer, snapPreview;

const SNAP_EDGE = 6;

function area() {
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 36;
  const reserve = store.get('dockAutohide') ? 8 : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-reserve')) || 88);
  return { x: 0, y: top, w: innerWidth, h: innerHeight - top - reserve };
}

function snapRect(zone) {
  const a = area();
  const g = 8; // Abstand beim Einrasten
  const hw = Math.round((a.w - g * 3) / 2), hh = Math.round((a.h - g * 3) / 2);
  switch (zone) {
    case 'max': return { x: a.x, y: a.y, w: a.w, h: a.h };
    case 'left': return { x: a.x + g, y: a.y + g, w: hw, h: a.h - g * 2 };
    case 'right': return { x: a.x + g * 2 + hw, y: a.y + g, w: hw, h: a.h - g * 2 };
    case 'tl': return { x: a.x + g, y: a.y + g, w: hw, h: hh };
    case 'tr': return { x: a.x + g * 2 + hw, y: a.y + g, w: hw, h: hh };
    case 'bl': return { x: a.x + g, y: a.y + g * 2 + hh, w: hw, h: hh };
    case 'br': return { x: a.x + g * 2 + hw, y: a.y + g * 2 + hh, w: hw, h: hh };
    case 'center': {
      const w = Math.min(a.w - 80, Math.round(a.w * 0.62)), hgt = Math.min(a.h - 60, Math.round(a.h * 0.75));
      return { x: Math.round(a.x + (a.w - w) / 2), y: Math.round(a.y + (a.h - hgt) / 2), w, h: hgt };
    }
    default: return null;
  }
}

class Win {
  constructor(app, args) {
    this.id = 'w' + (++seq);
    this.app = app;
    this.appId = app.id;
    this.title = app.name;
    this.ws = currentWs;
    this.max = false;
    this.min = false;
    this.snap = null;
    this.restoreBounds = null;
    this.instance = null;
    this.args = args || {};
    this.build();
  }

  build() {
    const ctrl = (cls, ic, title, fn) => h('button.win-ctrl.' + cls, { title, html: icon(ic), onclick: (e) => { e.stopPropagation(); fn(); } });
    this.titleEl = h('div.win-title', this.title);
    this.tools = h('div.win-tools');
    this.maxBtn = ctrl('max', 'maximize', 'Maximieren (Alt+↑)', () => this.toggleMax());
    this.titlebar = h('div.win-titlebar',
      h('span.app-icon', { html: appIconHtml(this.app, true) }),
      this.titleEl,
      this.tools,
      h('div.win-ctrls',
        ctrl('min', 'minimize', 'Minimieren (Alt+↓)', () => this.minimize()),
        this.maxBtn,
        ctrl('close', 'x', 'Schließen (Alt+Q)', () => this.close())),
    );
    this.body = h('div.win-body');
    this.el = h('div.win', { dataset: { app: this.appId, id: this.id } }, this.titlebar, this.body,
      ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => h('div.rz.' + d, { dataset: { dir: d } })));

    this.el.addEventListener('pointerdown', () => focus(this.id), true);
    this.titlebar.addEventListener('pointerdown', (e) => this.startDrag(e));
    this.titlebar.addEventListener('dblclick', (e) => { if (!e.target.closest('button, input')) this.toggleMax(); });
    this.titlebar.addEventListener('contextmenu', (e) => { e.preventDefault(); this.menu(e.clientX, e.clientY); });
    this.el.querySelectorAll('.rz').forEach((r) => r.addEventListener('pointerdown', (e) => this.startResize(e, r.dataset.dir)));
  }

  menu(x, y) {
    contextMenu(x, y, [
      { label: this.max ? 'Wiederherstellen' : 'Maximieren', icon: this.max ? 'restore' : 'maximize', key: 'Alt+↑', action: () => this.toggleMax() },
      { label: 'Minimieren', icon: 'minimize', key: 'Alt+↓', action: () => this.minimize() },
      '-',
      { label: 'Links einrasten', icon: 'columns', key: 'Alt+←', action: () => this.snapTo('left') },
      { label: 'Rechts einrasten', icon: 'columns', key: 'Alt+→', action: () => this.snapTo('right') },
      { label: 'Zentrieren', icon: 'focus', action: () => this.snapTo('center') },
      '-',
      ...Array.from({ length: store.get('workspaces') }, (_, i) => i)
        .filter((i) => i !== this.ws)
        .map((i) => ({ label: `Auf Arbeitsfläche ${i + 1} verschieben`, icon: 'layers', action: () => moveToWorkspace(this.id, i) })),
      '-',
      { label: 'Schließen', icon: 'x', key: 'Alt+Q', danger: true, action: () => this.close() },
    ]);
  }

  setTitle(t) {
    this.title = t || this.app.name;
    this.titleEl.textContent = this.title;
    bus.emit('wm:change');
  }

  setBounds({ x, y, w, h: hgt }, animate = false) {
    if (animate) {
      this.el.classList.add('anim');
      clearTimeout(this._animT);
      this._animT = setTimeout(() => this.el.classList.remove('anim'), 280);
    }
    this.x = Math.round(x); this.y = Math.round(y); this.w = Math.round(w); this.h = Math.round(hgt);
    Object.assign(this.el.style, { left: this.x + 'px', top: this.y + 'px', width: this.w + 'px', height: this.h + 'px' });
    this.instance && this.instance.onResize && this.instance.onResize();
    saveSession();
  }

  bounds() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  toggleMax() { this.max ? this.restore() : this.maximize(); }

  maximize() {
    if (this.max) return;
    if (!this.snap) this.restoreBounds = this.bounds();
    this.max = true;
    this.snap = 'max';
    this.el.classList.add('max');
    this.maxBtn.innerHTML = icon('restore');
    this.setBounds(snapRect('max'), true);
    bus.emit('wm:change');
  }

  restore() {
    this.max = false;
    this.snap = null;
    this.el.classList.remove('max');
    this.maxBtn.innerHTML = icon('maximize');
    if (this.restoreBounds) this.setBounds(this.restoreBounds, true);
    bus.emit('wm:change');
  }

  snapTo(zone) {
    if (zone === 'max') return this.maximize();
    if (!this.snap) this.restoreBounds = this.bounds();
    this.max = false;
    this.el.classList.remove('max');
    this.maxBtn.innerHTML = icon('maximize');
    this.snap = zone === 'center' ? null : zone;
    this.setBounds(snapRect(zone), true);
  }

  // Ziel für Minimieren: das Dock-Symbol der App (relativ zur Fenstermitte)
  aimAtDock() {
    const item = document.querySelector(`#dock .dock-item[data-app="${CSS.escape(this.appId)}"]`);
    if (!item) { this.el.style.removeProperty('--dx'); this.el.style.removeProperty('--dy'); return; }
    const r = item.getBoundingClientRect();
    this.el.style.setProperty('--dx', Math.round(r.left + r.width / 2 - (this.x + this.w / 2)) + 'px');
    this.el.style.setProperty('--dy', Math.round(r.top + r.height / 2 - (this.y + this.h / 2)) + 'px');
  }

  minimize() {
    if (this.min) return;
    this.min = true;
    this.aimAtDock();
    this.el.classList.add('anim', 'minimizing');
    setTimeout(() => {
      this.el.classList.remove('anim', 'minimizing');
      this.el.classList.add('min');
    }, 230);
    if (activeId === this.id) {
      activeId = null;
      const next = topWindow(this.id);
      if (next) focus(next.id); else bus.emit('wm:focus', null);
    }
    bus.emit('wm:change');
  }

  unminimize() {
    if (!this.min) return;
    this.min = false;
    this.aimAtDock();
    this.el.classList.remove('min');
    this.el.classList.add('minimizing');
    // Reflow erzwingen, dann zurück-animieren
    void this.el.offsetWidth;
    this.el.classList.add('anim');
    this.el.classList.remove('minimizing');
    setTimeout(() => this.el.classList.remove('anim'), 260);
    bus.emit('wm:change');
  }

  async close(force = false) {
    if (!force && this.instance && this.instance.onClose) {
      try {
        const ok = await this.instance.onClose();
        if (ok === false) return false;
      } catch (e) { console.error(e); }
    }
    try { this.instance && this.instance.destroy && this.instance.destroy(); } catch (e) { console.error(e); }
    this.el.classList.add('closing');
    windows.delete(this.id);
    bus.emit('wm:close', this);
    if (activeId === this.id) {
      activeId = null;
      const next = topWindow();
      if (next) focus(next.id); else bus.emit('wm:focus', null);
    }
    setTimeout(() => this.el.remove(), 170);
    bus.emit('wm:change');
    saveSession();
    return true;
  }

  startDrag(e) {
    if (e.button !== 0 || e.target.closest('button, input, select, .no-drag')) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let origin = this.bounds();
    let moved = false;
    let zone = null;
    const a = area();
    // 3D-Neigung beim Ziehen: Fenster kippt leicht in Bewegungsrichtung
    const tiltOn = document.documentElement.dataset.fx3d !== 'false' && document.documentElement.dataset.perf !== 'true';
    let lastX = startX, lastY = startY, lastT = performance.now(), vx = 0, vy = 0, settle = 0;
    const tilt = (rx, ry) => { this.el.style.setProperty('--tilt-x', rx.toFixed(2) + 'deg'); this.el.style.setProperty('--tilt-y', ry.toFixed(2) + 'deg'); };
    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (tiltOn) {
        const now = performance.now(), dt = Math.max(8, now - lastT);
        vx = vx * 0.6 + ((ev.clientX - lastX) / dt) * 0.4;
        vy = vy * 0.6 + ((ev.clientY - lastY) / dt) * 0.4;
        lastX = ev.clientX; lastY = ev.clientY; lastT = now;
        const lim = (v) => Math.max(-9, Math.min(9, v));
        tilt(lim(-vy * 5), lim(vx * 5));
        clearTimeout(settle);
        settle = setTimeout(() => tilt(0, 0), 90);
      }
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        this.el.classList.add('dragging');
        if (this.max || this.snap) {
          // aus maximiert/eingerastet lösen: Fenster unter dem Zeiger wiederherstellen
          const rb = this.restoreBounds || snapRect('center');
          const ratio = (startX - this.x) / this.w;
          this.max = false; this.snap = null;
          this.el.classList.remove('max');
          this.maxBtn.innerHTML = icon('maximize');
          origin = { x: startX - rb.w * ratio, y: this.y, w: rb.w, h: rb.h };
          this.setBounds(origin);
        }
      }
      const nx = origin.x + dx;
      const ny = clamp(origin.y + dy, a.y, innerHeight - 50);
      this.setBounds({ x: nx, y: ny, w: this.w, h: this.h });
      // Einrast-Zone bestimmen
      const cx = ev.clientX, cy = ev.clientY;
      const left = cx <= SNAP_EDGE, right = cx >= innerWidth - SNAP_EDGE - 1;
      const top = cy <= a.y + SNAP_EDGE;
      const nearTop = cy < a.y + a.h * 0.25, nearBottom = cy > a.y + a.h * 0.75;
      zone = null;
      if (left) zone = nearTop ? 'tl' : nearBottom ? 'bl' : 'left';
      else if (right) zone = nearTop ? 'tr' : nearBottom ? 'br' : 'right';
      else if (top) zone = 'max';
      showSnap(zone);
    };
    const onUp = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      clearTimeout(settle);
      tilt(0, 0);
      this.el.classList.remove('dragging');
      showSnap(null);
      if (moved && zone) {
        this.restoreBounds = { ...this.bounds() };
        if (zone === 'max') this.maximize(); else this.snapTo(zone);
      }
      saveSession();
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
  }

  startResize(e, dir) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const b = this.bounds();
    const minW = this.app.minSize ? this.app.minSize[0] : 320;
    const minH = this.app.minSize ? this.app.minSize[1] : 200;
    const a = area();
    this.snap = null;
    this.el.classList.add('resizing');
    const onMove = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let { x, y, w, h: hh } = b;
      if (dir.includes('e')) w = Math.max(minW, b.w + dx);
      if (dir.includes('s')) hh = Math.max(minH, b.h + dy);
      if (dir.includes('w')) { w = Math.max(minW, b.w - dx); x = b.x + b.w - w; }
      if (dir.includes('n')) { hh = Math.max(minH, b.h - dy); y = b.y + b.h - hh; if (y < a.y) { hh -= a.y - y; y = a.y; } }
      this.setBounds({ x, y, w, h: hh });
    };
    const onUp = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      this.el.classList.remove('resizing');
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
  }
}

function showSnap(zone) {
  if (!snapPreview) return;
  if (!zone) { snapPreview.classList.remove('on'); return; }
  const r = snapRect(zone);
  Object.assign(snapPreview.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  snapPreview.classList.add('on');
}

function topWindow(excludeId) {
  let best = null;
  for (const w of windows.values()) {
    if (w.id === excludeId || w.min || w.ws !== currentWs) continue;
    if (!best || +w.el.style.zIndex > +best.el.style.zIndex) best = w;
  }
  return best;
}

function placement(app) {
  const a = area();
  const [dw, dh] = app.size || [880, 580];
  const w = Math.min(dw, a.w - 40), hh = Math.min(dh, a.h - 30);
  const count = [...windows.values()].filter((x) => x.ws === currentWs && !x.min).length;
  const off = (count % 7) * 28;
  return {
    x: Math.round(a.x + (a.w - w) / 2 - 90 + off),
    y: Math.round(a.y + Math.max(12, (a.h - hh) / 2 - 50 + off)),
    w, h: hh,
  };
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

export function initWM() {
  layer = document.getElementById('windows');
  snapPreview = h('div#snap-preview');
  document.getElementById('os').append(snapPreview);
  addEventListener('resize', debounce(() => {
    for (const w of windows.values()) {
      if (w.max) w.setBounds(snapRect('max'));
      else if (w.snap) w.setBounds(snapRect(w.snap));
      else {
        const a = area();
        w.setBounds({ x: clamp(w.x, -w.w + 120, a.w - 120), y: clamp(w.y, a.y, a.y + a.h - 40), w: w.w, h: w.h });
      }
    }
  }, 120));
}

let launchOrigin = null;
/** Merkt sich, von wo (Bildschirmpunkt) die nächste App gestartet wird */
export function setLaunchOrigin(rect) {
  launchOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, t: Date.now() };
}

export async function openApp(appId, args = {}, opts = {}) {
  const app = getApp(appId);
  if (!app) { showError(`App „${appId}“ nicht gefunden.`); return null; }

  if (app.singleton) {
    const existing = [...windows.values()].find((w) => w.appId === appId);
    if (existing) {
      if (existing.ws !== currentWs) switchWorkspace(existing.ws);
      if (existing.min) existing.unminimize();
      focus(existing.id);
      if (args && Object.keys(args).length && existing.instance && existing.instance.onArgs) existing.instance.onArgs(args);
      return existing;
    }
  }

  const win = new Win(app, args);
  if (opts.ws != null) win.ws = opts.ws;
  windows.set(win.id, win);
  layer.append(win.el);
  const b = opts.bounds || placement(app);
  win.setBounds(b);
  // Start aus dem Dock: Fenster wächst räumlich aus dem angeklickten Symbol heraus
  if (launchOrigin && Date.now() - launchOrigin.t < 1500) {
    const o = launchOrigin;
    win.el.style.setProperty('--lx', Math.round(o.x - (b.x + b.w / 2)) + 'px');
    win.el.style.setProperty('--ly', Math.round(o.y - (b.y + b.h / 2)) + 'px');
    win.el.classList.add('launch');
    setTimeout(() => win.el.classList.remove('launch'), 700);
  }
  launchOrigin = null;
  if (win.ws !== currentWs) win.el.classList.add('other-ws');
  focus(win.id);
  bus.emit('wm:open', win);
  bus.emit('wm:change');

  try {
    const mod = await app.load();
    const def = mod.default || mod;
    win.instance = (await def.mount(win.body, win, args)) || {};
  } catch (err) {
    showError(err, `${app.name} konnte nicht gestartet werden`);
    win.body.append(h('div.empty', { html: `${icon('alert')}<b>Fehler beim Laden</b><span>${String(err.message || err)}</span>` }));
  }
  if (opts.max) win.maximize();
  else if (opts.snap) win.snapTo(opts.snap);
  saveSession();
  return win;
}

export function focus(id) {
  const w = windows.get(id);
  if (!w) return;
  if (activeId !== id) {
    w.el.style.zIndex = ++zTop;
    activeId = id;
    for (const o of windows.values()) o.el.classList.toggle('inactive', o.id !== id);
    w.instance && w.instance.onFocus && w.instance.onFocus();
    bus.emit('wm:focus', w);
    bus.emit('wm:change');
  }
}

export function activeWindow() { return activeId ? windows.get(activeId) : null; }
export function allWindows() { return [...windows.values()]; }
export function windowsOf(appId) { return [...windows.values()].filter((w) => w.appId === appId); }
export function getWindow(id) { return windows.get(id); }

/** Klick auf ein Dock-Symbol: öffnen, fokussieren oder minimieren */
export function activateApp(appId) {
  const list = windowsOf(appId).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex);
  if (!list.length) return openApp(appId);
  const w = list.find((x) => x.ws === currentWs) || list[0];
  if (w.ws !== currentWs) switchWorkspace(w.ws);
  if (w.min) { w.unminimize(); focus(w.id); return w; }
  if (activeId === w.id) {
    // Bei mehreren Fenstern durchschalten, sonst minimieren
    const others = list.filter((x) => x.ws === currentWs && x.id !== w.id);
    if (others.length) { const n = others[others.length - 1]; n.min && n.unminimize(); focus(n.id); return n; }
    w.minimize();
    return w;
  }
  focus(w.id);
  return w;
}

export function minimizeAll() {
  const vis = [...windows.values()].filter((w) => w.ws === currentWs && !w.min);
  if (vis.length) vis.forEach((w) => w.minimize());
  else [...windows.values()].filter((w) => w.ws === currentWs).forEach((w) => w.unminimize());
}

// ---------- Arbeitsflächen ----------
export function getWorkspace() { return currentWs; }

export function switchWorkspace(i) {
  i = clamp(i, 0, store.get('workspaces') - 1);
  if (i === currentWs) return;
  const dir = i > currentWs ? 'next' : 'prev';
  currentWs = i;
  for (const w of windows.values()) w.el.classList.toggle('other-ws', w.ws !== i);
  // 3D-Drehung der Fensterebene in Wechselrichtung + Anzeige der Arbeitsfläche
  const layer = document.getElementById('windows');
  if (layer && document.documentElement.dataset.fx3d !== 'false') {
    layer.classList.remove('ws-next', 'ws-prev');
    void layer.offsetWidth;
    layer.classList.add('ws-' + dir);
    clearTimeout(layer._wsT);
    layer._wsT = setTimeout(() => layer.classList.remove('ws-next', 'ws-prev'), 500);
  }
  showWsHud(i);
  activeId = null;
  const top = topWindow();
  if (top) focus(top.id); else bus.emit('wm:focus', null);
  bus.emit('wm:workspace', i);
  bus.emit('wm:change');
}

function showWsHud(i) {
  const n = store.get('workspaces');
  let hud = document.getElementById('ws-hud');
  if (!hud) { hud = h('div#ws-hud.glass'); document.getElementById('os').append(hud); }
  hud.innerHTML = `<b>Arbeitsfläche ${i + 1}</b><div class="ws-hud-dots">${Array.from({ length: n }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>`;
  hud.classList.remove('out');
  hud.classList.add('show');
  clearTimeout(hud._t);
  hud._t = setTimeout(() => hud.classList.add('out'), 900);
}

export function moveToWorkspace(id, i) {
  const w = windows.get(id);
  if (!w) return;
  w.ws = i;
  w.el.classList.toggle('other-ws', i !== currentWs);
  if (activeId === id) { activeId = null; const t = topWindow(); if (t) focus(t.id); else bus.emit('wm:focus', null); }
  bus.emit('wm:change');
  saveSession();
}

// ---------- Sitzung ----------
const saveSession = debounce(() => {
  const list = [...windows.values()].map((w) => ({
    app: w.appId,
    bounds: w.restoreBounds && (w.max || w.snap) ? w.restoreBounds : w.bounds(),
    max: w.max,
    snap: w.snap && w.snap !== 'max' ? w.snap : null,
    ws: w.ws,
    min: w.min,
    args: (w.instance && w.instance.getState && w.instance.getState()) || null,
  }));
  store.set('session', list);
}, 600);

export { saveSession };

export async function restoreSession() {
  const list = store.get('session', []) || [];
  for (const s of list) {
    if (!getApp(s.app)) continue;
    const w = await openApp(s.app, s.args || {}, { bounds: s.bounds, ws: s.ws || 0, max: s.max, snap: s.snap });
    if (w && s.min) w.minimize();
  }
  return list.length;
}
