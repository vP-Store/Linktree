'use strict';
// Werkzeuge: ZIP-Archive und PDF-Export.

const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const { execFile } = require('child_process');
const { BrowserWindow } = require('electron');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60 * 1000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').toString().trim().split('\n').slice(-3).join(' ')));
      else resolve(stdout);
    });
  });
}

function unique(p) {
  const { dir, name, ext } = path.parse(p);
  let c = p;
  for (let i = 2; fs.existsSync(c); i++) c = path.join(dir, `${name} (${i})${ext}`);
  return c;
}

// PowerShell-Zeichenkette sicher in einfache Anführungszeichen setzen
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

async function zip(paths, dest) {
  if (process.platform === 'win32') {
    const list = paths.map(psq).join(',');
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -LiteralPath ${list} -DestinationPath ${psq(dest)} -CompressionLevel Optimal`]);
  } else {
    const cwd = path.dirname(paths[0]);
    await run('zip', ['-r', '-q', dest, ...paths.map((p) => path.relative(cwd, p))], { cwd });
  }
  return dest;
}

async function unzip(file, destDir) {
  await fsp.mkdir(destDir, { recursive: true });
  if (process.platform === 'win32') {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${psq(file)} -DestinationPath ${psq(destDir)} -Force`]);
  } else {
    await run('unzip', ['-q', '-o', file, '-d', destDir]);
  }
  return destDir;
}

const PDF_CSS = `
  body { font: 11pt/1.6 "Segoe UI", system-ui, sans-serif; color: #1a1d29; margin: 0; padding: 0 4mm; }
  h1 { font-size: 22pt; margin: 0 0 8pt; } h2 { font-size: 15pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; } h3 { font-size: 12.5pt; }
  code { font-family: Consolas, monospace; background: #f1f2f6; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  pre { background: #f6f7fb; border: 1px solid #e3e5ee; border-radius: 6px; padding: 8pt; white-space: pre-wrap; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #7c5cff; margin: 8pt 0; padding: 2pt 10pt; color: #555; background: #f7f5ff; }
  table { border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 4pt 8pt; } th { background: #f3f4f8; }
  a { color: #5b3df5; } li.task { list-style: none; margin-left: -14pt; } hr { border: 0; border-top: 1px solid #ddd; }
  [class^="hl-"] { color: inherit; } .hl-kw { color: #7c3aed; } .hl-str { color: #15803d; } .hl-com { color: #8b93a7; } .hl-num { color: #c2410c; } .hl-fn { color: #1d4ed8; }
`;

async function htmlToPdf(html, dest, title) {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  let tmp = null;
  try {
    const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${String(title || '').replace(/</g, '&lt;')}</title><style>${PDF_CSS}</style></head><body>${html}</body></html>`;
    // Über eine temporäre Datei laden: data:-URLs sind in Chromium auf 2 MB begrenzt
    tmp = path.join(os.tmpdir(), `nova-pdf-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    await fsp.writeFile(tmp, doc, 'utf8');
    await w.loadFile(tmp);
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } });
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, pdf);
    return dest;
  } finally {
    w.destroy();
    if (tmp) fsp.unlink(tmp).catch(() => {});
  }
}

module.exports = function register(ipcMain) {
  ipcMain.handle('tools:zip', async (_e, paths, name) => {
    const list = [].concat(paths);
    const dir = path.dirname(list[0]);
    const base = name || (list.length === 1 ? path.parse(list[0]).name : path.basename(dir) || 'Archiv');
    return zip(list, unique(path.join(dir, base + '.zip')));
  });
  ipcMain.handle('tools:unzip', async (_e, file) => {
    const dest = unique(path.join(path.dirname(file), path.parse(file).name));
    return unzip(file, dest);
  });
  ipcMain.handle('tools:pdf', async (_e, html, dest, title) => htmlToPdf(String(html), unique(dest), title));
};
