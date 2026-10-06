// Zwischenablage-Verlauf: alles, was du kopierst, wird gesammelt (max. 100 Einträge).

import { h, clear, esc, timeAgo, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { toast, contextMenu } from '../core/ui.js';
import { openApp } from '../core/wm.js';

const MAX = 100;

export function initClipboardHistory() {
  api.clip.onChange((text) => {
    if (!text || !text.trim()) return;
    store.update('clipHistory', (list) => {
      list = (list || []).filter((x) => x.text !== text);
      const pinned = list.filter((x) => x.pinned);
      const rest = list.filter((x) => !x.pinned);
      return [...pinned, { text, time: Date.now() }, ...rest].slice(0, MAX);
    }, []);
    bus.emit('clip:history');
  });
}

function kindOf(text) {
  if (/^https?:\/\/\S+$/i.test(text.trim())) return ['link', 'Link'];
  if (/^([a-z]:\\|\/)[^\n]*$/i.test(text.trim())) return ['folder', 'Pfad'];
  if (/^#?[0-9a-f]{6}$/i.test(text.trim())) return ['palette', 'Farbe'];
  if (/[{};=<>]/.test(text) && text.includes('\n')) return ['code', 'Code'];
  return ['type', 'Text'];
}

export default {
  mount(root) {
    const search = h('input.input', { placeholder: 'Verlauf durchsuchen …', spellcheck: false });
    const list = h('div.app-scroll.clip-list');
    root.append(
      h('div.app-toolbar', h('div.search-field.grow', { html: icon('search') }, search),
        h('button.btn.sm', { html: `${icon('trash')} Leeren`, onclick: () => { store.set('clipHistory', (store.get('clipHistory', []) || []).filter((x) => x.pinned)); render(); } })),
      list,
    );

    function render() {
      clear(list);
      const q = search.value.trim().toLowerCase();
      const items = (store.get('clipHistory', []) || []).filter((x) => !q || x.text.toLowerCase().includes(q));
      if (!items.length) {
        list.append(h('div.empty', { html: `${icon('clipboard')}<b>${q ? 'Keine Treffer' : 'Noch nichts kopiert'}</b><span>Alles, was du mit Strg+C kopierst, erscheint hier.</span>` }));
        return;
      }
      for (const it of items) {
        const [ic, label] = kindOf(it.text);
        const color = label === 'Farbe' ? (it.text.startsWith('#') ? it.text : '#' + it.text) : null;
        const el = h('div.clip-item', { class: it.pinned ? 'pinned' : '', title: 'Klicken zum Kopieren' },
          h('div.clip-meta', { html: `${color ? `<i class="clip-swatch" style="background:${esc(color)}"></i>` : icon(ic)}<span>${label}</span><span class="faint">· ${timeAgo(it.time)}</span>${it.pinned ? `<span class="badge accent">${icon('pin')} Angeheftet</span>` : ''}` }),
          h('div.clip-text', it.text.length > 600 ? it.text.slice(0, 600) + ' …' : it.text));
        el.addEventListener('click', () => { api.clip.write(it.text); toast('Kopiert', it.text.slice(0, 80), { icon: 'copy', duration: 1500 }); });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          contextMenu(e.clientX, e.clientY, [
            { label: 'Kopieren', icon: 'copy', action: () => api.clip.write(it.text) },
            { label: it.pinned ? 'Lösen' : 'Anheften', icon: 'pin', action: () => { store.update('clipHistory', (l) => l.map((x) => (x === it || (x.text === it.text) ? { ...x, pinned: !x.pinned } : x))); render(); } },
            label === 'Link' ? { label: 'Im Browser öffnen', icon: 'globe', action: () => openApp('browser', { url: it.text.trim() }) } : null,
            { label: 'Als Notiz speichern', icon: 'stickyNote', action: () => openApp('notes', { action: 'new', text: it.text }) },
            '-',
            { label: 'Entfernen', icon: 'trash', danger: true, action: () => { store.update('clipHistory', (l) => l.filter((x) => x.text !== it.text)); render(); } },
          ]);
        });
        list.append(el);
      }
    }

    search.addEventListener('input', render);
    const off = bus.on('clip:history', render);
    render();
    return { destroy: off };
  },
};
