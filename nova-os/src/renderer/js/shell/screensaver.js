// Bildschirmschoner: nach einiger Zeit ohne Eingabe (oder per Befehl) treten Fenster,
// Dock und Widgets zurück – der 3D-Hintergrund füllt den Bildschirm, darüber eine
// große Uhr. Jede Taste oder Mausbewegung beendet ihn.

import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { bus } from '../core/dom.js';
import { api } from '../core/api.js';

let musicPlaying = false;
bus.on('music:state', (s) => { musicPlaying = !!(s && s.playing); });

let el = null;
let lastInput = Date.now();
let timer = null;
let clockTimer = null;

export function isSaverActive() { return !!el; }

function fmt(d) {
  return d.toLocaleTimeString(store.get('clock24') === false ? 'en-US' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function startSaver() {
  if (el) return;
  const time = h('div.saver-time');
  const date = h('div.saver-date');
  const hint = h('div.saver-hint', 'Beliebige Taste oder Mausbewegung zum Fortfahren');
  el = h('div#saver', h('div.saver-clock', time, date), hint);
  const tick = () => {
    const d = new Date();
    time.textContent = fmt(d);
    date.textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  tick();
  clockTimer = setInterval(tick, 1000);
  document.getElementById('os').append(el);
  document.body.classList.add('saver-on');
  // Erst nach kurzer Zeit auf Eingaben reagieren (sonst beendet die auslösende Bewegung sofort)
  el._armedAt = Date.now() + 600;
  // Fokus aus Webseiten/Eingabefeldern holen, damit Tasten den Schoner beenden können
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

export function stopSaver() {
  if (!el) return;
  clearInterval(clockTimer);
  const old = el;
  el = null;
  document.body.classList.remove('saver-on');
  old.classList.add('out');
  setTimeout(() => old.remove(), 450);
}

let swallowUntil = 0;

function onInput(e) {
  lastInput = Date.now();
  // Tastenkombinationen (z. B. Strg+K), mit denen man den Schoner beendet, nicht weiterreichen
  if (!el && e.type === 'keydown' && Date.now() < swallowUntil) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (!el) return;
  if (e.type === 'keydown') swallowUntil = Date.now() + 500;
  // Taste, die den Schoner beendet, soll nichts anderes auslösen
  if (e.type === 'keydown' || e.type === 'pointerdown' || e.type === 'wheel') { e.preventDefault(); e.stopImmediatePropagation(); }
  if (Date.now() > el._armedAt || e.type !== 'pointermove') stopSaver();
}

export function initScreensaver() {
  for (const ev of ['pointermove', 'pointerdown', 'keydown']) addEventListener(ev, onInput, { capture: true });
  addEventListener('wheel', onInput, { capture: true, passive: false });
  timer = setInterval(async () => {
    const min = +store.get('saverMinutes') || 0;
    const hidden = document.body.classList.contains('overlay-hidden') || document.hidden;
    if (hidden || musicPlaying) { lastInput = Date.now(); return; }
    if (el || min <= 0) return;
    // In der Desktop-App zählt die System-Leerlaufzeit: Eingaben im Browser-Tab (Webview)
    // erreichen dieses Fenster nicht und dürfen den Schoner trotzdem verhindern
    let idleMs = Date.now() - lastInput;
    if (api.sys && api.sys.idle) { try { idleMs = Math.min(idleMs, (await api.sys.idle()) * 1000); } catch (_) { /* Fallback */ } }
    // laufende Videos (z. B. im Browser) nicht unterbrechen
    if ([...document.querySelectorAll('video')].some((v) => !v.paused)) return;
    if (idleMs > min * 60000) startSaver();
  }, 5000);
}
