import type { Data, Person, Template } from './types';
import { CONVERSATION_TYPES } from './types';
import { interactionsFor, shortFirm } from './logic';
import { daysBetween, fmtDate, parseDate, today } from './util';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function whenPhrase(date?: string | null) {
  if (!date) return 'recently';
  const n = daysBetween(date, today());
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return `on ${DAYS[parseDate(date).getDay()]}`;
  return `on ${fmtDate(date)}`;
}

export function connectionPhrase(p: Person, firm: string) {
  const alum = p.tags.find((t) => /alum/i.test(t));
  if (alum) return `a fellow ${alum.replace(/^alum\s*\((.*)\)$/i, '$1 alum')}`;
  const other = p.tags.find((t) => !/personal/i.test(t));
  if (other) return `connected through ${other}`;
  return firm ? `at ${firm}` : 'in practice';
}

/** Notes the composer offers as {{detail}} snippets. */
export function snippets(data: Data, p: Person): string[] {
  const out: string[] = [];
  const add = (s: string) => s.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter((x) => x.length > 3).forEach((x) => out.push(x));
  for (const i of interactionsFor(data, p.id).reverse()) {
    if (i.takeaways) add(i.takeaways);
    if (i.summary && CONVERSATION_TYPES.includes(i.type)) add(i.summary);
  }
  if (p.personal) add(p.personal);
  return [...new Set(out)].slice(0, 12);
}

export function render(tpl: string, data: Data, p: Person, details: string[]) {
  const firm = shortFirm(data, p.firmId);
  const lastConv = interactionsFor(data, p.id).reverse().find((i) => CONVERSATION_TYPES.includes(i.type));
  const s = data.settings;
  const vars: Record<string, string> = {
    first: p.name.trim().split(/\s+/)[0] ?? '',
    name: p.name.trim(),
    firm: firm || 'your firm',
    when: whenPhrase(lastConv?.date),
    detail: details.length ? details.join(' ') : '[add a specific detail]',
    connection: connectionPhrase(p, firm),
    myName: s.name || '[your name]',
    school: s.school,
    year: s.year,
  };
  const sig = s.signature.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  vars.signature = sig;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export function renderTemplate(t: Template, data: Data, p: Person, details: string[]) {
  return { subject: render(t.subject, data, p, details), body: render(t.body, data, p, details) };
}

export function gmailUrl(to: string, subject: string, body: string) {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

export const emailOf = (p: Person) => (p.email.match(/[^\s/<>;,]+@[^\s/<>;,]+/) ?? [''])[0];
