'use strict';
// Zwischenablage lesen/schreiben und Verlauf beobachten.

const { clipboard } = require('electron');

module.exports = function register(ipcMain, getWin) {
  let last = '';
  try { last = clipboard.readText(); } catch (_) {}

  setInterval(() => {
    let txt = '';
    try { txt = clipboard.readText(); } catch (_) { return; }
    if (txt && txt !== last) {
      last = txt;
      const w = getWin();
      if (w && !w.isDestroyed()) w.webContents.send('clip:changed', txt);
    }
  }, 1000).unref();

  ipcMain.handle('clip:read', () => clipboard.readText());
  ipcMain.handle('clip:write', (_e, txt) => {
    last = String(txt);
    clipboard.writeText(last);
    return true;
  });
};
