// Code: Text- & Code-Editor mit Tabs, Syntax-Highlighting, Zeilennummern,
// Suchen/Ersetzen, Markdown-Vorschau und echtem Speichern.

import { h, clear, esc, pathx, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { highlight, langFor, LANG_LABEL } from '../core/highlight.js';
import { renderMarkdown } from '../core/markdown.js';
import { promptDialog, confirmDialog, showError, toast, contextMenu } from '../core/ui.js';
import { addRecentFile } from '../core/winapps.js';
import { openApp } from '../core/wm.js';

let untitled = 1;

export default {
  async mount(root, win, args) {
    const places = await api.fs.places();
    const docs = [];
    let cur = null;
    let wrapOn = store.get('editorWrap', false);
    let fontSize = store.get('editorFont', 13.5);

    // ---------- Gerüst ----------
    const btns = {};
    const tabsEl = h('div.ed-tabs');
    const gutter = h('div.ed-gutter');
    const hl = h('pre.ed-hl', { 'aria-hidden': 'true' });
    const ta = h('textarea.ed-ta', { spellcheck: false, wrap: 'off', autocomplete: 'off', autocapitalize: 'off' });
    const scroller = h('div.ed-scroll', h('div.ed-layer', hl, ta));
    const preview = h('div.ed-preview.md-body.hidden');
    const findBar = h('div.ed-find.hidden');
    const statusL = h('span'), statusR = h('span.grow', { style: { textAlign: 'right' } });
    const editorWrap = h('div.ed-wrap', gutter, scroller);
    root.classList.add('ed-root');
    root.append(
      h('div.app-toolbar.ed-toolbar',
        tb('filePlus', 'Neu (Strg+N)', () => newDoc()),
        tb('folder', 'Öffnen (Strg+O)', () => openDialog()),
        tb('save', 'Speichern (Strg+S)', () => save()),
        h('div.tb-sep'),
        tb('search', 'Suchen & Ersetzen (Strg+F)', () => toggleFind(true)),
        tb('wrap', 'Zeilenumbruch (Alt+Z)', () => setWrap(!wrapOn), 'wrapBtn'),
        tb('zoomOut', 'Kleiner (Strg+-)', () => setFont(fontSize - 1)),
        tb('zoomIn', 'Größer (Strg++)', () => setFont(fontSize + 1)),
        tb('eye', 'Markdown-Vorschau (Strg+Umschalt+V)', () => togglePreview(), 'prevBtn'),
        h('div.grow'),
        tb('terminal', 'Terminal im Ordner der Datei', () => cur && openApp('terminal', { cwd: cur.path ? pathx.dir(cur.path) : places.home })),
      ),
      tabsEl, findBar,
      h('div.ed-main', editorWrap, preview),
      h('div.app-status', statusL, statusR),
    );
    function tb(ic, title, fn, key) {
      const b = h('button.icon-btn', { title, html: icon(ic), onclick: fn });
      if (key) btns[key] = b;
      return b;
    }

    // ---------- Dokumente ----------
    function makeDoc({ path = null, text = '', name } = {}) {
      const d = {
        path, text, saved: text,
        name: name || (path ? pathx.base(path) : `Unbenannt-${untitled++}.txt`),
        lang: langFor(pathx.ext(path || name || '')),
        scroll: 0, sel: [0, 0], preview: false,
      };
      d.tab = h('button.ed-tab', { onclick: () => activate(d), onauxclick: (e) => { if (e.button === 1) closeDoc(d); } },
        h('span.ed-tab-name'), h('span.ed-tab-x', { html: icon('x'), onclick: (e) => { e.stopPropagation(); closeDoc(d); } }));
      d.tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenu(e.clientX, e.clientY, [
          { label: 'Schließen', icon: 'x', action: () => closeDoc(d) },
          { label: 'Andere schließen', icon: 'layers', action: () => docs.filter((x) => x !== d).forEach((x) => closeDoc(x)) },
          d.path ? '-' : null,
          d.path ? { label: 'Pfad kopieren', icon: 'copy', action: () => api.clip.write(d.path) } : null,
          d.path ? { label: 'Im Explorer zeigen', icon: 'folder', action: () => api.fs.reveal(d.path) } : null,
        ]);
      });
      docs.push(d);
      tabsEl.append(d.tab);
      refreshTab(d);
      return d;
    }

    function refreshTab(d) {
      d.tab.querySelector('.ed-tab-name').textContent = (d.text !== d.saved ? '● ' : '') + d.name;
      d.tab.title = d.path || d.name;
      d.tab.classList.toggle('on', d === cur);
      d.tab.classList.toggle('dirty', d.text !== d.saved);
    }

    function activate(d) {
      if (cur) { cur.scroll = scroller.scrollTop; cur.sel = [ta.selectionStart, ta.selectionEnd]; }
      cur = d;
      docs.forEach(refreshTab);
      ta.value = d.text;
      ta.setSelectionRange(d.sel[0], d.sel[1]);
      render();
      scroller.scrollTop = d.scroll;
      applyPreview();
      win.setTitle(`${d.name} – Code`);
      setTimeout(() => ta.focus(), 10);
    }

    async function openFile(path) {
      const existing = docs.find((d) => d.path && d.path.toLowerCase() === path.toLowerCase());
      if (existing) return activate(existing);
      try {
        const text = await api.fs.readText(path);
        if (/\u0000/.test(text.slice(0, 2000))) throw new Error('Das sieht nach einer Binärdatei aus.');
        // leeren Platzhalter-Tab ersetzen
        if (docs.length === 1 && !docs[0].path && !docs[0].text && docs[0].text === docs[0].saved) removeDoc(docs[0]);
        addRecentFile(path);
        activate(makeDoc({ path, text }));
      } catch (e) { showError(e, 'Datei konnte nicht geöffnet werden'); if (!docs.length) newDoc(); }
    }

    function newDoc(text = '') {
      const d = makeDoc({ text });
      d.saved = '';
      activate(d);
      refreshTab(d);
    }

    function removeDoc(d) {
      docs.splice(docs.indexOf(d), 1);
      d.tab.remove();
      if (cur === d) cur = null;
    }

    async function closeDoc(d) {
      if (d.text !== d.saved) {
        const ok = await confirmDialog({ title: `„${d.name}“ schließen?`, message: 'Ungespeicherte Änderungen gehen verloren.', ok: 'Verwerfen', danger: true });
        if (!ok) return false;
      }
      const i = docs.indexOf(d);
      removeDoc(d);
      if (!docs.length) { win.close(true); return true; }
      if (!cur) activate(docs[Math.max(0, i - 1)]);
      return true;
    }

    async function save(as = false) {
      const d = cur;
      if (!d) return;
      let p = d.path;
      if (!p || as) {
        const suggestion = p || pathx.join(places.documents || places.home, d.name);
        p = await promptDialog({ title: 'Speichern unter', message: 'Vollständiger Pfad der Datei:', value: suggestion, ok: 'Speichern', select: false });
        if (!p) return;
        if (p !== d.path && await api.fs.exists(p) && !(await confirmDialog({ title: 'Datei überschreiben?', message: p, ok: 'Überschreiben', danger: true }))) return;
      }
      try {
        await api.fs.writeText(p, d.text);
        d.path = p;
        d.name = pathx.base(p);
        d.lang = langFor(pathx.ext(p));
        d.saved = d.text;
        refreshTab(d);
        render();
        win.setTitle(`${d.name} – Code`);
        addRecentFile(p);
        toast('Gespeichert', d.name, { icon: 'save', kind: 'ok', duration: 1600 });
      } catch (e) { showError(e, 'Speichern fehlgeschlagen'); }
    }

    async function openDialog() {
      const p = await promptDialog({ title: 'Datei öffnen', message: 'Pfad der Datei (oder per Rechtsklick im Dateimanager „Im Code-Editor öffnen“):', value: cur && cur.path ? pathx.dir(cur.path) + (api.platform === 'win32' ? '\\' : '/') : (places.documents || places.home) + (api.platform === 'win32' ? '\\' : '/'), ok: 'Öffnen', select: false });
      if (p) openFile(p);
    }

    // ---------- Darstellung ----------
    let gutterLines = -1;
    function render() {
      if (!cur) return;
      const text = ta.value;
      hl.innerHTML = highlight(text, cur.lang) + '\n ';
      const lines = text.split('\n').length;
      if (gutterLines !== lines) {
        gutterLines = lines;
        let s = '';
        for (let i = 1; i <= lines; i++) s += i + '\n';
        gutter.textContent = s;
      }
      updateStatus();
      if (cur.preview) preview.innerHTML = renderMarkdown(text);
    }

    function updateStatus() {
      if (!cur) return;
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const ln = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      const selLen = Math.abs(ta.selectionEnd - ta.selectionStart);
      statusL.textContent = `Zeile ${ln}, Spalte ${col}${selLen ? ` (${selLen} ausgewählt)` : ''}`;
      const words = (ta.value.match(/\S+/g) || []).length;
      statusR.textContent = `${words} Wörter · ${LANG_LABEL[cur.lang]} · UTF-8 · ${cur.path || 'nicht gespeichert'}`;
    }

    function syncScroll() {
      gutter.scrollTop = scroller.scrollTop;
    }

    function setWrap(on) {
      wrapOn = on;
      store.set('editorWrap', on);
      root.classList.toggle('ed-wrapped', on);
      ta.setAttribute('wrap', on ? 'soft' : 'off');
      btns.wrapBtn.classList.toggle('on', on);
      gutter.classList.toggle('hidden', on);
    }

    function setFont(px) {
      fontSize = Math.max(10, Math.min(28, px));
      store.set('editorFont', fontSize);
      root.style.setProperty('--ed-font', fontSize + 'px');
    }

    function togglePreview() {
      if (!cur) return;
      cur.preview = !cur.preview;
      applyPreview();
    }

    function applyPreview() {
      const on = cur && cur.preview;
      preview.classList.toggle('hidden', !on);
      btns.prevBtn.classList.toggle('on', !!on);
      if (on) preview.innerHTML = renderMarkdown(ta.value);
    }

    preview.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-ext]');
      if (a) { e.preventDefault(); openApp('browser', { url: a.getAttribute('href') }); }
    });

    // ---------- Suchen & Ersetzen ----------
    const fIn = h('input.input', { placeholder: 'Suchen', spellcheck: false });
    const rIn = h('input.input', { placeholder: 'Ersetzen', spellcheck: false });
    const fCount = h('span.faint', { style: { fontSize: '12px', minWidth: '70px' } });
    const caseBtn = h('button.icon-btn.sm', { title: 'Groß/Kleinschreibung', html: '<b style="font-size:12px">Aa</b>' });
    let matchCase = false;
    caseBtn.onclick = () => { matchCase = !matchCase; caseBtn.classList.toggle('on', matchCase); countMatches(); };
    findBar.append(fIn, caseBtn, fCount,
      h('button.btn.sm', { onclick: () => findNext(-1), html: icon('arrowUp') }),
      h('button.btn.sm', { onclick: () => findNext(1), html: icon('arrowDown') }),
      rIn,
      h('button.btn.sm', { onclick: replaceOne }, 'Ersetzen'),
      h('button.btn.sm', { onclick: replaceAll }, 'Alle'),
      h('button.icon-btn.sm', { html: icon('x'), onclick: () => toggleFind(false) }));

    function toggleFind(on) {
      findBar.classList.toggle('hidden', !on);
      if (on) {
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        if (sel && !sel.includes('\n')) fIn.value = sel;
        fIn.focus(); fIn.select(); countMatches();
      } else ta.focus();
    }
    function norm(s) { return matchCase ? s : s.toLowerCase(); }
    function countMatches() {
      const q = fIn.value;
      if (!q) { fCount.textContent = ''; return; }
      const n = norm(ta.value).split(norm(q)).length - 1;
      fCount.textContent = n ? `${n} Treffer` : 'Keine Treffer';
    }
    function findNext(dir = 1) {
      const q = fIn.value;
      if (!q) return;
      const hay = norm(ta.value), needle = norm(q);
      let i = dir > 0 ? hay.indexOf(needle, ta.selectionEnd) : hay.lastIndexOf(needle, ta.selectionStart - 1);
      if (i < 0) i = dir > 0 ? hay.indexOf(needle) : hay.lastIndexOf(needle);
      if (i < 0) return;
      ta.focus();
      ta.setSelectionRange(i, i + q.length);
      // zur Fundstelle scrollen
      const line = ta.value.slice(0, i).split('\n').length;
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      scroller.scrollTop = Math.max(0, line * lh - scroller.clientHeight / 2);
      updateStatus();
      setTimeout(() => fIn.focus(), 0);
    }
    function replaceOne() {
      const q = fIn.value;
      if (!q) return;
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (norm(sel) === norm(q)) {
        ta.setRangeText(rIn.value, ta.selectionStart, ta.selectionEnd, 'end');
        onInput();
      }
      findNext(1);
    }
    function replaceAll() {
      const q = fIn.value;
      if (!q) return;
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
      const n = (ta.value.match(re) || []).length;
      ta.value = ta.value.replace(re, () => rIn.value);
      onInput();
      toast('Ersetzt', `${n} Vorkommen`, { icon: 'check', duration: 1500 });
    }
    fIn.addEventListener('input', countMatches);
    fIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') toggleFind(false); });
    rIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } if (e.key === 'Escape') toggleFind(false); });

    // ---------- Eingabe ----------
    const renderSoon = debounce(render, 16);
    function onInput() {
      if (!cur) return;
      cur.text = ta.value;
      refreshTab(cur);
      if (ta.value.length > 120000) renderSoon(); else render();
    }
    ta.addEventListener('input', onInput);
    ta.addEventListener('scroll', syncScroll);
    scroller.addEventListener('scroll', syncScroll);
    ['keyup', 'click', 'select'].forEach((ev) => ta.addEventListener(ev, updateStatus));

    const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    ta.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); return; }
      if (ctrl && k.toLowerCase() === 'n') { e.preventDefault(); newDoc(); return; }
      if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); openDialog(); return; }
      if (ctrl && (k.toLowerCase() === 'f' || k.toLowerCase() === 'h')) { e.preventDefault(); toggleFind(true); return; }
      if (ctrl && k.toLowerCase() === 'w') { e.preventDefault(); cur && closeDoc(cur); return; }
      if (ctrl && (k === '+' || k === '=')) { e.preventDefault(); setFont(fontSize + 1); return; }
      if (ctrl && k === '-') { e.preventDefault(); setFont(fontSize - 1); return; }
      if (ctrl && e.shiftKey && k.toLowerCase() === 'v') { e.preventDefault(); togglePreview(); return; }
      if (e.altKey && k.toLowerCase() === 'z') { e.preventDefault(); setWrap(!wrapOn); return; }
      if (ctrl && k === 'Tab') return;
      if (ctrl && k === '/') { e.preventDefault(); toggleComment(); return; }
      if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); duplicateLine(); return; }

      const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
      if (k === 'Tab') {
        e.preventDefault();
        if (s !== en && v.slice(s, en).includes('\n')) {
          // Block einrücken / ausrücken
          const ls = v.lastIndexOf('\n', s - 1) + 1;
          const block = v.slice(ls, en);
          const next = e.shiftKey ? block.replace(/^( {1,2}|\t)/gm, '') : block.replace(/^/gm, '  ');
          ta.setRangeText(next, ls, en, 'select');
        } else if (e.shiftKey) {
          const ls = v.lastIndexOf('\n', s - 1) + 1;
          if (v.slice(ls, ls + 2) === '  ') ta.setRangeText('', ls, ls + 2, 'end');
        } else ta.setRangeText('  ', s, en, 'end');
        onInput();
        return;
      }
      if (k === 'Enter' && !e.shiftKey) {
        // Einrückung übernehmen, nach { einrücken
        e.preventDefault();
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const indent = (v.slice(ls, s).match(/^[ \t]*/) || [''])[0];
        const prev = v[s - 1];
        let extra = /[{[(:]/.test(prev) ? '  ' : '';
        // Markdown-Listen fortsetzen
        const li = cur && cur.lang === 'md' && v.slice(ls, s).match(/^(\s*)([-*+]|\d+\.)\s(\[[ x]\]\s)?/);
        let ins = '\n' + indent + extra;
        if (li) {
          if (v.slice(ls, s).trim() === li[0].trim()) { ta.setRangeText('', ls, s, 'end'); onInput(); return; }
          const marker = /\d+\./.test(li[2]) ? (parseInt(li[2], 10) + 1) + '.' : li[2];
          ins = '\n' + li[1] + marker + ' ' + (li[3] ? '[ ] ' : '');
        }
        if (extra && PAIRS[prev] && v[s] === PAIRS[prev]) {
          ta.setRangeText(ins + '\n' + indent, s, en, 'start');
          ta.selectionStart = ta.selectionEnd = s + ins.length;
        } else ta.setRangeText(ins, s, en, 'end');
        onInput();
        return;
      }
      if (PAIRS[k] && cur && cur.lang !== 'text' && cur.lang !== 'md') {
        if ((k === '"' || k === "'" || k === '`') && v[s] === k && s === en) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
        e.preventDefault();
        ta.setRangeText(k + v.slice(s, en) + PAIRS[k], s, en, 'end');
        ta.setSelectionRange(s + 1, s + 1 + (en - s));
        onInput();
        return;
      }
      if ((k === ')' || k === ']' || k === '}') && v[s] === k && s === en) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
      if (k === 'Backspace' && s === en && PAIRS[v[s - 1]] === v[s] && s > 0) { e.preventDefault(); ta.setRangeText('', s - 1, s + 1, 'end'); onInput(); }
    });

    function toggleComment() {
      const prefix = { js: '//', c: '//', go: '//', rs: '//', css: '/*', py: '#', sh: '#', ps: '#', sql: '--', html: '<!--', md: '<!--' }[cur.lang] || '#';
      if (prefix === '/*' || prefix === '<!--') return;
      const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', en); if (le < 0) le = v.length;
      const block = v.slice(ls, le);
      const all = block.split('\n').every((l) => !l.trim() || l.trim().startsWith(prefix));
      const next = block.split('\n').map((l) => (all ? l.replace(new RegExp('^(\\s*)' + prefix.replace(/[/]/g, '\\/') + ' ?'), '$1') : (l.trim() ? l.replace(/^(\s*)/, `$1${prefix} `) : l))).join('\n');
      ta.setRangeText(next, ls, le, 'select');
      onInput();
    }

    function duplicateLine() {
      const v = ta.value, s = ta.selectionStart;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', s); if (le < 0) le = v.length;
      const line = v.slice(ls, le);
      ta.setRangeText('\n' + line, le, le, 'preserve');
      ta.setSelectionRange(s + line.length + 1, s + line.length + 1);
      onInput();
    }

    // ---------- Start ----------
    setFont(fontSize);
    setWrap(wrapOn);
    if (args.path) await openFile(args.path);
    else if (args.paths) for (const p of args.paths) await openFile(p);
    if (!docs.length) newDoc(args.text || '');

    return {
      onArgs(a) { if (a.path) openFile(a.path); else if (a.action === 'new') newDoc(a.text || ''); },
      onFocus() { setTimeout(() => ta.focus(), 10); },
      onResize() { syncScroll(); },
      async onClose() {
        const dirty = docs.filter((d) => d.text !== d.saved && (d.text || d.path));
        if (!dirty.length) return true;
        return confirmDialog({ title: 'Ungespeicherte Änderungen', message: `${dirty.length} Datei(en) haben ungespeicherte Änderungen: ${dirty.map((d) => d.name).join(', ')}`, ok: 'Trotzdem schließen', danger: true });
      },
      getState() { const paths = docs.filter((d) => d.path).map((d) => d.path); return paths.length ? { paths } : {}; },
    };
  },
};
