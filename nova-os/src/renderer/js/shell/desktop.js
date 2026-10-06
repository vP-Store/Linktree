// Desktop: echte Dateien vom Windows-Desktop, Nova-Verknüpfungen, Widgets.

import { h, clear, bus, pad, esc, debounce } from '../core/dom.js';
import { icon, fileGlyph } from '../core/icons.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { appIconSpan, getApp } from '../core/registry.js';
import { openApp } from '../core/wm.js';
import { openPath } from '../core/open.js';
import { contextMenu, promptDialog, confirmDialog, showError, toast } from '../core/ui.js';
import { getTasks, updateTask } from '../core/tasks.js';
import { forecast, describe } from '../core/weather.js';
import { sysInfo } from './state.js';

let iconsEl, widgetsEl, places = null;
let selected = new Set();
const SHORTCUTS = ['files', 'terminal', 'browser', 'launcher'];

export async function initDesktop() {
  const desk = document.getElementById('desktop');
  iconsEl = h('div#desk-icons');
  widgetsEl = h('div#widgets');
  desk.append(iconsEl, widgetsEl);
  try { places = await api.fs.places(); } catch (_) {}

  desk.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.desk-icon, .widget')) return;
    e.preventDefault();
    deskMenu(e.clientX, e.clientY);
  });
  desk.addEventListener('dragover', (e) => { if (places && places.desktop && e.dataTransfer.types.includes('application/x-nova-paths')) e.preventDefault(); });
  desk.addEventListener('drop', async (e) => {
    if (e.defaultPrevented || !places || !places.desktop) return;
    const raw = e.dataTransfer.getData('application/x-nova-paths');
    if (!raw) return;
    e.preventDefault();
    const paths = JSON.parse(raw).filter((p) => !p.startsWith(places.desktop));
    if (!paths.length) return;
    try { e.ctrlKey ? await api.fs.copy(paths, places.desktop) : await api.fs.move(paths, places.desktop); renderIcons(); toast(e.ctrlKey ? 'Auf den Desktop kopiert' : 'Auf den Desktop verschoben', `${paths.length} Element(e)`, { icon: 'monitor', duration: 2000 }); } catch (err) { showError(err); }
  });
  desk.addEventListener('pointerdown', (e) => {
    if (e.target === desk || e.target === iconsEl) startRubber(e);
  });

  renderIcons();
  renderWidgets();
  store.on('showWidgets', renderWidgets);
  store.on('showDesktopIcons', renderIcons);
  store.on('weatherCity', renderWidgets);
  bus.on('tasks', debounce(renderWidgets, 100));
  bus.on('desktop:refresh', renderIcons);
  bus.on('overlay:shown', renderIcons);
  bus.on('sys:stats', (s) => { lastStats = s; updateRings(s); });
  setInterval(tickWidgetClock, 1000);
}

// ---------------------------------------------------------------------------
// Symbole
// ---------------------------------------------------------------------------
async function renderIcons() {
  clear(iconsEl);
  selected.clear();
  if (!store.get('showDesktopIcons')) return;
  for (const id of SHORTCUTS) {
    const app = getApp(id);
    iconsEl.append(deskIcon({ key: 'app:' + id, label: app.name, html: appIconSpan(app), open: () => openApp(id) }));
  }
  if (places && places.home) {
    iconsEl.append(deskIcon({ key: 'home', label: 'Persönlicher Ordner', html: fileGlyph('', true), open: () => openApp('files', { path: places.home }) }));
  }
  if (!places || !places.desktop) return;
  let files = [];
  try {
    if (!(await api.fs.exists(places.desktop))) return;
    files = await api.fs.list(places.desktop);
  } catch (_) { return; }
  files.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'de'));
  for (const f of files.filter((x) => !/^desktop\.ini$/i.test(x.name))) {
    const label = f.ext === 'lnk' || f.ext === 'url' ? f.name.replace(/\.(lnk|url)$/i, '') : f.name;
    const el = deskIcon({
      key: f.path, label, html: fileGlyph(f.ext, f.dir), file: f,
      open: () => openPath(f.path, { isDir: f.dir }),
    });
    iconsEl.append(el);
    if (f.ext === 'lnk' || f.ext === 'exe' || f.ext === 'url') {
      api.fs.fileIcon(f.path).then((url) => { if (url) el.querySelector('.file-glyph').innerHTML = `<img src="${url}" alt="">`; });
    }
  }
}

