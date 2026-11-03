import { useEffect, useState } from 'preact/hooks';
import type { Data, Firm, Person, Interaction, Task, Deadline, ID } from './types';
import { uid, today } from './util';
import { DEFAULT_TEMPLATES, DEFAULT_QUESTIONS, DEFAULT_SETTINGS } from './seed';
import { derivedStatus, interactionsFor } from './logic';
import { gasAvailable, gasInit, gasSave } from './gas';

export const DATA_FILE = 'tracker.json';
const BACKUP_DIR = 'backups';
const KEEP_BACKUPS = 10;
const BACKUP_EVERY_MS = 30 * 60 * 1000;

export type Mode = 'loading' | 'setup' | 'reconnect' | 'broken' | 'ready';

interface State {
  mode: Mode;
  data: Data;
  dir: FileSystemDirectoryHandle | null;
  memory: boolean; // no folder: in-memory / download mode
  saveState: 'saved' | 'saving' | 'dirty' | 'error';
  saveError: string;
  loadError: string;
  lastSaved: Date | null;
  backend: 'fs' | 'memory' | 'gas';
  conflict: boolean;   // gas: someone else saved since we loaded
  offline: boolean;    // gas: last save failed to reach the server; kept locally
  sheetUrl: string;
  sheetSynced: Date | null;
  user: string;
}

export function emptyData(): Data {
  return {
    version: 1, firms: [], people: [], interactions: [], tasks: [], deadlines: [],
    templates: structuredClone(DEFAULT_TEMPLATES), questions: structuredClone(DEFAULT_QUESTIONS),
    settings: { ...DEFAULT_SETTINGS }, updatedAt: new Date().toISOString(),
  };
}

let state: State = {
  mode: 'loading', data: emptyData(), dir: null, memory: false,
  saveState: 'saved', saveError: '', loadError: '', lastSaved: null,
  backend: 'fs', conflict: false, offline: false, sheetUrl: '', sheetSynced: null, user: '',
};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; emit(); };

export const getState = () => state;
export const setState = set;
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return state;
}

/** Fill in fields missing from older or hand-edited files. */
export function normalize(raw: any): Data {
  const base = emptyData();
  const d: Data = { ...base, ...raw, settings: { ...base.settings, ...(raw.settings ?? {}) } };
  for (const k of ['firms', 'people', 'interactions', 'tasks', 'deadlines'] as const) (d as any)[k] = Array.isArray(raw[k]) ? raw[k] : [];
  if (!Array.isArray(raw.templates) || !raw.templates.length) d.templates = base.templates;
  if (!Array.isArray(raw.questions) || !raw.questions.length) d.questions = base.questions;
  d.firms = d.firms.map((f) => ({ aliases: [], kind: 'firm', market: '', offices: '', size: '', tiers: [], practiceAreas: '', howFound: '', status: 'Researching', interest: null, notes: '', links: [], ...(f as any) }));
  d.people = d.people.map((p) => ({ firmId: null, pastEmployers: '', role: '', title: '', gradYear: null, school: '', tags: [], email: '', linkedin: '', otherChannel: '', status: 'Prospect', statusManual: false, whereMet: '', personal: '', notes: '', createdAt: today(), ...(p as any) }));
  d.people.forEach((p) => { delete (p as any).flag; }); // follow-up flag was removed; Tasks cover it
  d.interactions = d.interactions.map((i) => ({ summary: '', takeaways: '', impression: null, ...(i as any) }));
  return d;
}

// ---------- mutations ----------
let saveTimer: number | undefined;
function commit(mut: (d: Data) => void) {
  const data = structuredClone(state.data);
  mut(data);
  data.updatedAt = new Date().toISOString();
  set({ data, saveState: 'dirty' });
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 600);
}

const upsert = <T extends { id: ID }>(arr: T[], item: T) => {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
};

