'use strict';
// Browser-Sitzung (persist:browser): Downloads ohne Dialog, Berechtigungen.

const path = require('path');
const fs = require('fs');
const { app, session } = require('electron');

// Ohne Rückfrage erlaubt – harmlos und für normales Surfen nötig
const ALLOW = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'window-management']);
// Darf der Nutzer per Rückfrage freigeben
const ASK = new Set(['media', 'geolocation', 'notifications', 'clipboard-read', 'display-capture']);

// Pfade laufender Downloads – die Datei existiert erst später, darf aber nicht doppelt vergeben werden
const reserved = new Set();

function uniquePath(dir, name) {
  const { name: stem, ext } = path.parse(name || 'download');
  let candidate = path.join(dir, `${stem}${ext}`);
  for (let i = 2; fs.existsSync(candidate) || reserved.has(candidate); i++) candidate = path.join(dir, `${stem} (${i})${ext}`);
  return candidate;
}

module.exports = function register(ipcMain, getWin) {
  const send = (ch, payload) => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send(ch, payload);
  };
  const ses = session.fromPartition('persist:browser');
  const pending = new Map(); // id → resolve
  let seq = 0;

  ses.on('will-download', (_e, item) => {
    const target = uniquePath(app.getPath('downloads'), item.getFilename());
    item.setSavePath(target);
    reserved.add(target);
    const id = ++seq;
    send('browser:download', { id, state: 'started', name: path.basename(target), path: target, total: item.getTotalBytes() });
    let last = 0;
    item.on('updated', () => {
      const now = Date.now();
      if (now - last < 400) return;
      last = now;
      send('browser:download', { id, state: 'progress', name: path.basename(target), received: item.getReceivedBytes(), total: item.getTotalBytes() });
    });
    item.once('done', (_ev, state) => {
      reserved.delete(target);
      send('browser:download', { id, state: state === 'completed' ? 'done' : 'failed', name: path.basename(target), path: target });
    });
  });

  // Freigaben, die der Nutzer erteilt hat (Sitzungsdauer): "https://seite.de|notifications"
  const granted = new Set();
  const originOf = (u) => { try { return new URL(u).origin; } catch (_) { return ''; } };

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (ALLOW.has(permission)) return callback(true);
    if (!ASK.has(permission)) return callback(false);
    const key = originOf(details.requestingUrl) + '|' + permission;
    if (granted.has(key)) return callback(true);
    const id = ++seq;
    pending.set(id, (ok) => { if (ok) granted.add(key); callback(ok); });
    let origin = '';
    try { origin = new URL(details.requestingUrl).host; } catch (_) {}
    send('browser:permission', { id, permission, origin, media: details.mediaTypes || [] });
    // Ohne Antwort nach 60 s ablehnen
    setTimeout(() => { if (pending.has(id)) { pending.get(id)(false); pending.delete(id); } }, 60000);
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => ALLOW.has(permission) || granted.has(originOf(requestingOrigin) + '|' + permission));

  ipcMain.handle('browser:permission:answer', (_e, id, allow) => {
    const cb = pending.get(id);
    if (cb) { cb(!!allow); pending.delete(id); }
    return !!cb;
  });
};
