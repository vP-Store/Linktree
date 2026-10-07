// Thema, Akzentfarbe, Wallpaper.

import { store } from '../core/store.js';
import { api, fileUrl } from '../core/api.js';
import { h, clear } from '../core/dom.js';
import { startScene, stopScene } from './wallpaper3d.js';

export const ACCENTS = [
  { name: 'Nova', color: '#7c5cff', alt: '#4cc9f0' },
  { name: 'Ozean', color: '#3b82f6', alt: '#22d3ee' },
  { name: 'Lagune', color: '#06b6d4', alt: '#34d399' },
  { name: 'Smaragd', color: '#10b981', alt: '#a3e635' },
  { name: 'Bernstein', color: '#f59e0b', alt: '#fb7185' },
  { name: 'Koralle', color: '#f97316', alt: '#facc15' },
  { name: 'Rose', color: '#f43f5e', alt: '#c084fc' },
  { name: 'Orchidee', color: '#d946ef', alt: '#60a5fa' },
];

// Jede Vorlage: Grundfarbe + weiche, treibende Farbflecken
export const WALLPAPERS = {
  galaxy3d: { name: 'Galaxie 3D', bg: 'radial-gradient(ellipse at 50% 48%,#160f33 0%,#0a0820 45%,#04040c 100%)', scene: 'galaxy',
    blobs: [['#4c1d95', 50, 30, 40], ['#0c4a6e', 10, 70, 34]] },
  horizon3d: { name: 'Horizont 3D', bg: 'linear-gradient(180deg,#05030f 0%,#1a0b33 48%,#2a0d3a 58%,#05030c 100%)', scene: 'horizon',
    blobs: [['#6d28d9', 50, 30, 30]] },
  aurora: { name: 'Aurora', bg: 'linear-gradient(160deg,#0b0b1f 0%,#120d2e 45%,#06161f 100%)', stars: true,
    blobs: [['#7c3aed', 8, 12, 46], ['#0ea5e9', 62, 4, 42], ['#10b981', 40, 60, 38], ['#db2777', 78, 62, 34]] },
  nebula: { name: 'Nebel', bg: 'linear-gradient(140deg,#120318 0%,#1d0b2e 50%,#0a0616 100%)', stars: true,
    blobs: [['#c026d3', 16, 20, 44], ['#6d28d9', 58, 42, 50], ['#f43f5e', 76, 6, 30], ['#2563eb', 6, 68, 36]] },
  ocean: { name: 'Ozean', bg: 'linear-gradient(180deg,#03121f 0%,#062a3f 60%,#04324a 100%)',
    blobs: [['#0891b2', 10, 50, 48], ['#2563eb', 60, 10, 46], ['#14b8a6', 70, 64, 40], ['#1e40af', 30, 0, 30]] },
  sunset: { name: 'Abendrot', bg: 'linear-gradient(170deg,#1a0b1e 0%,#3b0f2a 45%,#4a1d12 100%)',
    blobs: [['#f97316', 60, 58, 46], ['#e11d48', 18, 30, 44], ['#a21caf', 72, 4, 36], ['#facc15', 40, 76, 26]] },
  forest: { name: 'Wald', bg: 'linear-gradient(160deg,#04140d 0%,#082419 50%,#0c1b10 100%)',
    blobs: [['#16a34a', 14, 40, 46], ['#0d9488', 62, 14, 40], ['#65a30d', 66, 64, 38], ['#0e7490', 30, 0, 30]] },
  graphite: { name: 'Graphit', bg: 'linear-gradient(160deg,#0d0f14 0%,#16191f 50%,#0b0c10 100%)',
    blobs: [['#475569', 10, 20, 44], ['#334155', 62, 50, 50], ['#6366f1', 70, 4, 26]] },
  dawn: { name: 'Morgen', bg: 'linear-gradient(160deg,#e0e7ff 0%,#fce7f3 50%,#e0f2fe 100%)', light: true,
    blobs: [['#a5b4fc', 10, 14, 46], ['#f9a8d4', 62, 6, 40], ['#7dd3fc', 50, 60, 44], ['#c4b5fd', 80, 66, 30]] },
  mono: { name: 'Mitternacht', bg: '#05060a', blobs: [] },
  transparent: { name: 'Durchsichtig', bg: 'transparent', blobs: [], see: true },
};

export function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g);
  return m ? m.map((x) => parseInt(x, 16)).join(', ') : '124, 92, 255';
}

