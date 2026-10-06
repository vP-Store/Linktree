'use strict';
// NovaOS – Electron-Hauptprozess
// Erzeugt ein transparentes, rahmenloses Vollbild-Overlay, das per globalem
// Hotkey ein- und ausgeblendet wird, und stellt der Oberfläche über IPC echte
// Systemfunktionen bereit.

const path = require('path');
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, screen, ipcMain, shell, protocol, net } = require('electron');
const { pathToFileURL } = require('url');

const store = require('./ipc/store');
const registerFs = require('./ipc/fs');
const registerSys = require('./ipc/sys');
const registerTerm = require('./ipc/term');
const registerApps = require('./ipc/apps');
const registerClip = require('./ipc/clip');
const registerPower = require('./ipc/power');
const registerWin = require('./ipc/win');
const registerAi = require('./ipc/ai');

const isDev = process.argv.includes('--dev');
const startHidden = process.argv.includes('--hidden');
const FALLBACK_HOTKEYS = ['Alt+Space', 'Control+Alt+Space', 'Control+Shift+Space'];

let win = null;
let tray = null;
let activeHotkey = null;
const PALETTE_HOTKEY = 'Alt+Shift+Space';
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showOverlay());
}

// nova-file://local/<kodierter Pfad> → lokale Datei (Bilder, Musik, Videos)
protocol.registerSchemesAsPrivileged([
  { scheme: 'nova-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Transparente Fenster brauchen unter Linux/VMs teils diesen Schalter.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');

function displayForCursor() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function createWindow() {
  const { bounds } = displayForCursor();
  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'NovaOS',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      plugins: true, // eingebauter PDF-Betrachter für die Datei-Vorschau
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    if (!startHidden) showOverlay();
  });

  // Schließen blendet nur aus – Beenden geht über Tray oder Energiemenü.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      hideOverlay();
    }
  });

  // Links aus Webviews/Fenstern im Standardbrowser öffnen statt neue Electron-Fenster.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  // Automatischer Rauchtest (CI): Konsole mitschreiben, Screenshot speichern, beenden.
  if (process.env.NOVA_SMOKE) {
    win.webContents.on('console-message', (_e, level, message) => console.log(`[renderer:${level}] ${message}`));
    win.webContents.on('render-process-gone', (_e, d) => { console.error('[renderer] abgestürzt', d); app.exit(2); });
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env.NOVA_SMOKE_JS) await win.webContents.executeJavaScript(process.env.NOVA_SMOKE_JS);
          await new Promise((r) => setTimeout(r, 1500));
          const img = await win.webContents.capturePage();
          require('fs').writeFileSync(process.env.NOVA_SMOKE, img.toPNG());
          console.log('[smoke] Screenshot gespeichert:', process.env.NOVA_SMOKE);
        } catch (err) {
          console.error('[smoke] Fehler:', err);
          app.exit(1);
        }
        quit();
      }, 2500);
    });
  }
}

function showOverlay() {
  if (!win) return;
  // Auf den Monitor springen, auf dem der Mauszeiger gerade ist.
  const { bounds } = displayForCursor();
  win.setBounds(bounds);
  win.show();
  win.focus();
  win.webContents.send('overlay:visibility', true);
}

function hideOverlay() {
  if (!win || !win.isVisible()) return;
  win.webContents.send('overlay:visibility', false);
  // Der Renderer spielt eine kurze Ausblend-Animation ab.
  setTimeout(() => win && win.hide(), 160);
}

function toggleOverlay() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) hideOverlay();
  else showOverlay();
}

function registerHotkey(preferred) {
  if (activeHotkey) {
    globalShortcut.unregister(activeHotkey);
    activeHotkey = null;
  }
  const candidates = [preferred, ...FALLBACK_HOTKEYS].filter(Boolean);
  for (const accel of candidates) {
    try {
      if (globalShortcut.register(accel, toggleOverlay)) {
        activeHotkey = accel;
        return accel;
      }
    } catch (_) {
      // ungültige Tastenkombination → nächste probieren
    }
  }
  return null;
}

function showPalette() {
  showOverlay();
  if (win) win.webContents.send('overlay:palette');
}

function registerPaletteHotkey() {
  try { globalShortcut.register(PALETTE_HOTKEY, showPalette); } catch (_) {}
}

function trayIcon() {
  const file = path.join(__dirname, '..', '..', 'build', 'tray.png');
  const img = nativeImage.createFromPath(file);
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('NovaOS');
  const menu = Menu.buildFromTemplate([
    { label: 'NovaOS anzeigen', click: showOverlay },
    { label: 'Suchen … (Alt+Umschalt+Leertaste)', click: showPalette },
    { label: 'Ausblenden', click: hideOverlay },
    { type: 'separator' },
    { label: 'Neu laden', click: () => win && win.reload() },
    { label: 'Beenden', click: quit },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleOverlay);
}

function quit() {
  quitting = true;
  app.quit();
}

function registerOverlayIpc() {
  ipcMain.handle('overlay:hide', () => hideOverlay());
  ipcMain.handle('overlay:quit', () => quit());
  ipcMain.handle('overlay:reload', () => win && win.reload());
  ipcMain.handle('overlay:devtools', () => win && win.webContents.openDevTools({ mode: 'detach' }));
  ipcMain.handle('overlay:hotkey:get', () => activeHotkey);
  ipcMain.handle('overlay:hotkey:set', (_e, accel) => {
    const result = registerHotkey(accel);
    if (result) store.set('hotkey', result);
    return result;
  });
  ipcMain.handle('overlay:autostart:get', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('overlay:autostart:set', (_e, on) => {
    app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('overlay:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }));
}

app.whenReady().then(() => {
  store.init(app.getPath('userData'));

  protocol.handle('nova-file', (req) => {
    const url = new URL(req.url);
    const filePath = decodeURIComponent(url.pathname.slice(1));
    return net.fetch(pathToFileURL(filePath).toString(), { headers: req.headers });
  });

  registerOverlayIpc();
  registerFs(ipcMain);
  registerSys(ipcMain);
  registerTerm(ipcMain, () => win);
  registerApps(ipcMain);
  registerClip(ipcMain, () => win);
  registerPower(ipcMain, quit);
  registerWin(ipcMain, () => win);
  registerAi(ipcMain, () => win);
  store.register(ipcMain);

  createWindow();
  createTray();
  registerHotkey(store.get('hotkey'));
  registerPaletteHotkey();

  // Bei Bildschirmänderungen Größe neu anpassen.
  const refit = () => win && win.isVisible() && win.setBounds(displayForCursor().bounds);
  screen.on('display-metrics-changed', refit);
  screen.on('display-added', refit);
  screen.on('display-removed', refit);
});

// Webviews (Browser-App): Pop-ups als neuen Tab in NovaOS öffnen, keine neuen Fenster.
app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() !== 'webview') return;
  wc.setWindowOpenHandler(({ url }) => {
    if (win && !win.isDestroyed()) win.webContents.send('browser:new-window', url);
    return { action: 'deny' };
  });
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* Tray hält die App am Leben */ });
