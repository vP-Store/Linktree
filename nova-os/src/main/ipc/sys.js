'use strict';
// Systeminformationen: CPU, Speicher, Laufwerke, Netzwerk, Prozesse.

const os = require('os');
const fsp = require('fs').promises;
const { execFile } = require('child_process');

let lastCpu = os.cpus();
let lastNet = null;
let lastRate = null;

function cpuUsage() {
  const now = os.cpus();
  const perCore = now.map((c, i) => {
    const prev = lastCpu[i] || c;
    const idle = c.times.idle - prev.times.idle;
    const total = Object.values(c.times).reduce((a, b) => a + b, 0)
      - Object.values(prev.times).reduce((a, b) => a + b, 0);
    return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : 0;
  });
  lastCpu = now;
  const avg = perCore.reduce((a, b) => a + b, 0) / (perCore.length || 1);
  return { avg, perCore };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 15000, ...opts }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function processes() {
  if (process.platform === 'win32') {
    const out = await run('tasklist', ['/fo', 'csv', '/nh']);
    return out.split(/\r?\n/).filter(Boolean).map((line) => {
      const [name, pid, , , mem] = parseCsvLine(line);
      return { name, pid: Number(pid), cpu: null, mem: Number(String(mem).replace(/[^\d]/g, '')) * 1024 };
    }).filter((p) => p.pid);
  }
  const out = await run('ps', ['-eo', 'pid,pcpu,rss,comm', '--no-headers']);
  return out.split('\n').filter(Boolean).map((line) => {
    const m = line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
    if (!m) return null;
    return { pid: Number(m[1]), cpu: Number(m[2]), mem: Number(m[3]) * 1024, name: m[4] };
  }).filter(Boolean);
}

// Unter Windows liefert ein einziger, dauerhaft laufender PowerShell-Prozess alle
// 2 Sekunden die Netzwerk-Summen (statt jedes Mal einen neuen Prozess zu starten).
let winNet = { proc: null, latest: null };
function ensureWinNetWatcher() {
  if (winNet.proc) return;
  const { spawn } = require('child_process');
  const script = 'while ($true) { try { $s = Get-NetAdapterStatistics | Measure-Object -Property ReceivedBytes,SentBytes -Sum; ' +
    '[Console]::Out.WriteLine(($s | ForEach-Object { $_.Sum }) -join ","); [Console]::Out.Flush() } catch { } ; Start-Sleep -Seconds 2 }';
  const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  winNet.proc = proc;
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    const last = lines.filter(Boolean).pop();
    if (last) {
      const [rx, tx] = last.trim().split(',').map(Number);
      winNet.latest = { rx: rx || 0, tx: tx || 0, t: Date.now() };
    }
  });
  proc.on('exit', () => { winNet.proc = null; });
  proc.on('error', () => { winNet.proc = null; });
}

async function netTotals() {
  // Gesamt-Bytes über alle Adapter (für Up/Down-Rate in der Statusleiste).
  try {
    if (process.platform === 'win32') {
      ensureWinNetWatcher();
      return winNet.latest;
    }
    const txt = await fsp.readFile('/proc/net/dev', 'utf8');
    let rx = 0, tx = 0;
    for (const line of txt.split('\n').slice(2)) {
      const parts = line.trim().split(/[:\s]+/);
      if (!parts[0] || parts[0] === 'lo') continue;
      rx += Number(parts[1]) || 0;
      tx += Number(parts[9]) || 0;
    }
    return { rx, tx };
  } catch (_) {
    return null;
  }
}

function stopWatchers() {
  if (winNet.proc) { try { winNet.proc.kill(); } catch (_) {} winNet.proc = null; }
}

module.exports = function register(ipcMain) {
  require('electron').app.on('will-quit', stopWatchers);
  ipcMain.handle('sys:info', () => {
    const cpus = os.cpus();
    return {
      hostname: os.hostname(),
      user: os.userInfo().username,
      platform: process.platform,
      release: os.release(),
      version: typeof os.version === 'function' ? os.version() : '',
      arch: os.arch(),
      cpuModel: cpus[0] ? cpus[0].model.trim() : 'Unbekannt',
      cores: cpus.length,
      totalmem: os.totalmem(),
    };
  });
  ipcMain.handle('sys:stats', () => {
    const cpu = cpuUsage();
    return {
      cpu: cpu.avg,
      perCore: cpu.perCore,
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      uptime: os.uptime(),
      load: os.loadavg(),
    };
  });
  ipcMain.handle('sys:net', async () => {
    const now = await netTotals();
    const t = (now && now.t) || Date.now();
    let rate = lastRate;
    if (now && (!lastNet || t !== lastNet.t)) {
      if (lastNet) {
        const dt = (t - lastNet.t) / 1000;
        if (dt > 0) rate = { down: Math.max(0, (now.rx - lastNet.rx) / dt), up: Math.max(0, (now.tx - lastNet.tx) / dt) };
      }
      lastNet = { ...now, t };
      lastRate = rate;
    }
    const ifaces = Object.entries(os.networkInterfaces())
      .flatMap(([name, list]) => list.filter((a) => !a.internal && a.family === 'IPv4').map((a) => ({ name, address: a.address })));
    return { rate, ifaces };
  });
  ipcMain.handle('sys:processes', () => processes());
  ipcMain.handle('sys:kill', (_e, pid) => {
    process.kill(Number(pid));
    return true;
  });
};
