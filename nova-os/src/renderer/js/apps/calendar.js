// Kalender: Monats- und Wochenansicht, Termine mit Uhrzeit, Farben und Erinnerungen.

import { h, clear, esc, bus, uid, pad, isoDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { formDialog, contextMenu } from '../core/ui.js';
import { getTasks } from '../core/tasks.js';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const COLORS = ['#7c5cff', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#ec4899', '#94a3b8'];

export function getEvents() { return store.get('calendarEvents', []) || []; }
function saveEvents(list) { store.set('calendarEvents', list); bus.emit('calendar'); }

// Feiertage (bundesweit, Deutschland) – inkl. beweglicher Feiertage über das Osterdatum
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const holidayCache = {};
function holidays(y) {
  if (holidayCache[y]) return holidayCache[y];
  const e = easter(y);
  const off = (n) => { const d = new Date(e); d.setDate(d.getDate() + n); return isoDate(d); };
  holidayCache[y] = {
    [`${y}-01-01`]: 'Neujahr', [off(-2)]: 'Karfreitag', [off(1)]: 'Ostermontag', [`${y}-05-01`]: 'Tag der Arbeit',
    [off(39)]: 'Christi Himmelfahrt', [off(50)]: 'Pfingstmontag', [`${y}-10-03`]: 'Tag der Deutschen Einheit',
    [`${y}-12-24`]: 'Heiligabend', [`${y}-12-25`]: '1. Weihnachtstag', [`${y}-12-26`]: '2. Weihnachtstag', [`${y}-12-31`]: 'Silvester',
  };
  return holidayCache[y];
}

/** Erinnerungen: läuft global (aus main.js gestartet) */
export function startReminders(notify) {
  const check = () => {
    const now = new Date();
    const fired = new Set(store.get('calendarFired', []) || []);
    let changed = false;
    for (const ev of getEvents()) {
      if (!ev.time || !ev.remind) continue;
      const at = new Date(`${ev.date}T${ev.time}`);
      const diff = (at - now) / 60000;
      const key = ev.id + '@' + ev.date + ev.time;
      if (diff <= Number(ev.remind) && diff > -5 && !fired.has(key)) {
        notify(ev.title, `${diff > 1 ? `in ${Math.round(diff)} Min.` : 'jetzt'} · ${ev.time} Uhr`, { icon: 'alarm', kind: 'warn', duration: 9000 });
        fired.add(key);
        changed = true;
      }
    }
    if (changed) store.set('calendarFired', [...fired].slice(-200));
  };
  check();
  setInterval(check, 30000);
}

export default {
  mount(root, win, args = {}) {
    let view = store.get('calView', 'month');
    let cursor = args.date ? new Date(args.date + 'T00:00') : new Date();
    let selected = args.date || isoDate();

    const title = h('h2.cal-title');
    const seg = h('div.seg',
      ...[['month', 'Monat'], ['week', 'Woche']].map(([v, l]) => h('button.seg-btn', { dataset: { v }, onclick: () => { view = v; store.set('calView', v); render(); } }, l)));
    const grid = h('div.cal-grid');
    const agenda = h('div.cal-agenda');
    root.append(
      h('div.app-toolbar',
        h('button.btn.sm', { onclick: () => { cursor = new Date(); selected = isoDate(); render(); } }, 'Heute'),
        h('button.icon-btn', { html: icon('chevronLeft'), title: 'Zurück', onclick: () => step(-1) }),
        h('button.icon-btn', { html: icon('chevronRight'), title: 'Weiter', onclick: () => step(1) }),
        title, h('div.grow'), seg,
        h('button.btn.sm.primary', { html: `${icon('plus')} Termin`, onclick: () => editEvent(null, selected) })),
      h('div.app-split', h('div.app-main', grid), agenda));

    function step(dir) {
      if (view === 'month') cursor.setMonth(cursor.getMonth() + dir);
      else cursor.setDate(cursor.getDate() + dir * 7);
      render();
    }

    function eventsOn(date) {
      return getEvents().filter((e) => e.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    }

    function render() {
      seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
      if (view === 'month') renderMonth(); else renderWeek();
      renderAgenda();
    }

    function renderMonth() {
      title.textContent = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
      clear(grid);
      grid.className = 'cal-grid month';
      DOW.forEach((d) => grid.append(h('div.cal-dow', d)));
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const start = new Date(first);
      start.setDate(1 - ((first.getDay() + 6) % 7));
      const todayKey = isoDate();
      const tasks = getTasks().filter((t) => !t.done && t.due);
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const key = isoDate(d);
        const hol = holidays(d.getFullYear())[key];
        const evs = eventsOn(key);
        const tcount = tasks.filter((t) => t.due === key).length;
        const cell = h('div.cal-cell', {
          class: [d.getMonth() !== cursor.getMonth() ? 'other' : '', key === todayKey ? 'today' : '', key === selected ? 'sel' : '', d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''].join(' '),
          onclick: () => { selected = key; render(); },
          ondblclick: () => editEvent(null, key),
        }, h('div.cal-num', h('span', String(d.getDate())), hol ? h('small.cal-hol', hol) : null));
        for (const ev of evs.slice(0, 3)) cell.append(evChip(ev));
        if (evs.length > 3) cell.append(h('div.cal-more', `+${evs.length - 3} weitere`));
        if (tcount) cell.append(h('div.cal-more', { html: `${icon('listChecks')} ${tcount} Aufgabe${tcount > 1 ? 'n' : ''}` }));
        grid.append(cell);
      }
    }

    function renderWeek() {
      clear(grid);
      grid.className = 'cal-grid week';
      const start = new Date(cursor);
      start.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
      const end = new Date(start); end.setDate(start.getDate() + 6);
      title.textContent = `${start.getDate()}. ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()}. ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
      const todayKey = isoDate();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const key = isoDate(d);
        const hol = holidays(d.getFullYear())[key];
        const col = h('div.cal-wcol', { class: (key === todayKey ? 'today ' : '') + (key === selected ? 'sel' : ''), onclick: () => { selected = key; renderAgenda(); grid.querySelectorAll('.cal-wcol').forEach((c) => c.classList.toggle('sel', c === col)); }, ondblclick: () => editEvent(null, key) },
          h('div.cal-whead', h('span', DOW[i]), h('b', String(d.getDate()))),
          hol ? h('div.cal-hol', hol) : null);
        const evs = eventsOn(key);
        if (!evs.length) col.append(h('div.faint', { style: { fontSize: '11.5px', padding: '6px 2px' } }, '—'));
        evs.forEach((ev) => col.append(evChip(ev, true)));
        grid.append(col);
      }
    }

    function evChip(ev, big = false) {
      const el = h('div.cal-ev' + (big ? '.big' : ''), { style: { '--c': ev.color || 'var(--accent)' }, title: ev.title, onclick: (e) => { e.stopPropagation(); editEvent(ev); } },
        ev.time ? h('span.cal-ev-time', ev.time) : null, h('span.ellipsis', ev.title));
      if (big && ev.notes) el.append(h('div.cal-ev-notes', ev.notes));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        contextMenu(e.clientX, e.clientY, [
          { label: 'Bearbeiten', icon: 'edit', action: () => editEvent(ev) },
          { label: 'Duplizieren (nächste Woche)', icon: 'copy', action: () => { const d = new Date(ev.date + 'T00:00'); d.setDate(d.getDate() + 7); saveEvents([...getEvents(), { ...ev, id: uid('ev'), date: isoDate(d) }]); } },
          '-',
          { label: 'Löschen', icon: 'trash', danger: true, action: () => saveEvents(getEvents().filter((x) => x.id !== ev.id)) },
        ]);
      });
      return el;
    }

    function renderAgenda() {
      clear(agenda);
      const d = new Date(selected + 'T00:00');
      const hol = holidays(d.getFullYear())[selected];
      agenda.append(
        h('div.cal-ag-date', h('b', String(d.getDate())), h('div', h('div', d.toLocaleDateString('de-DE', { weekday: 'long' })), h('div.faint', `${MONTHS[d.getMonth()]} ${d.getFullYear()}`))),
        hol ? h('div.badge.accent', { style: { margin: '0 0 10px' } }, hol) : null);
      const evs = eventsOn(selected);
      const tasks = getTasks().filter((t) => !t.done && t.due === selected);
      if (!evs.length && !tasks.length) agenda.append(h('div.empty', { style: { padding: '20px 0' }, html: `${icon('calendar')}<b>Frei</b><span>Doppelklick auf einen Tag erstellt einen Termin.</span>` }));
      evs.forEach((ev) => agenda.append(h('div.cal-ag-ev', { style: { '--c': ev.color || 'var(--accent)' }, onclick: () => editEvent(ev) },
        h('div.cal-ag-time', ev.time || 'Ganztägig', ev.end ? h('small', ` – ${ev.end}`) : null),
        h('div.cal-ag-title', ev.title),
        ev.notes ? h('div.faint', { style: { fontSize: '12px', marginTop: '2px' } }, ev.notes) : null)));
      if (tasks.length) {
        agenda.append(h('div.side-label', { style: { padding: '14px 0 6px' } }, 'Fällige Aufgaben'));
        tasks.forEach((t) => agenda.append(h('div.row', { style: { fontSize: '13px', padding: '4px 0' }, html: `${icon('circle')}<span>${esc(t.title)}</span>` })));
      }
      agenda.append(h('button.btn.sm', { style: { marginTop: '14px', width: '100%' }, html: `${icon('plus')} Termin am ${d.getDate()}.${d.getMonth() + 1}.`, onclick: () => editEvent(null, selected) }));
    }

    async function editEvent(ev, date) {
      const res = await formDialog({
        title: ev ? 'Termin bearbeiten' : 'Neuer Termin',
        ok: ev ? 'Speichern' : 'Erstellen',
        extra: ev ? [{ label: 'Löschen', danger: true, value: 'delete' }] : [],
        fields: [
          { name: 'title', label: 'Titel', value: ev ? ev.title : '', placeholder: 'z. B. Meeting mit Lisa', required: true },
          { name: 'date', label: 'Datum', type: 'date', value: ev ? ev.date : date },
          { name: 'time', label: 'Beginn (leer = ganztägig)', type: 'time', value: ev ? ev.time : '' },
          { name: 'end', label: 'Ende', type: 'time', value: ev ? ev.end : '' },
          { name: 'remind', label: 'Erinnerung', type: 'select', value: ev ? String(ev.remind || '') : '10', options: [{ value: '', label: 'Keine' }, { value: '0', label: 'Zum Termin' }, { value: '5', label: '5 Minuten vorher' }, { value: '10', label: '10 Minuten vorher' }, { value: '30', label: '30 Minuten vorher' }, { value: '60', label: '1 Stunde vorher' }] },
          { name: 'color', label: 'Farbe', type: 'color', value: ev ? ev.color : COLORS[0], options: COLORS },
          { name: 'notes', label: 'Notizen', type: 'textarea', value: ev ? ev.notes : '', rows: 2 },
        ],
      });
      if (!res) return;
      if (res.__action === 'delete') { saveEvents(getEvents().filter((x) => x.id !== ev.id)); return; }
      const data = { ...res, date: res.date || date || isoDate() };
      if (ev) saveEvents(getEvents().map((x) => (x.id === ev.id ? { ...x, ...data } : x)));
      else saveEvents([...getEvents(), { id: uid('ev'), ...data }]);
      selected = data.date;
      const d = new Date(data.date + 'T00:00');
      if (view === 'month' && (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear())) cursor = d;
      render();
    }

    const off = bus.on('calendar', render);
    const off2 = bus.on('tasks', render);
    render();
    return {
      onArgs(a) { if (a.date) { selected = a.date; cursor = new Date(a.date + 'T00:00'); render(); } },
      destroy() { off(); off2(); },
    };
  },
};
