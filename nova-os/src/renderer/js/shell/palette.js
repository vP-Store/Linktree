// Befehlspalette (Strg+K): Apps, Befehle, Fenster, Programme, Dateien, Rechnen, Web.

import { h, clear, esc, debounce } from '../core/dom.js';
import { icon, fileGlyph } from '../core/icons.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { listApps, appIconSpan } from '../core/registry.js';
import { openApp, allWindows, focus, minimizeAll, switchWorkspace, activeWindow } from '../core/wm.js';
import { getWinApps, loadAppIcon, launchWinApp, recentFiles } from '../core/winapps.js';
import { openPath } from '../core/open.js';
import { evaluate, formatNumber, looksLikeMath } from '../core/math.js';
import { toast, notify } from '../core/ui.js';
import { ACCENTS, WALLPAPERS } from './theme.js';
import { overlayHide } from './state.js';

let wrap, input, list;
let results = [];
let kb = 0;
let fileHits = [];
let fileQuery = '';
let places = null;

function commands() {
  const c = (label, ic, run, hint = '', kw = '') => ({ label, ic, run, hint, kw });
  return [
    c('Design: Hell / Dunkel umschalten', 'moon', () => store.set('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'), '', 'theme dark light modus'),
    c('Fokus-Modus umschalten', 'focus', () => store.set('focusMode', !store.get('focusMode')), '', 'focus konzentration'),
    c('Nicht stören umschalten', 'bellOff', () => store.set('dnd', !store.get('dnd')), '', 'dnd mitteilungen'),
    c('Alle Fenster minimieren / zeigen', 'layers', () => minimizeAll(), 'Alt+D', 'desktop zeigen'),
    c('NovaOS ausblenden', 'eyeOff', () => overlayHide(), 'Alt+Leer', 'hide verstecken'),
    c('Neue Notiz', 'stickyNote', () => openApp('notes', { action: 'new' }), '', 'notiz erstellen'),
    c('Neue Aufgabe …', 'listChecks', () => openApp('tasks', { action: 'focusInput' }), '', 'todo hinzufügen'),
    c('Neues Terminal', 'terminal', () => openApp('terminal'), 'Alt+T', 'shell konsole'),
    c('Neues Dokument im Editor', 'filePlus', () => openApp('editor', { action: 'new' }), '', 'text datei'),
    c('Pomodoro starten', 'timer', () => openApp('timer', { action: 'pomodoro' }), '', 'fokus timer'),
    c('Bildschirm sperren', 'lock', () => api.power.action('lock'), '', 'lock'),
    c('NovaOS neu laden', 'refresh', () => api.overlay.reload(), '', 'reload'),
    c('Einstellungen: Erscheinungsbild', 'palette', () => openApp('settings', { page: 'look' }), '', 'design farbe'),
    c('Einstellungen: Tastenkürzel', 'keyboard', () => openApp('settings', { page: 'keys' }), '', 'hotkey shortcuts'),
    c('Einstellungen: System', 'monitor', () => openApp('settings', { page: 'system' }), '', 'autostart'),
    ...ACCENTS.map((a) => c(`Akzentfarbe: ${a.name}`, 'palette', () => store.set('accent', a.color), '', 'farbe accent')),
    ...Object.entries(WALLPAPERS).map(([k, w]) => c(`Hintergrund: ${w.name}`, 'wallpaper', () => store.set('wallpaper', k), '', 'wallpaper hintergrund')),
    ...Array.from({ length: store.get('workspaces') }, (_, i) => c(`Zu Arbeitsfläche ${i + 1}`, 'layers', () => switchWorkspace(i), `Alt+${i + 1}`, 'workspace desktop')),
    c('Aktives Fenster schließen', 'x', () => activeWindow() && activeWindow().close(), 'Alt+Q', 'close'),
  ];
}

function score(q, text) {
  if (!q) return 1;
  const t = text.toLowerCase();
  const qq = q.toLowerCase();
  if (t.startsWith(qq)) return 3;
  if (t.split(/[\s:/\\_-]+/).some((w) => w.startsWith(qq))) return 2;
  if (qq.split(/\s+/).every((p) => t.includes(p))) return 1;
  return 0;
}

