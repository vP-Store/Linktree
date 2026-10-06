// Browser: Tabs, Adressleiste, Lesezeichen, Startseite – mit echten Chromium-Webviews.

import { h, clear, esc, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api, isElectron } from '../core/api.js';
import { store } from '../core/store.js';
import { contextMenu, toast, promptDialog } from '../core/ui.js';

const DEFAULT_BOOKMARKS = [
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Wikipedia', url: 'https://de.wikipedia.org' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Claude', url: 'https://claude.ai' },
  { title: 'Netflix', url: 'https://www.netflix.com' },
  { title: 'Amazon', url: 'https://www.amazon.de' },
];

const ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
};

function toUrl(input) {
  const s = input.trim();
  if (!s) return null;
  if (/^(https?|file):\/\//i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(s)) return 'http://' + s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s) && !/\s/.test(s)) return 'https://' + s;
  const eng = ENGINES[store.get('searchEngine', 'duckduckgo')] || ENGINES.duckduckgo;
  return eng.url + encodeURIComponent(s);
}

let lastActive = null; // zuletzt benutztes Browser-Fenster bekommt Pop-ups

/** <img> mit Ersatzinhalt bei Ladefehler (ohne Inline-Handler wegen CSP) */
function favImg(src, fallback = '') {
  const img = document.createElement('img');
  img.alt = '';
  img.addEventListener('error', () => { if (fallback) img.replaceWith(document.createTextNode(fallback)); else img.remove(); });
  img.src = src;
  return img;
}

function favicon(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch (_) { return ''; }
}

export default {
  mount(root, win, args) {
    const tabs = [];
    let cur = null;

    const tabBar = h('div.br-tabs');
    const newTabBtn = h('button.icon-btn.sm', { title: 'Neuer Tab (Strg+T)', html: icon('plus'), onclick: () => addTab() });
    const back = h('button.icon-btn', { title: 'Zurück (Alt+←)', html: icon('arrowLeft'), onclick: () => cur && cur.wv && cur.wv.canGoBack && cur.wv.canGoBack() && cur.wv.goBack() });
    const fwd = h('button.icon-btn', { title: 'Vor (Alt+→)', html: icon('arrowRight'), onclick: () => cur && cur.wv && cur.wv.canGoForward && cur.wv.canGoForward() && cur.wv.goForward() });
    const reload = h('button.icon-btn', { title: 'Neu laden (F5)', html: icon('refresh'), onclick: () => { if (!cur || !cur.wv) return; cur.loading ? cur.wv.stop() : cur.wv.reload(); } });
    const home = h('button.icon-btn', { title: 'Startseite', html: icon('home'), onclick: () => cur && showStart(cur) });
    const lock = h('span.br-lock');
    const addr = h('input.br-addr', { spellcheck: false, placeholder: 'Suchen oder Adresse eingeben' });
    const star = h('button.icon-btn.sm', { title: 'Lesezeichen (Strg+D)', html: icon('star'), onclick: () => toggleBookmark() });
    const ext = h('button.icon-btn', { title: 'Im Standardbrowser öffnen', html: icon('external'), onclick: () => cur && cur.url && api.fs.openExternal(cur.url) });
    const menuBtn = h('button.icon-btn', { title: 'Menü', html: icon('moreV'), onclick: (e) => menu(e.currentTarget) });
    const progress = h('div.br-progress');
    const view = h('div.br-view');
    const bmBar = h('div.br-bookmarks');

    root.classList.add('br-root');
    root.append(
      h('div.br-tabrow', tabBar, newTabBtn),
      h('div.br-nav', back, fwd, reload, home, h('div.br-addrbox', lock, addr, star), ext, menuBtn, progress),
      bmBar,
      view,
    );

    function bookmarks() { return store.get('bookmarks', null) || DEFAULT_BOOKMARKS; }

    function renderBookmarks() {
      clear(bmBar);
      for (const b of bookmarks()) {
        const el = h('button.br-bm', { title: b.url, onclick: () => navigate(cur, b.url) }, favImg(favicon(b.url)), h('span', b.title));
        el.addEventListener('auxclick', (e) => { if (e.button === 1) addTab(b.url); });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          contextMenu(e.clientX, e.clientY, [
            { label: 'In neuem Tab öffnen', icon: 'plus', action: () => addTab(b.url) },
            { label: 'Umbenennen', icon: 'edit', action: async () => { const n = await promptDialog({ title: 'Lesezeichen umbenennen', value: b.title }); if (n) { store.set('bookmarks', bookmarks().map((x) => (x.url === b.url ? { ...x, title: n } : x))); renderBookmarks(); } } },
            { label: 'Entfernen', icon: 'trash', danger: true, action: () => { store.set('bookmarks', bookmarks().filter((x) => x.url !== b.url)); renderBookmarks(); updateNav(); } },
          ]);
        });
        bmBar.append(el);
      }
      bmBar.classList.toggle('hidden', !store.get('browserBookmarkBar', true));
    }

    function addTab(url, activate = true) {
      const t = { id: uid('tab'), url: null, title: 'Neuer Tab', loading: false, wv: null, start: null };
      t.tabEl = h('button.br-tab', { onclick: () => select(t), onauxclick: (e) => { if (e.button === 1) closeTab(t); } },
        h('span.br-fav', { html: icon('globe') }), h('span.br-title', 'Neuer Tab'),
        h('span.br-x', { html: icon('x'), onclick: (e) => { e.stopPropagation(); closeTab(t); } }));
      t.pane = h('div.br-pane');
      view.append(t.pane);
      tabs.push(t);
      tabBar.append(t.tabEl);
      if (url) navigate(t, url); else showStart(t);
      if (activate) select(t);
      return t;
    }

    function select(t) {
      cur = t;
      tabs.forEach((x) => { x.tabEl.classList.toggle('on', x === t); x.pane.classList.toggle('hidden', x !== t); });
      updateNav();
      if (!t.url) setTimeout(() => (t.start && t.start.querySelector('input') || addr).focus(), 20);
    }

    function closeTab(t) {
      const i = tabs.indexOf(t);
      tabs.splice(i, 1);
      t.tabEl.remove();
      t.pane.remove();
      if (!tabs.length) { win.close(); return; }
      if (cur === t) select(tabs[Math.min(i, tabs.length - 1)]);
    }

    function showStart(t) {
      if (t.wv) { t.wv.remove(); t.wv = null; }
      t.url = null;
      t.title = 'Neuer Tab';
      clear(t.pane);
      const q = h('input.input.br-start-search', { placeholder: `Mit ${(ENGINES[store.get('searchEngine', 'duckduckgo')] || ENGINES.duckduckgo).name} suchen oder Adresse eingeben`, spellcheck: false });
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && q.value.trim()) navigate(t, q.value); });
      const hr = new Date().getHours();
      const greet = hr < 11 ? 'Guten Morgen' : hr < 17 ? 'Guten Tag' : 'Guten Abend';
      t.start = h('div.br-start',
        h('div.br-start-inner',
          h('h1', greet),
          h('div.search-field', { html: icon('search') }, q),
          h('div.br-tiles', ...bookmarks().slice(0, 12).map((b) => h('button.br-tile', { onclick: () => navigate(t, b.url) }, h('span.br-tile-ico', favImg(favicon(b.url), (b.title[0] || '?').toUpperCase())), h('span', b.title)))),
          !isElectron ? h('p.faint', { style: { marginTop: '20px', fontSize: '12px' } }, 'Vorschau-Modus: In der Desktop-App laufen Webseiten in echten Chromium-Webviews.') : null));
      t.pane.append(t.start);
      setTabMeta(t);
      if (t === cur) { updateNav(); setTimeout(() => q.focus(), 20); }
    }

    function navigate(t, input) {
      if (!t) t = addTab();
      const url = toUrl(input);
      if (!url) return;
      if (t.start) { t.start.remove(); t.start = null; }
      t.url = url;
      if (!t.wv) {
        if (isElectron) {
          t.wv = document.createElement('webview');
          t.wv.setAttribute('partition', 'persist:browser');
          t.wv.setAttribute('allowpopups', '');
          t.wv.setAttribute('src', url);
          wire(t);
        } else {
          t.wv = h('iframe', { src: url, referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups' });
          t.title = new URL(url).hostname;
        }
        t.wv.className = 'br-web';
        t.pane.append(t.wv);
      } else if (isElectron) t.wv.loadURL(url).catch(() => {});
      else t.wv.src = url;
      setTabMeta(t);
      if (t === cur) updateNav();
    }

    function wire(t) {
      const wv = t.wv;
      wv.addEventListener('did-start-loading', () => { t.loading = true; setTabMeta(t); if (t === cur) updateNav(); });
      wv.addEventListener('did-stop-loading', () => { t.loading = false; setTabMeta(t); if (t === cur) updateNav(); });
      wv.addEventListener('did-navigate', (e) => { t.url = e.url; if (t === cur) updateNav(); });
      wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { t.url = e.url; if (t === cur) updateNav(); } });
      wv.addEventListener('page-title-updated', (e) => { t.title = e.title; setTabMeta(t); if (t === cur) win.setTitle(`${t.title} – Browser`); });
      wv.addEventListener('page-favicon-updated', (e) => { t.favicon = e.favicons && e.favicons[0]; setTabMeta(t); });
      wv.addEventListener('did-fail-load', (e) => {
        if (e.errorCode === -3 || !e.isMainFrame) return; // abgebrochen
        t.loading = false;
        setTabMeta(t);
        toast('Seite nicht erreichbar', `${e.errorDescription} (${e.validatedURL})`, { kind: 'warn' });
      });
      wv.addEventListener('focus', () => import('../core/wm.js').then((m) => m.focus(win.id)));
    }

    function setTabMeta(t) {
      t.tabEl.querySelector('.br-title').textContent = t.title || t.url || 'Neuer Tab';
      t.tabEl.title = t.title || '';
      const fav = t.tabEl.querySelector('.br-fav');
      if (t.loading) fav.innerHTML = '<span class="spinner" style="width:13px;height:13px;border-width:2px"></span>';
      else if (t.favicon || t.url) { clear(fav); fav.append(favImg(t.favicon || favicon(t.url))); }
      else fav.innerHTML = icon('globe');
    }

    function updateNav() {
      if (!cur) return;
      const wv = cur.wv;
      const isWeb = !!(wv && isElectron && wv.getURL);
      let canBack = false, canFwd = false;
      try { canBack = isWeb && wv.canGoBack(); canFwd = isWeb && wv.canGoForward(); } catch (_) {}
      back.disabled = !canBack;
      fwd.disabled = !canFwd;
      reload.innerHTML = icon(cur.loading ? 'x' : 'refresh');
      progress.classList.toggle('on', !!cur.loading);
      if (document.activeElement !== addr) addr.value = cur.url || '';
      const secure = cur.url && cur.url.startsWith('https://');
      lock.innerHTML = cur.url ? icon(secure ? 'lock' : 'info') : icon('search');
      lock.title = cur.url ? (secure ? 'Sichere Verbindung' : 'Nicht verschlüsselt') : '';
      lock.classList.toggle('insecure', !!cur.url && !secure);
      const bm = cur.url && bookmarks().some((b) => b.url === cur.url);
      star.classList.toggle('on', !!bm);
      win.setTitle(`${cur.title || 'Neuer Tab'} – Browser`);
    }

    function toggleBookmark() {
      if (!cur || !cur.url) return;
      const list = bookmarks();
      if (list.some((b) => b.url === cur.url)) store.set('bookmarks', list.filter((b) => b.url !== cur.url));
      else { store.set('bookmarks', [...list, { title: (cur.title || cur.url).slice(0, 40), url: cur.url }]); toast('Lesezeichen gespeichert', cur.title || cur.url, { icon: 'star', duration: 1600 }); }
      renderBookmarks();
      updateNav();
    }

    function zoom(delta) {
      if (!cur || !cur.wv || !isElectron) return;
      const z = delta === 0 ? 1 : Math.max(0.3, Math.min(3, cur.wv.getZoomFactor() + delta));
      cur.wv.setZoomFactor(z);
      toast('Zoom', Math.round(z * 100) + ' %', { icon: 'zoomIn', duration: 900 });
    }

    function menu(btn) {
      const r = btn.getBoundingClientRect();
      contextMenu(r.right - 230, r.bottom + 4, [
        { label: 'Neuer Tab', icon: 'plus', key: 'Strg+T', action: () => addTab() },
        { label: 'Vergrößern', icon: 'zoomIn', key: 'Strg++', action: () => zoom(0.1) },
        { label: 'Verkleinern', icon: 'zoomOut', key: 'Strg+-', action: () => zoom(-0.1) },
        { label: 'Zoom zurücksetzen', icon: 'search', key: 'Strg+0', action: () => zoom(0) },
        '-',
        { label: store.get('browserBookmarkBar', true) ? 'Lesezeichenleiste ausblenden' : 'Lesezeichenleiste zeigen', icon: 'bookmark', action: () => { store.set('browserBookmarkBar', !store.get('browserBookmarkBar', true)); renderBookmarks(); } },
        { label: 'Suchmaschine', header: true },
        ...Object.entries(ENGINES).map(([k, e]) => ({ label: e.name + (store.get('searchEngine', 'duckduckgo') === k ? ' ✓' : ''), icon: 'search', action: () => store.set('searchEngine', k) })),
        '-',
        cur && cur.wv && isElectron ? { label: 'Entwicklertools', icon: 'code', action: () => cur.wv.openDevTools() } : null,
        cur && cur.url ? { label: 'Adresse kopieren', icon: 'copy', action: () => api.clip.write(cur.url) } : null,
      ]);
    }

    addr.addEventListener('focus', () => setTimeout(() => addr.select(), 0));
    addr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { navigate(cur, addr.value); addr.blur(); }
      if (e.key === 'Escape') { addr.value = cur.url || ''; addr.blur(); }
    });
    root.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 't') { e.preventDefault(); addTab(); }
      else if (ctrl && k === 'w') { e.preventDefault(); cur && closeTab(cur); }
      else if (ctrl && k === 'l') { e.preventDefault(); addr.focus(); }
      else if (ctrl && k === 'd') { e.preventDefault(); toggleBookmark(); }
      else if (ctrl && (k === '+' || k === '=')) { e.preventDefault(); zoom(0.1); }
      else if (ctrl && k === '-') { e.preventDefault(); zoom(-0.1); }
      else if (ctrl && k === '0') { e.preventDefault(); zoom(0); }
      else if (e.key === 'F5') { e.preventDefault(); reload.click(); }
      else if (ctrl && e.key === 'Tab' && tabs.length > 1) { e.preventDefault(); e.stopPropagation(); select(tabs[(tabs.indexOf(cur) + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]); }
    });

    lastActive = win;
    const offNew = api.browser && api.browser.onNewWindow ? api.browser.onNewWindow((url) => { if (lastActive === win) addTab(url); }) : () => {};

    renderBookmarks();
    addTab(args.url);

    return {
      onArgs(a) { if (a.url) addTab(a.url); },
      onFocus() { lastActive = win; },
      getState() { return cur && cur.url ? { url: cur.url } : {}; },
      destroy() { offNew(); if (lastActive === win) lastActive = null; },
    };
  },
};
