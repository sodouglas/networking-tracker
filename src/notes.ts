import type { Data, InteractionType } from './types';
import { INTERACTION_TYPES } from './types';
import { fmtDate } from './util';
import { interactionsFor, taskActive } from './logic';

/** What the server turns into a Google Doc. Kept dumb on purpose: all the content decisions live here. */
export interface NotesSpec { title: string; blocks: { type: 'h1' | 'h2' | 'h3' | 'p' | 'bullet'; text: string; date?: string }[] }

export const isUrl = (s?: string) => !!s && /^https?:\/\//i.test(s.trim());

/** A fresh notes doc for one conversation: who they are, what you know, then blank sections to fill in. */
export function notesDocSpec(d: Data, o: { personId: string; date: string; type: InteractionType; where?: string }): NotesSpec | null {
  const p = d.people.find((x) => x.id === o.personId);
  if (!p) return null;
  const f = d.firms.find((x) => x.id === p.firmId);
  const kind = INTERACTION_TYPES[o.type];
  const b: NotesSpec['blocks'] = [];
  const add = (type: NotesSpec['blocks'][number]['type'], text = '', date?: string) => b.push(date ? { type, text, date } : { type, text });

  const who = [p.title || p.role, f?.name].filter(Boolean).join(', ');
  add('h1', `${kind} with ${p.name} | `, o.date); // the date is added as a date chip after the text
  if (o.where) add('p', o.where);

  add('h2', 'Attendees');
  add('bullet', who ? `${p.name} (${who}${p.gradYear ? `, class of ${p.gradYear}` : ''})` : p.name);

  const bg: string[] = [];
  if (p.whereMet) bg.push(`Met: ${p.whereMet}`);
  if (p.pastEmployers) bg.push(`Before: ${p.pastEmployers}`);
  if (p.personal) bg.push(`Remember: ${p.personal}`);
  if (p.tags.length) bg.push(`Connection: ${p.tags.join(', ')}`);
  const last = interactionsFor(d, p.id).reverse()[0];
  if (last) bg.push(`Last time (${fmtDate(last.date)}): ${last.summary || INTERACTION_TYPES[last.type]}`);
  d.tasks.filter((t) => t.personId === p.id && taskActive(d, t)).forEach((t) => bg.push(`${t.direction === 'owe' ? 'I owe' : 'Waiting on'}: ${t.text}`));
  if (bg.length) { add('h2', 'Background'); bg.forEach((x) => add('bullet', x)); }

  add('h2', 'Notes'); add('p');
  add('h2', 'Action items'); add('bullet');

  return { title: `${kind} with ${p.name} – ${o.date} – Notes`, blocks: b };
}
