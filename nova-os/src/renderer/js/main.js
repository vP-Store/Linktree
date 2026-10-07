// NovaOS – Start der Oberfläche.

import { api } from './core/api.js';
import { store } from './core/store.js';
import { bus } from './core/dom.js';
import { logoSvg } from './core/icons.js';
import { initWM, restoreSession, openApp } from './core/wm.js';
import { notify } from './core/ui.js';
import { initTheme } from './shell/theme.js';
import { initTopbar } from './shell/topbar.js';
import { initDock } from './shell/dock.js';
import { initDesktop } from './shell/desktop.js';
import { initStart } from './shell/start.js';
import { initPalette } from './shell/palette.js';
import { initKeys } from './shell/keys.js';
import { loadSysInfo } from './shell/state.js';
import { initClipboardHistory } from './apps/clipboard.js';
import { startReminders } from './apps/calendar.js';
import { initBrowserHooks } from './shell/browserhooks.js';

// Unerwartete Fehler sichtbar machen statt sie still zu verschlucken (höchstens einmal je Meldung)
const seenErrors = new Set();
function reportError(err) {
  const msg = String((err && (err.message || err.reason && err.reason.message)) || err || 'Unbekannter Fehler');
  console.error(err);
  if (err && err.name === 'AbortError') return;
  if (seenErrors.has(msg) || /ResizeObserver|AbortError|The play\(\) request/.test(msg)) return;
  seenErrors.add(msg);
  import('./core/ui.js').then((m) => m.toast('Unerwarteter Fehler', msg.slice(0, 160), { kind: 'error', force: true, duration: 6000 })).catch(() => {});
}
addEventListener('error', (e) => reportError(e.error || e.message));
addEventListener('unhandledrejection', (e) => reportError(e.reason));

async function boot() {
  const bootEl = document.getElementById('boot');
  document.getElementById('boot-logo').innerHTML = logoSvg(92);
  const started = performance.now();

  await store.load();
  await loadSysInfo();
  initTheme();
  initWM();
  initTopbar();
  initDock();
  initStart();
  initPalette();
  initKeys();
  initClipboardHistory();
  startReminders(notify);
  initBrowserHooks();
  await initDesktop();

  api.overlay.onVisibility((visible) => {
    document.body.classList.toggle('overlay-hidden', !visible);
    if (visible) bus.emit('overlay:shown');
  });

  if (api.overlay.onPalette) api.overlay.onPalette(() => import('./shell/palette.js').then((m) => m.openPalette()));

  const restored = await restoreSession().catch(() => 0);

  const minBoot = store.get('bootAnimation') ? 900 : 0;
  const wait = Math.max(0, minBoot - (performance.now() - started));
  setTimeout(() => {
    bootEl.classList.add('done');
    setTimeout(() => bootEl.remove(), 700);
    if (!store.get('welcomed')) {
      store.set('welcomed', true);
      notify('Willkommen bei NovaOS', 'Strg+K öffnet die Befehlspalette, Alt+Leertaste blendet NovaOS ein und aus.', { kind: 'info', icon: 'sparkles', duration: 7000 });
      if (!restored) openApp('settings', { page: 'welcome' });
    }
  }, wait);
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<div style="padding:40px;font:14px system-ui;color:#fff;background:#200;height:100%">NovaOS konnte nicht starten:<pre>${String(err && err.stack || err)}</pre></div>`;
});
