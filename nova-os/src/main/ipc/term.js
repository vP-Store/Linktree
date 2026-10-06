'use strict';
// Terminal: führt Befehle in PowerShell / cmd / bash aus und streamt die Ausgabe.
// Jeder Befehl läuft als eigener Prozess; das Arbeitsverzeichnis wird pro Sitzung
// gemerkt („cd“ wird hier ausgewertet), damit es sich wie eine echte Shell anfühlt.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const running = new Map(); // id → ChildProcess

function expandHome(p) {
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(1));
  return p;
}

function resolveCd(cwd, arg) {
  const raw = arg.trim().replace(/^["']|["']$/g, '');
  if (!raw) return os.homedir();
  if (raw === '-') return null;
  const target = path.resolve(cwd, expandHome(raw));
  const st = fs.statSync(target);
  if (!st.isDirectory()) throw new Error(`Kein Ordner: ${target}`);
  return target;
}

function shellCommand(kind, cmd) {
  if (kind === 'cmd') return ['cmd.exe', ['/d', '/s', '/c', `chcp 65001>nul & ${cmd}`]];
  if (kind === 'bash' || process.platform !== 'win32') {
    const sh = process.platform === 'win32' ? 'bash.exe' : (process.env.SHELL || '/bin/bash');
    return [sh, ['-lc', cmd]];
  }
  // PowerShell: UTF-8 erzwingen und breite Ausgabe, damit Tabellen nicht abgeschnitten werden.
  const wrapped = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; & { ${cmd} } | Out-String -Stream -Width 220`;
  return ['powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapped]];
}

module.exports = function register(ipcMain, getWin) {
  const send = (ch, payload) => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send(ch, payload);
  };

  ipcMain.handle('term:home', () => os.homedir());
  ipcMain.handle('term:defaultShell', () => (process.platform === 'win32' ? 'powershell' : 'bash'));

  ipcMain.handle('term:cd', (_e, cwd, arg) => resolveCd(cwd, arg));

  ipcMain.handle('term:run', (_e, id, cmd, cwd, kind) => {
    if (running.has(id)) throw new Error('In dieser Sitzung läuft bereits ein Befehl.');
    const [exe, args] = shellCommand(kind, cmd);
    let child;
    try {
      child = spawn(exe, args, {
        cwd: fs.existsSync(cwd) ? cwd : os.homedir(),
        env: { ...process.env, FORCE_COLOR: '0', TERM: 'dumb' },
        windowsHide: true,
      });
    } catch (err) {
      send('term:data', { id, data: String(err.message) + '\n', stream: 'stderr' });
      send('term:exit', { id, code: -1 });
      return false;
    }
    running.set(id, child);
    child.stdout.on('data', (d) => send('term:data', { id, data: d.toString('utf8'), stream: 'stdout' }));
    child.stderr.on('data', (d) => send('term:data', { id, data: d.toString('utf8'), stream: 'stderr' }));
    child.on('error', (err) => send('term:data', { id, data: `${err.message}\n`, stream: 'stderr' }));
    child.on('close', (code) => {
      running.delete(id);
      send('term:exit', { id, code });
    });
    return true;
  });

  ipcMain.handle('term:input', (_e, id, text) => {
    const child = running.get(id);
    if (child && child.stdin.writable) child.stdin.write(text);
    return !!child;
  });

  ipcMain.handle('term:kill', (_e, id) => {
    const child = running.get(id);
    if (!child) return false;
    if (process.platform === 'win32') {
      // ganzen Prozessbaum beenden
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    } else {
      child.kill('SIGINT');
    }
    return true;
  });
};
