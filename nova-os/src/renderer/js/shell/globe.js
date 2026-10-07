// Widget „Weltuhr 3D“: rotierender Punkt-Globus mit echter Tag-/Nachtseite
// (Sonnenstand aus der aktuellen UTC-Zeit) und leuchtenden Städte-Markierungen.

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';

const CITIES = [
  { name: 'New York', lat: 40.7, lon: -74, tz: 'America/New_York' },
  { name: 'London', lat: 51.5, lon: -0.1, tz: 'Europe/London' },
  { name: 'Tokio', lat: 35.7, lon: 139.7, tz: 'Asia/Tokyo' },
];

// Hauptstadt-Näherung für die eigene Zeitzone, falls kein Wetter-Ort gesetzt ist
const TZ_POS = {
  'Europe/Berlin': [52.5, 13.4], 'Europe/Vienna': [48.2, 16.4], 'Europe/Zurich': [47.4, 8.5], 'Europe/Paris': [48.9, 2.35],
  'Europe/Amsterdam': [52.4, 4.9], 'Europe/Madrid': [40.4, -3.7], 'Europe/Rome': [41.9, 12.5], 'Europe/Warsaw': [52.2, 21],
  'Europe/Istanbul': [41, 29], 'America/Los_Angeles': [34, -118.2], 'America/Chicago': [41.9, -87.6], 'Asia/Dubai': [25.2, 55.3],
};

let running = null;

export function stopGlobe() { if (running) running(); running = null; }

function home() {
  const c = store.get('weatherCity');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (c && typeof c.lat === 'number') return { name: c.name, lat: c.lat, lon: c.lon, tz: c.tz || tz, home: true };
  const p = TZ_POS[tz] || [50, 10];
  return { name: tz.includes('/') ? tz.split('/').pop().replace(/_/g, ' ') : 'Hier', lat: p[0], lon: p[1], tz, home: true };
}

/** Position der Sonne (Breite/Länge des Punkts, an dem sie im Zenit steht) */
export function subsolar(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date - start) / 864e5;
  const decl = 23.44 * Math.sin((2 * Math.PI * (doy - 81)) / 365);
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60;
  return { lat: decl, lon: (12 - utcH) * 15 };
}

const rad = (d) => (d * Math.PI) / 180;

function timeIn(tz) {
  try { return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: tz }); } catch (_) { return '–'; }
}

export function globeWidget() {
  stopGlobe();
  const me = home();
  const cities = [me, ...CITIES.filter((c) => c.tz !== me.tz)].slice(0, 4);
  const size = 132;
  const canvas = h('canvas.globe-canvas', { width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
  const list = h('div.globe-list');
  const rows = cities.map((c) => {
    const t = h('b');
    const row = h('div.globe-row', { class: c.home ? 'home' : '' }, h('span.ellipsis', c.name), t);
    list.append(row);
    return { c, t };
  });
  const el = h('div.widget.glass.w-globe', h('h4', { html: `${icon('globe')} Weltuhr` }), h('div.globe-body', canvas, list));

  const ctx = canvas.getContext('2d');
  // Punkte gleichmäßig auf der Kugel (Fibonacci-Gitter)
  const N = 1100;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cff';

  let rot = Math.PI / 2 - rad(me.lon), raf = 0, last = performance.now(), stopped = false, color = accent(), n = 0;
  const tilt = rad(22); // Nordhalbkugel leicht zum Betrachter
  let slow = 0;
  const draw = (now) => {
    raf = 0; slow = 0;
    if (stopped) return;
    if (!el.isConnected) { stopped = true; return; } // Widget entfernt → Schleife beenden (nur diese)
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const b = document.body;
    const hidden = document.hidden || b.classList.contains('overlay-hidden') || b.classList.contains('saver-on') || b.classList.contains('focus-mode')
      || !!document.querySelector('#windows .win.max:not(.min):not(.other-ws):not(.closing)');
    const root = document.documentElement;
    // Bewegung reduzieren / Leistungsmodus: nur alle 2 s ein Standbild (Uhrzeit, Tag/Nacht)
    const still = root.dataset.reduceMotion === 'true' || root.dataset.perf === 'true';
    if (!hidden) {
      if (!still) rot += dt * 0.18;
      if (still || ++n % 120 === 1) { n = Math.max(n, 1); color = accent(); rows.forEach((r) => { r.t.textContent = timeIn(r.c.tz); }); }
      render();
    }
    if (still || hidden) slow = setTimeout(() => { last = performance.now(); draw(last); }, still ? 2000 : 500);
    else raf = requestAnimationFrame(draw);
  };

  function project(x, y, z) {
    // Drehung um die Y-Achse (Erdrotation), dann Neigung um X
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const x1 = x * cr - z * sr, z1 = x * sr + z * cr;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
    return [x1, y2, z2];
  }
  const fromLatLon = (lat, lon) => {
    const la = rad(lat), lo = rad(lon);
    return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
  };

  function render() {
    const S = size * 2, R = S * 0.42, cx = S / 2, cy = S / 2;
    ctx.clearRect(0, 0, S, S);
    // Atmosphäre
    const atm = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
    atm.addColorStop(0, color + '55'); atm.addColorStop(1, 'transparent');
    ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2); ctx.fill();
    // Kugelkörper
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    body.addColorStop(0, 'rgba(60,70,120,.55)'); body.addColorStop(1, 'rgba(8,10,24,.85)');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    const sun = subsolar();
    const sv = fromLatLon(sun.lat, sun.lon);
    for (const p of pts) {
      const [x, y, z] = project(p[0], p[1], p[2]);
      if (z < -0.05) continue; // Rückseite
      // Tageslicht: Skalarprodukt mit Sonnenrichtung (im Weltsystem)
      const day = p[0] * sv[0] + p[1] * sv[1] + p[2] * sv[2];
      const lit = Math.max(0, Math.min(1, day * 3 + 0.5));
      const a = (0.18 + lit * 0.7) * (0.35 + z * 0.65);
      ctx.fillStyle = lit > 0.5 ? `rgba(255,236,190,${a.toFixed(3)})` : `rgba(140,160,255,${(a * 0.8).toFixed(3)})`;
      const s = 2.2 + z * 2.6;
      ctx.fillRect(cx - x * R - s / 2, cy - y * R - s / 2, s, s);
    }
    // Städte
    for (const r of rows) {
      const v = fromLatLon(r.c.lat, r.c.lon);
      const [x, y, z] = project(v[0], v[1], v[2]);
      if (z < 0) continue;
      const px = cx - x * R, py = cy - y * R; // x gespiegelt: Osten liegt rechts
      const g = ctx.createRadialGradient(px, py, 0, px, py, 14);
      g.addColorStop(0, r.c.home ? color : '#4cc9f0'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, r.c.home ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    }
    // Glanzlicht
    const gl = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 0, cx - R * 0.45, cy - R * 0.5, R * 0.8);
    gl.addColorStop(0, 'rgba(255,255,255,.14)'); gl.addColorStop(1, 'transparent');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  }

  rows.forEach((r) => { r.t.textContent = timeIn(r.c.tz); });
  render();
  raf = requestAnimationFrame(draw);
  running = () => { stopped = true; if (raf) cancelAnimationFrame(raf); clearTimeout(slow); };
  return el;
}
