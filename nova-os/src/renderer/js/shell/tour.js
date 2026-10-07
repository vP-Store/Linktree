// Geführte Tour: dunkles Overlay mit „Lichtkegel“ um das erklärte Element und einer
// Sprechblase. Weiter/Zurück per Knopf oder Pfeiltasten, Esc beendet.

import { h, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';

const STEPS = [
  { sel: '#dock', title: 'Das Dock', text: 'Deine Apps. Ein Klick startet sie, ein Punkt darunter zeigt laufende Apps. Rechtsklick für mehr. Ganz rechts: Windows-Programme und dein Downloads-Stapel.' },
  { sel: '#topbar [title^="Suchen"]', title: 'Alles finden – Strg + K', text: 'Die Befehlspalette findet Apps, Dateien, Notizen, Termine und Befehle, rechnet und fragt auf Wunsch Nova KI.' },
  { sel: '#topbar .tb-right', title: 'Statusleiste', text: 'CPU, Arbeitsspeicher, Netzwerk, Zwischenablage, Mitteilungen und die Schnelleinstellungen (Design, Fokus-Modus, Hintergrund).' },
  { sel: '#topbar .tb-left', title: 'Arbeitsflächen', text: 'Bis zu neun getrennte Arbeitsbereiche – wechseln mit Alt + 1…9 oder Klick. Alt + W zeigt alle Fenster im Überblick.' },
  { sel: '#widgets', title: 'Widgets', text: 'Uhr, Weltuhr, System, Aufgaben, Wetter und Schnellnotiz. Auswahl unter Einstellungen → Desktop & Dock.' },
  { sel: null, title: 'Fenster wie ein Profi', text: 'An den Rand ziehen rastet ein. Maus auf dem Maximieren-Knopf halten zeigt Anordnungen. Strg + Tab wechselt im 3D-Karussell. Fertig – viel Spaß mit NovaOS!' },
];

let el = null, idx = 0, onKey = null;

export function isTourOpen() { return !!el; }

export function startTour() {
  endTour();
  idx = 0;
  el = h('div#tour', h('div.tour-hole'), h('div.tour-bubble.glass'));
  el.addEventListener('pointerdown', (e) => { if (e.target === el || e.target.classList.contains('tour-hole')) e.stopPropagation(); });
  document.getElementById('os').append(el);
  onKey = (e) => {
    if (!el) return;
    // Tippen in Eingabefeldern außerhalb der Tour nicht stören
    const typing = e.target !== document.body && !el.contains(e.target) && e.target.matches && e.target.matches('input, textarea, [contenteditable]');
    if (typing && e.key !== 'Escape') return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endTour(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); step(-1); }
  };
  addEventListener('keydown', onKey, true);
  addEventListener('resize', place);
  render();
}

export function endTour() {
  if (!el) return;
  el.remove(); el = null;
  removeEventListener('keydown', onKey, true);
  removeEventListener('resize', place);
  store.set('tourDone', true);
}

function step(d) {
  const n = idx + d;
  if (n >= STEPS.length) return endTour();
  if (n < 0) return;
  idx = n;
  render();
}

function render() {
  const s = STEPS[idx];
  const bubble = el.querySelector('.tour-bubble');
  bubble.innerHTML = `<div class="tour-count">${idx + 1} / ${STEPS.length}</div><b>${esc(s.title)}</b><p>${esc(s.text)}</p>`;
  const nav = h('div.tour-nav',
    h('button.btn.sm.ghost', { onclick: () => endTour() }, 'Überspringen'),
    h('div.grow'),
    idx > 0 ? h('button.btn.sm', { html: `${icon('chevronLeft')} Zurück`, onclick: () => step(-1) }) : null,
    h('button.btn.sm.primary', { html: idx === STEPS.length - 1 ? `${icon('check')} Los geht's` : `Weiter ${icon('chevronRight')}`, onclick: () => step(1) }));
  bubble.append(nav);
  place();
  nav.lastChild.focus();
}

function place() {
  if (!el) return;
  const s = STEPS[idx];
  const hole = el.querySelector('.tour-hole');
  const bubble = el.querySelector('.tour-bubble');
  const target = s.sel && document.querySelector(s.sel);
  const r = target && target.getBoundingClientRect();
  if (!r || !r.width) {
    // ohne Ziel: Blase in der Mitte, kein Lichtkegel
    hole.style.cssText = `left:${innerWidth / 2}px;top:${innerHeight / 2}px;width:0;height:0`;
    bubble.style.left = innerWidth / 2 - bubble.offsetWidth / 2 + 'px';
    bubble.style.top = innerHeight / 2 - bubble.offsetHeight / 2 + 'px';
    return;
  }
  const pad = 8;
  hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
  const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  // unter das Ziel, sonst darüber, sonst links daneben
  let top = r.bottom + 18, left = r.left + r.width / 2 - bw / 2;
  if (top + bh > innerHeight - 10) top = r.top - bh - 18;
  if (top < 10) { top = Math.max(10, r.top + r.height / 2 - bh / 2); left = r.left - bw - 22; }
  bubble.style.left = Math.max(12, Math.min(innerWidth - bw - 12, left)) + 'px';
  bubble.style.top = Math.max(12, Math.min(innerHeight - bh - 12, top)) + 'px';
}
