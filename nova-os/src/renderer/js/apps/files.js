// Dateien: echter Dateimanager mit Navigation, Suche, Kopieren/Ausschneiden/Einfügen,
// Drag & Drop, Umbenennen, Papierkorb, Raster- und Listenansicht.

import { h, clear, esc, bytes, dateShort, pathx, debounce } from '../core/dom.js';
import { icon, fileGlyph, fileKind } from '../core/icons.js';
import { api, fileUrl } from '../core/api.js';
import { store } from '../core/store.js';
import { openApp } from '../core/wm.js';
import { openPath } from '../core/open.js';
import { contextMenu, promptDialog, confirmDialog, showError, toast } from '../core/ui.js';
import { recentFiles } from '../core/winapps.js';

// gemeinsame Zwischenablage aller Dateien-Fenster
const fileClip = { mode: null, paths: [] };

const KIND_LABEL = { folder: 'Ordner', image: 'Bild', audio: 'Audio', video: 'Video', code: 'Quelltext', text: 'Text', archive: 'Archiv', pdf: 'PDF-Dokument', exe: 'Programm', doc: 'Dokument', sheet: 'Tabelle', slides: 'Präsentation', link: 'Verknüpfung', file: 'Datei' };

export default {
  async mount(root, win, args) {
    const places = await api.fs.places();
    const st = {
      path: args.path || places.home,
      history: [],
      future: [],
      entries: [],
      selected: new Set(),
      anchor: null,
      view: store.get('filesView', 'grid'),
      sort: store.get('filesSort', { key: 'name', dir: 1 }),
      hidden: store.get('filesHidden', false),
      filter: '',
      searchResults: null,
      loading: false,
    };

    // ---------- Grundgerüst ----------
    const btn = (ic, title, fn) => h('button.icon-btn', { title, html: icon(ic), onclick: fn });
    const backBtn = btn('arrowLeft', 'Zurück (Alt+←)', () => back());
    const fwdBtn = btn('arrowRight', 'Vor (Alt+→)', () => forward());
    const upBtn = btn('arrowUp', 'Übergeordneter Ordner (Backspace)', () => go(pathx.dir(st.path)));
    const crumbs = h('div.fm-crumbs');
    const pathInput = h('input.input.fm-path-input.hidden', { spellcheck: false });
    const crumbBox = h('div.fm-crumbbox', { onclick: (e) => { if (e.target === crumbBox || e.target === crumbs) editPath(); } }, crumbs, pathInput);
    const search = h('input.input', { placeholder: 'In Ordner suchen …', spellcheck: false });
    const viewBtn = btn(st.view === 'grid' ? 'list' : 'grid', 'Ansicht wechseln', () => setView(st.view === 'grid' ? 'list' : 'grid'));
    let showPreview = store.get('filesPreview', true);
    const previewBtn = btn('columns', 'Vorschau ein/aus (Alt+P)', () => togglePreview());
    previewBtn.classList.toggle('on', showPreview);
    const toolbar = h('div.app-toolbar',
      backBtn, fwdBtn, upBtn, btn('refresh', 'Aktualisieren (F5)', () => load()),
      crumbBox,
      h('div.search-field.fm-search', { html: icon('search') }, search),
      btn('folderPlus', 'Neuer Ordner (Strg+Umschalt+N)', () => newFolder()),
      btn('sortAsc', 'Sortieren', (e) => sortMenu(e.currentTarget)),
      viewBtn,
      previewBtn,
      btn('moreV', 'Mehr', (e) => moreMenu(e.currentTarget)),
    );
    const sidebar = h('div.app-sidebar');
    const content = h('div.fm-content', { tabIndex: 0 });
    const status = h('div.app-status');
    const preview = h('div.fm-preview');
    root.append(toolbar, h('div.app-split', sidebar, h('div.app-main', content, status), preview));
    preview.classList.toggle('hidden', !showPreview);

    function togglePreview() {
      showPreview = !showPreview;
      store.set('filesPreview', showPreview);
      previewBtn.classList.toggle('on', showPreview);
      preview.classList.toggle('hidden', !showPreview);
      updatePreview();
    }

    let previewToken = 0;
    async function updatePreview() {
      if (!showPreview) return;
      const token = ++previewToken;
      clear(preview);
      const sel = selectedEntries();
      if (sel.length !== 1) {
        if (sel.length > 1) {
          const size = sel.filter((e) => !e.dir).reduce((a, e) => a + (e.size || 0), 0);
          preview.append(h('div.fm-pv-icon', { html: fileGlyph('', true) }), h('div.fm-pv-name', `${sel.length} Elemente ausgewählt`), h('div.fm-pv-meta', size ? bytes(size) : ''));
        } else {
          const label = st.path === ':recent' ? 'Zuletzt geöffnet' : (pathx.base(st.path) || st.path);
          preview.append(h('div.fm-pv-icon', { html: fileGlyph('', true) }), h('div.fm-pv-name', label), h('div.fm-pv-meta', `${rendered.length} Elemente`),
            h('div.fm-pv-hint', 'Wähle eine Datei für die Vorschau.'));
        }
        return;
      }
      const e = sel[0];
      const kind = fileKind(e.ext, e.dir);
      const head = h('div.fm-pv-icon', { html: fileGlyph(e.ext, e.dir) });
      preview.append(head);
      if (kind === 'image' && fileUrl(e.path)) {
        head.className = 'fm-pv-img';
        head.innerHTML = '';
        const img = h('img', { src: fileUrl(e.path), alt: '' });
        img.addEventListener('load', () => { dims.textContent = `${img.naturalWidth} × ${img.naturalHeight} Pixel`; });
        head.append(img);
      }
      const dims = h('div.fm-pv-meta');
      preview.append(h('div.fm-pv-name', e.name), h('div.fm-pv-meta', KIND_LABEL[kind] + (e.dir ? '' : ' · ' + bytes(e.size))), dims);
      const rows = h('div.fm-pv-rows');
      preview.append(rows);
      try {
        const s2 = await api.fs.stat(e.path);
        if (token !== previewToken) return;
        rows.append(h('div', h('span', 'Geändert'), h('b', dateShort(s2.mtime))), h('div', h('span', 'Erstellt'), h('b', dateShort(s2.ctime))));
      } catch (_) {}
      if (e.dir) {
        try {
          const list = await api.fs.list(e.path);
          if (token !== previewToken) return;
          rows.append(h('div', h('span', 'Inhalt'), h('b', `${list.filter((x) => x.dir).length} Ordner, ${list.filter((x) => !x.dir).length} Dateien`)));
        } catch (_) {}
      }
      if ((kind === 'text' || kind === 'code') && e.size < 2e6) {
        try {
          const txt = await api.fs.readText(e.path);
          if (token !== previewToken) return;
          preview.append(h('pre.fm-pv-text', txt.slice(0, 3000) + (txt.length > 3000 ? '\n…' : '')));
        } catch (_) {}
      }
      if (kind === 'audio' && fileUrl(e.path)) preview.append(h('audio.fm-pv-audio', { controls: true, src: fileUrl(e.path) }));
      if (kind === 'video' && fileUrl(e.path)) preview.append(h('video.fm-pv-video', { controls: true, src: fileUrl(e.path) }));
      preview.append(h('div.fm-pv-actions',
        h('button.btn.sm.primary', { html: `${icon('external')} Öffnen`, onclick: () => openEntry(e) }),
        !e.dir ? h('button.btn.sm', { html: `${icon('box')} Mit Windows`, onclick: () => openPath(e.path, { external: true }) }) : null,
        h('button.btn.sm', { html: `${icon('copy')} Pfad`, onclick: copyPaths })));
    }

    // ---------- Seitenleiste ----------
    async function renderSidebar() {
      clear(sidebar);
      const fav = [
        ['home', 'Persönlich', places.home], ['monitor', 'Desktop', places.desktop], ['fileText', 'Dokumente', places.documents],
        ['download', 'Downloads', places.downloads], ['image', 'Bilder', places.pictures], ['music', 'Musik', places.music], ['video', 'Videos', places.videos],
      ].filter((x, i, arr) => x[2] && (i === 0 || (x[2] !== places.home && arr.findIndex((y) => y[2] === x[2]) === i)));
      const pinned = store.get('filesPinned', []) || [];
      sidebar.append(h('div.side-label', 'Favoriten'));
      for (const [ic, label, p] of fav) sidebar.append(sideItem(ic, label, p));
      if (pinned.length) {
        sidebar.append(h('div.side-label', 'Angeheftet'));
        for (const p of pinned) {
          const it = sideItem('pin', pathx.base(p), p);
          it.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenu(e.clientX, e.clientY, [{ label: 'Lösen', icon: 'x', action: () => { store.set('filesPinned', pinned.filter((x) => x !== p)); renderSidebar(); } }]); });
          sidebar.append(it);
        }
      }
      sidebar.append(h('div.side-label', 'Laufwerke'));
      try {
        for (const d of await api.fs.drives()) {
          const it = sideItem('hardDrive', d.name === '/' ? 'System' : `Laufwerk (${d.name})`, d.path);
          if (d.total) {
            const pct = (1 - d.free / d.total) * 100;
            it.title = `${bytes(d.free)} frei von ${bytes(d.total)}`;
            it.append(h('div.progress.meter', h('i', { style: { width: pct + '%', background: pct > 90 ? 'var(--danger)' : '' } })));
          }
          sidebar.append(it);
        }
      } catch (_) {}
      sidebar.append(h('div.side-label', 'Bereiche'));
      sidebar.append(h('button.side-item', { class: st.path === ':recent' ? 'on' : '', html: `${icon('history')}<span>Zuletzt geöffnet</span>`, onclick: () => go(':recent') }));
    }

    function sideItem(ic, label, p) {
      const el = h('button.side-item', { class: samePath(p, st.path) ? 'on' : '', html: `${icon(ic)}<span class="ellipsis">${esc(label)}</span>`, title: p, onclick: () => go(p) });
      dropTarget(el, p);
      return el;
    }

    function samePath(a, b) { return a && b && a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase(); }

    // ---------- Navigation ----------
    async function go(p, push = true) {
      if (!p) return;
      if (push && p !== st.path) { st.history.push(st.path); st.future = []; }
      st.path = p;
      st.filter = '';
      search.value = '';
      st.searchResults = null;
      st.selected.clear();
      await load();
    }
    function back() { if (st.history.length) { st.future.push(st.path); go(st.history.pop(), false); } }
    function forward() { if (st.future.length) { st.history.push(st.path); go(st.future.pop(), false); } }

    async function load() {
      st.loading = true;
      renderChrome();
      try {
        if (st.path === ':recent') {
          st.entries = recentFiles().map((f) => ({ ...f, dir: false, size: null, mtime: null }));
        } else {
          st.entries = await api.fs.list(st.path, st.hidden);
        }
      } catch (e) {
        st.entries = [];
        showError(e, 'Ordner kann nicht geöffnet werden');
        if (st.history.length) { st.path = st.history.pop(); return load(); }
      }
      st.loading = false;
      win.setTitle(st.path === ':recent' ? 'Zuletzt geöffnet' : (pathx.base(st.path) || st.path));
      renderChrome();
      renderSidebar();
      renderContent();
    }

    function renderChrome() {
      backBtn.disabled = !st.history.length;
      fwdBtn.disabled = !st.future.length;
      upBtn.disabled = st.path === ':recent' || pathx.dir(st.path) === st.path;
      clear(crumbs);
      if (st.path === ':recent') { crumbs.append(h('span.fm-crumb.on', 'Zuletzt geöffnet')); return; }
      const parts = pathx.crumbs(st.path);
      parts.forEach((c, i) => {
        if (i) crumbs.append(h('span.fm-crumb-sep', { html: icon('chevronRight') }));
        const el = h('button.fm-crumb', { class: i === parts.length - 1 ? 'on' : '', onclick: () => go(c.path) }, c.name);
        dropTarget(el, c.path);
        crumbs.append(el);
      });
      crumbs.scrollLeft = 1e6;
    }

    function editPath() {
      if (st.path === ':recent') return;
      crumbs.classList.add('hidden');
      pathInput.classList.remove('hidden');
      pathInput.value = st.path;
      pathInput.focus();
      pathInput.select();
    }
    const endEdit = () => { pathInput.classList.add('hidden'); crumbs.classList.remove('hidden'); };
    pathInput.addEventListener('blur', endEdit);
    pathInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') { endEdit(); content.focus(); }
      if (e.key === 'Enter') {
        const p = pathInput.value.trim();
        endEdit();
        try { const s = await api.fs.stat(p); if (s.dir) go(p); else openPath(p); } catch (_) { toast('Pfad nicht gefunden', p, { kind: 'warn' }); }
      }
    });

    // ---------- Inhalt ----------
    function visibleEntries() {
      let list = st.searchResults || st.entries;
      if (st.filter && !st.searchResults) {
        const f = st.filter.toLowerCase();
        list = list.filter((e) => e.name.toLowerCase().includes(f));
      }
      const { key, dir } = st.sort;
      const kindOf = (e) => KIND_LABEL[fileKind(e.ext, e.dir)];
      return [...list].sort((a, b) => {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
        let r = 0;
        if (key === 'name') r = a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' });
        else if (key === 'mtime') r = (a.mtime || 0) - (b.mtime || 0);
        else if (key === 'size') r = (a.size || 0) - (b.size || 0);
        else if (key === 'type') r = kindOf(a).localeCompare(kindOf(b), 'de') || a.name.localeCompare(b.name, 'de');
        return r * dir;
      });
    }

    let rendered = [];
    function renderContent() {
      clear(content);
      content.className = 'fm-content ' + (st.view === 'grid' ? 'fm-grid' : 'fm-list');
      rendered = visibleEntries();
      if (st.loading) { content.append(h('div.empty', h('div.spinner'))); return; }
      if (!rendered.length) {
        content.append(h('div.empty', { html: st.filter || st.searchResults ? `${icon('search')}<b>Nichts gefunden</b><span>Keine Dateien passen zu „${esc(st.filter)}“.</span>` : `${icon('folder')}<b>Dieser Ordner ist leer</b><span>Rechtsklick → Neu, oder Dateien hierher ziehen.</span>` }));
        updateStatus();
        return;
      }
      if (st.view === 'list') {
        const hd = (key, label, cls = '') => h('button.fm-th' + cls, { onclick: () => setSort(key) }, label, st.sort.key === key ? h('span', { html: icon(st.sort.dir > 0 ? 'chevronUp' : 'chevronDown') }) : null);
        content.append(h('div.fm-row.fm-head', hd('name', 'Name', '.c-name'), hd('mtime', 'Geändert', '.c-date'), hd('type', 'Typ', '.c-type'), hd('size', 'Größe', '.c-size')));
      }
      const frag = document.createDocumentFragment();
      rendered.forEach((e, i) => frag.append(item(e, i)));
      content.append(frag);
      updateStatus();
    }

    function item(e, i) {
      const kind = fileKind(e.ext, e.dir);
      let el;
      if (st.view === 'grid') {
        const thumb = h('div.fm-thumb', { html: fileGlyph(e.ext, e.dir) });
        if (kind === 'image' && fileUrl(e.path) && e.size < 40 * 1024 * 1024) {
          const img = h('img', { loading: 'lazy', src: fileUrl(e.path), alt: '', onerror: () => img.remove() });
          thumb.classList.add('has-img');
          thumb.append(img);
        }
        el = h('div.fm-item', { title: e.path }, thumb, h('span.fm-name', e.name));
      } else {
        el = h('div.fm-row', { title: e.path },
          h('div.c-name', { html: `${fileGlyph(e.ext, e.dir)}<span class="ellipsis">${esc(e.name)}</span>` }),
          h('div.c-date', e.mtime ? dateShort(e.mtime) : ''),
          h('div.c-type', KIND_LABEL[kind] + (e.ext && !e.dir ? ` (.${e.ext})` : '')),
          h('div.c-size', e.dir ? '' : bytes(e.size)));
      }
      el.dataset.i = i;
      if (st.selected.has(e.path)) el.classList.add('sel');
      if (fileClip.mode === 'cut' && fileClip.paths.includes(e.path)) el.classList.add('cut');
      el.draggable = st.path !== ':recent';
      el.addEventListener('click', (ev) => select(i, ev));
      el.addEventListener('dblclick', () => openEntry(e));
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (!st.selected.has(e.path)) select(i, {});
        itemMenu(ev.clientX, ev.clientY);
      });
      el.addEventListener('dragstart', (ev) => {
        if (!st.selected.has(e.path)) select(i, {});
        const paths = [...st.selected];
        ev.dataTransfer.setData('application/x-nova-paths', JSON.stringify(paths));
        ev.dataTransfer.setData('text/plain', paths.join('\n'));
        ev.dataTransfer.effectAllowed = 'copyMove';
      });
      if (e.dir) dropTarget(el, e.path);
      return el;
    }

    function select(i, ev) {
      const e = rendered[i];
      if (!e) return;
      if (ev.shiftKey && st.anchor != null) {
        const [a, b] = [Math.min(st.anchor, i), Math.max(st.anchor, i)];
        if (!ev.ctrlKey) st.selected.clear();
        for (let k = a; k <= b; k++) st.selected.add(rendered[k].path);
      } else if (ev.ctrlKey) {
        st.selected.has(e.path) ? st.selected.delete(e.path) : st.selected.add(e.path);
        st.anchor = i;
      } else {
        st.selected.clear();
        st.selected.add(e.path);
        st.anchor = i;
      }
      content.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('sel', st.selected.has(rendered[+el.dataset.i].path)));
      updateStatus();
    }

    function selectedEntries() { return rendered.filter((e) => st.selected.has(e.path)); }

    function updateStatus() {
      updatePreview();
      clear(status);
      const sel = selectedEntries();
      const total = rendered.length;
      status.append(h('span', `${total} ${total === 1 ? 'Element' : 'Elemente'}`));
      if (sel.length) {
        const size = sel.filter((e) => !e.dir).reduce((a, e) => a + (e.size || 0), 0);
        status.append(h('span', `${sel.length} ausgewählt${size ? ' · ' + bytes(size) : ''}`));
      }
      if (fileClip.paths.length) status.append(h('span', { html: `${icon(fileClip.mode === 'cut' ? 'scissors' : 'copy')} ${fileClip.paths.length} in Zwischenablage` }));
      status.append(h('span.grow'));
      if (st.searchResults) status.append(h('span', `Suchergebnisse für „${st.filter}“`));
    }

    function openEntry(e) {
      if (e.dir) go(e.path);
      else openPath(e.path);
    }

    // ---------- Aktionen ----------
    async function newFolder() {
      if (st.path === ':recent') return;
      const n = await promptDialog({ title: 'Neuer Ordner', value: 'Neuer Ordner', ok: 'Erstellen' });
      if (!n) return;
      try { const p = await api.fs.mkdir(st.path, n); await load(); selectPath(p); } catch (e) { showError(e); }
    }

    async function newFile(name = 'Neues Dokument.txt') {
      if (st.path === ':recent') return;
      const n = await promptDialog({ title: 'Neue Datei', value: name, ok: 'Erstellen' });
      if (!n) return;
      try { const p = await api.fs.newFile(st.path, n); await load(); selectPath(p); } catch (e) { showError(e); }
    }

    function selectPath(p) {
      const i = rendered.findIndex((e) => e.path === p);
      if (i >= 0) { select(i, {}); content.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); }
    }

    async function rename() {
      const [e] = selectedEntries();
      if (!e) return;
      const n = await promptDialog({ title: 'Umbenennen', value: e.name, ok: 'Umbenennen' });
      if (!n || n === e.name) return;
      try { const p = await api.fs.rename(e.path, n); await load(); selectPath(p); } catch (err) { showError(err); }
    }

    async function trash() {
      const sel = selectedEntries();
      if (!sel.length) return;
      const ok = await confirmDialog({
        title: sel.length === 1 ? `„${sel[0].name}“ löschen?` : `${sel.length} Elemente löschen?`,
        message: 'Die Elemente werden in den Papierkorb verschoben und können dort wiederhergestellt werden.',
        ok: 'In den Papierkorb', danger: true,
      });
      if (!ok) return;
      try { await api.fs.trash(sel.map((e) => e.path)); toast('In den Papierkorb verschoben', `${sel.length} Element(e)`, { icon: 'trash', duration: 2500 }); load(); } catch (err) { showError(err); }
    }

    function clipSet(mode) {
      const paths = [...st.selected];
      if (!paths.length) return;
      fileClip.mode = mode;
      fileClip.paths = paths;
      api.clip.write(paths.join('\n'));
      renderContent();
    }

    async function paste(target = st.path) {
      if (!fileClip.paths.length || target === ':recent') return;
      try {
        const out = fileClip.mode === 'cut' ? await api.fs.move(fileClip.paths, target) : await api.fs.copy(fileClip.paths, target);
        toast(fileClip.mode === 'cut' ? 'Verschoben' : 'Kopiert', `${out.length} Element(e) nach ${pathx.base(target)}`, { icon: fileClip.mode === 'cut' ? 'scissors' : 'copy', duration: 2500 });
        if (fileClip.mode === 'cut') { fileClip.mode = null; fileClip.paths = []; }
        await load();
        out.forEach((p) => st.selected.add(p));
        renderContent();
      } catch (e) { showError(e, 'Einfügen fehlgeschlagen'); load(); }
    }

    function dropTarget(el, target) {
      el.addEventListener('dragover', (ev) => {
        if (!ev.dataTransfer.types.includes('application/x-nova-paths')) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = ev.ctrlKey ? 'copy' : 'move';
        el.classList.add('drop');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', async (ev) => {
        el.classList.remove('drop');
        const raw = ev.dataTransfer.getData('application/x-nova-paths');
        if (!raw) return;
        ev.preventDefault();
        ev.stopPropagation();
        const paths = JSON.parse(raw).filter((p) => !samePath(p, target) && !samePath(pathx.dir(p), target));
        if (!paths.length) return;
        try {
          const out = ev.ctrlKey ? await api.fs.copy(paths, target) : await api.fs.move(paths, target);
          toast(ev.ctrlKey ? 'Kopiert' : 'Verschoben', `${out.length} Element(e) → ${pathx.base(target)}`, { icon: ev.ctrlKey ? 'copy' : 'folder', duration: 2200 });
          load();
        } catch (e) { showError(e); }
      });
    }
    // In leeren Bereich dieses Fensters ziehen = in aktuellen Ordner
    content.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('application/x-nova-paths') && st.path !== ':recent') { ev.preventDefault(); } });
    content.addEventListener('drop', async (ev) => {
      const raw = ev.dataTransfer.getData('application/x-nova-paths');
      if (!raw || ev.defaultPrevented) return;
      ev.preventDefault();
      const paths = JSON.parse(raw).filter((p) => !samePath(pathx.dir(p), st.path));
      if (!paths.length) return;
      try { ev.ctrlKey ? await api.fs.copy(paths, st.path) : await api.fs.move(paths, st.path); load(); } catch (e) { showError(e); }
    });

    function copyPaths() {
      const paths = [...st.selected];
      api.clip.write(paths.join('\n'));
      toast('Pfad kopiert', paths.length === 1 ? paths[0] : `${paths.length} Pfade`, { icon: 'copy', duration: 2000 });
    }

    function itemMenu(x, y) {
      const sel = selectedEntries();
      const one = sel.length === 1 ? sel[0] : null;
      const kind = one ? fileKind(one.ext, one.dir) : null;
      contextMenu(x, y, [
        { label: 'Öffnen', icon: 'external', key: 'Enter', action: () => sel.forEach(openEntry) },
        one && !one.dir ? { label: 'Mit Windows-Programm öffnen', icon: 'box', action: () => openPath(one.path, { external: true }) } : null,
        one && !one.dir && (kind === 'text' || kind === 'code' || one.size < 2e6) ? { label: 'Im Code-Editor öffnen', icon: 'code', action: () => openApp('editor', { path: one.path }) } : null,
        one && one.dir ? { label: 'In neuem Fenster öffnen', icon: 'layout', action: () => openApp('files', { path: one.path }) } : null,
        one && one.dir ? { label: 'Terminal hier öffnen', icon: 'terminal', action: () => openApp('terminal', { cwd: one.path }) } : null,
        one && one.dir ? { label: 'In Seitenleiste anheften', icon: 'pin', action: () => { store.update('filesPinned', (l) => [...new Set([...(l || []), one.path])], []); renderSidebar(); } } : null,
        '-',
        st.path !== ':recent' ? { label: 'Ausschneiden', icon: 'scissors', key: 'Strg+X', action: () => clipSet('cut') } : null,
        { label: 'Kopieren', icon: 'copy', key: 'Strg+C', action: () => clipSet('copy') },
        one && one.dir && fileClip.paths.length ? { label: 'Hier hinein einfügen', icon: 'paste', action: () => paste(one.path) } : null,
        { label: 'Pfad kopieren', icon: 'link', action: copyPaths },
        '-',
        one && st.path !== ':recent' ? { label: 'Umbenennen', icon: 'edit', key: 'F2', action: rename } : null,
        { label: 'Im Explorer zeigen', icon: 'folder', action: () => api.fs.reveal(sel[0].path) },
        one ? { label: 'Eigenschaften', icon: 'info', action: () => properties(one) } : null,
        st.path !== ':recent' ? '-' : null,
        st.path !== ':recent' ? { label: 'In den Papierkorb', icon: 'trash', key: 'Entf', danger: true, action: trash } : null,
      ]);
    }

    function bgMenu(x, y) {
      if (st.path === ':recent') return;
      contextMenu(x, y, [
        { label: 'Neuer Ordner', icon: 'folderPlus', key: 'Strg+⇧+N', action: newFolder },
        { label: 'Neue Textdatei', icon: 'filePlus', action: () => newFile('Neues Dokument.txt') },
        { label: 'Neue Markdown-Datei', icon: 'fileText', action: () => newFile('Notiz.md') },
        '-',
        { label: 'Einfügen', icon: 'paste', key: 'Strg+V', disabled: !fileClip.paths.length, action: () => paste() },
        { label: 'Alles auswählen', icon: 'check', key: 'Strg+A', action: selectAll },
        '-',
        { label: st.view === 'grid' ? 'Listenansicht' : 'Rasteransicht', icon: st.view === 'grid' ? 'list' : 'grid', action: () => setView(st.view === 'grid' ? 'list' : 'grid') },
        { label: st.hidden ? 'Versteckte ausblenden' : 'Versteckte anzeigen', icon: st.hidden ? 'eyeOff' : 'eye', action: toggleHidden },
        { label: 'Aktualisieren', icon: 'refresh', key: 'F5', action: load },
        '-',
        { label: 'Terminal hier öffnen', icon: 'terminal', action: () => openApp('terminal', { cwd: st.path }) },
        { label: 'Im Explorer öffnen', icon: 'external', action: () => api.fs.open(st.path) },
        { label: 'Pfad kopieren', icon: 'link', action: () => { api.clip.write(st.path); toast('Pfad kopiert', st.path, { icon: 'copy', duration: 1800 }); } },
      ]);
    }

    async function properties(e) {
      let info = '';
      try {
        const s = await api.fs.stat(e.path);
        info = `${KIND_LABEL[fileKind(e.ext, e.dir)]}${s.dir ? '' : ' · ' + bytes(s.size)}\nErstellt: ${dateShort(s.ctime)}\nGeändert: ${dateShort(s.mtime)}\n${e.path}`;
      } catch (err) { info = String(err.message); }
      const { alertDialog } = await import('../core/ui.js');
      alertDialog({ title: e.name, message: info });
    }

    function selectAll() {
      rendered.forEach((e) => st.selected.add(e.path));
      renderContent();
    }

    function setView(v) {
      st.view = v;
      store.set('filesView', v);
      viewBtn.innerHTML = icon(v === 'grid' ? 'list' : 'grid');
      renderContent();
    }

    function setSort(key) {
      st.sort = st.sort.key === key ? { key, dir: -st.sort.dir } : { key, dir: 1 };
      store.set('filesSort', st.sort);
      renderContent();
    }

    function toggleHidden() {
      st.hidden = !st.hidden;
      store.set('filesHidden', st.hidden);
      load();
    }

    function sortMenu(btnEl) {
      const r = btnEl.getBoundingClientRect();
      const mark = (k) => (st.sort.key === k ? (st.sort.dir > 0 ? ' ↑' : ' ↓') : '');
      contextMenu(r.left, r.bottom + 4, [
        { label: 'Name' + mark('name'), icon: 'type', action: () => setSort('name') },
        { label: 'Änderungsdatum' + mark('mtime'), icon: 'clock', action: () => setSort('mtime') },
        { label: 'Typ' + mark('type'), icon: 'tag', action: () => setSort('type') },
        { label: 'Größe' + mark('size'), icon: 'hardDrive', action: () => setSort('size') },
      ]);
    }

    function moreMenu(btnEl) {
      const r = btnEl.getBoundingClientRect();
      contextMenu(r.right - 220, r.bottom + 4, [
        { label: 'Neue Textdatei', icon: 'filePlus', action: () => newFile() },
        { label: st.hidden ? 'Versteckte ausblenden' : 'Versteckte anzeigen', icon: st.hidden ? 'eyeOff' : 'eye', action: toggleHidden },
        { label: 'Neues Fenster', icon: 'layout', action: () => openApp('files', { path: st.path }) },
        { label: 'Terminal hier öffnen', icon: 'terminal', action: () => openApp('terminal', { cwd: st.path }) },
        { label: 'Im Windows-Explorer öffnen', icon: 'external', action: () => api.fs.open(st.path) },
      ]);
    }

    // ---------- Suche ----------
    search.addEventListener('input', debounce(() => {
      st.filter = search.value.trim();
      st.searchResults = null;
      renderContent();
    }, 120));
    search.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && st.filter && st.path !== ':recent') {
        status.textContent = 'Durchsuche Unterordner …';
        try {
          const res = await api.fs.search(st.path, st.filter, 300);
          st.searchResults = res.map((r) => ({ ...r, size: null, mtime: null }));
          renderContent();
        } catch (err) { showError(err); }
      }
      if (e.key === 'Escape') { search.value = ''; st.filter = ''; st.searchResults = null; renderContent(); content.focus(); }
    });

    // ---------- Tastatur & Maus ----------
    content.addEventListener('click', (e) => {
      if (e.target === content) { st.selected.clear(); renderContent(); }
    });
    content.addEventListener('contextmenu', (e) => {
      if (e.target.closest('[data-i]')) return;
      e.preventDefault();
      bgMenu(e.clientX, e.clientY);
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (k === 'Enter') { selectedEntries().forEach(openEntry); }
      else if (k === 'Backspace' || (e.altKey && k === 'ArrowUp')) { e.preventDefault(); if (!upBtn.disabled) go(pathx.dir(st.path)); }
      else if (e.altKey && k === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.altKey && k === 'ArrowRight') { e.preventDefault(); forward(); }
      else if (k === 'Delete') trash();
      else if (k === 'F2') rename();
      else if (k === 'F5') { e.preventDefault(); load(); }
      else if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
      else if (ctrl && k.toLowerCase() === 'c') clipSet('copy');
      else if (ctrl && k.toLowerCase() === 'x' && st.path !== ':recent') clipSet('cut');
      else if (ctrl && k.toLowerCase() === 'v') paste();
      else if (ctrl && e.shiftKey && k.toLowerCase() === 'n') { e.preventDefault(); newFolder(); }
      else if (ctrl && k.toLowerCase() === 'f') { e.preventDefault(); search.focus(); }
      else if (ctrl && k.toLowerCase() === 'l') { e.preventDefault(); editPath(); }
      else if (e.altKey && k.toLowerCase() === 'p') { e.preventDefault(); togglePreview(); }
      else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(k) && !e.altKey) {
        e.preventDefault();
        const cur = st.anchor ?? -1;
        let cols = 1;
        if (st.view === 'grid') {
          const first = content.querySelector('.fm-item');
          if (first) cols = Math.max(1, Math.floor(content.clientWidth / first.getBoundingClientRect().width));
        }
        const delta = { ArrowDown: cols, ArrowUp: -cols, ArrowLeft: st.view === 'grid' ? -1 : 0, ArrowRight: st.view === 'grid' ? 1 : 0 }[k];
        const next = Math.max(0, Math.min(rendered.length - 1, cur + delta));
        select(next, { shiftKey: e.shiftKey });
        content.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' });
      } else if (k.length === 1 && !ctrl && !e.altKey) {
        // Tippen springt zum ersten passenden Namen
        const i = rendered.findIndex((x) => x.name.toLowerCase().startsWith(k.toLowerCase()));
        if (i >= 0) { select(i, {}); content.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); }
      }
    });

    await go(st.path, false);
    setTimeout(() => content.focus(), 50);

    const fit = () => win.el.classList.toggle('narrow', win.w < 780);
    fit();
    return {
      onResize: fit,
      onArgs(a) { if (a.path) go(a.path); },
      onFocus() { if (st.path !== ':recent') { /* still */ } },
      getState() { return { path: st.path === ':recent' ? places.home : st.path }; },
    };
  },
};
