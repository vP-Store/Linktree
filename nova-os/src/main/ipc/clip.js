'use strict';
// Zwischenablage lesen/schreiben und Verlauf beobachten.
// Hinweis: Neuere Electron-Versionen liefern bei clipboard.readText() ein Promise,
// ältere einen String – mit await funktioniert beides.

const { clipboard } = require('electron');

async function readText() {
  try {
    const v = await clipboard.readText();
    return typeof v === 'string' ? v : '';
  } catch (_) {
    return '';
  }
}

module.exports = function register(ipcMain, getWin) {
  let last = null;
  let busy = false;

  readText().then((t) => { last = t; });

  setInterval(async () => {
    if (busy || last === null) return;
    busy = true;
    try {
      const txt = await readText();
      if (txt && txt !== last) {
        last = txt;
        const w = getWin();
        if (w && !w.isDestroyed()) w.webContents.send('clip:changed', txt);
      }
    } finally {
      busy = false;
    }
  }, 1000).unref();

  ipcMain.handle('clip:read', () => readText());
  ipcMain.handle('clip:write', async (_e, txt) => {
    last = String(txt);
    await clipboard.writeText(last);
    return true;
  });
};
