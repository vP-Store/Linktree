// Systemklänge: kurze, weiche Töne, live per Web Audio erzeugt (keine Audiodateien).
// Standardmäßig aus – Einstellungen → Erscheinungsbild → Effekte → „Systemklänge“.

import { store } from './store.js';
import { bus } from './dom.js';

let ctx = null;
const audio = () => {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

// Ton = Folge von [Frequenz Hz, Startzeit s, Dauer s]
const SOUNDS = {
  notify: [[880, 0, 0.18], [1318.5, 0.09, 0.28]],
  open: [[523.25, 0, 0.12], [784, 0.05, 0.16]],
  close: [[659.25, 0, 0.1], [440, 0.05, 0.14]],
  error: [[311.1, 0, 0.16], [233.1, 0.12, 0.24]],
  shot: [[1567.98, 0, 0.05], [1046.5, 0.04, 0.09]],
};

let lastPlay = 0;
export function play(kind) {
  if (!store.get('uiSounds') || muted) return;
  const now = performance.now();
  if (now - lastPlay < 60) return; // nicht stapeln
  lastPlay = now;
  const notes = SOUNDS[kind];
  const ac = notes && audio();
  if (!ac) return;
  const vol = Math.max(0, Math.min(1, (store.get('uiSoundVolume') ?? 40) / 100)) * 0.18;
  if (vol < 0.0005) return; // exponentielle Rampe kann nicht auf 0 zielen
  try {
  const t0 = ac.currentTime + 0.01;
  for (const [freq, at, dur] of notes) {
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // weicher Anschlag, exponentielles Ausklingen (wie eine Glocke)
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
  } catch (_) { /* Klang ist nie wichtiger als die Meldung selbst */ }
}

// Beim Wiederherstellen von Sitzungen/Anordnungen keine Klang-Salven
let muted = 0;
export async function quietly(fn) { muted++; try { return await fn(); } finally { muted--; } }

bus.on('wm:open', () => play('open'));
bus.on('wm:close', () => play('close'));