export const actions = {
  replaceAll(data: Data) { commit((d) => Object.assign(d, normalize(data))); },
  saveFirm(f: Firm) { commit((d) => upsert(d.firms, f)); },
  savePerson(p: Person) { commit((d) => upsert(d.people, p)); },
  saveTask(t: Task) { commit((d) => upsert(d.tasks, t)); },
  saveDeadline(x: Deadline) { commit((d) => upsert(d.deadlines, x)); },
  deleteDeadline(id: ID) { commit((d) => { d.deadlines = d.deadlines.filter((x) => x.id !== id); }); },
  deleteTask(id: ID) { commit((d) => { d.tasks = d.tasks.filter((x) => x.id !== id); }); },
  toggleTask(id: ID) {
    commit((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (t) { t.done = !t.done; t.doneAt = t.done ? today() : null; }
    });
  },
  /** Logging an interaction clears any manual status override. */
  saveInteraction(i: Interaction) {
    commit((d) => {
      upsert(d.interactions, i);
      const p = d.people.find((x) => x.id === i.personId);
      if (p) { p.statusManual = false; p.status = derivedStatus(interactionsFor(d, p.id), d.settings.noReplyDays); }
    });
  },
  deleteInteraction(id: ID) { commit((d) => { d.interactions = d.interactions.filter((x) => x.id !== id); }); },
  deletePerson(id: ID) {
    commit((d) => {
      d.people = d.people.filter((x) => x.id !== id);
      d.interactions = d.interactions.filter((x) => x.personId !== id);
      d.tasks = d.tasks.filter((x) => x.personId !== id);
    });
  },
  deleteFirm(id: ID) {
    commit((d) => {
      d.firms = d.firms.filter((x) => x.id !== id);
      d.people.forEach((p) => { if (p.firmId === id) p.firmId = null; });
      d.tasks.forEach((t) => { if (t.firmId === id) t.firmId = null; if (t.trigger?.firmId === id) t.trigger = null; });
      d.deadlines.forEach((x) => { if (x.firmId === id) x.firmId = null; });
    });
  },
  /** Merge `fromId` into `intoId`, moving everything that references it. */
  mergePeople(intoId: ID, fromId: ID) {
    commit((d) => {
      const into = d.people.find((p) => p.id === intoId)!, from = d.people.find((p) => p.id === fromId)!;
      for (const k of Object.keys(from) as (keyof Person)[]) {
        const a = into[k] as any, b = from[k] as any;
        if ((a === '' || a == null || (Array.isArray(a) && !a.length)) && b) (into as any)[k] = b;
      }
      into.tags = [...new Set([...into.tags, ...from.tags])];
      for (const k of ['notes', 'personal'] as const) if (from[k] && into[k] !== from[k] && !into[k].includes(from[k])) into[k] = [into[k], from[k]].filter(Boolean).join('\n');
      d.interactions.forEach((i) => { if (i.personId === fromId) i.personId = intoId; });
      d.tasks.forEach((t) => { if (t.personId === fromId) t.personId = intoId; });
      d.people = d.people.filter((p) => p.id !== fromId);
    });
  },
  mergeFirms(intoId: ID, fromId: ID) {
    commit((d) => {
      const into = d.firms.find((f) => f.id === intoId)!, from = d.firms.find((f) => f.id === fromId)!;
      for (const k of Object.keys(from) as (keyof Firm)[]) {
        const a = into[k] as any, b = from[k] as any;
        if ((a === '' || a == null || (Array.isArray(a) && !a.length)) && b) (into as any)[k] = b;
      }
      into.aliases = [...new Set([...into.aliases, from.name, ...from.aliases])].filter((a) => a !== into.name);
      into.tiers = [...new Set([...into.tiers, ...from.tiers])];
      into.links = [...new Set([...into.links, ...from.links])];
      if (from.notes && !into.notes.includes(from.notes)) into.notes = [into.notes, from.notes].filter(Boolean).join('\n');
      d.people.forEach((p) => { if (p.firmId === fromId) p.firmId = intoId; });
      d.tasks.forEach((t) => { if (t.firmId === fromId) t.firmId = intoId; if (t.trigger?.firmId === fromId) t.trigger.firmId = intoId; });
      d.deadlines.forEach((x) => { if (x.firmId === fromId) x.firmId = intoId; });
      d.firms = d.firms.filter((f) => f.id !== fromId);
    });
  },
  updateData(mut: (d: Data) => void) { commit(mut); },
};

export const newPerson = (p: Partial<Person> = {}): Person => ({
  id: uid(), name: '', firmId: null, pastEmployers: '', role: '', title: '', gradYear: null, school: '', tags: [],
  email: '', linkedin: '', otherChannel: '', status: 'Prospect', statusManual: false, whereMet: '', personal: '', notes: '',
  createdAt: today(), ...p,
});
export const newFirm = (f: Partial<Firm> = {}): Firm => ({
  id: uid(), name: '', aliases: [], kind: 'firm', market: '', offices: '', size: '', tiers: [], practiceAreas: '',
  howFound: '', status: 'Researching', interest: null, notes: '', links: [], ...f,
});

// ---------- persistence (File System Access API) ----------
const IDB = 'networking-tracker';
function idb<T>(fn: (s: IDBObjectStore) => IDBRequest, mode: IDBTransactionMode = 'readonly'): Promise<T> {
  return new Promise((res, rej) => {
    const open = indexedDB.open(IDB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => rej(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode);
      const r = fn(tx.objectStore('kv'));
      r.onsuccess = () => res(r.result as T);
      r.onerror = () => rej(r.error);
    };
  });
}
const saveHandle = (h: FileSystemDirectoryHandle) => idb((s) => s.put(h, 'dir'), 'readwrite');
const loadHandle = () => idb<FileSystemDirectoryHandle | undefined>((s) => s.get('dir'));

