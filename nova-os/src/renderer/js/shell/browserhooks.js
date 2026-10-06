// Browser-Ereignisse auf Shell-Ebene: Downloads (mit Anzeige in der Statusleiste)
// und Berechtigungsanfragen von Webseiten.

import { api } from '../core/api.js';
import { bytes, pathx } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { notify, confirmDialog, toast } from '../core/ui.js';
import { openApp } from '../core/wm.js';
import { openPath } from '../core/open.js';

const PERM_LABEL = {
  media: 'Kamera/Mikrofon', geolocation: 'deinen Standort', notifications: 'Benachrichtigungen',
  'clipboard-read': 'die Zwischenablage', 'display-capture': 'deinen Bildschirm',
};

export function initBrowserHooks() {
  if (!api.browser || !api.browser.onDownload) return;
  const active = new Map(); // id → { name, received, total }
  const indicator = document.createElement('button');
  indicator.className = 'tb-item tb-meter hidden';
  indicator.title = 'Downloads';
  indicator.onclick = async () => { const p = await api.fs.places(); openApp('files', { path: p.downloads }); };
  const right = document.querySelector('#topbar .tb-right');
  if (right) right.prepend(indicator);

  const render = () => {
    if (!active.size) { indicator.classList.add('hidden'); return; }
    let rec = 0, tot = 0;
    for (const d of active.values()) { rec += d.received || 0; tot += d.total || 0; }
    const pct = tot ? Math.round((rec / tot) * 100) : null;
    indicator.classList.remove('hidden');
    indicator.innerHTML = `${icon('download')}<span class="mini-bar"><i style="width:${pct ?? 30}%"></i></span><span>${pct != null ? pct + '%' : bytes(rec)}</span>`;
    indicator.title = [...active.values()].map((d) => d.name).join(', ');
  };

  api.browser.onDownload((d) => {
    if (d.state === 'started') {
      active.set(d.id, { name: d.name, received: 0, total: d.total });
      toast('Download gestartet', d.name, { icon: 'download', duration: 2200 });
    } else if (d.state === 'progress') {
      active.set(d.id, { name: d.name, received: d.received, total: d.total });
    } else {
      active.delete(d.id);
      if (d.state === 'done') {
        notify('Download abgeschlossen', d.name, { icon: 'download', kind: 'ok', onClick: () => openPath(d.path) });
      } else {
        notify('Download fehlgeschlagen', d.name, { kind: 'error' });
      }
    }
    render();
  });

  api.browser.onPermission(async (p) => {
    const what = PERM_LABEL[p.permission] || p.permission;
    const ok = await confirmDialog({ title: `${p.origin || 'Eine Webseite'} möchte auf ${what} zugreifen`, message: 'Nur erlauben, wenn du der Seite vertraust. Die Freigabe gilt für diese Anfrage.', ok: 'Erlauben' });
    api.browser.answerPermission(p.id, ok);
  });
}

export { pathx };
