// Gemeinsames Datenmodell für Aufgaben (App + Widget).

import { store } from './store.js';
import { bus, uid } from './dom.js';

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

export function updateTask(id, patch) {
  saveTasks(getTasks().map((t) => (t.id === id ? { ...t, ...patch, ...(patch.done ? { doneAt: Date.now() } : {}) } : t)));
}

export function removeTask(id) {
  saveTasks(getTasks().filter((t) => t.id !== id));
}
