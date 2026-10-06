// Einstellungen & App-Daten. Lädt einmal beim Start, speichert über api.store.

import { api } from './api.js';
import { Emitter } from './dom.js';

export const DEFAULTS = {
  theme: 'dark',
  accent: '#7c5cff',
  wallpaper: 'aurora',
  wallpaperImage: null,
  wallpaperDim: 0,
  overlayOpacity: 100,
  animatedWallpaper: true,
  blur: 28,
  reduceMotion: false,
  showWidgets: true,
  showDesktopIcons: true,
  dockAutohide: false,
  dockSize: 52,
  dockPinned: ['files', 'terminal', 'browser', 'assistant', 'notes', 'tasks', 'calendar', 'editor', 'monitor', 'settings'],
  clock24: true,
  showSeconds: false,
  showMeters: true,
  userName: '',
  focusMode: false,
  dnd: false,
  weatherCity: null,
  terminalShell: null,
  bootAnimation: true,
  closeOnBlur: false,
  workspaces: 4,
  uiScale: 100,
  hotCorner: true,
  widgetList: ['clock', 'system', 'tasks', 'weather', 'note'],
  perfMode: false,
  doubleEscHide: true,
};

const state = {};
const events = new Emitter();

export const store = {
  async load() {
    let all = {};
    try { all = (await api.store.all()) || {}; } catch (_) {}
    Object.assign(state, all);
  },
  get(key, fallback) {
    if (key in state && state[key] !== undefined) return state[key];
    if (key in DEFAULTS) return structuredClone(DEFAULTS[key]);
    return fallback;
  },
  set(key, value) {
    state[key] = value;
    api.store.set(key, value).catch(() => {});
    events.emit(key, value);
    events.emit('*', key, value);
  },
  update(key, fn, fallback) {
    const next = fn(this.get(key, fallback));
    this.set(key, next);
    return next;
  },
  on(key, fn) { return events.on(key, fn); },
};

/** Settings (s.*) mit Kurzschreibweise */
export const settings = new Proxy({}, {
  get: (_t, k) => store.get(k),
  set: (_t, k, v) => { store.set(k, v); return true; },
});
