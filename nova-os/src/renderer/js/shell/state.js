// Gemeinsamer Shell-Zustand.

import { api } from '../core/api.js';

let info = null;

export async function loadSysInfo() {
  try { info = await api.sys.info(); } catch (_) { info = null; }
  return info;
}

export function sysInfo() { return info; }

export function overlayHide() {
  document.body.classList.add('overlay-hidden');
  api.overlay.hide();
}

/** Nach dem Öffnen von etwas in Windows (Programm, Datei, Explorer) zur Seite treten,
 *  damit das Fenster nicht hinter dem Overlay verschwindet. */
export function stepAside() {
  // dynamisch, um Zyklen zu vermeiden
  import('../core/store.js').then(({ store }) => {
    if (store.get('hideOnLaunch', true)) setTimeout(overlayHide, 350);
  });
}
