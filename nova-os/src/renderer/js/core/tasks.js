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

/** Nächstes Fälligkeitsdatum einer wiederkehrenden Aufgabe */
export function nextDue(due, repeat) {
  const d = due ? new Date(due + 'T00:00') : new Date();
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  // nie in der Vergangenheit anlegen
  const today = isoDate();
  let next = isoDate(d);
  while (next < today && repeat) { const x = new Date(next + 'T00:00'); if (repeat === 'daily') x.setDate(x.getDate() + 1); else if (repeat === 'weekly') x.setDate(x.getDate() + 7); else x.setMonth(x.getMonth() + 1); next = isoDate(x); }
  return next;
}

export function updateTask(id, patch) {
  let list = getTasks();
  const t = list.find((x) => x.id === id);
  list = list.map((x) => (x.id === id ? { ...x, ...patch, ...(patch.done ? { doneAt: Date.now() } : {}) } : x));
  // Wiederkehrend: beim Abhaken die nächste Ausgabe anlegen
  if (t && patch.done && !t.done && t.repeat) {
    const { id: _old, done: _d, doneAt: _da, ...rest } = t;
    list = [{ ...rest, id: uid('t'), done: false, due: nextDue(t.due, t.repeat), created: Date.now() }, ...list];
  }
  saveTasks(list);
}

export function removeTask(id) {
  saveTasks(getTasks().filter((t) => t.id !== id));
}
