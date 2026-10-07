// Musik: spielt lokale Audiodateien (Musik-Ordner oder beliebiger Ordner).

import { h, clear, esc, pathx, pad } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api, fileUrl } from '../core/api.js';
import { store } from '../core/store.js';
import { fileKind } from '../core/icons.js';
import { promptDialog, toast, showError } from '../core/ui.js';
import { bus } from '../core/dom.js';

function hue(s) { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 360; }
function fmt(t) { if (!isFinite(t)) return '0:00'; return `${Math.floor(t / 60)}:${pad(Math.floor(t % 60))}`; }
function cleanTitle(name) { return name.replace(/\.[^.]+$/, '').replace(/_/g, ' '); }
function splitArtist(title) {
  const m = title.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1], title: m[2] } : { artist: '', title };
}

export default {
  async mount(root, win, args) {
    const places = await api.fs.places();
    let folder = args.folder || store.get('musicFolder', places.music || places.home);
    let tracks = [];
    let idx = -1;
    let shuffle = store.get('musicShuffle', false);
    let repeat = store.get('musicRepeat', 'all');
    let q = '';
    const audio = new Audio();
    audio.volume = store.get('musicVolume', 0.8);

    const art = h('div.mu-art');
    const tTitle = h('div.mu-title', 'Nichts ausgewählt');
    const tArtist = h('div.mu-artist.faint', 'Wähle einen Titel aus der Liste');
    const seek = h('input.range', { type: 'range', min: 0, max: 1000, value: 0 });
    const tCur = h('span', '0:00'), tDur = h('span', '0:00');
    const playBtn = h('button.mu-play', { html: icon('play'), title: 'Abspielen/Pause (Leertaste)', onclick: () => toggle() });
    const shufBtn = h('button.icon-btn', { title: 'Zufällig', html: icon('shuffle'), onclick: () => { shuffle = !shuffle; store.set('musicShuffle', shuffle); updateModes(); } });
    const repBtn = h('button.icon-btn', { title: 'Wiederholen', html: icon('repeat'), onclick: () => { repeat = repeat === 'all' ? 'one' : repeat === 'one' ? 'off' : 'all'; store.set('musicRepeat', repeat); updateModes(); } });
    const vol = h('input.range', { type: 'range', min: 0, max: 100, value: Math.round(audio.volume * 100) });
    const list = h('div.mu-list');
    const search = h('input.input', { placeholder: 'Titel suchen …', spellcheck: false });
    const folderLbl = h('span.faint.ellipsis', { style: { fontSize: '12px' } });

    root.append(h('div.app-split',
      h('div.mu-now',
        art,
        h('div.mu-meta', tTitle, tArtist),
        h('div.mu-seek', seek, h('div.mu-times', tCur, tDur)),
        h('div.mu-ctrls', shufBtn, h('button.icon-btn.mu-skip', { html: icon('skipBack'), title: 'Zurück', onclick: () => prev() }), playBtn, h('button.icon-btn.mu-skip', { html: icon('skipFwd'), title: 'Weiter', onclick: () => next(true) }), repBtn),
        h('div.mu-vol', { html: icon('volume') }, vol)),
      h('div.app-main',
        h('div.app-toolbar', h('div.search-field.grow', { html: icon('search') }, search),
          h('button.btn.sm', { html: `${icon('folder')} Ordner`, onclick: chooseFolder })),
        h('div.mu-folder', icon('music') ? h('span', { html: icon('music') }) : null, folderLbl),
        list)));

    const rangeFill = (r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
    rangeFill(vol); rangeFill(seek);

    async function scan() {
      clear(list);
      list.append(h('div.empty', h('div.spinner'), h('span', 'Musik wird gesucht …')));
      folderLbl.textContent = folder;
      try {
        const res = await api.fs.search(folder, '.', 3000);
        tracks = res.filter((f) => !f.dir && fileKind(f.ext) === 'audio').map((f) => ({ path: f.path, name: f.name, ...splitArtist(cleanTitle(f.name)), album: pathx.base(pathx.dir(f.path)) }));
        tracks.sort((a, b) => a.path.localeCompare(b.path, 'de', { numeric: true }));
      } catch (e) { tracks = []; showError(e); }
      renderList();
    }

    function renderList() {
      clear(list);
      const shown = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !q || (t.title + t.artist + t.album).toLowerCase().includes(q));
      if (!shown.length) {
        list.append(h('div.empty', { html: `${icon('music')}<b>${q ? 'Keine Treffer' : 'Keine Musik gefunden'}</b><span>${q ? '' : 'Unterstützt: MP3, WAV, OGG, FLAC, M4A, AAC, OPUS. Wähle oben einen anderen Ordner.'}</span>` }));
        return;
      }
      for (const { t, i } of shown) {
        list.append(h('button.mu-row', { class: i === idx ? 'on' : '', onclick: () => play(i) },
          h('span.mu-num', i === idx && !audio.paused ? h('span.mu-eq', h('i'), h('i'), h('i')) : String(i + 1)),
          h('span.mu-cover', { style: { background: `linear-gradient(135deg, hsl(${hue(t.album)} 70% 55%), hsl(${(hue(t.album) + 60) % 360} 70% 40%))` } }),
          h('div.grow', h('div.ellipsis', { style: { fontWeight: 500 } }, t.title), h('div.ellipsis.faint', { style: { fontSize: '11.5px' } }, [t.artist, t.album].filter(Boolean).join(' · ')))));
      }
    }

    function setArt(t) {
      const h1 = hue(t ? t.album + t.title : 'nova');
      art.style.background = `radial-gradient(circle at 30% 25%, hsl(${h1} 85% 70%), transparent 55%), linear-gradient(135deg, hsl(${h1} 70% 45%), hsl(${(h1 + 70) % 360} 75% 30%))`;
      art.innerHTML = icon('music');
    }

    function play(i) {
      const t = tracks[i];
      if (!t) return;
      const url = fileUrl(t.path);
      if (!url) { toast('Vorschau-Modus', 'Musik wird in der Desktop-App abgespielt.', { icon: 'music' }); return; }
      idx = i;
      audio.src = url;
      audio.play().catch((e) => showError(e, 'Wiedergabe nicht möglich'));
      tTitle.textContent = t.title;
      tArtist.textContent = [t.artist, t.album].filter(Boolean).join(' · ') || ' ';
      setArt(t);
      win.setTitle(`${t.title} – Musik`);
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album });
      renderList();
    }

    function toggle() {
      if (idx < 0) { if (tracks.length) play(shuffle ? Math.floor(Math.random() * tracks.length) : 0); return; }
      audio.paused ? audio.play() : audio.pause();
    }

    function next(manual = false) {
      if (!tracks.length) return;
      if (repeat === 'one' && !manual) { audio.currentTime = 0; audio.play(); return; }
      let n = shuffle ? Math.floor(Math.random() * tracks.length) : idx + 1;
      if (n >= tracks.length) { if (repeat === 'off' && !manual) { audio.pause(); return; } n = 0; }
      play(n);
    }

    function prev() {
      if (audio.currentTime > 3) { audio.currentTime = 0; return; }
      play(Math.max(0, idx - 1));
    }

    function updateModes() {
      shufBtn.classList.toggle('on', shuffle);
      repBtn.classList.toggle('on', repeat !== 'off');
      repBtn.title = repeat === 'one' ? 'Titel wiederholen' : repeat === 'all' ? 'Alle wiederholen' : 'Nicht wiederholen';
      repBtn.innerHTML = icon('repeat') + (repeat === 'one' ? '<small class="mu-one">1</small>' : '');
    }

    async function chooseFolder() {
      const p = await promptDialog({ title: 'Musikordner', message: 'Pfad des Ordners mit deiner Musik:', value: folder, ok: 'Übernehmen', select: false });
      if (!p) return;
      folder = p;
      store.set('musicFolder', p);
      scan();
    }

    const announce = () => bus.emit('music:state', idx >= 0 ? { title: tracks[idx].title, artist: tracks[idx].artist, playing: !audio.paused } : null);
    audio.addEventListener('play', () => { playBtn.innerHTML = icon('pause'); renderList(); announce(); });
    audio.addEventListener('pause', () => { playBtn.innerHTML = icon('play'); renderList(); announce(); });
    const offCtl = bus.on('music:control', (cmd) => { if (cmd === 'toggle') toggle(); if (cmd === 'next') next(true); if (cmd === 'prev') prev(); });
    audio.addEventListener('ended', () => next());
    audio.addEventListener('timeupdate', () => {
      if (!seeking) { seek.value = audio.duration ? (audio.currentTime / audio.duration) * 1000 : 0; rangeFill(seek); }
      tCur.textContent = fmt(audio.currentTime);
      tDur.textContent = fmt(audio.duration);
    });
    let destroyed = false;
    audio.addEventListener('error', () => { if (!destroyed && idx >= 0 && audio.getAttribute('src')) toast('Datei nicht abspielbar', tracks[idx] && tracks[idx].name, { kind: 'warn' }); });
    let seeking = false;
    seek.addEventListener('input', () => { seeking = true; rangeFill(seek); tCur.textContent = fmt((seek.value / 1000) * (audio.duration || 0)); });
    seek.addEventListener('change', () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; seeking = false; });
    vol.addEventListener('input', () => { audio.volume = vol.value / 100; store.set('musicVolume', audio.volume); rangeFill(vol); });
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); renderList(); });
    root.tabIndex = 0;
    root.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight') audio.currentTime += 5;
      if (e.key === 'ArrowLeft') audio.currentTime -= 5;
    });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => next(true));
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
    }

    setArt(null);
    updateModes();
    await scan();
    if (args.path) {
      const i = tracks.findIndex((t) => t.path === args.path);
      if (i >= 0) play(i);
      else { tracks.unshift({ path: args.path, name: pathx.base(args.path), ...splitArtist(cleanTitle(pathx.base(args.path))), album: pathx.base(pathx.dir(args.path)) }); renderList(); play(0); }
    }

    return {
      onArgs(a) {
        if (!a.path) return;
        let i = tracks.findIndex((t) => t.path === a.path);
        if (i < 0) { tracks.unshift({ path: a.path, name: pathx.base(a.path), ...splitArtist(cleanTitle(pathx.base(a.path))), album: pathx.base(pathx.dir(a.path)) }); i = 0; if (idx >= 0) idx++; }
        play(i);
      },
      destroy() { destroyed = true; offCtl(); audio.pause(); audio.removeAttribute('src'); audio.load(); bus.emit('music:state', null); },
    };
  },
};