export function applyTheme() {
  const root = document.documentElement;
  const theme = store.get('theme');
  const resolved = theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  root.dataset.theme = resolved;
  const accent = store.get('accent');
  const preset = ACCENTS.find((a) => a.color === accent);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', hexToRgb(accent));
  root.style.setProperty('--accent-2', preset ? preset.alt : '#4cc9f0');
  const perf = !!store.get('perfMode');
  root.dataset.perf = String(perf);
  root.style.setProperty('--blur', (perf ? 0 : store.get('blur')) + 'px');
  const ds = store.get('dockSize');
  root.style.setProperty('--dock-size', ds + 'px');
  root.style.setProperty('--dock-reserve', (ds + 36) + 'px');
  root.dataset.reduceMotion = String(!!store.get('reduceMotion'));
  root.dataset.fx3d = String(store.get('fx3d') !== false && !store.get('reduceMotion'));
  if (api.setZoom) api.setZoom((store.get('uiScale') || 100) / 100);
  document.body.classList.toggle('focus-mode', !!store.get('focusMode'));
}

let imgCache = { path: null, url: null };

export async function renderWallpaper() {
  const host = document.getElementById('wallpaper');
  if (!host) return;
  const key = store.get('wallpaper');
  const wp = WALLPAPERS[key] || WALLPAPERS.aurora;
  stopScene();
  clear(host);
  host.classList.toggle('animated', !!store.get('animatedWallpaper') && !store.get('reduceMotion') && !store.get('perfMode'));
  const opacity = store.get('overlayOpacity') / 100;
  document.documentElement.dataset.wp = wp.light && key !== 'image' ? 'light' : 'dark';

  if (key === 'image' && store.get('wallpaperImage')) {
    const p = store.get('wallpaperImage');
    if (imgCache.path !== p) {
      try {
        imgCache = { path: p, url: fileUrl(p) || await api.fs.readDataUrl(p, mimeFor(p)) };
      } catch (_) {
        imgCache = { path: null, url: null };
      }
    }
    host.style.background = '#000';
    if (imgCache.url) host.append(h('div.wp-layer.wp-image', { style: { backgroundImage: `url("${imgCache.url}")` } }));
  } else {
    host.style.background = wp.bg;
    for (const [color, x, y, size] of wp.blobs) {
      host.append(h('div.blob', { style: { background: color, left: x + '%', top: y + '%', width: size + 'vmax', height: size + 'vmax', marginLeft: -size / 4 + 'vmax', marginTop: -size / 4 + 'vmax' } }));
    }
    if (wp.stars) host.append(h('div.stars'));
    if (wp.scene) {
      const still = !!store.get('reduceMotion') || !!store.get('perfMode') || !store.get('animatedWallpaper');
      startScene(host, wp.scene, { still });
    }
  }
  const dim = store.get('wallpaperDim');
  if (dim) host.append(h('div.wp-layer', { style: { background: `rgba(0,0,0,${dim / 100})` } }));
  if (!wp.see) host.append(h('div.wp-layer.wp-noise'), h('div.vignette'));
  host.style.opacity = wp.see ? 1 : opacity;
}

function mimeFor(p) {
  const e = p.split('.').pop().toLowerCase();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif' }[e] || 'image/*';
}

/** Kleine Vorschau-Kachel eines Wallpapers (für Einstellungen/Schnellmenü) */
export function wallpaperThumb(key) {
  const wp = WALLPAPERS[key];
  const el = h('div.wp-thumb', { class: wp.scene ? 'is-3d' : '', style: { background: wp.see ? 'repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0/14px 14px' : wp.bg } });
  if (wp.scene) el.append(h('b.wp-3d', '3D'));
  for (const [color, x, y, size] of wp.blobs) {
    el.append(h('i', { style: { background: color, left: x + '%', top: y + '%', width: size * 1.4 + '%', paddingTop: size * 1.4 + '%' } }));
  }
  return el;
}

export function initTheme() {
  applyTheme();
  renderWallpaper();
  const re = ['fx3d', 'perfMode', 'theme', 'accent', 'blur', 'dockSize', 'reduceMotion', 'focusMode', 'uiScale'];
  re.forEach((k) => store.on(k, () => { applyTheme(); if (k === 'reduceMotion' || k === 'perfMode') renderWallpaper(); }));
  ['wallpaper', 'wallpaperImage', 'wallpaperDim', 'overlayOpacity', 'animatedWallpaper'].forEach((k) => store.on(k, renderWallpaper));
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => store.get('theme') === 'auto' && applyTheme());
}