export function initPalette() {
  wrap = document.getElementById('palette-wrap');
  wrap.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('scrim')) closePalette(); });
  api.fs.places().then((p) => { places = p; }).catch(() => {});
}

export function isPaletteOpen() { return wrap && wrap.classList.contains('open'); }

export function closePalette() {
  wrap.classList.remove('open');
  clear(wrap);
}

export function openPalette(initial = '') {
  if (isPaletteOpen()) { input.select(); return; }
  clear(wrap);
  input = h('input', { placeholder: 'Suchen, rechnen, Befehle (>) oder Pfade öffnen …', spellcheck: false, value: initial });
  list = h('div.pal-list');
  const panel = h('div#palette.glass',
    h('div.pal-input', { html: icon('command') }, input, h('span.kbd', 'Esc')),
    list,
    h('div.pal-foot',
      h('span', { html: '<span class="kbd">↑</span><span class="kbd">↓</span> Auswählen' }),
      h('span', { html: '<span class="kbd">↵</span> Öffnen' }),
      h('span', { html: '<span class="kbd">&gt;</span> Nur Befehle' }),
      h('span', { html: '<span class="kbd">=</span> Rechnen' }),
      h('span', { html: '<span class="kbd">?</span> Websuche' })),
  );
  wrap.append(h('div.scrim'), panel);
  wrap.classList.add('open');
  input.addEventListener('input', () => { kb = 0; render(); searchFiles(); });
  input.addEventListener('keydown', onKey);
  render();
  setTimeout(() => { input.focus(); input.select(); }, 10);
}

const searchFiles = debounce(async () => {
  const q = input && input.value.trim();
  if (!q || q.length < 2 || /^[>?=]/.test(q) || !places) { fileHits = []; return; }
  fileQuery = q;
  try {
    const hits = await api.fs.search(places.home, q, 40);
    if (fileQuery !== q || !isPaletteOpen()) return;
    fileHits = hits;
    render();
  } catch (_) {}
}, 250);

