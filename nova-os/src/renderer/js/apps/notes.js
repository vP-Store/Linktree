// Notizen: Markdown-Notizen als echte .md-Dateien in Dokumente/NovaOS/Notizen.

import { h, clear, esc, timeAgo, debounce, pathx } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { renderMarkdown, toggleTask } from '../core/markdown.js';
import { confirmDialog, showError, contextMenu, toast } from '../core/ui.js';
import { openApp } from '../core/wm.js';

function titleOf(text) {
  const line = (text || '').split('\n').find((l) => l.trim()) || '';
  return line.replace(/^#+\s*/, '').trim().slice(0, 80) || 'Neue Notiz';
}
function snippet(text) {
  const lines = (text || '').split('\n').filter((l) => l.trim());
  return lines.slice(1).join(' ').replace(/[#*_`>[\]-]/g, '').trim().slice(0, 120);
}
function safeName(t) {
  return (t.replace(/[\\/:*?"<>|#]/g, '').trim().slice(0, 60) || 'Notiz');
}

export default {
  async mount(root, win, args) {
    const places = await api.fs.places();
    const dir = pathx.join(places.novaData, 'Notizen');
    let notes = []; // { path, text, mtime }
    let cur = null;
    let mode = store.get('notesMode', 'split');
    const pinned = new Set(store.get('notesPinned', []) || []);

    const search = h('input.input', { placeholder: 'Notizen durchsuchen …', spellcheck: false });
    const listEl = h('div.notes-list');
    const ta = h('textarea.notes-ta', { spellcheck: true, placeholder: '# Titel\n\nSchreibe hier deine Gedanken … Markdown wird unterstützt.' });
    const prev = h('div.notes-prev.md-body');
    const meta = h('span.faint');
    const modeBtns = {};
    const modeBar = h('div.seg', ...[['edit', 'edit', 'Schreiben'], ['split', 'columns', 'Geteilt'], ['view', 'eye', 'Ansicht']].map(([m, ic, t]) => {
      const b = h('button.seg-btn', { title: t, html: `${icon(ic)}<span>${t}</span>`, onclick: () => setMode(m) });
      modeBtns[m] = b;
      return b;
    }));
    const editorArea = h('div.notes-edit', ta, prev);
    const emptyState = h('div.empty.notes-empty', { html: `${icon('stickyNote')}<b>Keine Notiz ausgewählt</b><span>Erstelle eine neue Notiz mit Strg+N.</span>` });
    const main = h('div.app-main',
      h('div.app-toolbar', modeBar, h('div.grow'), meta,
        h('button.icon-btn', { title: 'Notiz anheften', html: icon('pin'), onclick: () => cur && togglePin(cur) }),
        h('button.icon-btn', { title: 'Als PDF exportieren', html: icon('download'), onclick: () => cur && exportPdf(cur) }),
        h('button.icon-btn', { title: 'Als Datei im Editor öffnen', html: icon('code'), onclick: () => cur && openApp('editor', { path: cur.path }) }),
        h('button.icon-btn', { title: 'Löschen', html: icon('trash'), onclick: () => cur && remove(cur) })),
      editorArea, emptyState);
    root.append(h('div.app-split',
      h('div.app-sidebar.notes-side',
        h('div.row', { style: { marginBottom: '10px' } },
          h('div.search-field.grow', { html: icon('search') }, search),
          h('button.icon-btn', { title: 'Neue Notiz (Strg+N)', html: icon('plus'), onclick: () => create() })),
        listEl),
      main));

    async function load() {
      try {
        if (!(await api.fs.exists(dir))) {
          await api.fs.writeText(pathx.join(dir, 'Willkommen.md'), '# Willkommen in Notizen\n\nDeine Notizen werden als **Markdown-Dateien** gespeichert in:\n\n`' + dir + '`\n\n## Was geht?\n\n- [x] Überschriften, **fett**, _kursiv_, `Code`\n- [ ] Aufgabenlisten zum Abhaken\n- [ ] Links wie https://example.com\n\n> Tipp: Strg+N erstellt eine neue Notiz.\n');
        }
        const files = (await api.fs.list(dir)).filter((f) => !f.dir && /\.(md|txt)$/i.test(f.name));
        notes = await Promise.all(files.map(async (f) => ({ path: f.path, mtime: f.mtime, text: await api.fs.readText(f.path).catch(() => '') })));
      } catch (e) { showError(e, 'Notizen konnten nicht geladen werden'); notes = []; }
      sortNotes();
      renderList();
      if (!cur && notes.length) select(notes[0]);
      else if (!notes.length) select(null);
    }

    function sortNotes() {
      notes.sort((a, b) => (pinned.has(b.path) - pinned.has(a.path)) || b.mtime - a.mtime);
    }

    function renderList() {
      clear(listEl);
      const q = search.value.trim().toLowerCase();
      const shown = notes.filter((n) => !q || n.text.toLowerCase().includes(q));
      if (!shown.length) listEl.append(h('div.faint', { style: { padding: '12px', fontSize: '12.5px' } }, q ? 'Keine Treffer.' : 'Noch keine Notizen.'));
      for (const n of shown) {
        const el = h('button.note-item', { class: n === cur ? 'on' : '', onclick: () => select(n) },
          h('div.note-title', { html: `${pinned.has(n.path) ? icon('pin') : ''}<span class="ellipsis">${esc(titleOf(n.text))}</span>` }),
          h('div.note-snip', snippet(n.text) || 'Kein weiterer Text'),
          h('div.note-date', timeAgo(n.mtime)));
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          contextMenu(e.clientX, e.clientY, [
            { label: pinned.has(n.path) ? 'Lösen' : 'Anheften', icon: 'pin', action: () => togglePin(n) },
            { label: 'Im Editor öffnen', icon: 'code', action: () => openApp('editor', { path: n.path }) },
            { label: 'Im Explorer zeigen', icon: 'folder', action: () => api.fs.reveal(n.path) },
            '-',
            { label: 'Löschen', icon: 'trash', danger: true, action: () => remove(n) },
          ]);
        });
        listEl.append(el);
      }
    }

    function select(n) {
      flush();
      cur = n;
      editorArea.classList.toggle('hidden', !n);
      emptyState.classList.toggle('hidden', !!n);
      if (n) {
        ta.value = n.text;
        renderPrev();
        win.setTitle(`${titleOf(n.text)} – Notizen`);
        meta.textContent = `Bearbeitet ${timeAgo(n.mtime)}`;
      } else win.setTitle('Notizen');
      renderList();
    }

    function renderPrev() { prev.innerHTML = renderMarkdown(ta.value); }

    function setMode(m) {
      mode = m;
      store.set('notesMode', m);
      editorArea.dataset.mode = m;
      Object.entries(modeBtns).forEach(([k, b]) => b.classList.toggle('on', k === m));
      if (m !== 'view') setTimeout(() => ta.focus(), 10);
    }

    let pending = null;
    const saveSoon = debounce(() => flush(), 600);
    function flush() {
      if (!pending) return;
      const n = pending;
      pending = null;
      api.fs.writeText(n.path, n.text).then(() => { meta.textContent = 'Gespeichert'; }).catch((e) => showError(e, 'Notiz nicht gespeichert'));
    }

    ta.addEventListener('input', () => {
      if (!cur) return;
      cur.text = ta.value;
      cur.mtime = Date.now();
      pending = cur;
      meta.textContent = 'Speichert …';
      renderPrev();
      win.setTitle(`${titleOf(cur.text)} – Notizen`);
      const item = listEl.querySelector('.note-item.on');
      if (item) {
        item.querySelector('.note-title span:last-child').textContent = titleOf(cur.text);
        item.querySelector('.note-snip').textContent = snippet(cur.text) || 'Kein weiterer Text';
      }
      saveSoon();
    });
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); toast('Gespeichert', titleOf(cur.text), { icon: 'save', kind: 'ok', duration: 1200 }); }
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
      if (e.key === 'Enter') {
        const v = ta.value, s = ta.selectionStart;
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const li = v.slice(ls, s).match(/^(\s*)([-*+]|\d+\.)\s(\[[ xX]\]\s)?/);
        if (li) {
          e.preventDefault();
          if (v.slice(ls, s).trim() === li[0].trim()) { ta.setRangeText('', ls, s, 'end'); }
          else {
            const marker = /\d+\./.test(li[2]) ? (parseInt(li[2], 10) + 1) + '.' : li[2];
            ta.setRangeText('\n' + li[1] + marker + ' ' + (li[3] ? '[ ] ' : ''), s, ta.selectionEnd, 'end');
          }
          ta.dispatchEvent(new Event('input'));
        }
      }
    });
    prev.addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-task]');
      if (!cb || !cur) return;
      ta.value = toggleTask(ta.value, +cb.dataset.task);
      ta.dispatchEvent(new Event('input'));
    });
    prev.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-ext]');
      if (a) { e.preventDefault(); openApp('browser', { url: a.getAttribute('href') }); }
    });
    root.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); create(); }
    });
    search.addEventListener('input', renderList);

    async function create(text = '') {
      flush();
      const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      const body = text ? `# ${safeName(titleOf(text))}\n\n${text}\n` : '# Neue Notiz\n\n';
      const path = pathx.join(dir, `${stamp} ${safeName(text ? titleOf(text) : 'Notiz')}.md`);
      try {
        await api.fs.writeText(path, body);
        const n = { path, text: body, mtime: Date.now() };
        notes.unshift(n);
        search.value = '';
        select(n);
        if (mode === 'view') setMode('split');
        ta.focus();
        ta.setSelectionRange(2, text ? 2 : body.length - 2);
      } catch (e) { showError(e); }
    }

    async function remove(n) {
      if (!(await confirmDialog({ title: `„${titleOf(n.text)}“ löschen?`, message: 'Die Notiz wird in den Papierkorb verschoben.', ok: 'Löschen', danger: true }))) return;
      try {
        if (pending === n) pending = null;
        await api.fs.trash(n.path);
        notes = notes.filter((x) => x !== n);
        if (cur === n) { cur = null; select(notes[0] || null); } else renderList();
      } catch (e) { showError(e); }
    }

    async function exportPdf(n) {
      flush();
      const title = safeName(titleOf(n.text));
      try {
        const p = await api.tools.pdf(renderMarkdown(n.text), pathx.join(places.documents || places.home, title + '.pdf'), title);
        const { notify } = await import('../core/ui.js');
        notify('PDF gespeichert', p, { icon: 'download', kind: 'ok', onClick: () => api.fs.open(p) });
      } catch (e) { showError(e, 'PDF-Export fehlgeschlagen'); }
    }

    function togglePin(n) {
      pinned.has(n.path) ? pinned.delete(n.path) : pinned.add(n.path);
      store.set('notesPinned', [...pinned]);
      sortNotes();
      renderList();
    }

    setMode(mode);
    await load();
    if (args.action === 'new') create(args.text || '');
    if (args.open) { const n = notes.find((x) => x.path === args.open); if (n) select(n); }

    return {
      onArgs(a) {
        if (a.action === 'new') create(a.text || '');
        if (a.open) { const n = notes.find((x) => x.path === a.open); if (n) { search.value = ''; select(n); } else load().then(() => { const m = notes.find((x) => x.path === a.open); if (m) select(m); }); }
      },
      onFocus() { if (cur && mode !== 'view') setTimeout(() => ta.focus(), 10); },
      onClose() { flush(); return true; },
      destroy() { flush(); },
    };
  },
};
