// Globale Tastenkürzel und Fenster-Wechsler.

import { h, clear, esc } from '../core/dom.js';
import { appIconSpan } from '../core/registry.js';
import { activeWindow, allWindows, focus, getWorkspace, switchWorkspace, openApp, minimizeAll } from '../core/wm.js';
import { store } from '../core/store.js';
import { openPalette, isPaletteOpen, closePalette } from './palette.js';
import { toggleStart, isStartOpen, closeStart } from './start.js';
import { closePop } from './topbar.js';
import { toggleOverview, isOverviewOpen } from './overview.js';

let sw = null; // { list, idx, el }

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export function initKeys() {
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', (e) => {
    if (sw && (e.key === 'Control' || !e.ctrlKey)) commitSwitcher();
  }, true);
  addEventListener('blur', () => sw && cancelSwitcher());
}

function onKey(e) {
  const k = e.key;
  const win = activeWindow();

  // Befehlspalette
  if ((e.ctrlKey || e.metaKey) && !e.altKey && k.toLowerCase() === 'k') {
    e.preventDefault();
    isPaletteOpen() ? closePalette() : (closeStart(), openPalette());
    return;
  }
  // Startmenü
  if (e.ctrlKey && !e.altKey && k === ' ') {
    e.preventDefault();
    if (isPaletteOpen()) closePalette();
    toggleStart();
    return;
  }
  // Fensterwechsler
  if (e.ctrlKey && k === 'Tab') {
    e.preventDefault();
    stepSwitcher(e.shiftKey ? -1 : 1);
    return;
  }
  if (sw && k === 'Escape') { e.preventDefault(); cancelSwitcher(); return; }

  if (k === 'Escape') {
    if (isPaletteOpen()) { closePalette(); return; }
    if (isStartOpen()) { closeStart(); return; }
    closePop();
    return;
  }

  // Alt-Kürzel (AltGr = Strg+Alt wird ignoriert, damit @ € usw. funktionieren)
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const lower = k.toLowerCase();
    if (lower === 'q' && win) { e.preventDefault(); win.close(); return; }
    if (k === 'ArrowUp' && win) { e.preventDefault(); win.toggleMax(); return; }
    if (k === 'ArrowDown' && win) { e.preventDefault(); win.max ? win.restore() : win.minimize(); return; }
    if (k === 'ArrowLeft' && win) { e.preventDefault(); win.snapTo('left'); return; }
    if (k === 'ArrowRight' && win) { e.preventDefault(); win.snapTo('right'); return; }
    if (lower === 't') { e.preventDefault(); openApp('terminal'); return; }
    if (lower === 'e') { e.preventDefault(); openApp('files'); return; }
    if (lower === 'd') { e.preventDefault(); minimizeAll(); return; }
    if (lower === 'w') { e.preventDefault(); toggleOverview(); return; }
    if (/^[1-9]$/.test(k) && +k <= store.get('workspaces')) { e.preventDefault(); switchWorkspace(+k - 1); return; }
  }
  if (isTyping(e)) return;
}

// ---------------------------------------------------------------------------
function orderedWindows() {
  return allWindows().filter((w) => w.ws === getWorkspace()).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex);
}

function stepSwitcher(dir) {
  if (!sw) {
    const list = orderedWindows();
    if (list.length < 1) return;
    const el = h('div#switcher');
    document.getElementById('os').append(el);
    sw = { list, idx: list.length > 1 ? 0 : 0, el };
  }
  sw.idx = (sw.idx + dir + sw.list.length) % sw.list.length;
  renderSwitcher();
}

function renderSwitcher() {
  clear(sw.el);
  const panel = h('div.sw-panel.glass');
  sw.list.forEach((w, i) => panel.append(h('div.sw-item', {
    class: i === sw.idx ? 'on' : '',
    html: `${appIconSpan(w.app)}<span>${esc(w.title)}</span>`,
    onclick: () => { sw.idx = i; commitSwitcher(); },
  })));
  sw.el.append(panel);
}

function commitSwitcher() {
  if (!sw) return;
  const w = sw.list[sw.idx];
  sw.el.remove();
  sw = null;
  if (w) { if (w.min) w.unminimize(); focus(w.id); }
}

function cancelSwitcher() {
  if (!sw) return;
  sw.el.remove();
  sw = null;
}
