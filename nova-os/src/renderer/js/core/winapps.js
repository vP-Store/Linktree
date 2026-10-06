// Installierte Windows-Programme + Icons (mit Cache), zuletzt geöffnete Dateien.

import { api } from './api.js';
import { store } from './store.js';
import { showError, toast } from './ui.js';
import { fileGlyph } from './icons.js';
import { pathx } from './dom.js';

let appsPromise = null;
const iconCache = new Map();

export function getWinApps(force = false) {
  if (!appsPromise || force) appsPromise = api.apps.list(force).catch(() => []);
  return appsPromise;
}

/** Setzt das Programm-Icon asynchron in ein Element ein */
export function loadAppIcon(app, el) {
  const fallback = () => { el.innerHTML = fileGlyph('exe'); };
  if (iconCache.has(app.path)) {
    const v = iconCache.get(app.path);
    if (v) el.innerHTML = `<span class="app-icon"><img src="${v}" alt=""></span>`; else fallback();
    return;
  }
  fallback();
  api.apps.icon(app.path).then((url) => {
    iconCache.set(app.path, url);
    if (url) el.innerHTML = `<span class="app-icon"><img src="${url}" alt=""></span>`;
  }).catch(() => iconCache.set(app.path, null));
}

export async function launchWinApp(app) {
  try {
    await api.apps.launch(app.path);
    toast(app.name, 'wird gestartet …', { icon: 'rocket', duration: 2200 });
    store.update('recentApps', (list) => [app.path, ...(list || []).filter((p) => p !== app.path)].slice(0, 12), []);
    import('../shell/state.js').then((m) => m.stepAside());
  } catch (e) {
    showError(e, `${app.name} konnte nicht gestartet werden`);
  }
}

export function addRecentFile(path) {
  store.update('recentFiles', (list) => [path, ...(list || []).filter((p) => p !== path)].slice(0, 30), []);
}

export function recentFiles() {
  return (store.get('recentFiles', []) || []).map((p) => ({ path: p, name: pathx.base(p), ext: pathx.ext(p) }));
}

// ---------------------------------------------------------------------------
// Offene Windows-Fenster
// ---------------------------------------------------------------------------
export async function getOpenWindows() {
  if (!api.win) return [];
  try { return await api.win.list(); } catch (_) { return []; }
}

export async function focusWindow(w) {
  try { await api.win.focus(w.pid); } catch (e) { showError(e, 'Fenster konnte nicht aktiviert werden'); }
}

/** Icon eines laufenden Programms (über den EXE-Pfad) */
export function loadExeIcon(w, el) {
  el.innerHTML = fileGlyph('exe');
  if (!w.path) return;
  loadAppIcon({ path: w.path, name: w.name }, el);
}

export async function takeScreenshot() {
  try {
    const file = await api.win.screenshot();
    const { notify } = await import('./ui.js');
    notify('Bildschirmfoto gespeichert', file, { icon: 'image', kind: 'ok', onClick: () => import('./wm.js').then((m) => m.openApp('photos', { path: file })) });
    return file;
  } catch (e) { showError(e, 'Bildschirmfoto fehlgeschlagen'); return null; }
}
