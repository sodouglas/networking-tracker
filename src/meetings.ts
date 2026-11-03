import type { Data, Meeting } from './types';
import { INTERACTION_TYPES } from './types';
import { addDays } from './util';

export const byWhen = (a: Meeting, b: Meeting) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));

/** "14:30" → "2:30 pm" */
export function timeLabel(t: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

export const meetingTitle = (d: Data, m: Meeting) =>
  `${INTERACTION_TYPES[m.type]} with ${d.people.find((p) => p.id === m.personId)?.name ?? 'someone'}`;

const compact = (date: string, time: string) => date.replace(/-/g, '') + (time ? 'T' + time.replace(':', '') + '00' : '');
/** End = start + 30 min (no end time is stored). Timed events stay on the same local day when possible. */
function endOf(m: Meeting) {
  if (!m.time) return compact(addDays(m.date, 1), '');
  const [h, min] = m.time.split(':').map(Number);
  const t = h * 60 + min + 30;
  const date = t >= 1440 ? addDays(m.date, 1) : m.date;
  const tt = t % 1440;
  return compact(date, `${String(Math.floor(tt / 60)).padStart(2, '0')}:${String(tt % 60).padStart(2, '0')}`);
}

/** Local ("floating") start/end for .ics and Google Calendar links: shows at the same wall-clock time wherever it's opened. */
export const meetingStart = (m: Meeting) => compact(m.date, m.time);
export const meetingEnd = endOf;

export function gcalUrl(d: Data, m: Meeting) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: meetingTitle(d, m), dates: `${meetingStart(m)}/${meetingEnd(m)}`, details: m.notes, location: m.where });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}
