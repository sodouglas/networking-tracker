import {
  CONVERSATION_TYPES, OUTREACH_TYPES, FIRM_STATUSES,
  type Data, type Person, type PersonStatus, type Interaction, type Task, type Firm, type ID,
} from './types';
import { addDays, daysBetween, parseDate, today, isoDate } from './util';

export const byDate = (a: Interaction, b: Interaction) => a.date.localeCompare(b.date);

export function interactionsFor(data: Data, personId: ID) {
  return data.interactions.filter((i) => i.personId === personId).sort(byDate);
}

/** Status implied by a person's interaction history. */
export function derivedStatus(list: Interaction[], noReplyDays: number): PersonStatus {
  const real = list.filter((i) => i.type !== 'note');
  if (!real.length) return 'Prospect';
  let status = 'Prospect' as PersonStatus;
  const is = (...l: PersonStatus[]) => l.includes(status);
  let lastOutreach: string | null = null;
  for (const i of real) {
    if (OUTREACH_TYPES.includes(i.type)) {
      if (is('Prospect', 'No response')) status = 'Outreach sent';
      lastOutreach = i.date;
    } else if (i.type === 'email-in') {
      if (is('Prospect', 'Outreach sent', 'No response')) status = 'Scheduling';
    } else if (CONVERSATION_TYPES.includes(i.type)) {
      status = 'Spoke';
    } else if (i.type === 'thank-you') {
      status = is('Keep warm') ? 'Keep warm' : 'Thanked';
    } else if (i.type === 'check-in') {
      if (is('Thanked', 'Spoke', 'Keep warm')) status = 'Keep warm';
    }
  }
  if (is('Outreach sent') && lastOutreach && daysBetween(lastOutreach, today()) >= noReplyDays) status = 'No response';
  return status;
}

export function effectiveStatus(data: Data, p: Person): PersonStatus {
  if (p.statusManual) return p.status;
  const s = derivedStatus(interactionsFor(data, p.id), data.settings.noReplyDays);
  // a date has been set (booked and not yet logged) → Scheduled
  if (data.meetings.some((m) => m.personId === p.id && m.date >= today())) return 'Scheduled';
  return s;
}

const firmStatusRank = (s: string) => FIRM_STATUSES.indexOf(s as any);

export function taskActive(data: Data, t: Task) {
  if (t.done) return false;
  if (t.trigger) {
    const f = data.firms.find((x) => x.id === t.trigger!.firmId);
    if (!f) return false;
    const r = firmStatusRank(f.status), need = firmStatusRank(t.trigger.status);
    return r >= need && f.status !== 'Declined' && f.status !== 'Not Pursuing';
  }
  return true;
}

export interface Reminder {
  key: string;
  kind: 'thank-you' | 'check-in' | 'no-reply';
  personId: ID;
  due: string;
  label: string;
}

