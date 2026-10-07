// Übersicht (Alt+W): alle Fenster der Arbeitsfläche als Raster, Arbeitsflächen-Leiste
// oben. Klick fokussiert, Ziehen auf eine Arbeitsfläche verschiebt das Fenster.

import { h, clear, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { appIconSpan } from '../core/registry.js';
import { allWindows, focus, getWorkspace, switchWorkspace, moveToWorkspace } from '../core/wm.js';

let state = null; // { el, wins, layout }

export function isOverviewOpen() { return !!state; }

export function toggleOverview() { state ? closeOverview() : openOverview(); }

function layoutGrid(wins, area) {
  const n = wins.length;
  if (!n) return [];
  const cols = Math.ceil(Math.sqrt(n * area.w / area.h));
  const rows = Math.ceil(n / cols);
  const gap = 28;
  const cellW = (area.w - gap * (cols + 1)) / cols;
  const cellH = (area.h - gap * (rows + 1)) / rows;
  return wins.map((w, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const offset = (cols - inRow) * (cellW + gap) / 2;
    const scale = Math.min(cellW / w.w, (cellH - 30) / w.h, 1);
    const tw = w.w * scale, th = w.h * scale;
    const x = area.x + gap + c * (cellW + gap) + offset + (cellW - tw) / 2;
    const y = area.y + gap + r * (cellH + gap) + (cellH - 30 - th) / 2;
    return { w, x, y, scale, tw, th };
  });
}

export function openOverview() {
  if (state) return;
  const ws = getWorkspace();
  const wins = allWindows().filter((w) => w.ws === ws).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const el = h('div#overview');
  const strip = h('div.ov-strip');
  el.append(strip);
  document.getElementById('os').append(el);
  state = { el, wins, labels: [] };
  document.body.classList.add('overview-open');

  // Arbeitsflächen-Leiste
  const n = store.get('workspaces');
  for (let i = 0; i < n; i++) {
    const count = allWindows().filter((w) => w.ws === i).length;
    const thumb = h('button.ov-ws', { class: i === ws ? 'on' : '', dataset: { ws: i }, onclick: () => { closeOverview(); switchWorkspace(i); } },
      h('div.ov-ws-prev', ...allWindows().filter((w) => w.ws === i).slice(0, 6).map((w) => h('span', { html: appIconSpan(w.app) }))),
      h('span', `Arbeitsfläche ${i + 1}${count ? ` · ${count}` : ''}`));
    strip.append(thumb);
  }

  const top = 150;
  const area = { x: 20, y: top, w: innerWidth - 40, h: innerHeight - top - 110 };
  const layout = layoutGrid(wins, area);
  state.layout = layout;

  if (!wins.length) el.append(h('div.ov-empty', { html: `${icon('layers')}<b>Keine Fenster auf dieser Arbeitsfläche</b><span>Esc oder Klick schließt die Übersicht.</span>` }));

  layout.forEach((L, i) => {
    const w = L.w;
    w._ovWasMin = w.min;
    if (w.min) { w.el.classList.remove('min'); }
    w.el.classList.add('ov-item');
    w.el.style.transformOrigin = '0 0';
    // gestaffelt einschweben; beim Hover hebt sich das Fenster an (3D)
    const place = (lift) => {
      const z = lift ? 1.035 : 1;
      const dx = (L.tw * (z - 1)) / 2, dy = (L.th * (z - 1)) / 2 + (lift ? 8 : 0);
      w.el.style.transform = `translate(${L.x - w.x - dx}px, ${L.y - w.y - dy}px) scale(${L.scale * z})`;
    };
    w.el.style.transitionDelay = i * 28 + 'ms';
    setTimeout(() => { if (w.el.classList.contains('ov-item')) w.el.style.transitionDelay = ''; }, 400 + i * 28);
    place(false);
    w.el.style.zIndex = String(+w.el.style.zIndex || 20);
    const label = h('div.ov-label', { style: { left: L.x + 'px', top: L.y + L.th + 8 + 'px', width: L.tw + 'px' }, html: `${appIconSpan(w.app)}<span>${esc(w.title)}</span>${w._ovWasMin ? '<em>minimiert</em>' : ''}` });
    const close = h('button.ov-close', { style: { left: L.x + L.tw - 14 + 'px', top: L.y - 12 + 'px' }, title: 'Schließen', html: icon('x'), onclick: async (e) => { e.stopPropagation(); const ok = await w.close(); if (ok) { closeOverview(); openOverview(); } } });
    const hit = h('div.ov-hit', { style: { left: L.x + 'px', top: L.y + 'px', width: L.tw + 'px', height: L.th + 'px' } });
    hit.addEventListener('pointerdown', (e) => startDrag(e, w, hit));
    hit.addEventListener('pointerenter', () => { w.el.classList.add('ov-hover'); place(true); });
    hit.addEventListener('pointerleave', () => { w.el.classList.remove('ov-hover'); place(false); });
    el.append(hit, label, close);
  });

  el.addEventListener('pointerdown', (e) => { if (e.target === el) closeOverview(); });
}

function startDrag(e, w, hit) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  let moved = false;
  let target = null;
  const ghost = h('div.ov-ghost', { html: appIconSpan(w.app) });
  const move = (ev) => {
    if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) {
      moved = true;
      state.el.append(ghost);
      hit.classList.add('dragging');
    }
    if (!moved) return;
    ghost.style.left = ev.clientX - 28 + 'px';
    ghost.style.top = ev.clientY - 28 + 'px';
    const over = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.classList && x.classList.contains('ov-ws'));
    state.el.querySelectorAll('.ov-ws').forEach((x) => x.classList.toggle('drop', x === over));
    target = over ? +over.dataset.ws : null;
  };
  const up = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    ghost.remove();
    if (!moved) {
      // Klick: Fenster fokussieren
      closeOverview();
      if (w.min) w.unminimize();
      focus(w.id);
      return;
    }
    if (target != null && target !== w.ws) {
      closeOverview();
      moveToWorkspace(w.id, target);
      openOverview();
    } else {
      hit.classList.remove('dragging');
      state.el.querySelectorAll('.ov-ws').forEach((x) => x.classList.remove('drop'));
    }
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

export function closeOverview() {
  if (!state) return;
  for (const L of state.layout) {
    const w = L.w;
    w.el.style.transform = '';
    w.el.style.transitionDelay = '';
    w.el.classList.remove('ov-item', 'ov-hover');
    if (w._ovWasMin && w.min) w.el.classList.add('min');
    delete w._ovWasMin;
  }
  state.el.remove();
  state = null;
  document.body.classList.remove('overview-open');
}

addEventListener('keydown', (e) => { if (state && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeOverview(); } }, true);
addEventListener('resize', () => { if (state) { closeOverview(); } });
