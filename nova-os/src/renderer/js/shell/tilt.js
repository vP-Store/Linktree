// 3D-Neigung mit Lichtreflex für Karten (Widgets, Hintergrund-Vorschauen, App-Kacheln):
// die Karte kippt sanft zum Mauszeiger, ein Glanzlicht folgt ihm.

const SELECTOR = '.widget, .wp-thumb, .app-tile, .desk-icon, .br-tile';
let current = null;
let litWin = null;

// Lichtkante: der Fensterrand leuchtet dort auf, wo der Mauszeiger ist
function edgeLight(e) {
  const win = e.target.closest && e.target.closest('.win');
  if (litWin && litWin !== win) litWin.classList.remove('lit');
  litWin = win;
  if (!win) return;
  // Variablen auf einem eigenen, leeren Kind-Element setzen – auf .win gesetzt würden sie
  // bei jeder Mausbewegung den Stil des ganzen Fensterinhalts neu berechnen lassen
  let edge = win._edge;
  if (!edge || edge.parentNode !== win) { edge = win._edge = document.createElement('i'); edge.className = 'win-edge'; win.append(edge); }
  const r = win.getBoundingClientRect();
  edge.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
  edge.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
  if (!win.classList.contains('lit')) win.classList.add('lit');
}

function reset(el) {
  el.style.removeProperty('--rx');
  el.style.removeProperty('--ry');
  el.classList.remove('tilting');
}

export function initTilt() {
  const root = document.documentElement;
  // Raumtiefe: Desktop-Ebenen verschieben sich je nach Mausposition unterschiedlich stark
  // (direkt als translate auf die Ebenen – geerbte Variablen würden den ganzen Desktop neu berechnen)
  let depthX = 0, depthY = 0, queued = false;
  const applyDepth = () => {
    queued = false;
    const on = root.dataset.fx3d !== 'false' && root.dataset.perf !== 'true';
    const icons = document.getElementById('desk-icons'), widgets = document.getElementById('widgets');
    if (icons) icons.style.translate = on ? `${(depthX * -5).toFixed(1)}px ${(depthY * -4).toFixed(1)}px` : '';
    if (widgets) widgets.style.translate = on ? `${(depthX * -10).toFixed(1)}px ${(depthY * -7).toFixed(1)}px` : '';
  };
  const unlight = () => { if (litWin) litWin.classList.remove('lit'); litWin = null; };
  document.addEventListener('pointermove', (e) => {
    depthX = (e.clientX / innerWidth) * 2 - 1; depthY = (e.clientY / innerHeight) * 2 - 1;
    if (!queued) { queued = true; requestAnimationFrame(applyDepth); }
    if (root.dataset.fx3d === 'false' || root.dataset.perf === 'true' || e.buttons) {
      if (current) { reset(current); current = null; }
      unlight();
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
  // Maus verlässt das Fenster (pointerleave feuert auf document nicht)
  document.documentElement.addEventListener('mouseleave', () => { if (current) reset(current); current = null; unlight(); });
}
