// ANSI-Escape-Sequenzen → sicheres HTML (16/256 Farben, Truecolor, fett, \r-Fortschritt).

import { esc } from './dom.js';

const BASE = ['#3f3f46', '#f87171', '#4ade80', '#facc15', '#60a5fa', '#e879f9', '#22d3ee', '#e5e7eb',
  '#71717a', '#fca5a5', '#86efac', '#fde047', '#93c5fd', '#f0abfc', '#67e8f9', '#ffffff'];

function xterm256(n) {
  if (n < 16) return BASE[n];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  n -= 16;
  const c = [Math.floor(n / 36), Math.floor((n % 36) / 6), n % 6].map((x) => (x ? 55 + x * 40 : 0));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Wendet \r (Zeilenanfang) an: nur der letzte Stand einer überschriebenen Zeile bleibt. */
export function applyCarriageReturns(text) {
  return text.split('\n').map((line) => {
    if (!line.includes('\r')) return line;
    // Leere Abschnitte (z. B. abschließendes \r einer CRLF-Zeile) löschen nichts
    const parts = line.split('\r').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }).join('\n');
}

export function ansiToHtml(text) {
  // Andere Steuersequenzen (Cursor, Löschen, Titel) entfernen
  text = text.replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?<=>]*[ -\/]*[@-ln-~]/g, '').replace(/\x1b[()][0-9A-Za-z]/g, '');
  let fg = null, bold = false, dim = false;
  let out = '';
  const parts = text.split(/\x1b\[([\d;]*)m/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (!parts[i]) continue;
      const style = [fg ? `color:${fg}` : '', bold ? 'font-weight:700' : '', dim ? 'opacity:.7' : ''].filter(Boolean).join(';');
      out += style ? `<span style="${style}">${esc(parts[i])}</span>` : esc(parts[i]);
      continue;
    }
    const codes = parts[i] === '' ? [0] : parts[i].split(';').map(Number);
    for (let k = 0; k < codes.length; k++) {
      const c = codes[k];
      if (c === 0) { fg = null; bold = false; dim = false; }
      else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) { bold = false; dim = false; }
      else if (c === 39) fg = null;
      else if (c >= 30 && c <= 37) fg = BASE[c - 30];
      else if (c >= 90 && c <= 97) fg = BASE[c - 90 + 8];
      else if (c === 38 && codes[k + 1] === 5) { fg = xterm256(codes[k + 2] || 0); k += 2; }
      else if (c === 38 && codes[k + 1] === 2) { fg = `rgb(${codes[k + 2] | 0},${codes[k + 3] | 0},${codes[k + 4] | 0})`; k += 4; }
      else if ((c === 48 && (codes[k + 1] === 5 || codes[k + 1] === 2))) { k += codes[k + 1] === 5 ? 2 : 4; } // Hintergrund ignorieren
    }
  }
  return out;
}
