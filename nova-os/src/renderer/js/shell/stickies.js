// Haftnotizen: farbige Zettel direkt auf dem Desktop (verschiebbar, Größe änderbar).

import { h, clear, uid, debounce, clamp } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { contextMenu } from '../core/ui.js';

const COLORS = { gelb: '#fde68a', rosa: '#fbcfe8', blau: '#bfdbfe', gruen: '#bbf7d0', lila: '#ddd6fe' };
let layer;

// Aktueller Stand im Speicher; gespeichert wird verzögert (beim Tippen nicht bei jedem Zeichen)
let cache = null;
function all() { if (!cache) cache = structuredClone(store.get('stickies', []) || []); return cache; }
const persist = debounce(() => store.set('stickies', cache), 300);
function setAll(list) { cache = list; persist(); }

export function initStickies() {
  // Verzögertes Speichern beim Neuladen/Beenden nicht verlieren
  addEventListener('beforeunload', () => { if (cache) store.set('stickies', cache); });
  layer = h('div#stickies');
  document.getElementById('desktop').append(layer);
  render();
}

export function addSticky(x, y) {
  const list = all();
  const n = { id: uid('st'), x: x ?? 140 + list.length * 24, y: y ?? 60 + list.length * 24, w: 220, h: 200, color: 'gelb', text: '' };
  setAll([...list, n]);
  render();
  const ta = layer.querySelector(`[data-id="${n.id}"] textarea`);
  if (ta) ta.focus();
}

function update(id, patch) {
  const n = all().find((x) => x.id === id);
  if (n) Object.assign(n, patch);
  persist();
}

function render() {
  clear(layer);
  for (const n of all()) layer.append(sticky(n));
}

function sticky(n) {
  const ta = h('textarea', { value: n.text, placeholder: 'Notiz …', spellcheck: false });
  ta.addEventListener('input', () => update(n.id, { text: ta.value }));
  const head = h('div.st-head',
    h('button.st-btn', { title: 'Farbe', html: icon('palette'), onclick: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      contextMenu(r.left, r.bottom + 4, Object.entries(COLORS).map(([k]) => ({ label: k[0].toUpperCase() + k.slice(1), icon: 'circle', action: () => { update(n.id, { color: k }); render(); } })));
    } }),
    h('div.grow'),
    h('button.st-btn', { title: 'Löschen', html: icon('x'), onclick: () => { setAll(all().filter((x) => x.id !== n.id)); render(); } }));
  const grip = h('div.st-grip');
  const el = h('div.sticky', { dataset: { id: n.id }, style: { left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px', '--st': COLORS[n.color] || COLORS.gelb } }, head, ta, grip);

  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const sx = e.clientX - n.x, sy = e.clientY - n.y;
    el.classList.add('drag');
    const mv = (ev) => {
      n.x = clamp(ev.clientX - sx, 0, innerWidth - 80);
      n.y = clamp(ev.clientY - sy, 0, innerHeight - 120);
      el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); el.classList.remove('drag'); update(n.id, { x: n.x, y: n.y }); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, w0 = n.w, h0 = n.h;
    const mv = (ev) => {
      n.w = clamp(w0 + ev.clientX - sx, 150, 600);
      n.h = clamp(h0 + ev.clientY - sy, 110, 600);
      el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); update(n.id, { w: n.w, h: n.h }); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  return el;
}
