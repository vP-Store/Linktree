// Aufgaben: Listen, Fälligkeiten, Prioritäten, intelligente Ansichten.

import { h, clear, esc, bus, uid, isoDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { getTasks, getLists, addTask, updateTask, removeTask, saveLists, saveTasks } from '../core/tasks.js';
import { contextMenu, promptDialog, confirmDialog, notify } from '../core/ui.js';
import { store } from '../core/store.js';

const COLORS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#f87171', '#22d3ee', '#a3e635'];
const PRIO = [
  { v: 0, label: 'Keine', color: 'var(--text-3)' },
  { v: 1, label: 'Niedrig', color: '#60a5fa' },
  { v: 2, label: 'Mittel', color: '#f59e0b' },
  { v: 3, label: 'Hoch', color: '#f87171' },
];

function today() { return isoDate(); }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); }
function dueLabel(due) {
  if (!due) return '';
  if (due === today()) return 'Heute';
  if (due === addDays(1)) return 'Morgen';
  if (due < today()) return 'Überfällig · ' + new Date(due + 'T00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  return new Date(due + 'T00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** „Morgen Zahnarzt !hoch #arbeit“ → Fälligkeit, Priorität, Liste aus dem Text lesen */
function parseQuick(text, lists) {
  let title = text;
  const extra = {};
  const take = (re, fn) => { const m = title.match(re); if (m) { fn(m); title = title.replace(re, ' '); } };
  take(/(^|\s)(heute)(?=\s|$)/i, () => { extra.due = today(); });
  take(/(^|\s)(morgen)(?=\s|$)/i, () => { extra.due = addDays(1); });
  take(/(^|\s)(übermorgen)(?=\s|$)/i, () => { extra.due = addDays(2); });
  take(/(^|\s)(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s|$)/, (m) => {
    const y = m[4] ? (m[4].length === 2 ? '20' + m[4] : m[4]) : new Date().getFullYear();
    extra.due = `${y}-${String(m[3]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  });
  take(/(^|\s)!(hoch|high|3)(?=\s|$)/i, () => { extra.prio = 3; });
  take(/(^|\s)!(mittel|medium|2)(?=\s|$)/i, () => { extra.prio = 2; });
  take(/(^|\s)!(niedrig|low|1)(?=\s|$)/i, () => { extra.prio = 1; });
  take(/(^|\s)#([\wäöüß-]+)(?=\s|$)/i, (m) => {
    const l = lists.find((x) => x.name.toLowerCase() === m[2].toLowerCase() || x.id === m[2].toLowerCase());
    if (l) extra.list = l.id;
  });
  return { title: title.replace(/\s+/g, ' ').trim(), extra };
}

export default {
  mount(root, win, args) {
    let view = store.get('tasksView', 'today');
    let showDone = false;

    const side = h('div.app-sidebar');
    const listHead = h('div.tasks-head');
    const input = h('input.input.tasks-input', { placeholder: 'Neue Aufgabe … (z. B. „Morgen Bericht abgeben !hoch #arbeit“)', spellcheck: false });
    const listEl = h('div.app-scroll.tasks-list');
    root.append(h('div.app-split', side, h('div.app-main', listHead, h('div.tasks-add', { html: icon('plus') }, input), listEl)));

    function views() {
      const tasks = getTasks();
      const open = tasks.filter((t) => !t.done);
      return [
        { id: 'today', label: 'Heute', icon: 'sun', filter: (t) => t.due && t.due <= today(), count: open.filter((t) => t.due && t.due <= today()).length },
        { id: 'upcoming', label: 'Geplant', icon: 'calendar', filter: (t) => !!t.due, count: open.filter((t) => t.due).length },
        { id: 'important', label: 'Wichtig', icon: 'flag', filter: (t) => t.prio >= 2, count: open.filter((t) => t.prio >= 2).length },
        { id: 'all', label: 'Alle', icon: 'inbox', filter: () => true, count: open.length },
      ];
    }

    function renderSide() {
      clear(side);
      side.append(h('div.side-label', 'Ansichten'));
      for (const v of views()) {
        side.append(h('button.side-item', { class: view === v.id ? 'on' : '', html: `${icon(v.icon)}<span>${v.label}</span><span class="count">${v.count || ''}</span>`, onclick: () => setView(v.id) }));
      }
      side.append(h('div.side-label', { style: { display: 'flex', alignItems: 'center' } }, 'Listen'));
      const open = getTasks().filter((t) => !t.done);
      for (const l of getLists()) {
        const el = h('button.side-item', {
          class: view === 'list:' + l.id ? 'on' : '',
          html: `<i class="dot" style="background:${l.color}"></i><span class="ellipsis">${esc(l.name)}</span><span class="count">${open.filter((t) => t.list === l.id).length || ''}</span>`,
          onclick: () => setView('list:' + l.id),
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          contextMenu(e.clientX, e.clientY, [
            { label: 'Umbenennen', icon: 'edit', action: async () => { const n = await promptDialog({ title: 'Liste umbenennen', value: l.name }); if (n) saveLists(getLists().map((x) => (x.id === l.id ? { ...x, name: n } : x))); } },
            { label: 'Farbe wechseln', icon: 'palette', action: () => saveLists(getLists().map((x) => (x.id === l.id ? { ...x, color: COLORS[(COLORS.indexOf(x.color) + 1) % COLORS.length] } : x))) },
            l.id !== 'inbox' ? '-' : null,
            l.id !== 'inbox' ? { label: 'Liste löschen', icon: 'trash', danger: true, action: async () => {
              if (!(await confirmDialog({ title: `Liste „${l.name}“ löschen?`, message: 'Aufgaben darin werden in den Eingang verschoben.', ok: 'Löschen', danger: true }))) return;
              saveTasks(getTasks().map((t) => (t.list === l.id ? { ...t, list: 'inbox' } : t)));
              saveLists(getLists().filter((x) => x.id !== l.id));
              if (view === 'list:' + l.id) setView('all');
            } } : null,
          ]);
        });
        side.append(el);
      }
      side.append(h('button.side-item', { html: `${icon('plus')}<span>Neue Liste</span>`, onclick: async () => {
        const n = await promptDialog({ title: 'Neue Liste', placeholder: 'z. B. Einkauf', ok: 'Erstellen' });
        if (!n) return;
        const l = { id: uid('l'), name: n, color: COLORS[getLists().length % COLORS.length] };
        saveLists([...getLists(), l]);
        setView('list:' + l.id);
      } }));
    }

    function setView(v) {
      view = v;
      store.set('tasksView', v);
      render();
    }

    function currentFilter() {
      if (view.startsWith('list:')) { const id = view.slice(5); return { label: (getLists().find((l) => l.id === id) || {}).name || 'Liste', filter: (t) => t.list === id, list: id }; }
      const v = views().find((x) => x.id === view) || views()[3];
      return { label: v.label, filter: v.filter };
    }

    function render() {
      renderSide();
      const f = currentFilter();
      const tasks = getTasks().filter(f.filter);
      const open = tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.prio - a.prio || a.created - b.created);
      const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
      clear(listHead);
      const d = new Date();
      listHead.append(
        h('div', h('h2', f.label), h('div.faint', view === 'today' ? d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) : `${open.length} offen · ${done.length} erledigt`)),
        h('div.grow'),
        done.length ? h('button.btn.sm.ghost', { onclick: () => { showDone = !showDone; render(); } }, showDone ? 'Erledigte ausblenden' : `Erledigte zeigen (${done.length})`) : null,
      );
      clear(listEl);
      if (!open.length && (!showDone || !done.length)) {
        listEl.append(h('div.empty', { html: `${icon(view === 'today' ? 'sun' : 'checkCircle')}<b>${view === 'today' ? 'Nichts mehr für heute' : 'Alles erledigt'}</b><span>Tippe oben eine neue Aufgabe ein und drücke Enter.</span>` }));
      }
      open.forEach((t) => listEl.append(row(t)));
      if (showDone && done.length) {
        listEl.append(h('div.side-label', { style: { padding: '16px 6px 6px' } }, 'Erledigt'));
        done.forEach((t) => listEl.append(row(t)));
      }
      win.setTitle(`${f.label} – Aufgaben`);
    }

    function row(t) {
      const list = getLists().find((l) => l.id === t.list);
      const prio = PRIO[t.prio || 0];
      const overdue = !t.done && t.due && t.due < today();
      const check = h('button.task-check', { class: t.done ? 'on' : '', style: { borderColor: t.prio ? prio.color : '' }, html: icon('check'), title: t.done ? 'Wieder öffnen' : 'Erledigt', onclick: (e) => {
        e.stopPropagation();
        const el = e.currentTarget.closest('.task-row');
        if (!t.done) { el.classList.add('completing'); setTimeout(() => updateTask(t.id, { done: true }), 260); }
        else updateTask(t.id, { done: false });
      } });
      const title = h('div.task-title', t.title);
      const metaParts = [];
      if (t.due) metaParts.push(`<span class="${overdue ? 'overdue' : ''}">${icon('calendar')} ${dueLabel(t.due)}</span>`);
      if (list && !view.startsWith('list:')) metaParts.push(`<span><i class="dot" style="background:${list.color}"></i> ${esc(list.name)}</span>`);
      if (t.prio) metaParts.push(`<span style="color:${prio.color}">${icon('flag')} ${prio.label}</span>`);
      if (t.notes) metaParts.push(`<span>${icon('fileText')} Notiz</span>`);
      const el = h('div.task-row', { class: t.done ? 'done' : '' }, check, h('div.grow', title, metaParts.length ? h('div.task-meta', { html: metaParts.join('') }) : null));
      el.addEventListener('dblclick', () => edit(t));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(t, e.clientX, e.clientY); });
      el.append(h('button.icon-btn.sm.task-more', { html: icon('more'), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); menu(t, r.left - 180, r.bottom); } }));
      return el;
    }

    function menu(t, x, y) {
      contextMenu(x, y, [
        { label: 'Bearbeiten', icon: 'edit', action: () => edit(t) },
        { label: 'Heute fällig', icon: 'sun', action: () => updateTask(t.id, { due: today() }) },
        { label: 'Morgen fällig', icon: 'sunrise', action: () => updateTask(t.id, { due: addDays(1) }) },
        { label: 'Nächste Woche', icon: 'calendar', action: () => updateTask(t.id, { due: addDays(7) }) },
        t.due ? { label: 'Fälligkeit entfernen', icon: 'x', action: () => updateTask(t.id, { due: null }) } : null,
        '-',
        { label: 'Priorität', header: true },
        ...PRIO.map((p) => ({ label: p.label + (t.prio === p.v ? ' ✓' : ''), icon: 'flag', action: () => updateTask(t.id, { prio: p.v }) })),
        '-',
        { label: 'Verschieben nach', header: true },
        ...getLists().filter((l) => l.id !== t.list).map((l) => ({ label: l.name, icon: 'inbox', action: () => updateTask(t.id, { list: l.id }) })),
        '-',
        { label: 'Löschen', icon: 'trash', danger: true, action: () => removeTask(t.id) },
      ]);
    }

    async function edit(t) {
      const n = await promptDialog({ title: 'Aufgabe bearbeiten', value: t.title, ok: 'Speichern' });
      if (n) updateTask(t.id, { title: n });
    }

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const f = currentFilter();
      const { title, extra } = parseQuick(input.value, getLists());
      if (!title) return;
      const defaults = {};
      if (f.list) defaults.list = f.list;
      if (view === 'today' && !extra.due) defaults.due = today();
      if (view === 'important' && extra.prio == null) defaults.prio = 2;
      addTask(title, { ...defaults, ...extra });
      input.value = '';
    });

    // Fällige Aufgaben einmal pro Tag melden
    const key = 'tasksNotified';
    if (store.get(key) !== today()) {
      const due = getTasks().filter((t) => !t.done && t.due && t.due <= today());
      if (due.length) notify(`${due.length} Aufgabe(n) fällig`, due.slice(0, 3).map((t) => t.title).join(' · '), { icon: 'listChecks', kind: 'warn' });
      store.set(key, today());
    }

    const off = bus.on('tasks', render);
    render();
    if (args.action === 'focusInput') setTimeout(() => input.focus(), 50);

    return {
      onArgs(a) { if (a.action === 'focusInput') input.focus(); },
      onFocus() { setTimeout(() => input.focus(), 10); },
      destroy: off,
    };
  },
};
