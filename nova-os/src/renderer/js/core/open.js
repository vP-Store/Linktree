// Dateien mit der passenden App öffnen (NovaOS-intern oder Windows-Standardprogramm).

import { api } from './api.js';
import { fileKind } from './icons.js';
import { pathx } from './dom.js';
import { openApp } from './wm.js';
import { showError } from './ui.js';
import { addRecentFile } from './winapps.js';

const INTERNAL = { code: 'editor', text: 'editor', image: 'photos', audio: 'music' };

export async function openPath(path, { isDir = false, external = false } = {}) {
  if (isDir) return openApp('files', { path });
  if (/\.ics$/i.test(path) && !external) return openApp('calendar', { ics: path });
  const kind = fileKind(pathx.ext(path), false);
  addRecentFile(path);
  if (!external && INTERNAL[kind]) {
    return openApp(INTERNAL[kind], { path });
  }
  try {
    await api.fs.open(path);
  } catch (e) {
    showError(e, 'Datei konnte nicht geöffnet werden');
  }
  return null;
}

export function openWithSystem(path) {
  return openPath(path, { external: true });
}
