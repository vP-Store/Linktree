// Liste aller Tastenkürzel (Einstellungen + F1-Hilfe)

import { h } from './dom.js';

export const SHORTCUTS = [
  ['NovaOS ein-/ausblenden', 'Alt + Leertaste (änderbar)'],
  ['Befehlspalette / Suche', 'Strg + K'],
  ['Suchen von überall (global)', 'Alt + Umschalt + Leertaste'],
  ['Startmenü', 'Strg + Leertaste'],
  ['Fenster wechseln', 'Strg + Tab (halten)'],
  ['Fenster schließen', 'Alt + Q'],
  ['Maximieren / Wiederherstellen', 'Alt + ↑'],
  ['Minimieren', 'Alt + ↓'],
  ['Links / rechts einrasten', 'Alt + ← / →'],
  ['Fensterübersicht', 'Alt + W'],
  ['Alle Fenster minimieren', 'Alt + D'],
  ['Terminal öffnen', 'Alt + T'],
  ['Dateien öffnen', 'Alt + E'],
  ['Arbeitsfläche wechseln', 'Alt + 1 … 9'],
  ['Vorige / nächste Arbeitsfläche', 'Strg + Alt + ← / →'],
  ['Fenster auf Arbeitsfläche mitnehmen', 'Alt + Umschalt + 1 … 9'],
  ['Menüs schließen', 'Esc'],
];

/** „Alt + ← / →“ → Tasten-Chips; Verbinder und Hinweise in Klammern blass */
export function keyChips(keys) {
  return h('span.set-keys', ...keys.split(' ').map((p) => (/^[+/…]$|^\(/.test(p) ? h('span.faint', ' ' + p + ' ') : h('span.kbd', p))));
}