function deskIcon({ key, label, html, open, file }) {
  const el = h('button.desk-icon', { dataset: { key }, html: `${html}<span>${esc(label)}</span>`, title: file ? file.path : label });
  el.addEventListener('click', (e) => {
    if (!e.ctrlKey) { selected.clear(); iconsEl.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); }
    selected.add(key);
    el.classList.add('sel');
  });
  el.addEventListener('dblclick', open);
  if (file) {
    el.draggable = true;
    el.addEventListener('dragstart', (ev) => {
      const keys = selected.has(key) ? [...selected].filter((k) => k.includes('/') || k.includes('\\')) : [file.path];
      ev.dataTransfer.setData('application/x-nova-paths', JSON.stringify(keys.length ? keys : [file.path]));
      ev.dataTransfer.setData('text/plain', file.path);
      ev.dataTransfer.effectAllowed = 'copyMove';
    });
    if (file.dir) {
      el.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('application/x-nova-paths')) { ev.preventDefault(); el.classList.add('sel'); } });
      el.addEventListener('dragleave', () => el.classList.remove('sel'));
      el.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        el.classList.remove('sel');
        const paths = JSON.parse(ev.dataTransfer.getData('application/x-nova-paths') || '[]').filter((p) => p !== file.path);
        if (!paths.length) return;
        try { ev.ctrlKey ? await api.fs.copy(paths, file.path) : await api.fs.move(paths, file.path); renderIcons(); } catch (e) { showError(e); }
      });
    }
  }
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = [{ label: 'Öffnen', icon: 'external', action: open }];
    if (file) {
      items.push(
        { label: 'Mit Windows-Standardprogramm öffnen', icon: 'box', action: () => openPath(file.path, { external: true }) },
        { label: 'Im Explorer zeigen', icon: 'folder', action: () => api.fs.reveal(file.path) },
        '-',
        { label: 'Pfad kopieren', icon: 'copy', action: () => { api.clip.write(file.path); toast('Pfad kopiert', file.path, { icon: 'copy', duration: 1800 }); } },
        { label: 'Umbenennen', icon: 'edit', action: async () => {
          const n = await promptDialog({ title: 'Umbenennen', value: file.name, ok: 'Umbenennen' });
          if (n && n !== file.name) { try { await api.fs.rename(file.path, n); renderIcons(); } catch (err) { showError(err); } }
        } },
        { label: 'In den Papierkorb', icon: 'trash', danger: true, action: async () => {
          if (await confirmDialog({ title: `„${file.name}“ löschen?`, message: 'Die Datei wird in den Papierkorb verschoben.', ok: 'Löschen', danger: true })) {
            try { await api.fs.trash(file.path); renderIcons(); } catch (err) { showError(err); }
          }
        } },
      );
    }
    contextMenu(e.clientX, e.clientY, items);
  });
  return el;
}

function startRubber(e) {
  if (e.button !== 0) return;
  selected.clear();
  iconsEl.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
  const desk = document.getElementById('desktop');
  const origin = desk.getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const box = h('div#desk-select');
  let shown = false;
  const move = (ev) => {
    const x = Math.min(sx, ev.clientX), y = Math.min(sy, ev.clientY);
    const w = Math.abs(ev.clientX - sx), hh = Math.abs(ev.clientY - sy);
    if (!shown && w + hh > 6) { desk.append(box); shown = true; }
    Object.assign(box.style, { left: x - origin.left + 'px', top: y - origin.top + 'px', width: w + 'px', height: hh + 'px' });
    iconsEl.querySelectorAll('.desk-icon').forEach((ic) => {
      const r = ic.getBoundingClientRect();
      const hit = r.left < x + w && r.right > x && r.top < y + hh && r.bottom > y;
      ic.classList.toggle('sel', hit);
      if (hit) selected.add(ic.dataset.key); else selected.delete(ic.dataset.key);
    });
  };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); box.remove(); };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

