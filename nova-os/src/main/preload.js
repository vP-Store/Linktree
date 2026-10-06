'use strict';
// Sichere Brücke zwischen Oberfläche und Hauptprozess → window.nova

const { contextBridge, ipcRenderer, webFrame } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('nova', {
  isElectron: true,
  platform: process.platform,
  setZoom: (f) => webFrame.setZoomFactor(Math.max(0.6, Math.min(2, Number(f) || 1))),
  overlay: {
    hide: call('overlay:hide'),
    quit: call('overlay:quit'),
    reload: call('overlay:reload'),
    devtools: call('overlay:devtools'),
    info: call('overlay:info'),
    getHotkey: call('overlay:hotkey:get'),
    setHotkey: call('overlay:hotkey:set'),
    getAutostart: call('overlay:autostart:get'),
    setAutostart: call('overlay:autostart:set'),
    onVisibility: on('overlay:visibility'),
  },
  store: {
    get: call('store:get'),
    all: call('store:all'),
    set: call('store:set'),
  },
  fs: {
    list: call('fs:list'),
    drives: call('fs:drives'),
    places: call('fs:places'),
    stat: call('fs:stat'),
    exists: call('fs:exists'),
    readText: call('fs:readText'),
    writeText: call('fs:writeText'),
    readDataUrl: call('fs:readDataUrl'),
    mkdir: call('fs:mkdir'),
    newFile: call('fs:newFile'),
    rename: call('fs:rename'),
    trash: call('fs:trash'),
    copy: call('fs:copy'),
    move: call('fs:move'),
    open: call('fs:open'),
    reveal: call('fs:reveal'),
    openExternal: call('fs:openExternal'),
    fileIcon: call('fs:fileIcon'),
    search: call('fs:search'),
  },
  sys: {
    info: call('sys:info'),
    stats: call('sys:stats'),
    net: call('sys:net'),
    processes: call('sys:processes'),
    kill: call('sys:kill'),
  },
  term: {
    home: call('term:home'),
    defaultShell: call('term:defaultShell'),
    cd: call('term:cd'),
    run: call('term:run'),
    input: call('term:input'),
    kill: call('term:kill'),
    onData: on('term:data'),
    onExit: on('term:exit'),
  },
  apps: {
    list: call('apps:list'),
    icon: call('apps:icon'),
    launch: call('apps:launch'),
  },
  clip: {
    read: call('clip:read'),
    write: call('clip:write'),
    onChange: on('clip:changed'),
  },
  power: {
    action: call('power:action'),
  },
  win: {
    list: call('win:list'),
    focus: call('win:focus'),
    screenshot: call('win:screenshot'),
  },
  ai: {
    hasKey: call('ai:hasKey'),
    setKey: call('ai:setKey'),
    model: call('ai:model'),
    chat: call('ai:chat'),
    abort: call('ai:abort'),
    onDelta: on('ai:delta'),
    onDone: on('ai:done'),
  },
  browser: {
    onNewWindow: on('browser:new-window'),
  },
});
