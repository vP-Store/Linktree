// Fokus: Pomodoro, Timer und Stoppuhr. Läuft weiter, auch wenn das Fenster zu ist,
// und zeigt die Restzeit in der Statusleiste.

import { h, clear, pad, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { notify } from '../core/ui.js';

// ---------------------------------------------------------------------------
// Gemeinsamer Zustand (modulweit)
// ---------------------------------------------------------------------------
const engine = {
  mode: 'pomodoro', // pomodoro | timer | stopwatch
  phase: 'focus', // focus | short | long
  running: false,
  endAt: 0, // pomodoro/timer
  remaining: 0, // ms, wenn pausiert
  total: 0,
  cycles: 0,
  swStart: 0, swElapsed: 0, laps: [],
  tick: null,
};

function cfg() {
  return { focus: store.get('pomoFocus', 25), short: store.get('pomoShort', 5), long: store.get('pomoLong', 15), every: 4 };
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = [880, 988, 1175][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.25);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch (_) {}
}

function loop() {
  clearInterval(engine.tick);
  engine.tick = setInterval(() => {
    if (!engine.running) return;
    if (engine.mode !== 'stopwatch' && Date.now() >= engine.endAt) finish();
    bus.emit('timer:tick', status());
  }, 250);
}

function finish() {
  engine.running = false;
  engine.remaining = 0;
  beep();
  if (engine.mode === 'timer') {
    notify('Timer abgelaufen', 'Die Zeit ist um.', { icon: 'alarm', kind: 'warn', app: 'Fokus' });
    return;
  }
  // Pomodoro: nächste Phase vorbereiten und automatisch starten
  if (engine.phase === 'focus') {
    engine.cycles++;
    store.update('pomoDone', (n) => (n || 0) + 1, 0);
    const long = engine.cycles % cfg().every === 0;
    engine.phase = long ? 'long' : 'short';
    notify('Fokuszeit geschafft! 🎉', long ? 'Zeit für eine lange Pause.' : 'Kurze Pause – steh kurz auf.', { icon: 'coffee', kind: 'ok', app: 'Fokus' });
  } else {
    engine.phase = 'focus';
    notify('Pause vorbei', 'Weiter geht’s mit der nächsten Fokusrunde.', { icon: 'target', app: 'Fokus' });
  }
  setPhaseTime();
  if (store.get('pomoAuto', true)) start();
}

function setPhaseTime() {
  const c = cfg();
  engine.total = (engine.phase === 'focus' ? c.focus : engine.phase === 'short' ? c.short : c.long) * 60000;
  engine.remaining = engine.total;
}

export function start() {
  if (engine.mode === 'stopwatch') { engine.swStart = Date.now() - engine.swElapsed; }
  else { if (!engine.remaining) setPhaseTime(); engine.endAt = Date.now() + engine.remaining; }
  engine.running = true;
  loop();
  bus.emit('timer:tick', status());
}

export function pause() {
  if (!engine.running) return;
  if (engine.mode === 'stopwatch') engine.swElapsed = Date.now() - engine.swStart;
  else engine.remaining = Math.max(0, engine.endAt - Date.now());
  engine.running = false;
  bus.emit('timer:tick', status());
}

export function reset() {
  engine.running = false;
  if (engine.mode === 'stopwatch') { engine.swElapsed = 0; engine.laps = []; }
  else if (engine.mode === 'pomodoro') setPhaseTime();
  else { engine.remaining = engine.total; }
  bus.emit('timer:tick', status());
}

export function status() {
  let ms;
  if (engine.mode === 'stopwatch') ms = engine.running ? Date.now() - engine.swStart : engine.swElapsed;
  else ms = engine.running ? Math.max(0, engine.endAt - Date.now()) : engine.remaining;
  return { mode: engine.mode, phase: engine.phase, running: engine.running, ms, total: engine.total, cycles: engine.cycles };
}

export function fmtMs(ms, withTenths = false) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const base = (hh ? hh + ':' + pad(m) : pad(m)) + ':' + pad(sec);
  return withTenths ? base + ',' + Math.floor((ms % 1000) / 100) : base;
}

setPhaseTime();

// ---------------------------------------------------------------------------
// Oberfläche
// ---------------------------------------------------------------------------
const PHASE = { focus: ['Fokus', 'target'], short: ['Kurze Pause', 'coffee'], long: ['Lange Pause', 'sun'] };

