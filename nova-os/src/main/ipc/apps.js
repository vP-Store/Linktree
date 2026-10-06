'use strict';
// Installierte Programme finden (Startmenü-Verknüpfungen) und starten.

const os = require('os');
const path = require('path');
const fsp = require('fs').promises;
const { app, shell } = require('electron');

let cache = null;

async function walk(dir, out, depth = 0) {
  let ents;
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const ent of ents) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (depth < 4) await walk(full, out, depth + 1);
    } else if (/\.(lnk|url|appref-ms)$/i.test(ent.name)) {
      const name = ent.name.replace(/\.(lnk|url|appref-ms)$/i, '');
      // Deinstallations- und Hilfe-Verknüpfungen ausblenden
      if (/uninstall|deinstall|readme|help|hilfe|website|documentation/i.test(name)) continue;
      out.push({ name, path: full, folder: path.basename(dir) });
    }
  }
}

async function scanWindows() {
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
  const out = [];
  for (const r of roots) await walk(r, out);
  return out;
}

async function scanLinux() {
  const out = [];
  for (const dir of ['/usr/share/applications', path.join(os.homedir(), '.local/share/applications')]) {
    let files;
    try { files = await fsp.readdir(dir); } catch (_) { continue; }
    for (const f of files.filter((x) => x.endsWith('.desktop'))) {
      try {
        const txt = await fsp.readFile(path.join(dir, f), 'utf8');
        if (/^NoDisplay=true/m.test(txt)) continue;
        const name = (txt.match(/^Name=(.*)$/m) || [])[1];
        if (name) out.push({ name, path: path.join(dir, f), folder: 'Anwendungen' });
      } catch (_) {}
    }
  }
  return out;
}

async function listApps(force) {
  if (cache && !force) return cache;
  const raw = process.platform === 'win32' ? await scanWindows() : await scanLinux();
  const seen = new Map();
  for (const a of raw) {
    const key = a.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, a);
  }
  cache = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return cache;
}

module.exports = function register(ipcMain) {
  ipcMain.handle('apps:list', (_e, force) => listApps(force));
  ipcMain.handle('apps:icon', async (_e, p) => {
    try {
      let target = p;
      if (process.platform === 'win32' && p.toLowerCase().endsWith('.lnk')) {
        try {
          const link = shell.readShortcutLink(p);
          if (link.icon) target = link.icon;
          else if (link.target) target = link.target;
        } catch (_) {}
      }
      const img = await app.getFileIcon(target, { size: 'large' });
      return img.isEmpty() ? null : img.toDataURL();
    } catch (_) {
      return null;
    }
  });
  ipcMain.handle('apps:launch', async (_e, p) => {
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return true;
  });
};