async function render() {
  const raw = input.value;
  const q = raw.trim();
  results = [];
  const groups = [];
  const add = (group, entries) => { if (entries.length) groups.push([group, entries]); };

  // Rechnen
  const mathSrc = q.startsWith('=') ? q.slice(1) : q;
  if (q && (q.startsWith('=') || looksLikeMath(q))) {
    try {
      const v = formatNumber(evaluate(mathSrc));
      add('Rechner', [{ ic: 'calculator', label: `= ${v}`, sub: `${mathSrc.trim()} · Enter kopiert das Ergebnis`, run: () => { api.clip.write(v); toast('Kopiert', v, { icon: 'copy', duration: 1800 }); } }]);
    } catch (_) { /* keine gültige Rechnung */ }
  }

  // Websuche
  if (q.startsWith('?') && q.length > 1) {
    const term = q.slice(1).trim();
    add('Web', [{ ic: 'globe', label: `Im Web suchen: ${term}`, sub: 'Öffnet den NovaOS-Browser', run: () => openApp('browser', { url: 'https://duckduckgo.com/?q=' + encodeURIComponent(term) }) }]);
  }

  // Pfad
  if (/^([a-z]:[\\/]|\/|~)/i.test(q)) {
    const p = q.startsWith('~') && places ? places.home + q.slice(1) : q;
    add('Pfad', [{ ic: 'folder', label: `Öffnen: ${p}`, sub: 'In Dateien öffnen', run: async () => {
      try { const st = await api.fs.stat(p); openPath(p, { isDir: st.dir }); } catch (_) { toast('Pfad nicht gefunden', p, { kind: 'warn' }); }
    } }]);
  }

  const onlyCmds = q.startsWith('>');
  const cq = onlyCmds ? q.slice(1).trim() : q;

  if (!onlyCmds && !q.startsWith('?')) {
    // Fenster
    const wins = allWindows().map((w) => ({ w, s: score(cq, w.title + ' ' + w.app.name) })).filter((x) => cq && x.s);
    add('Offene Fenster', wins.slice(0, 5).map(({ w }) => ({ app: w.app, label: w.title, sub: `Zu ${w.app.name} wechseln`, hint: 'Fenster', run: () => { w.min && w.unminimize(); focus(w.id); } })));
    // Apps
    const apps = listApps().map((a) => ({ a, s: Math.max(score(cq, a.name), score(cq, a.keywords) * 0.8, score(cq, a.desc) * 0.5) })).filter((x) => x.s).sort((x, y) => y.s - x.s);
    add('Apps', apps.slice(0, cq ? 6 : 8).map(({ a }) => ({ app: a, label: a.name, sub: a.desc, hint: 'App', run: () => openApp(a.id) })));
  }

  // Befehle
  const cmds = commands().map((c) => ({ c, s: Math.max(score(cq, c.label), score(cq, c.kw) * 0.7) })).filter((x) => (cq || onlyCmds) && x.s).sort((a, b) => b.s - a.s);
  add('Befehle', cmds.slice(0, onlyCmds ? 30 : 5).map(({ c }) => ({ ic: c.ic, label: c.label, hint: c.hint, run: c.run })));

  if (!onlyCmds && !q.startsWith('?') && cq) {
    const winApps = (await getWinApps()).map((a) => ({ a, s: score(cq, a.name) })).filter((x) => x.s).sort((x, y) => y.s - x.s);
    if (input.value !== raw) return;
    add('Programme', winApps.slice(0, 6).map(({ a }) => ({ winApp: a, label: a.name, sub: a.folder, hint: 'Programm', run: () => launchWinApp(a) })));
    const rec = recentFiles().filter((f) => score(cq, f.name));
    const seen = new Set(rec.map((f) => f.path));
    const files = [...rec, ...fileHits.filter((f) => !seen.has(f.path) && score(cq, f.name))];
    add('Dateien', files.slice(0, 8).map((f) => ({ file: f, label: f.name, sub: f.path, hint: f.dir ? 'Ordner' : 'Datei', run: () => openPath(f.path, { isDir: !!f.dir }) })));
    add('Web', [{ ic: 'globe', label: `„${cq}“ im Web suchen`, sub: 'DuckDuckGo im NovaOS-Browser', run: () => openApp('browser', { url: 'https://duckduckgo.com/?q=' + encodeURIComponent(cq) }) }]);
  }

  if (!q) {
    const rec = recentFiles().slice(0, 4);
    add('Zuletzt geöffnet', rec.map((f) => ({ file: f, label: f.name, sub: f.path, run: () => openPath(f.path) })));
  }

  clear(list);
  for (const [g, entries] of groups) {
    list.append(h('div.pal-group', g));
    for (const e of entries) {
      const ico = h('div.p-ico');
      if (e.app) ico.innerHTML = appIconSpan(e.app);
      else if (e.winApp) loadAppIcon(e.winApp, ico);
      else if (e.file) ico.innerHTML = fileGlyph(e.file.ext, e.file.dir);
      else ico.innerHTML = icon(e.ic || 'circle');
      const idx = results.length;
      const el = h('div.pal-item', {
        onpointermove: () => { if (kb !== idx) { kb = idx; highlight(); } },
        onclick: () => run(idx),
      }, ico, h('div.p-main', h('b', e.label), e.sub ? h('small', e.sub) : null), e.hint ? h('span.p-hint', e.hint) : null);
      results.push({ ...e, el });
      list.append(el);
    }
  }
  if (!results.length) list.append(h('div.empty', { html: `${icon('search')}<b>Keine Treffer</b><span>Versuche „&gt;“ für Befehle oder „?“ für die Websuche.</span>` }));
  kb = Math.min(kb, Math.max(0, results.length - 1));
  highlight();
}

function highlight() {
  results.forEach((r, i) => r.el.classList.toggle('kb', i === kb));
  const cur = results[kb];
  if (cur) cur.el.scrollIntoView({ block: 'nearest' });
}

function run(i) {
  const r = results[i];
  if (!r) return;
  closePalette();
  Promise.resolve().then(r.run).catch((e) => notify('Fehler', String(e.message || e), { kind: 'error' }));
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); kb = Math.min(results.length - 1, kb + 1); highlight(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); kb = Math.max(0, kb - 1); highlight(); }
  else if (e.key === 'Enter') { e.preventDefault(); run(kb); }
}
