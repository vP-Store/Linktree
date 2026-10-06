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
