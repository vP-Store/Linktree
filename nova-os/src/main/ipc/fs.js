'use strict';
// Dateisystem-Zugriff für Dateimanager, Editor, Notizen, Bilder, Musik.

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { app, shell } = require('electron');

const TEXT_LIMIT = 5 * 1024 * 1024; // 5 MB

async function list(dir, showHidden) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const out = await Promise.all(entries.map(async (ent) => {
    const full = path.join(dir, ent.name);
    if (!showHidden && ent.name.startsWith('.')) return null;
    try {
      const st = await fsp.stat(full);
      return {
        name: ent.name,
        path: full,
        dir: st.isDirectory(),
        size: st.size,
        mtime: st.mtimeMs,
        ext: st.isDirectory() ? '' : path.extname(ent.name).slice(1).toLowerCase(),
      };
    } catch (_) {
      // Systemdateien ohne Zugriff (z. B. pagefile.sys) überspringen
      return null;
    }
  }));
  return out.filter(Boolean);
}

async function drives() {
  if (process.platform !== 'win32') {
    try { const s = await fsp.statfs('/'); return [{ name: '/', path: '/', free: s.bavail * s.bsize, total: s.blocks * s.bsize }]; } catch (_) { return [{ name: '/', path: '/' }]; }
  }
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('');
  const found = [];
  await Promise.all(letters.map(async (l) => {
    const root = l + ':\\';
    try {
      await fsp.access(root);
      let free = null, total = null;
      try {
        const s = await fsp.statfs(root);
        free = s.bavail * s.bsize;
        total = s.blocks * s.bsize;
      } catch (_) {}
      found.push({ name: l + ':', path: root, free, total });
    } catch (_) {}
  }));
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function places() {
  const p = (k) => { try { return app.getPath(k); } catch (_) { return null; } };
  return {
    home: p('home'),
    desktop: p('desktop'),
    documents: p('documents'),
    downloads: p('downloads'),
    pictures: p('pictures'),
    music: p('music'),
    videos: p('videos'),
    novaData: path.join(p('documents') || os.homedir(), 'NovaOS'),
    sep: path.sep,
  };
}

async function uniquePath(target) {
  let candidate = target;
  const { dir, name, ext } = path.parse(target);
  for (let i = 2; ; i++) {
    try {
      await fsp.access(candidate);
      candidate = path.join(dir, `${name} (${i})${ext}`);
    } catch (_) {
      return candidate;
    }
  }
}

module.exports = function register(ipcMain) {
  ipcMain.handle('fs:list', (_e, dir, hidden) => list(dir, hidden));
  ipcMain.handle('fs:drives', () => drives());
  ipcMain.handle('fs:places', () => places());
  ipcMain.handle('fs:stat', async (_e, p) => {
    const st = await fsp.stat(p);
    return { size: st.size, mtime: st.mtimeMs, ctime: st.birthtimeMs, dir: st.isDirectory() };
  });
  ipcMain.handle('fs:exists', async (_e, p) => {
    try { await fsp.access(p); return true; } catch (_) { return false; }
  });
  ipcMain.handle('fs:readText', async (_e, p) => {
    const st = await fsp.stat(p);
    if (st.size > TEXT_LIMIT) throw new Error('Datei ist zu groß für den Editor (> 5 MB).');
    return fsp.readFile(p, 'utf8');
  });
  ipcMain.handle('fs:writeText', async (_e, p, text) => {
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, text, 'utf8');
    return true;
  });
  ipcMain.handle('fs:readDataUrl', async (_e, p, mime) => {
    const buf = await fsp.readFile(p);
    return `data:${mime || 'application/octet-stream'};base64,${buf.toString('base64')}`;
  });
  ipcMain.handle('fs:mkdir', async (_e, dir, name) => {
    const target = await uniquePath(path.join(dir, name));
    await fsp.mkdir(target, { recursive: true });
    return target;
  });
  ipcMain.handle('fs:newFile', async (_e, dir, name) => {
    const target = await uniquePath(path.join(dir, name));
    await fsp.writeFile(target, '', 'utf8');
    return target;
  });
  ipcMain.handle('fs:rename', async (_e, p, newName) => {
    if (/[\\/]/.test(newName)) throw new Error('Name darf keine Schrägstriche enthalten.');
    const target = path.join(path.dirname(p), newName);
    // rename() ersetzt vorhandene Dateien stillschweigend → vorher prüfen
    // (reine Groß-/Kleinschreibungs-Änderung derselben Datei bleibt erlaubt).
    if (target.toLowerCase() !== p.toLowerCase()) {
      const exists = await fsp.access(target).then(() => true, () => false);
      if (exists) throw new Error(`„${newName}“ existiert bereits.`);
    }
    await fsp.rename(p, target);
    return target;
  });
  ipcMain.handle('fs:trash', async (_e, paths) => {
    for (const p of [].concat(paths)) await shell.trashItem(p);
    return true;
  });
  ipcMain.handle('fs:copy', async (_e, paths, destDir) => {
    const out = [];
    for (const src of [].concat(paths)) {
      const target = await uniquePath(path.join(destDir, path.basename(src)));
      await fsp.cp(src, target, { recursive: true, errorOnExist: true });
      out.push(target);
    }
    return out;
  });
  ipcMain.handle('fs:move', async (_e, paths, destDir) => {
    const out = [];
    for (const src of [].concat(paths)) {
      const target = await uniquePath(path.join(destDir, path.basename(src)));
      try {
        await fsp.rename(src, target);
      } catch (err) {
        if (err.code !== 'EXDEV') throw err;
        // anderes Laufwerk → kopieren und löschen
        await fsp.cp(src, target, { recursive: true });
        await fsp.rm(src, { recursive: true, force: true });
      }
      out.push(target);
    }
    return out;
  });
  ipcMain.handle('fs:open', async (_e, p) => {
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return true;
  });
  ipcMain.handle('fs:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('fs:openExternal', (_e, url) => {
    if (!/^(https?|mailto):/i.test(url)) throw new Error('Nur http(s)/mailto-Links erlaubt.');
    return shell.openExternal(url);
  });
  ipcMain.handle('fs:fileIcon', async (_e, p) => {
    try {
      const img = await app.getFileIcon(p, { size: 'normal' });
      return img.isEmpty() ? null : img.toDataURL();
    } catch (_) {
      return null;
    }
  });
  const searchGen = new Map(); // Kanal → laufende Suchnummer
  ipcMain.handle('fs:search', async (_e, root, query, limit = 200, channel = null) => {
    // Breitensuche nach Dateinamen, begrenzt auf Tiefe und Treffer. Eine neue Suche
    // im selben Kanal (z. B. „palette“) bricht die vorherige ab.
    const gen = (searchGen.get(channel) || 0) + 1;
    if (channel) searchGen.set(channel, gen);
    const stale = () => channel && searchGen.get(channel) !== gen;
    const q = String(query).toLowerCase();
    const results = [];
    const queue = [{ dir: root, depth: 0 }];
    const started = Date.now();
    while (queue.length && results.length < limit && Date.now() - started < 4000) {
      if (stale()) return [];
      const { dir, depth } = queue.shift();
      let ents;
      try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { continue; }
      for (const ent of ents) {
        if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'AppData') continue;
        const full = path.join(dir, ent.name);
        if (ent.name.toLowerCase().includes(q)) {
          results.push({ name: ent.name, path: full, dir: ent.isDirectory(), ext: path.extname(ent.name).slice(1).toLowerCase() });
          if (results.length >= limit) break;
        }
        if (ent.isDirectory() && depth < 6) queue.push({ dir: full, depth: depth + 1 });
      }
    }
    return results;
  });
};
