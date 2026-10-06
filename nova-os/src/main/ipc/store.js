'use strict';
// Einfacher JSON-Speicher im userData-Ordner. Schreibt verzögert und atomar.

const fs = require('fs');
const path = require('path');

let file = null;
let data = {};
let timer = null;

function init(dir) {
  file = path.join(dir, 'nova-data.json');
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (_) {
    data = {};
  }
}

function flush() {
  timer = null;
  if (!file) return;
  const tmp = file + '.tmp';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[store] Schreiben fehlgeschlagen:', err);
  }
}

function schedule() {
  if (!timer) timer = setTimeout(flush, 250);
}

// Werte, die die Oberfläche nie zu sehen bekommt (z. B. API-Schlüssel)
const PRIVATE = new Set(['aiKeyEnc', 'aiKeyPlain']);

function publicData() {
  const out = {};
  for (const [k, v] of Object.entries(data)) if (!PRIVATE.has(k)) out[k] = v;
  return out;
}

function get(key) {
  return data[key];
}

function set(key, value) {
  if (value === undefined) delete data[key];
  else data[key] = value;
  schedule();
}

function register(ipcMain) {
  ipcMain.handle('store:get', (_e, key) => (PRIVATE.has(key) ? undefined : get(key)));
  ipcMain.handle('store:all', () => publicData());
  ipcMain.handle('store:set', (_e, key, value) => { if (!PRIVATE.has(key)) set(key, value); });
  process.on('exit', () => timer && flush());
}

module.exports = { init, get, set, register, flush };
