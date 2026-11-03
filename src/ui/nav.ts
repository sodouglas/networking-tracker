import { useEffect, useState } from 'preact/hooks';
import type { ID } from '../types';

export type Route =
  | { page: 'today' } | { page: 'people'; id?: ID } | { page: 'firms'; id?: ID }
  | { page: 'compare' } | { page: 'calendar' } | { page: 'templates' } | { page: 'questions' } | { page: 'settings' };

export const hashQuery = () => new URLSearchParams(location.hash.split('?')[1] ?? '');

export function parseHash(): Route {
  const [, page = 'today', id] = location.hash.replace(/^#/, '').split('?')[0].split('/');
  if (page === 'people' || page === 'firms') return { page, id: id || undefined } as Route;
  if (['compare', 'calendar', 'templates', 'questions', 'settings'].includes(page)) return { page } as Route;
  return { page: 'today' };
}
export const go = (path: string) => { location.hash = '/' + path; };

export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const f = () => setR(parseHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

// ---- global modals ----
export type ModalState =
  | null
  | { kind: 'log'; personId?: ID; interactionId?: ID }
  | { kind: 'compose'; personId: ID; templateId?: string }
  | { kind: 'merge'; type: 'person' | 'firm'; id: ID }
  | { kind: 'prep'; personId: ID }
  | { kind: 'task'; taskId?: ID; personId?: ID; firmId?: ID }
  | { kind: 'person-new'; firmId?: ID }
  | { kind: 'firm-new' };

let modal: ModalState = null;
const subs = new Set<() => void>();
export const openModal = (m: ModalState) => { modal = m; subs.forEach((f) => f()); };
export const closeModal = () => openModal(null);
export function useModal() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return modal;
}

// ---- toast ----
let toastMsg = '';
let toastTimer: number | undefined;
const tsubs = new Set<() => void>();
export const toast = (m: string) => {
  toastMsg = m; tsubs.forEach((f) => f());
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastMsg = ''; tsubs.forEach((f) => f()); }, 2600);
};
export function useToast() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); tsubs.add(f); return () => { tsubs.delete(f); }; }, []);
  return toastMsg;
}
