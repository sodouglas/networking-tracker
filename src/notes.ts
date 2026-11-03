import type { Data, InteractionType } from './types';
import { INTERACTION_TYPES } from './types';
import { fmtDate } from './util';
import { interactionsFor, taskActive } from './logic';

/** What the server turns into a Google Doc. Kept dumb on purpose: all the content decisions live here. */
export interface NotesSpec { title: string; blocks: { type: 'h1' | 'h2' | 'h3' | 'p' | 'bullet'; text: string }[] }

export const isUrl = (s?: string) => !!s && /^https?:\/\//i.test(s.trim());

/** A fresh notes doc for one conversation: who they are, what you know, then blank sections to fill in. */
export function notesDocSpec(d: Data, o: { personId: string; date: string; type: InteractionType; where?: string }): NotesSpec | null {
  const p = d.people.find((x) => x.id === o.personId);
  if (!p) return null;
  const f = d.firms.find((x) => x.id === p.firmId);
  const kind = INTERACTION_TYPES[o.type];
  const b: NotesSpec['blocks'] = [];
  const add = (type: NotesSpec['blocks'][number]['type'], text = '') => b.push({ type, text });

  add('h1', `${kind} with ${p.name}`);
  add('p', [p.title || p.role, f?.name, p.gradYear && `Class of ${p.gradYear}`, p.school].filter(Boolean).join(' · '));
  add('p', [fmtDate(o.date), o.where].filter(Boolean).join(' · '));
  if (p.whereMet) add('p', `Met: ${p.whereMet}`);
  if (p.pastEmployers) add('p', `Before: ${p.pastEmployers}`);
  if (p.personal) add('p', `Remember: ${p.personal}`);
  if (p.tags.length) add('p', `Connection: ${p.tags.join(', ')}`);

  const history = interactionsFor(d, p.id).reverse().slice(0, 4);
  if (history.length) {
    add('h2', 'History');
    history.forEach((i) => add('bullet', `${fmtDate(i.date)} ${INTERACTION_TYPES[i.type]}${i.summary ? ` — ${i.summary}` : ''}${i.takeaways ? ` (${i.takeaways})` : ''}`));
  }
  const open = d.tasks.filter((t) => t.personId === p.id && taskActive(d, t));
  if (open.length) {
    add('h2', 'Open items');
    open.forEach((t) => add('bullet', `${t.direction === 'owe' ? 'I owe: ' : 'Waiting on: '}${t.text}`));
  }

  add('h2', 'Notes'); add('p');
  add('h2', 'Takeaways'); add('p');
  add('h2', 'Personal details to remember'); add('p');
  add('h2', 'To do'); add('p');
  add('h2', 'Intros / people to contact'); add('p');

  const cats = [...new Set(d.questions.map((q) => q.category))];
  if (cats.length) {
    add('h2', 'Question bank (delete what you don’t need)');
    cats.forEach((c) => { add('h3', c); d.questions.filter((q) => q.category === c).forEach((q) => add('bullet', q.text)); });
  }
  return { title: `${o.date} · ${kind} · ${p.name}${f ? ` · ${f.aliases[0] ?? f.name}` : ''}`, blocks: b };
}