export default {
  mount(root, win, args) {
    const seg = h('div.seg', ...[['pomodoro', 'Pomodoro'], ['timer', 'Timer'], ['stopwatch', 'Stoppuhr']].map(([m, l]) => h('button.seg-btn', { dataset: { m }, onclick: () => setMode(m) }, l)));
    const body = h('div.tm-body');
    root.append(h('div.app-toolbar', { style: { justifyContent: 'center' } }, seg), body);

    const C = 2 * Math.PI * 120;
    let ringBar, timeEl, labelEl, mainBtn, lapsEl;

    function setMode(m) {
      if (engine.running && engine.mode !== m) pause();
      engine.mode = m;
      if (m === 'pomodoro') { engine.phase = engine.phase || 'focus'; if (!engine.running) setPhaseTime(); }
      if (m === 'timer' && !engine.total) { engine.total = engine.remaining = 10 * 60000; }
      render();
      bus.emit('timer:tick', status());
    }

    function render() {
      seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.m === engine.mode));
      clear(body);
      const ring = h('div.tm-ring', { html: `<svg viewBox="0 0 260 260"><circle class="track" cx="130" cy="130" r="120"/><circle class="bar" cx="130" cy="130" r="120" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>` });
      ringBar = ring.querySelector('.bar');
      timeEl = h('div.tm-time');
      labelEl = h('div.tm-label');
      ring.append(h('div.tm-center', labelEl, timeEl));
      mainBtn = h('button.mu-play.tm-main', { onclick: () => (engine.running ? pause() : start()) });
      const controls = h('div.tm-ctrls', h('button.icon-btn.mu-skip', { title: 'Zurücksetzen', html: icon('refresh'), onclick: reset }), mainBtn);
      if (engine.mode === 'pomodoro') {
        controls.append(h('button.icon-btn.mu-skip', { title: 'Phase überspringen', html: icon('skipFwd'), onclick: () => { engine.running = false; finishSkip(); } }));
        const c = cfg();
        const field = (key, label, val) => {
          const inp = h('input.input', { type: 'number', min: 1, max: 180, value: val, style: { width: '70px', textAlign: 'center' } });
          inp.onchange = () => { store.set(key, Math.max(1, Math.min(180, +inp.value || val))); if (!engine.running) { setPhaseTime(); update(); } };
          return h('label.col', { style: { gap: '4px', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-3)' } }, inp, label);
        };
        const auto = h('input', { type: 'checkbox', checked: store.get('pomoAuto', true), onchange: (e) => store.set('pomoAuto', e.target.checked) });
        body.append(ring, controls,
          h('div.tm-dots', ...Array.from({ length: 4 }, (_, i) => h('i', { class: i < engine.cycles % 4 ? 'on' : '' }))),
          h('div.tm-settings', field('pomoFocus', 'Fokus (Min.)', c.focus), field('pomoShort', 'Kurze Pause', c.short), field('pomoLong', 'Lange Pause', c.long),
            h('label.col', { style: { gap: '6px', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-3)' } }, h('span.switch', auto, h('span')), 'Automatisch weiter')),
          h('div.faint', { style: { fontSize: '12px' } }, `Heute & insgesamt geschafft: ${store.get('pomoDone', 0)} Fokusrunden`));
      } else if (engine.mode === 'timer') {
        const presets = h('div.tm-presets', ...[1, 3, 5, 10, 15, 25, 30, 45, 60].map((m) => h('button.chip', { onclick: () => { engine.running = false; engine.total = engine.remaining = m * 60000; update(); } }, m < 60 ? `${m} Min` : '1 Std')));
        const custom = h('input.input', { placeholder: 'mm:ss oder Minuten', style: { width: '170px', textAlign: 'center' } });
        custom.onkeydown = (e) => {
          if (e.key !== 'Enter') return;
          const v = custom.value.trim();
          const parts = v.split(':').map(Number);
          const ms = parts.length === 2 ? (parts[0] * 60 + parts[1]) * 1000 : parts.length === 3 ? (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000 : (+v.replace(',', '.')) * 60000;
          if (ms > 0) { engine.running = false; engine.total = engine.remaining = ms; start(); custom.value = ''; }
        };
        body.append(ring, controls, presets, custom);
      } else {
        lapsEl = h('div.tm-laps');
        controls.append(h('button.icon-btn.mu-skip', { title: 'Runde', html: icon('flag'), onclick: () => { if (!engine.running) return; engine.laps.unshift(status().ms); renderLaps(); } }));
        body.append(ring, controls, lapsEl);
        renderLaps();
      }
      update();
    }

    function finishSkip() { engine.endAt = Date.now(); engine.running = true; finish(); if (!store.get('pomoAuto', true)) update(); }

    function renderLaps() {
      if (!lapsEl) return;
      clear(lapsEl);
      engine.laps.forEach((ms, i) => {
        const prev = engine.laps[i + 1] || 0;
        lapsEl.append(h('div.tm-lap', h('span.faint', `Runde ${engine.laps.length - i}`), h('span', '+' + fmtMs(ms - prev, true)), h('b', fmtMs(ms, true))));
      });
    }

    function update() {
      if (!timeEl) return;
      const s = status();
      const sw = s.mode === 'stopwatch';
      timeEl.textContent = fmtMs(s.ms, sw);
      if (s.mode === 'pomodoro') { labelEl.innerHTML = `${icon(PHASE[s.phase][1])} ${PHASE[s.phase][0]}`; root.dataset.phase = s.phase; }
      else { labelEl.innerHTML = sw ? `${icon('stopwatch')} Stoppuhr` : `${icon('hourglass')} Timer`; delete root.dataset.phase; }
      const frac = sw ? (s.ms % 60000) / 60000 : (s.total ? s.ms / s.total : 0);
      ringBar.style.strokeDashoffset = C * (1 - frac);
      mainBtn.innerHTML = icon(s.running ? 'pause' : 'play');
      win.setTitle(s.running ? `${fmtMs(s.ms)} – Fokus` : 'Fokus');
    }

    const off = bus.on('timer:tick', update);
    const raf = setInterval(() => { if (engine.mode === 'stopwatch' && engine.running) update(); }, 100);
    if (args.action === 'pomodoro') { engine.mode = 'pomodoro'; engine.phase = 'focus'; setPhaseTime(); start(); }
    render();
    return {
      onArgs(a) { if (a.action === 'pomodoro') { engine.mode = 'pomodoro'; engine.phase = 'focus'; setPhaseTime(); start(); render(); } },
      destroy() { off(); clearInterval(raf); },
    };
  },
};
