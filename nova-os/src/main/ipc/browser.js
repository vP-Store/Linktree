'use strict';
// Browser-Sitzung (persist:browser): Downloads ohne Dialog, Berechtigungen.

const path = require('path');
const fs = require('fs');
const { app, session, ipcMain: _ipc } = require('electron');

// Ohne Rückfrage erlaubt – harmlos und für normales Surfen nötig
const ALLOW = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'window-management']);
// Darf der Nutzer per Rückfrage freigeben
const ASK = new Set(['media', 'geolocation', 'notifications', 'clipboard-read', 'display-capture']);

function uniquePath(dir, name) {
  const { name: stem, ext } = path.parse(name || 'download');
  let candidate = path.join(dir, `${stem}${ext}`);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${stem} (${i})${ext}`);
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
      send('browser:download', { id, state: state === 'completed' ? 'done' : 'failed', name: path.basename(target), path: target });
    });
  });

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (ALLOW.has(permission)) return callback(true);
    if (!ASK.has(permission)) return callback(false);
    const id = ++seq;
    pending.set(id, callback);
    let origin = '';
    try { origin = new URL(details.requestingUrl).host; } catch (_) {}
    send('browser:permission', { id, permission, origin, media: details.mediaTypes || [] });
    // Ohne Antwort nach 60 s ablehnen
    setTimeout(() => { if (pending.has(id)) { pending.get(id)(false); pending.delete(id); } }, 60000);
  });
  ses.setPermissionCheckHandler((_wc, permission) => ALLOW.has(permission));

  ipcMain.handle('browser:permission:answer', (_e, id, allow) => {
    const cb = pending.get(id);
    if (cb) { cb(!!allow); pending.delete(id); }
    return !!cb;
  });
};
