// Storage backend used when the app runs as a Google Apps Script web app.
// The server (apps-script/Code.gs) keeps tracker.json in Drive and mirrors tables into a read-only Google Sheet.
import type { Data, Interaction } from './types';
import { getState, setState, normalize, emptyData } from './store';
import { isoDate } from './util';
import { sheetTables } from './io';

const PENDING_KEY = 'nt-pending-v1';
const MIRROR_DELAY_MS = 6000;
const RETRY_MS = 30000;

interface LoadResult { text: string | null; hash: string; emails: GmailEntry[]; user: string; sheetUrl: string }
interface SaveResult { ok?: boolean; conflict?: boolean; hash: string }
export interface GmailEntry { key: string; date: string; direction: 'sent' | 'received'; personId: string; subject: string; url: string }

const run = () => (window as any).google?.script?.run;
export const gasAvailable = () => !!run();

function call<T>(fn: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    run().withSuccessHandler(resolve).withFailureHandler((e: any) => reject(e instanceof Error ? e : new Error(String(e?.message ?? e))))[fn](...args);
  });
}

let serverHash = '';
let mirrorTimer: number | undefined;
let retryTimer: number | undefined;
let saving: Promise<void> | null = null;

const ls = {
  get(): { baseHash: string; text: string } | null { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; } },
  put(v: { baseHash: string; text: string }) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  clear() { try { localStorage.removeItem(PENDING_KEY); } catch { /* */ } },
};

/** Add Gmail log entries to timelines. Attaches the link to a matching manual entry instead of duplicating it. */
export function mergeGmail(d: Data, emails: GmailEntry[]): number {
  let added = 0;
  const people = new Set(d.people.map((p) => p.id));
  for (const e of emails) {
    const id = 'gm-' + e.key;
    if (!people.has(e.personId) || d.interactions.some((i) => i.id === id)) continue;
    const date = isoDate(new Date(e.date));
    const sent = e.direction === 'sent';
    const twin = d.interactions.find((i) => i.personId === e.personId && i.date === date && !i.source && !i.link
      && (sent ? ['email-out', 'thank-you', 'check-in'].includes(i.type) : i.type === 'email-in'));
    if (twin) { twin.link = e.url; continue; }
    const it: Interaction = {
      id, personId: e.personId, date, type: sent ? 'email-out' : 'email-in',
      summary: e.subject || (sent ? 'Email sent' : 'Email received'), takeaways: '', impression: null, link: e.url, source: 'gmail',
    };
    d.interactions.push(it);
    added++;
  }
  return added;
}

export async function gasInit() {
  setState({ backend: 'gas', mode: 'loading' });
  try {
    const r = await call<LoadResult>('loadData');
    serverHash = r.hash;
    let data = r.text ? normalize(JSON.parse(r.text)) : emptyData();
    let dirty = !r.text;
    const pending = ls.get();
    if (pending) {
      if (pending.baseHash === r.hash) { data = normalize(JSON.parse(pending.text)); dirty = true; }
      else ls.clear(); // server moved on; the stale local copy can't be applied safely
    }
    if (mergeGmail(data, r.emails ?? [])) dirty = true;
    setState({ data, mode: 'ready', user: r.user, sheetUrl: r.sheetUrl, saveState: dirty ? 'dirty' : 'saved', conflict: false, offline: false });
    if (dirty) gasSave(); else scheduleMirror();
    window.addEventListener('online', () => { if (getState().offline) gasSave(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkRemote(); });
  } catch (e: any) {
    setState({ mode: 'broken', loadError: e?.message ?? String(e) });
  }
}

/** When the tab comes back into view, pick up changes made on another device. */
async function checkRemote() {
  const st = getState();
  if (st.saveState !== 'saved' || st.conflict) return;
  try {
    const h = await call<string>('getHash');
    if (h && h !== serverHash) await reloadFromServer();
  } catch { /* offline; ignore */ }
}

export async function reloadFromServer() {
  const r = await call<LoadResult>('loadData');
  serverHash = r.hash;
  const data = r.text ? normalize(JSON.parse(r.text)) : emptyData();
  mergeGmail(data, r.emails ?? []);
  ls.clear();
  setState({ data, conflict: false, offline: false, saveState: 'saved', saveError: '', sheetUrl: r.sheetUrl });
}

export function gasSave(force = false): Promise<void> {
  if (saving) { return saving.then(() => { if (getState().saveState === 'dirty') return gasSave(force); }); }
  saving = (async () => {
    const st = getState();
    if (st.conflict && !force) return;
    const text = JSON.stringify(st.data, null, 2);
    ls.put({ baseHash: serverHash, text });
    setState({ saveState: 'saving' });
    try {
      const r = await call<SaveResult>('saveData', text, force ? '' : serverHash);
      if (r.conflict) {
        setState({ conflict: true, saveState: 'error', saveError: 'Changed on another device' });
        return;
      }
      serverHash = r.hash;
      ls.clear();
      clearTimeout(retryTimer);
      const stillDirty = getState().data !== st.data;
      setState({ saveState: stillDirty ? 'dirty' : 'saved', lastSaved: new Date(), saveError: '', offline: false, conflict: false });
      scheduleMirror();
    } catch (e: any) {
      setState({ saveState: 'error', offline: true, saveError: e?.message ?? 'Offline' });
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => gasSave(), RETRY_MS);
    }
  })().finally(() => { saving = null; });
  return saving;
}

function scheduleMirror() {
  clearTimeout(mirrorTimer);
  mirrorTimer = window.setTimeout(mirrorNow, MIRROR_DELAY_MS);
}

export async function mirrorNow() {
  try {
    const url = await call<string>('mirrorSheet', sheetTables(getState().data));
    setState({ sheetUrl: url, sheetSynced: new Date() });
  } catch { /* the next save retries */ }
}
