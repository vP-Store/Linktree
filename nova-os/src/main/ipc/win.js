'use strict';
// Windows-Integration: offene Programmfenster auflisten/aktivieren, Bildschirmfotos.

const path = require('path');
const fsp = require('fs').promises;
const { execFile } = require('child_process');
const { app, desktopCapturer, screen } = require('electron');

function ps(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 15000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

async function listWindows() {
  if (process.platform !== 'win32') return [];
  const out = await ps(
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " +
    "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | " +
    "Select-Object Id, ProcessName, MainWindowTitle, Path | ConvertTo-Json -Compress");
  if (!out.trim()) return [];
  let data = JSON.parse(out);
  if (!Array.isArray(data)) data = [data];
  const self = process.pid;
  return data
    .filter((p) => p.Id !== self && !/^(NovaOS|electron|TextInputHost|ApplicationFrameHost|SystemSettings)$/i.test(p.ProcessName))
    .map((p) => ({ pid: p.Id, name: p.ProcessName, title: p.MainWindowTitle, path: p.Path || null }));
}

const FOCUS_SCRIPT = (pid) => `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NovaWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
"@
$p = Get-Process -Id ${Number(pid)} -ErrorAction Stop
$h = $p.MainWindowHandle
if ([NovaWin]::IsIconic($h)) { [NovaWin]::ShowWindowAsync($h, 9) | Out-Null }
[NovaWin]::SetForegroundWindow($h) | Out-Null
`;

module.exports = function register(ipcMain, getWin) {
  ipcMain.handle('win:list', () => listWindows());

  ipcMain.handle('win:focus', async (_e, pid) => {
    if (process.platform !== 'win32') return false;
    const w = getWin();
    // Overlay zuerst ausblenden, sonst liegt es über dem Programm
    if (w && w.isVisible()) {
      w.webContents.send('overlay:visibility', false);
      await new Promise((r) => setTimeout(r, 120));
      w.hide();
    }
    await ps(FOCUS_SCRIPT(pid));
    return true;
  });

  ipcMain.handle('win:screenshot', async () => {
    const w = getWin();
    const wasVisible = w && w.isVisible();
    if (wasVisible) { w.setOpacity(0); await new Promise((r) => setTimeout(r, 250)); }
    try {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const { width, height } = display.size;
      const sf = display.scaleFactor || 1;
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) } });
      const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
      if (!src) throw new Error('Kein Bildschirm gefunden.');
      const dir = path.join(app.getPath('pictures'), 'Screenshots');
      await fsp.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const file = path.join(dir, `NovaOS ${stamp}.png`);
      await fsp.writeFile(file, src.thumbnail.toPNG());
      return file;
    } finally {
      if (wasVisible) w.setOpacity(1);
    }
  });
};