export const fsSupported = () => typeof (window as any).showDirectoryPicker === 'function';

async function readJson(dir: FileSystemDirectoryHandle, name: string): Promise<Data | null> {
  try {
    const fh = await dir.getFileHandle(name);
    const text = await (await fh.getFile()).text();
    return normalize(JSON.parse(text));
  } catch (e: any) {
    if (e?.name === 'NotFoundError') return null;
    throw e;
  }
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await (fh as any).createWritable();
  await w.write(text);
  await w.close();
}

export async function init() {
  if (gasAvailable()) return gasInit();
  if (location.hash.includes('memory') || !fsSupported()) {
    set({ mode: 'setup', memory: !fsSupported() });
    return;
  }
  try {
    const h = await loadHandle();
    if (!h) return set({ mode: 'setup' });
    const perm = await (h as any).queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return openFolder(h);
    set({ mode: 'reconnect', dir: h });
  } catch {
    set({ mode: 'setup' });
  }
}

export async function pickFolder(keepCurrent = false) {
  const h: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'tracker', mode: 'readwrite', startIn: 'documents' });
  // Write test, so a read-only or blocked folder fails here rather than later.
  await writeText(h, '.write-test', String(Date.now()));
  await h.removeEntry('.write-test').catch(() => {});
  await saveHandle(h);
  await openFolder(h, keepCurrent);
}

export async function reconnect() {
  const h = state.dir!;
  const perm = await (h as any).requestPermission({ mode: 'readwrite' });
  if (perm === 'granted') await openFolder(h);
}

async function openFolder(h: FileSystemDirectoryHandle, keepCurrent = false) {
  try {
    const d = await readJson(h, DATA_FILE);
    if (!d) {
      set({ dir: h, memory: false, data: keepCurrent ? state.data : emptyData(), mode: 'ready' });
      await save();
      return;
    }
    set({ dir: h, memory: false, data: d, mode: 'ready', loadError: '' });
  } catch (e: any) {
    set({ dir: h, mode: 'broken', loadError: String(e?.message ?? e) });
  }
}

export function startMemory(data?: Data) {
  set({ backend: 'memory', memory: true, dir: null, data: data ? normalize(data) : emptyData(), mode: 'ready' });
}

let lastBackup = 0;
export async function save() {
  if (state.backend === 'gas') return gasSave();
  if (state.memory || !state.dir) { set({ saveState: 'saved' }); return; }
  const dir = state.dir;
  set({ saveState: 'saving' });
  try {
    if (Date.now() - lastBackup > BACKUP_EVERY_MS) {
      await backupNow(dir);
      lastBackup = Date.now();
    }
    await writeText(dir, DATA_FILE, JSON.stringify(state.data, null, 2));
    set({ saveState: state.saveState === 'saving' ? 'saved' : state.saveState, lastSaved: new Date(), saveError: '' });
  } catch (e: any) {
    set({ saveState: 'error', saveError: String(e?.message ?? e) });
  }
}

async function backupNow(dir: FileSystemDirectoryHandle) {
  let current: string;
  try {
    current = await (await (await dir.getFileHandle(DATA_FILE)).getFile()).text();
  } catch { return; }
  const bdir = await dir.getDirectoryHandle(BACKUP_DIR, { create: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  await writeText(bdir, `tracker-${stamp}.json`, current);
  const names = (await listBackups()).map((b) => b.name);
  for (const n of names.slice(KEEP_BACKUPS)) await bdir.removeEntry(n).catch(() => {});
}

export async function listBackups(): Promise<{ name: string; size: number; modified: number }[]> {
  if (!state.dir) return [];
  try {
    const bdir = await state.dir.getDirectoryHandle(BACKUP_DIR);
    const out = [];
    for await (const [name, h] of (bdir as any).entries()) {
      if (h.kind !== 'file' || !name.endsWith('.json')) continue;
      const f = await h.getFile();
      out.push({ name, size: f.size, modified: f.lastModified });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}

export async function restoreBackup(name: string) {
  const bdir = await state.dir!.getDirectoryHandle(BACKUP_DIR);
  const d = await readJson(bdir, name);
  if (!d) throw new Error('Backup not found');
  // Keep the broken/current file as a backup before overwriting.
  lastBackup = 0;
  set({ data: d, mode: 'ready', loadError: '' });
  await save();
}

export async function backupManual() {
  if (!state.dir) return;
  await backupNow(state.dir);
  lastBackup = Date.now();
}

/** Move to another folder; if it has no tracker.json, current data is written there. */
export async function changeFolder() {
  await pickFolder(true);
}
