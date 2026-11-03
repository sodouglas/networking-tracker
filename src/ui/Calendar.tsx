import { useState } from 'preact/hooks';
import type { Data, Deadline, Task } from '../types';
import { INTERACTION_TYPES } from '../types';
import { firmName, reminders, taskActive } from '../logic';
import { actions } from '../store';
import { isoDate, today, uid, fmtDate, cx } from '../util';
import { exportIcs } from '../io';
import { meetingTitle, timeLabel } from '../meetings';
import { openModal } from './nav';
import { Area, Combo, Empty, Field, Modal, Text, firmItems } from './common';

interface Ev { date: string; label: string; kind: 'deadline' | 'task' | 'follow' | 'past' | 'meeting'; href?: string; unverified?: boolean; open?: () => void; task?: Task }

export function Calendar({ data }: { data: Data }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [editing, setEditing] = useState<Deadline | null>(null);
  const t = today();

  const evs: Ev[] = [];
  data.deadlines.forEach((d) => evs.push({ date: d.date, label: d.name, kind: 'deadline', unverified: !d.verified }));
  // Done tasks stay visible (struck through) so a mis-click can be undone.
  data.tasks.filter((x) => x.due && (x.done || taskActive(data, x))).forEach((x) => {
    const who = data.people.find((p) => p.id === x.personId)?.name;
    evs.push({ date: x.due!, label: who ? `${x.text} · ${who}` : x.text, kind: 'task', task: x, open: () => openModal({ kind: 'task', taskId: x.id }) });
  });
  data.meetings.forEach((m) => evs.push({ date: m.date, kind: 'meeting', label: `${timeLabel(m.time) ? timeLabel(m.time) + ' ' : ''}${meetingTitle(data, m)}`, open: () => openModal({ kind: 'meeting', meetingId: m.id }) }));
  reminders(data).filter((r) => r.kind !== 'no-reply').forEach((r) => {
    const p = data.people.find((x) => x.id === r.personId)!;
    evs.push({ date: r.due < t ? t : r.due, label: `${r.kind === 'thank-you' ? 'Thank' : 'Check in'}: ${p.name}`, kind: 'follow', href: `#/people/${p.id}` });
  });
  data.interactions.forEach((i) => {
    const p = data.people.find((x) => x.id === i.personId);
    if (p) evs.push({ date: i.date, label: `${INTERACTION_TYPES[i.type]} · ${p.name}`, kind: 'past', href: `#/people/${p.id}` });
  });

  const first = new Date(ym.y, ym.m, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const shift = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const sorted = [...data.deadlines].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div class="page">
      <div class="page-head">
        <h1>Calendar</h1>
        <div class="right row-gap">
          <button class="btn ghost" onClick={() => exportIcs(data)} title="Deadlines, tasks with dates and follow-ups, for Google or Apple Calendar">Export .ics</button>
          <button class="btn primary" onClick={() => openModal({ kind: 'meeting' })} title="Book a call, video chat, coffee or in-person meeting with someone in your list">+ Schedule</button>
          <button class="btn ghost" onClick={() => setEditing({ id: uid(), name: '', program: '', date: t, source: '', verified: false, notes: '', firmId: null })}>+ Deadline</button>
        </div>
      </div>
      <section class="card">
        <div class="cal-head">
          <button class="btn sm ghost" onClick={() => shift(-1)}>‹</button>
          <h3>{first.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}</h3>
          <button class="btn sm ghost" onClick={() => shift(1)}>›</button>
          <button class="btn sm ghost" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>
          <span class="legend right"><i class="meeting" />Scheduled <i class="deadline" />Deadline <i class="task" />Task <i class="follow" />Follow-up <i class="past" />Logged</span>
        </div>
        <div class="cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div class="dow">{d}</div>)}
          {days.map((d) => {
            const iso = isoDate(d);
            const list = evs.filter((e) => e.date === iso);
            return (
              <div class={cx('day', d.getMonth() !== ym.m && 'other', iso === t && 'today')}>
                <div class="num">{d.getDate()}</div>
                <button class="day-add" title="Schedule a conversation this day" aria-label="Schedule a conversation this day" onClick={() => openModal({ kind: 'meeting', date: iso })}>+</button>
                {list.slice(0, 4).map((e) => e.task
                  ? <div class={cx('ev task', e.task.done && 'done')} title={e.label}>
                      <input type="checkbox" checked={e.task.done} onChange={() => actions.toggleTask(e.task!.id)} aria-label={e.task.done ? 'Mark not done' : 'Mark done'} />
                      <button class="ev-text" onClick={e.open}>{e.label}</button>
                    </div>
                  : e.open
                  ? <button class={cx('ev', e.kind)} title={e.label} onClick={e.open}>{e.label}</button>
                  : e.href
                  ? <a class={cx('ev', e.kind)} href={e.href} title={e.label}>{e.label}</a>
                  : <div class={cx('ev', e.kind)} title={e.label}>{e.unverified ? '◌ ' : ''}{e.label}</div>)}
                {list.length > 4 && <div class="more">+{list.length - 4} more</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section class="card">
        <h3>Recruiting deadlines</h3>
        <p class="small muted">Pre-filled from public sources in Nov 2026. “Verify” means check the official page before relying on it — dates move every year. Most US 1L programs require an ABA-accredited school; confirm eligibility from McGill before spending time on them.</p>
        {sorted.length === 0 && <Empty>No deadlines yet.</Empty>}
        <table class="grid compact">
          <thead><tr><th>Date</th><th>Deadline</th><th>Firm / program</th><th>Notes</th><th>Verified</th><th /></tr></thead>
          <tbody>
            {sorted.map((d) => (
              <tr class={cx(d.date < t && 'past')}>
                <td class="nowrap strong">{fmtDate(d.date)}{d.time && <div class="small muted">{d.time}</div>}</td>
                <td>{d.name}{d.source && <> <a href={d.source} target="_blank" rel="noreferrer" class="small">source</a></>}</td>
                <td class="muted">{firmName(data, d.firmId) || d.program}</td>
                <td class="small">{d.notes}</td>
                <td><input type="checkbox" checked={d.verified} onChange={() => actions.saveDeadline({ ...d, verified: !d.verified })} aria-label="Verified" /></td>
                <td class="actions"><button class="btn xs ghost" onClick={() => setEditing(d)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {editing && <DeadlineEditor data={data} d={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DeadlineEditor({ data, d: d0, onClose }: { data: Data; d: Deadline; onClose: () => void }) {
  const [d, setD] = useState(d0);
  const exists = data.deadlines.some((x) => x.id === d.id);
  const up = (p: Partial<Deadline>) => setD({ ...d, ...p });
  return (
    <Modal title={exists ? 'Edit deadline' : 'New deadline'} onClose={onClose}
      footer={<>
        {exists && <button class="btn ghost danger" onClick={() => { actions.deleteDeadline(d.id); onClose(); }}>Delete</button>}
        <button class="btn ghost right" onClick={onClose}>Cancel</button>
        <button class="btn primary" disabled={!d.name || !d.date} onClick={() => { actions.saveDeadline(d); onClose(); }}>Save</button>
      </>}>
      <div class="form">
        <Field label="Name" span={2}><Text value={d.name} onInput={(name) => up({ name })} placeholder="e.g. Toronto 1L recruit — applications due" autoFocus /></Field>
        <Field label="Date"><input type="date" value={d.date} onInput={(e) => up({ date: (e.target as HTMLInputElement).value })} /></Field>
        <Field label="Time"><Text value={d.time ?? ''} onInput={(time) => up({ time })} placeholder="5:00 pm ET" /></Field>
        <Field label="Firm"><Combo items={firmItems(data)} value={d.firmId ?? null} onChange={(firmId) => up({ firmId })} placeholder="Optional" /></Field>
        <Field label="Program"><Text value={d.program} onInput={(program) => up({ program })} placeholder="e.g. Toronto 1L recruit" /></Field>
        <Field label="Source link" span={2}><Text value={d.source} onInput={(source) => up({ source })} /></Field>
        <Field label="Notes" span={2}><Area value={d.notes} onInput={(notes) => up({ notes })} rows={2} /></Field>
        <label class="check"><input type="checkbox" checked={d.verified} onChange={() => up({ verified: !d.verified })} /> Verified against official source</label>
      </div>
    </Modal>
  );
}
