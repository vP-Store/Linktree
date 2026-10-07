// 3D-Neigung mit Lichtreflex für Karten (Widgets, Hintergrund-Vorschauen, App-Kacheln):
// die Karte kippt sanft zum Mauszeiger, ein Glanzlicht folgt ihm.

const SELECTOR = '.widget, .wp-thumb, .app-tile, .desk-icon';
let current = null;
let litWin = null;

// Lichtkante: der Fensterrand leuchtet dort auf, wo der Mauszeiger ist
function edgeLight(e) {
  const win = e.target.closest && e.target.closest('.win');
  if (litWin && litWin !== win) litWin.classList.remove('lit');
  litWin = win;
  if (!win) return;
  const r = win.getBoundingClientRect();
  win.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
  win.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
  win.classList.add('lit');
}

function reset(el) {
  el.style.removeProperty('--rx');
  el.style.removeProperty('--ry');
  el.classList.remove('tilting');
}

export function initTilt() {
  const root = document.documentElement;
  document.addEventListener('pointermove', (e) => {
    if (root.dataset.fx3d === 'false' || root.dataset.perf === 'true' || e.buttons) {
      if (current) { reset(current); current = null; }
      return;
    }
    edgeLight(e);
    const el = e.target.closest && e.target.closest(SELECTOR);
    if (current && current !== el) reset(current);
    current = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    // große Flächen kippen weniger
    const k = Math.max(2, Math.min(8, 1400 / Math.max(r.width, r.height)));
    el.classList.add('tilt3d', 'tilting');
    el.style.setProperty('--rx', ((0.5 - py) * k).toFixed(2) + 'deg');
    el.style.setProperty('--ry', ((px - 0.5) * k).toFixed(2) + 'deg');
    el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
    el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (current) reset(current); current = null; if (litWin) litWin.classList.remove('lit'); litWin = null; });
}
