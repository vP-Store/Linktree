// Programme: alle installierten Windows-Programme durchsuchen, starten, anheften.

import { h, clear, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { getWinApps, loadAppIcon, launchWinApp, getOpenWindows, focusWindow, loadExeIcon } from '../core/winapps.js';
import { contextMenu, toast } from '../core/ui.js';
import { api } from '../core/api.js';

export default {
  async mount(root, win) {
    let filter = '';
    let folder = null;
    const search = h('input.input', { placeholder: 'Programme durchsuchen …', spellcheck: false });
    const side = h('div.app-sidebar');
    const grid = h('div.app-scroll.lp-grid');
    const hide = h('input', { type: 'checkbox', checked: store.get('hideOnLaunch', true) });
    hide.onchange = () => store.set('hideOnLaunch', hide.checked);
    root.append(
      h('div.app-toolbar', h('div.search-field.grow', { html: icon('search') }, search),
        h('label.row', { style: { fontSize: '12.5px', color: 'var(--text-2)', gap: '8px' }, title: 'NovaOS nach dem Start eines Programms ausblenden' }, h('span.switch', hide, h('span')), 'Nach Start ausblenden'),
        h('button.icon-btn', { title: 'Liste neu einlesen', html: icon('refresh'), onclick: async () => { apps = await getWinApps(true); render(); toast('Programme aktualisiert', `${apps.length} gefunden`, { icon: 'apps', duration: 1600 }); } })),
      h('div.app-split', side, h('div.app-main', grid)));

    let apps = [];
    grid.append(h('div.empty', h('div.spinner'), h('span', 'Programme werden gesucht …')));
    apps = await getWinApps();

    function favs() { return store.get('launcherFavs', []) || []; }
    function recent() { return store.get('recentApps', []) || []; }

    function renderSide() {
      clear(side);
      const folders = [...new Set(apps.map((a) => a.folder))].sort((a, b) => a.localeCompare(b, 'de'));
      const item = (id, ic, label, count) => h('button.side-item', { class: folder === id ? 'on' : '', html: `${icon(ic)}<span class="ellipsis">${esc(label)}</span><span class="count">${count}</span>`, onclick: () => { folder = id; render(); } });
      side.append(h('div.side-label', 'Bibliothek'),
        item(':open', 'layout', 'Gerade geöffnet', ''),
        item(null, 'apps', 'Alle Programme', apps.length),
        item(':fav', 'star', 'Favoriten', favs().length),
        item(':recent', 'history', 'Zuletzt gestartet', recent().length),
        h('div.side-label', 'Ordner'));
      for (const f of folders) side.append(item(f, 'folder', f, apps.filter((a) => a.folder === f).length));
    }

    async function renderOpen() {
      grid.append(h('div.empty', h('div.spinner')));
      const wins = await getOpenWindows();
      if (folder !== ':open') return;
      clear(grid);
      if (!wins.length) { grid.append(h('div.empty', { html: `${icon('layout')}<b>Keine Programmfenster offen</b><span>Laufende Windows-Programme erscheinen hier – ein Klick holt sie nach vorne.</span>` })); return; }
      for (const w of wins) {
        const ico = h('span.lp-ico');
        loadExeIcon(w, ico);
        grid.append(h('button.app-tile.lp-tile', { title: w.title, onclick: () => focusWindow(w) }, ico, h('span', w.title), h('small.faint', { style: { fontSize: '11px' } }, w.name)));
      }
    }

    function render() {
      renderSide();
      clear(grid);
      if (folder === ':open') { renderOpen(); return; }
      const q = filter.toLowerCase();
      let list = apps;
      if (folder === ':fav') list = apps.filter((a) => favs().includes(a.path));
      else if (folder === ':recent') list = recent().map((p) => apps.find((a) => a.path === p)).filter(Boolean);
      else if (folder) list = apps.filter((a) => a.folder === folder);
      if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
      if (!list.length) {
        grid.append(h('div.empty', { html: `${icon(folder === ':fav' ? 'star' : 'apps')}<b>${q ? 'Keine Treffer' : folder === ':fav' ? 'Noch keine Favoriten' : 'Keine Programme'}</b><span>${folder === ':fav' ? 'Rechtsklick auf ein Programm → Zu Favoriten.' : ''}</span>` }));
        return;
      }
      for (const a of list) {
        const ico = h('span.lp-ico');
        const tile = h('button.app-tile.lp-tile', { title: a.path, onclick: () => launchWinApp(a) }, ico, h('span', a.name));
        if (favs().includes(a.path)) tile.append(h('span.lp-star', { html: icon('star') }));
        loadAppIcon(a, ico);
        tile.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const isFav = favs().includes(a.path);
          contextMenu(e.clientX, e.clientY, [
            { label: 'Starten', icon: 'rocket', action: () => launchWinApp(a) },
            { label: isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten', icon: 'star', action: () => { store.set('launcherFavs', isFav ? favs().filter((p) => p !== a.path) : [...favs(), a.path]); render(); } },
            (() => {
              const docked = (store.get('dockWinApps', []) || []).some((x) => x.path === a.path);
              return { label: docked ? 'Vom Dock lösen' : 'Ans Dock heften', icon: 'pin', action: () => store.update('dockWinApps', (l) => (docked ? (l || []).filter((x) => x.path !== a.path) : [...(l || []), { name: a.name, path: a.path }]), []) };
            })(),
            { label: 'Speicherort öffnen', icon: 'folder', action: () => api.fs.reveal(a.path) },
          ]);
        });
        grid.append(tile);
      }
    }

    search.addEventListener('input', () => { filter = search.value.trim(); render(); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = grid.querySelector('.lp-tile'); if (first) first.click(); }
    });
    render();
    setTimeout(() => search.focus(), 30);
    return { onFocus() { setTimeout(() => search.focus(), 10); } };
  },
};
