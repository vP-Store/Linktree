// Gemeinsames Datenmodell für Aufgaben (App + Widget).

import { store } from './store.js';
import { bus, uid, isoDate } from './dom.js';

export const DEFAULT_LISTS = [
  { id: 'inbox', name: 'Eingang', color: '#60a5fa' },
  { id: 'work', name: 'Arbeit', color: '#f59e0b' },
  { id: 'private', name: 'Privat', color: '#34d399' },
];

export function getTasks() { return store.get('tasks', []) || []; }
export function getLists() { return store.get('taskLists', null) || DEFAULT_LISTS; }

export function saveTasks(list) {
  store.set('tasks', list);
  bus.emit('tasks');
}

export function saveLists(lists) {
  store.set('taskLists', lists);
  bus.emit('tasks');
}

export function addTask(title, extra = {}) {
  const t = { id: uid('t'), title: title.trim(), done: false, list: 'inbox', prio: 0, due: null, notes: '', created: Date.now(), ...extra };
  saveTasks([t, ...getTasks()]);
  return t;
}

export const REPEAT_LABEL = { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' };

/** Einen Wiederholungsschritt weiter; Monatsende wird gekappt (31.01. → 28./29.02.) */
function stepRepeat(d, repeat) {
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return d;
}

/** Nächstes Fälligkeitsdatum einer wiederkehrenden Aufgabe */
export function nextDue(due, repeat) {
  const d = stepRepeat(due ? new Date(due + 'T00:00') : new Date(), repeat);
  // nie in der Vergangenheit anlegen
  const today = isoDate();
  while (isoDate(d) < today && REPEAT_LABEL[repeat]) stepRepeat(d, repeat);
  return isoDate(d);
}

export function updateTask(id, patch) {
  let list = getTasks();
  const t = list.find((x) => x.id === id);
  // Wiederkehrend: beim Abhaken die nächste Ausgabe anlegen – nur einmal pro Ausgabe,
  // sonst entstünde bei Abhaken → Zurücknehmen → Abhaken jedes Mal eine weitere Kopie
  let next = null;
  if (t && patch.done && !t.done && t.repeat && !t.nextId) {
    const { id: _old, done: _d, doneAt: _da, nextId: _n, ...rest } = t;
    next = { ...rest, id: uid('t'), done: false, due: nextDue(t.due, t.repeat), created: Date.now() };
  }
  list = list.map((x) => (x.id === id ? { ...x, ...patch, ...(patch.done ? { doneAt: Date.now() } : {}), ...(next ? { nextId: next.id } : {}) } : x));
  if (next) list = [next, ...list];
  saveTasks(list);
}

export function removeTask(id) {
  saveTasks(getTasks().filter((t) => t.id !== id));
}