/** Follow-ups implied by the timeline (not stored). */
export function reminders(data: Data): Reminder[] {
  const out: Reminder[] = [];
  const t = today();
  for (const p of data.people) {
    const list = interactionsFor(data, p.id).filter((i) => i.type !== 'note');
    if (!list.length) continue;
    const status = effectiveStatus(data, p);
    if (status === 'Dormant') continue;
    const lastConv = [...list].reverse().find((i) => CONVERSATION_TYPES.includes(i.type));
    if (lastConv) {
      const thanked = list.some((i) => (i.type === 'thank-you' || i.type === 'email-out' || i.type === 'check-in') && i.date >= lastConv.date && i !== lastConv && !CONVERSATION_TYPES.includes(i.type));
      if (!thanked) {
        out.push({ key: `ty-${p.id}-${lastConv.date}`, kind: 'thank-you', personId: p.id, due: addDays(lastConv.date, 1), label: `Thank-you for ${lastConv.date === t ? "today's" : 'the'} conversation` });
        continue;
      }
    }
    const last = list[list.length - 1];
    if ((status === 'Thanked' || status === 'Keep warm' || status === 'Spoke') && daysBetween(last.date, t) >= data.settings.silenceWeeks * 7) {
      out.push({ key: `ci-${p.id}-${last.date}`, kind: 'check-in', personId: p.id, due: addDays(last.date, data.settings.silenceWeeks * 7), label: `No contact in ${Math.floor(daysBetween(last.date, t) / 7)} weeks — check in` });
    }
    if (status === 'No response') {
      const lastOut = [...list].reverse().find((i) => OUTREACH_TYPES.includes(i.type))!;
      out.push({ key: `nr-${p.id}-${lastOut.date}`, kind: 'no-reply', personId: p.id, due: addDays(lastOut.date, data.settings.noReplyDays), label: `No reply since ${lastOut.date} — nudge once, or let it go` });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

function weekStart(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return isoDate(x);
}

export function metrics(data: Data) {
  const statusCounts: Record<string, number> = {};
  for (const p of data.people) {
    const s = effectiveStatus(data, p);
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }
  const thisWeek = weekStart(new Date());
  const lastWeek = weekStart(parseDate(addDays(thisWeek, -7)));
  let outThis = 0, outLast = 0;
  for (const i of data.interactions) {
    if (!OUTREACH_TYPES.includes(i.type)) continue;
    if (i.date >= thisWeek) outThis++;
    else if (i.date >= lastWeek) outLast++;
  }
  // Response rate: of people we reached out to, how many replied or talked afterwards.
  let reached = 0, responded = 0;
  for (const p of data.people) {
    const list = interactionsFor(data, p.id);
    const first = list.find((i) => OUTREACH_TYPES.includes(i.type));
    if (!first) continue;
    reached++;
    if (list.some((i) => i.date >= first.date && (i.type === 'email-in' || CONVERSATION_TYPES.includes(i.type)))) responded++;
  }
  const rem = reminders(data);
  const owedTasks = data.tasks.filter((t) => taskActive(data, t) && t.direction === 'owe' && (!t.due || t.due <= today()));
  const followUpsOwed = rem.filter((r) => r.kind !== 'no-reply' && r.due <= addDays(today(), 1)).length + owedTasks.length + data.meetings.filter((m) => m.date < today()).length;

  const spokeFirm = new Set<ID>();
  for (const i of data.interactions) {
    if (!CONVERSATION_TYPES.includes(i.type)) continue;
    const p = data.people.find((x) => x.id === i.personId);
    if (p?.firmId) spokeFirm.add(p.firmId);
  }
  const firmsNoConvo = data.firms.filter((f) => f.kind === 'firm' && !spokeFirm.has(f.id) && f.status !== 'Not Pursuing' && f.status !== 'Declined' && f.status !== 'Not Started');
  const next = data.deadlines.filter((d) => d.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    statusCounts, outThis, outLast, reached, responded,
    responseRate: reached ? Math.round((responded / reached) * 100) : null,
    followUpsOwed, firmsNoConvo, nextDeadline: next ?? null,
    daysToNext: next ? daysBetween(today(), next.date) : null,
  };
}

export function firmStats(data: Data, f: Firm) {
  const people = data.people.filter((p) => p.firmId === f.id);
  const ids = new Set(people.map((p) => p.id));
  const ints = data.interactions.filter((i) => ids.has(i.personId));
  const spoke = new Set(ints.filter((i) => CONVERSATION_TYPES.includes(i.type)).map((i) => i.personId));
  const imps = ints.map((i) => i.impression).filter((x): x is number => x != null);
  const last = ints.map((i) => i.date).sort().pop() ?? null;
  const next = data.deadlines.filter((d) => d.firmId === f.id && d.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    people, peopleCount: people.length, spokeCount: spoke.size,
    avgImpression: imps.length ? imps.reduce((a, b) => a + b, 0) / imps.length : null,
    lastContact: last, nextDeadline: next ?? null,
  };
}

export function lastInteraction(data: Data, personId: ID) {
  const l = interactionsFor(data, personId);
  return l[l.length - 1] ?? null;
}

export function firmName(data: Data, id?: ID | null) {
  return data.firms.find((f) => f.id === id)?.name ?? '';
}
export function shortFirm(data: Data, id?: ID | null) {
  const f = data.firms.find((x) => x.id === id);
  if (!f) return '';
  return f.aliases[0] && f.aliases[0].length < f.name.length ? f.aliases[0] : f.name;
}
