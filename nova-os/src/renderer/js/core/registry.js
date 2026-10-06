// Verzeichnis aller NovaOS-Apps.

import { appIconSvg } from './icons.js';

const APPS = [
  { id: 'assistant', name: 'Nova KI', glyph: 'sparkles', colors: ['#a78bfa', '#ec4899'], size: [920, 680], singleton: true, desc: 'KI-Assistent (Claude)', keywords: 'ki ai assistent claude chat fragen schreiben', load: () => import('../apps/assistant.js') },
  { id: 'files', name: 'Dateien', glyph: 'folder', colors: ['#60a5fa', '#2563eb'], size: [980, 620], desc: 'Dateien und Ordner verwalten', keywords: 'explorer ordner datei dokumente', load: () => import('../apps/files.js') },
  { id: 'terminal', name: 'Terminal', glyph: 'terminal', colors: ['#3f3f46', '#0a0a0a'], size: [820, 520], desc: 'PowerShell, CMD oder Bash', keywords: 'konsole shell powershell cmd befehl', load: () => import('../apps/terminal.js') },
  { id: 'browser', name: 'Browser', glyph: 'compass', colors: ['#22d3ee', '#0284c7'], size: [1100, 720], desc: 'Im Web surfen', keywords: 'internet web surfen google', load: () => import('../apps/browser.js') },
  { id: 'editor', name: 'Code', glyph: 'code', colors: ['#818cf8', '#4338ca'], size: [940, 640], desc: 'Text- und Code-Editor', keywords: 'editor text code programmieren', load: () => import('../apps/editor.js') },
  { id: 'notes', name: 'Notizen', glyph: 'stickyNote', colors: ['#fcd34d', '#f59e0b'], size: [900, 600], singleton: true, desc: 'Gedanken festhalten (Markdown)', keywords: 'notiz notes markdown schreiben', load: () => import('../apps/notes.js') },
  { id: 'tasks', name: 'Aufgaben', glyph: 'listChecks', colors: ['#4ade80', '#16a34a'], size: [820, 600], singleton: true, desc: 'To-dos und Listen', keywords: 'todo aufgaben liste erledigen', load: () => import('../apps/tasks.js') },
  { id: 'calendar', name: 'Kalender', glyph: 'calendar', colors: ['#fb7185', '#e11d48'], size: [960, 660], singleton: true, desc: 'Termine planen', keywords: 'kalender termine datum event', load: () => import('../apps/calendar.js') },
  { id: 'calc', name: 'Rechner', glyph: 'calculator', colors: ['#fb923c', '#ea580c'], size: [360, 560], minSize: [300, 460], desc: 'Taschenrechner', keywords: 'rechner calculator mathe', load: () => import('../apps/calc.js') },
  { id: 'monitor', name: 'System', glyph: 'activity', colors: ['#2dd4bf', '#0d9488'], size: [920, 620], singleton: true, desc: 'Leistung & Prozesse', keywords: 'task manager cpu ram prozesse leistung', load: () => import('../apps/monitor.js') },
  { id: 'launcher', name: 'Programme', glyph: 'apps', colors: ['#c084fc', '#7e22ce'], size: [900, 620], singleton: true, desc: 'Installierte Windows-Programme starten', keywords: 'programme apps windows starten installiert', load: () => import('../apps/launcher.js') },
  { id: 'clipboard', name: 'Zwischenablage', glyph: 'clipboard', colors: ['#94a3b8', '#475569'], size: [520, 600], singleton: true, desc: 'Verlauf der Zwischenablage', keywords: 'clipboard kopieren einfügen verlauf', load: () => import('../apps/clipboard.js') },
  { id: 'music', name: 'Musik', glyph: 'music', colors: ['#f472b6', '#be185d'], size: [860, 580], singleton: true, desc: 'Lokale Musik abspielen', keywords: 'musik player audio mp3 song', load: () => import('../apps/music.js') },
  { id: 'photos', name: 'Bilder', glyph: 'image', colors: ['#a78bfa', '#db2777'], size: [960, 640], desc: 'Bilder ansehen', keywords: 'fotos bilder galerie viewer', load: () => import('../apps/photos.js') },
  { id: 'timer', name: 'Fokus', glyph: 'timer', colors: ['#f87171', '#b91c1c'], size: [560, 560], singleton: true, minSize: [420, 460], desc: 'Pomodoro, Timer & Stoppuhr', keywords: 'timer pomodoro stoppuhr fokus wecker', load: () => import('../apps/timer.js') },
  { id: 'weather', name: 'Wetter', glyph: 'cloudSun', colors: ['#38bdf8', '#1d4ed8'], size: [760, 560], singleton: true, desc: 'Wetter & Vorhersage', keywords: 'wetter temperatur regen vorhersage', load: () => import('../apps/weather.js') },
  { id: 'settings', name: 'Einstellungen', glyph: 'settings', colors: ['#a1a1aa', '#52525b'], size: [900, 640], singleton: true, desc: 'NovaOS anpassen', keywords: 'einstellungen settings design theme hotkey', load: () => import('../apps/settings.js') },
];

const byId = new Map(APPS.map((a) => [a.id, a]));

export function listApps() { return APPS; }
export function getApp(id) { return byId.get(id); }

// Hinweis: bewusst ohne Cache – jede Instanz braucht eigene Verlaufs-IDs,
// sonst verschwinden Farben, wenn das erste Vorkommen unsichtbar ist.
export function appIconHtml(app) {
  if (!app) return '';
  return appIconSvg(app.glyph, app.colors[0], app.colors[1]);
}

/** <span class="app-icon">…</span> */
export function appIconSpan(appOrId) {
  const app = typeof appOrId === 'string' ? getApp(appOrId) : appOrId;
  return `<span class="app-icon">${appIconHtml(app)}</span>`;
}
