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
