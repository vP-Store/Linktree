// Bilder: Galerie & Betrachter mit Zoom, Drehen, Diashow und „Als Hintergrund“.

import { h, clear, esc, pathx, bytes, dateShort } from '../core/dom.js';
import { icon, fileKind } from '../core/icons.js';
import { api, fileUrl } from '../core/api.js';
import { store } from '../core/store.js';
import { toast, showError, contextMenu } from '../core/ui.js';
import { openApp } from '../core/wm.js';

export default {
  async mount(root, win, args) {
    const places = await api.fs.places();
    let folder = args.path ? pathx.dir(args.path) : (places.pictures || places.home);
    let images = [];
    let idx = -1;
    let zoom = 1, rot = 0, panX = 0, panY = 0;
    let slideshow = null;

    const gallery = h('div.ph-gallery');
    const stage = h('div.ph-stage.hidden');
    const img = h('img.ph-img', { alt: '', draggable: false });
    const caption = h('div.ph-caption');
    const strip = h('div.ph-strip');
    const toolbar = h('div.app-toolbar');
    root.classList.add('ph-root');
    root.append(toolbar, gallery, stage);
    stage.append(
      h('div.ph-canvas', img,
        h('button.ph-nav.l', { html: icon('chevronLeft'), title: 'Vorheriges (←)', onclick: () => show(idx - 1) }),
        h('button.ph-nav.r', { html: icon('chevronRight'), title: 'Nächstes (→)', onclick: () => show(idx + 1) })),
      caption, strip);

    const src = async (p) => fileUrl(p) || api.fs.readDataUrl(p, 'image/svg+xml');

    function renderToolbar() {
      clear(toolbar);
      if (idx < 0) {
        toolbar.append(
          h('span', { html: icon('folder') }), h('b.ellipsis', { style: { maxWidth: '50%' } }, folder), h('span.faint', `${images.length} Bilder`), h('div.grow'),
          h('button.btn.sm', { html: `${icon('image')} Bilder`, onclick: () => load(places.pictures) }),
          h('button.btn.sm', { html: `${icon('monitor')} Desktop`, onclick: () => load(places.desktop) }),
          h('button.btn.sm', { html: `${icon('download')} Downloads`, onclick: () => load(places.downloads) }));
      } else {
        const b = (ic, t, fn, on) => h('button.icon-btn' + (on ? '.on' : ''), { title: t, html: icon(ic), onclick: fn });
        toolbar.append(
          b('grid', 'Zur Galerie (Esc)', () => back()),
          h('div.grow'),
          b('zoomOut', 'Verkleinern (-)', () => setZoom(zoom / 1.25)),
          h('span.faint', { style: { width: '48px', textAlign: 'center', fontSize: '12px' } }, Math.round(zoom * 100) + '%'),
          b('zoomIn', 'Vergrößern (+)', () => setZoom(zoom * 1.25)),
          b('maximize', 'Einpassen (0)', () => { zoom = 1; panX = panY = 0; apply(); renderToolbar(); }),
          b('rotate', 'Drehen (R)', () => { rot = (rot + 90) % 360; apply(); }),
          b(slideshow ? 'pause' : 'play', 'Diashow (Leertaste)', () => toggleSlides(), !!slideshow),
          h('div.grow'),
          b('wallpaper', 'Als NovaOS-Hintergrund', () => { store.set('wallpaperImage', images[idx].path); store.set('wallpaper', 'image'); toast('Hintergrund gesetzt', images[idx].name, { icon: 'wallpaper', kind: 'ok' }); }),
          b('copy', 'Pfad kopieren', () => { api.clip.write(images[idx].path); toast('Pfad kopiert', '', { icon: 'copy', duration: 1200 }); }),
          b('external', 'Mit Windows öffnen', () => api.fs.open(images[idx].path)),
          b('trash', 'In den Papierkorb (Entf)', () => remove()));
      }
    }

    async function load(dir) {
      if (!dir) return;
      folder = dir;
      try {
        const files = await api.fs.list(dir);
        images = files.filter((f) => !f.dir && fileKind(f.ext) === 'image').sort((a, b) => b.mtime - a.mtime);
      } catch (e) { showError(e); images = []; }
      idx = -1;
      renderGallery();
      renderToolbar();
    }

    function renderGallery() {
      stage.classList.add('hidden');
      gallery.classList.remove('hidden');
      clear(gallery);
      win.setTitle(`${pathx.base(folder)} – Bilder`);
      if (!images.length) { gallery.append(h('div.empty', { html: `${icon('image')}<b>Keine Bilder hier</b><span>Wähle oben einen anderen Ordner oder öffne ein Bild über Dateien.</span>` })); return; }
      images.forEach((f, i) => {
        const im = h('img', { loading: 'lazy', alt: '' });
        src(f.path).then((u) => { im.src = u; });
        const tile = h('button.ph-tile', { title: f.name, onclick: () => show(i) }, im);
        tile.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          contextMenu(e.clientX, e.clientY, [
            { label: 'Öffnen', icon: 'eye', action: () => show(i) },
            { label: 'Als Hintergrund', icon: 'wallpaper', action: () => { store.set('wallpaperImage', f.path); store.set('wallpaper', 'image'); } },
            { label: 'Im Dateimanager zeigen', icon: 'folder', action: () => openApp('files', { path: folder }) },
          ]);
        });
        gallery.append(tile);
      });
    }

    async function show(i) {
      if (!images.length) return;
      idx = (i + images.length) % images.length;
      const f = images[idx];
      zoom = 1; rot = 0; panX = panY = 0;
      gallery.classList.add('hidden');
      stage.classList.remove('hidden');
      img.classList.add('loading');
      img.src = await src(f.path);
      apply();
      caption.innerHTML = `<b>${esc(f.name)}</b><span class="faint">${idx + 1} / ${images.length} · ${bytes(f.size)} · ${dateShort(f.mtime)}</span>`;
      win.setTitle(`${f.name} – Bilder`);
      renderStrip();
      renderToolbar();
    }

    function renderStrip() {
      clear(strip);
      const from = Math.max(0, idx - 12), to = Math.min(images.length, idx + 13);
      for (let i = from; i < to; i++) {
        const t = h('button.ph-thumb', { class: i === idx ? 'on' : '', onclick: () => show(i) }, h('img', { alt: '' }));
        src(images[i].path).then((u) => { t.firstChild.src = u; });
        strip.append(t);
      }
      strip.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    img.addEventListener('load', () => {
      img.classList.remove('loading');
      const f = images[idx];
      if (f) caption.querySelector('.faint').textContent = `${idx + 1} / ${images.length} · ${img.naturalWidth} × ${img.naturalHeight} · ${bytes(f.size)} · ${dateShort(f.mtime)}`;
    });

    function apply() { img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom}) rotate(${rot}deg)`; img.style.cursor = zoom > 1 ? 'grab' : 'default'; }
    function setZoom(z) { zoom = Math.max(0.1, Math.min(10, z)); if (zoom <= 1) { panX = panY = 0; } apply(); renderToolbar(); }
    function back() { stopSlides(); idx = -1; renderGallery(); renderToolbar(); }
    function toggleSlides() { slideshow ? stopSlides() : (slideshow = setInterval(() => show(idx + 1), 3500)); renderToolbar(); }
    function stopSlides() { clearInterval(slideshow); slideshow = null; }
    async function remove() {
      const f = images[idx];
      try { await api.fs.trash(f.path); images.splice(idx, 1); toast('In den Papierkorb verschoben', f.name, { icon: 'trash' }); images.length ? show(idx) : back(); } catch (e) { showError(e); }
    }

    stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });
    img.addEventListener('pointerdown', (e) => {
      if (zoom <= 1) return;
      e.preventDefault();
      const sx = e.clientX - panX, sy = e.clientY - panY;
      img.style.cursor = 'grabbing';
      const mv = (ev) => { panX = ev.clientX - sx; panY = ev.clientY - sy; apply(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); img.style.cursor = 'grab'; };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    img.addEventListener('dblclick', () => setZoom(zoom > 1 ? 1 : 2));
    root.tabIndex = 0;
    root.addEventListener('keydown', (e) => {
      if (idx < 0) return;
      const k = e.key;
      if (k === 'ArrowRight') show(idx + 1);
      else if (k === 'ArrowLeft') show(idx - 1);
      else if (k === 'Escape') back();
      else if (k === '+' || k === '=') setZoom(zoom * 1.25);
      else if (k === '-') setZoom(zoom / 1.25);
      else if (k === '0') setZoom(1);
      else if (k.toLowerCase() === 'r') { rot = (rot + 90) % 360; apply(); }
      else if (k === ' ') { e.preventDefault(); toggleSlides(); }
      else if (k === 'Delete') remove();
      else return;
      e.preventDefault();
    });

    await load(folder);
    if (args.path) {
      let i = images.findIndex((f) => f.path === args.path);
      if (i < 0) { images.unshift({ path: args.path, name: pathx.base(args.path), size: 0, mtime: Date.now() }); i = 0; }
      show(i);
    }
    setTimeout(() => root.focus(), 30);

    return {
      onArgs(a) { if (a.path) { load(pathx.dir(a.path)).then(() => { const i = images.findIndex((f) => f.path === a.path); show(Math.max(0, i)); }); } },
      getState() { return idx >= 0 ? { path: images[idx].path } : {}; },
      destroy: stopSlides,
    };
  },
};
