// Führt Werkzeug-Aufrufe von Nova KI lokal aus (Aufgaben, Termine, Notizen, Dateisuche).

import { api } from './api.js';
import { store } from './store.js';
import { bus, uid, isoDate, pathx } from './dom.js';
import { addTask, getTasks } from './tasks.js';

const LABEL = {
  add_task: 'Aufgabe angelegt', add_event: 'Termin eingetragen', create_note: 'Notiz erstellt',
  list_tasks: 'Aufgaben abgefragt', list_events: 'Termine abgefragt', search_files: 'Dateien durchsucht',
};

function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); }

async function execute(name, input) {
  if (name === 'add_task') {
    const t = addTask(input.title, { ...(input.due ? { due: input.due } : {}), ...(input.priority != null ? { prio: input.priority } : {}), ...(input.repeat ? { repeat: input.repeat } : {}) });
    return { result: { ok: true, id: t.id, title: t.title, due: t.due }, summary: `${t.title}${t.due ? ' · fällig ' + new Date(t.due + 'T00:00').toLocaleDateString('de-DE') : ''}` };
  }
  if (name === 'add_event') {
    const ev = { id: uid('ev'), title: input.title, date: input.date, time: input.time || '', end: input.end || '', notes: input.notes || '', remind: input.remind_minutes != null ? String(input.remind_minutes) : (input.time ? '10' : ''), color: '#7c5cff' };
    store.set('calendarEvents', [...(store.get('calendarEvents', []) || []), ev]);
    bus.emit('calendar');
    return { result: { ok: true, id: ev.id }, summary: `${ev.title} · ${new Date(ev.date + 'T00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}${ev.time ? ' ' + ev.time : ''}` };
  }
  if (name === 'create_note') {
    const places = await api.fs.places();
    const safe = input.title.replace(/[\\/:*?"<>|#]/g, '').trim().slice(0, 60) || 'Notiz';
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const file = pathx.join(pathx.join(places.novaData, 'Notizen'), `${stamp} ${safe}.md`);
    await api.fs.writeText(file, `# ${input.title}\n\n${input.content}\n`);
    bus.emit('notes:changed', file);
    return { result: { ok: true, path: file }, summary: input.title };
  }
  if (name === 'list_tasks') {
    const list = getTasks().filter((t) => input.include_done || !t.done).slice(0, 100)
      .map((t) => ({ title: t.title, due: t.due || null, done: !!t.done, priority: t.prio || 0, repeat: t.repeat || null }));
    return { result: list, summary: `${list.length} Aufgaben` };
  }
  if (name === 'list_events') {
    const from = input.from || isoDate(), to = input.to || addDays(14);
    const list = (store.get('calendarEvents', []) || []).filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((e) => ({ title: e.title, date: e.date, time: e.time || null, end: e.end || null, notes: e.notes || null }));
    return { result: list, summary: `${list.length} Termine` };
  }
  if (name === 'search_files') {
    const places = await api.fs.places();
    const hits = await api.fs.search(places.home, input.query, 30, 'ai');
    return { result: hits.map((f) => ({ name: f.name, path: f.path, folder: !!f.dir })), summary: `„${input.query}“: ${hits.length} Treffer` };
  }
  throw new Error('Unbekanntes Werkzeug: ' + name);
}

export function initAiTools() {
  if (!api.ai || !api.ai.onTool) return;
  api.ai.onTool(async ({ id, toolId, name, input }) => {
    try {
      const { result, summary } = await execute(name, input || {});
      bus.emit('ai:tool', { id, name, label: LABEL[name] || name, summary, ok: true });
      api.ai.toolResult(toolId, { result });
    } catch (e) {
      bus.emit('ai:tool', { id, name, label: LABEL[name] || name, summary: String(e.message || e), ok: false });
      api.ai.toolResult(toolId, { error: String(e.message || e) });
    }
  });
}
