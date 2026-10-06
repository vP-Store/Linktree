'use strict';
// Energieoptionen: Sperren, Energiesparen, Neustart, Herunterfahren, Abmelden.

const { execFile } = require('child_process');

const WIN = {
  lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
  sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']],
  restart: ['shutdown', ['/r', '/t', '0']],
  shutdown: ['shutdown', ['/s', '/t', '0']],
  logoff: ['shutdown', ['/l']],
};
const NIX = {
  lock: ['loginctl', ['lock-session']],
  sleep: ['systemctl', ['suspend']],
  restart: ['systemctl', ['reboot']],
  shutdown: ['systemctl', ['poweroff']],
  logoff: ['loginctl', ['terminate-user', process.env.USER || '']],
};

module.exports = function register(ipcMain, quit) {
  ipcMain.handle('power:action', (_e, action) => {
    if (action === 'quit') return quit();
    const table = process.platform === 'win32' ? WIN : NIX;
    const entry = table[action];
    if (!entry) throw new Error('Unbekannte Aktion: ' + action);
    return new Promise((resolve, reject) => {
      execFile(entry[0], entry[1], { windowsHide: true }, (err) => (err ? reject(err) : resolve(true)));
    });
  });
};