function deskMenu(x, y) {
  const dir = places && places.desktop;
  contextMenu(x, y, [
    dir ? { label: 'Neuer Ordner', icon: 'folderPlus', action: async () => {
      const n = await promptDialog({ title: 'Neuer Ordner', value: 'Neuer Ordner', ok: 'Erstellen' });
      if (n) { try { await api.fs.mkdir(dir, n); renderIcons(); } catch (e) { showError(e); } }
    } } : null,
    dir ? { label: 'Neue Textdatei', icon: 'filePlus', action: async () => {
      const n = await promptDialog({ title: 'Neue Textdatei', value: 'Neues Dokument.txt', ok: 'Erstellen' });
      if (n) { try { const p = await api.fs.newFile(dir, n); renderIcons(); openPath(p); } catch (e) { showError(e); } }
    } } : null,
    { label: 'Aktualisieren', icon: 'refresh', action: renderIcons },
    '-',
    { label: 'Terminal hier öffnen', icon: 'terminal', action: () => openApp('terminal', { cwd: dir }) },
    dir ? { label: 'Desktop-Ordner öffnen', icon: 'folder', action: () => openApp('files', { path: dir }) } : null,
    '-',
    { label: store.get('showWidgets') ? 'Widgets ausblenden' : 'Widgets einblenden', icon: 'grid', action: () => store.set('showWidgets', !store.get('showWidgets')) },
    { label: 'Hintergrund ändern', icon: 'wallpaper', action: () => openApp('settings', { page: 'look' }) },
    { label: 'Einstellungen', icon: 'settings', action: () => openApp('settings') },
  ]);
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------
let clockW, ringEls = {}, lastStats = null;

function greeting() {
  const hr = new Date().getHours();
  const info = sysInfo();
  const name = store.get('userName') || (info && info.user) || '';
  const g = hr < 5 ? 'Gute Nacht' : hr < 11 ? 'Guten Morgen' : hr < 17 ? 'Guten Tag' : hr < 22 ? 'Guten Abend' : 'Gute Nacht';
  return name ? `${g}, ${name}` : g;
}

function tickWidgetClock() {
  if (!clockW) return;
  const d = new Date();
  clockW.time.innerHTML = `${pad(d.getHours())}:${pad(d.getMinutes())}<small>${pad(d.getSeconds())}</small>`;
  if (d.getSeconds() === 0) {
    clockW.date.textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    clockW.greet.lastChild.textContent = greeting();
  }
}

function ring(label) {
  const C = 2 * Math.PI * 30;
  const wrap = h('div', { html: `<div class="ring"><svg viewBox="0 0 70 70"><circle class="track" cx="35" cy="35" r="30"/><circle class="bar" cx="35" cy="35" r="30" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><b>–</b></div><div class="ring-label">${label}</div>` });
  return { el: wrap, set(pct, text) {
    wrap.querySelector('.bar').style.strokeDashoffset = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
    wrap.querySelector('b').textContent = text;
  } };
}

function updateRings(s) {
  if (!ringEls.cpu) return;
  ringEls.cpu.set(s.cpu, Math.round(s.cpu) + '%');
  const mem = (s.totalmem - s.freemem) / s.totalmem * 100;
  ringEls.mem.set(mem, Math.round(mem) + '%');
}

async function renderWidgets() {
  clear(widgetsEl);
  clockW = null;
  ringEls = {};
  widgetsEl.classList.toggle('hide', !store.get('showWidgets'));
  if (!store.get('showWidgets')) return;

  // Uhr
  const d = new Date();
  clockW = {
    time: h('div.time'),
    date: h('div.date', d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
    greet: h('div.greet', { html: icon('sparkles') }, greeting()),
  };
  widgetsEl.append(h('div.widget.glass.w-clock', clockW.time, clockW.date, clockW.greet));
  tickWidgetClock();

  // System
  ringEls.cpu = ring('CPU');
  ringEls.mem = ring('RAM');
  ringEls.disk = ring('Laufwerk');
  widgetsEl.append(h('div.widget.glass', { style: { cursor: 'default' }, ondblclick: () => openApp('monitor') },
    h('h4', { html: `${icon('activity')} System` }),
    h('div.w-stats', ringEls.cpu.el, ringEls.mem.el, ringEls.disk.el)));
  if (lastStats) updateRings(lastStats);
  api.fs.drives().then((ds) => {
    const d0 = ds.find((x) => x.total) || ds[0];
    if (d0 && d0.total) ringEls.disk && ringEls.disk.set((1 - d0.free / d0.total) * 100, Math.round((1 - d0.free / d0.total) * 100) + '%');
    else ringEls.disk && ringEls.disk.set(0, '–');
  }).catch(() => {});

  // Aufgaben
  const open = getTasks().filter((t) => !t.done).slice(0, 5);
  const tw = h('div.widget.glass.w-tasks', h('h4', { html: `${icon('listChecks')} Aufgaben <span class="badge" style="margin-left:auto">${getTasks().filter((t) => !t.done).length}</span>` }));
  if (!open.length) tw.append(h('div.faint', { style: { fontSize: '12.5px' } }, 'Keine offenen Aufgaben – stark! 🎉'));
  for (const t of open) {
    const cb = h('input', { type: 'checkbox', onchange: () => updateTask(t.id, { done: true }) });
    tw.append(h('label.t-row', cb, h('span.ellipsis', t.title)));
  }
  tw.append(h('button.btn.sm.ghost', { style: { marginTop: '6px', paddingLeft: '4px' }, html: `${icon('plus')} Aufgabe hinzufügen`, onclick: () => openApp('tasks', { action: 'focusInput' }) }));
  widgetsEl.append(tw);

  // Wetter
  const city = store.get('weatherCity');
  const ww = h('div.widget.glass.w-weather', { ondblclick: () => openApp('weather') }, h('h4', { html: `${icon('cloudSun')} Wetter${city ? ' · ' + esc(city.name) : ''}` }));
  widgetsEl.append(ww);
  if (!city) {
    ww.append(h('div.faint', { style: { fontSize: '12.5px', marginBottom: '8px' } }, 'Lege deinen Ort fest, um das Wetter zu sehen.'),
      h('button.btn.sm', { html: `${icon('mapPin')} Ort wählen`, onclick: () => openApp('weather') }));
  } else {
    forecast(city).then((data) => {
      const c = data.current;
      const ds = describe(c.weather_code, c.is_day);
      ww.append(h('div.big-ico', { html: icon(ds.icon) }), h('div.temp', `${Math.round(c.temperature_2m)}°`),
        h('div.cond', `${ds.label} · H ${Math.round(data.daily.temperature_2m_max[0])}° T ${Math.round(data.daily.temperature_2m_min[0])}°`));
    }).catch(() => ww.append(h('div.faint', { style: { fontSize: '12.5px' } }, 'Keine Verbindung zum Wetterdienst.')));
  }

  // Schnellnotiz
  const ta = h('textarea.input', { rows: 4, placeholder: 'Schnellnotiz …', value: store.get('quickNote', ''), style: { background: 'transparent', border: '0', padding: '0', boxShadow: 'none' } });
  ta.addEventListener('input', debounce(() => store.set('quickNote', ta.value), 300));
  widgetsEl.append(h('div.widget.glass', h('h4', { html: `${icon('edit')} Schnellnotiz` }), ta));
}
