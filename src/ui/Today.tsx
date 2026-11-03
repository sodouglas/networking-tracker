import type { Data } from '../types';
import { PERSON_STATUSES } from '../types';
import { metrics, reminders, taskActive, shortFirm, firmName } from '../logic';
import { actions } from '../store';
import { addDays, fmtDate, relDays, today, cx } from '../util';
import { go, openModal } from './nav';
import { Empty, Pill } from './common';

export function Today({ data }: { data: Data }) {
  const m = metrics(data);
  const t = today();
  const rem = reminders(data);
  const followUps = rem.filter((r) => r.kind !== 'no-reply');
  const noReply = rem.filter((r) => r.kind === 'no-reply');
  const tasks = data.tasks.filter((x) => taskActive(data, x)).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const owe = tasks.filter((x) => x.direction === 'owe');
  const owed = tasks.filter((x) => x.direction === 'owed');
  const upcoming = data.deadlines.filter((d) => d.date >= t && d.date <= addDays(t, 75)).sort((a, b) => a.date.localeCompare(b.date));
  const review = [...data.people.filter((p) => p.review), ...data.firms.filter((f) => f.review)];
  const flagged = data.people.filter((p) => p.flag).sort((a, b) => a.flag!.at.localeCompare(b.flag!.at));
  const person = (id?: string | null) => data.people.find((p) => p.id === id);
  const trend = m.outThis - m.outLast;

  return (
    <div class="page">
      <div class="page-head">
        <h1>Today</h1>
        <span class="muted">{new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </div>

      {flagged.length > 0 && (
        <section class="card flagged">
          <h3>Flagged to follow up <span class="count">{flagged.length}</span></h3>
          {flagged.map((p) => (
            <div class="row">
              <span class="flag-mark">⚑</span>
              <a class="strong" href={`#/people/${p.id}`}>{p.name}</a>
              <span class="muted small">{shortFirm(data, p.firmId)}</span>
              <span class="grow">{p.flag!.note || <span class="muted">no note</span>}</span>
              <span class="muted small">{fmtDate(p.flag!.at.slice(0, 10))}</span>
              <button class="btn sm ghost" onClick={() => actions.savePerson({ ...p, flag: undefined })}>Done</button>
            </div>
          ))}
        </section>
      )}

      <section class="stats">
        <div class="stat">
          <div class="k">People by status</div>
          <div class="bars">
            {PERSON_STATUSES.filter((s) => m.statusCounts[s]).map((s) => (
              <button class="bar-row" onClick={() => go(`people?status=${encodeURIComponent(s)}`)}>
                <Pill s={s} small /><span class="n">{m.statusCounts[s]}</span>
              </button>
            ))}
          </div>
        </div>
        <div class="stat"><div class="k">Outreach this week</div><div class="v">{m.outThis}</div>
          <div class={cx('d', trend > 0 && 'up', trend < 0 && 'down')}>{m.outLast} last week</div></div>
        <div class="stat"><div class="k">Response rate</div><div class="v">{m.responseRate == null ? '—' : `${m.responseRate}%`}</div>
          <div class="d">{m.responded} of {m.reached} replied or met</div></div>
        <div class="stat"><div class="k">Follow-ups owed</div><div class={cx('v', m.followUpsOwed > 0 && 'warn')}>{m.followUpsOwed}</div>
          <div class="d">thank-yous, check-ins, tasks</div></div>
        <div class="stat"><div class="k">Firms with no conversation</div><div class="v">{m.firmsNoConvo.length}</div>
          <div class="d trunc" title={m.firmsNoConvo.map((f) => f.name).join(', ')}>{m.firmsNoConvo.slice(0, 3).map((f) => f.aliases[0] ?? f.name).join(', ')}{m.firmsNoConvo.length > 3 ? '…' : ''}</div></div>
        <div class="stat"><div class="k">Next deadline</div><div class="v">{m.daysToNext == null ? '—' : `${m.daysToNext}d`}</div>
          <div class="d trunc" title={m.nextDeadline?.name}>{m.nextDeadline ? m.nextDeadline.name : 'none added'}</div></div>
      </section>

      <div class="cols">
        <section class="card">
          <h3>Follow-ups <span class="count">{followUps.length}</span></h3>
          {followUps.length === 0 && <Empty>Nothing owed. Nice.</Empty>}
          {followUps.map((r) => {
            const p = person(r.personId)!;
            const overdue = r.due < t;
            return (
              <div class="row">
                <div class="grow">
                  <a href={`#/people/${p.id}`} class="strong">{p.name}</a> <span class="muted">· {shortFirm(data, p.firmId)}</span>
                  <div class="small muted">{r.label}</div>
                </div>
                <span class={cx('due', overdue && 'late')}>{relDays(r.due)}</span>
                <button class="btn sm" onClick={() => openModal({ kind: 'compose', personId: p.id, templateId: r.kind === 'thank-you' ? 't-thanks' : 't-checkin' })}>Draft</button>
              </div>
            );
          })}
          {noReply.length > 0 && <>
            <h4>No reply yet</h4>
            {noReply.map((r) => {
              const p = person(r.personId)!;
              return (
                <div class="row">
                  <div class="grow"><a href={`#/people/${p.id}`}>{p.name}</a> <span class="muted">· {shortFirm(data, p.firmId)}</span></div>
                  <span class="due">{relDays(addDays(r.due, -data.settings.noReplyDays))}</span>
                  <button class="btn sm ghost" onClick={() => openModal({ kind: 'compose', personId: p.id, templateId: 't-alum' })}>Nudge</button>
                </div>
              );
            })}
          </>}
        </section>

        <section class="card">
          <h3>Tasks <span class="count">{tasks.length}</span><button class="btn sm ghost right" onClick={() => openModal({ kind: 'task' })}>+ Task</button></h3>
          {tasks.length === 0 && <Empty>No open tasks. Promises you make (“I’ll tell you when I apply”) go here.</Empty>}
          {owe.length > 0 && <h4>I owe</h4>}
          {owe.map((x) => <TaskRow data={data} t={x} />)}
          {owed.length > 0 && <h4>Waiting on others</h4>}
          {owed.map((x) => <TaskRow data={data} t={x} />)}
        </section>

        <section class="card">
          <h3>Deadlines · next 75 days <a class="right small" href="#/calendar">Calendar →</a></h3>
          {upcoming.length === 0 && <Empty>No deadlines in the next 75 days.</Empty>}
          {upcoming.map((d) => (
            <div class="row">
              <div class="date-chip"><b>{fmtDate(d.date).split(' ')[1]?.replace(',', '')}</b>{fmtDate(d.date).split(' ')[0]}</div>
              <div class="grow">
                <div>{d.name}</div>
                <div class="small muted">{[firmName(data, d.firmId) || d.program, d.time].filter(Boolean).join(' · ')}</div>
              </div>
              {!d.verified && <span class="flag" title="Not yet confirmed against the official source">verify</span>}
            </div>
          ))}
        </section>
      </div>

      {review.length > 0 && (
        <section class="card review">
          <h3>Needs review <span class="count">{review.length}</span></h3>
          <p class="small muted">Imported records with something uncertain. Fix the record, then clear the flag.</p>
          {review.map((r: any) => (
            <div class="row">
              <a class="strong" href={`#/${'role' in r ? 'people' : 'firms'}/${r.id}`}>{r.name}</a>
              <span class="grow small">{r.review}</span>
              <button class="btn sm ghost" onClick={() => 'role' in r ? actions.savePerson({ ...r, review: undefined }) : actions.saveFirm({ ...r, review: undefined })}>Clear</button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function TaskRow({ data, t }: { data: Data; t: Data['tasks'][number] }) {
  const p = data.people.find((x) => x.id === t.personId);
  const f = data.firms.find((x) => x.id === (t.firmId ?? p?.firmId));
  const late = t.due && t.due < today() && !t.done;
  return (
    <div class={cx('row task', t.done && 'done')}>
      <input type="checkbox" checked={t.done} onChange={() => actions.toggleTask(t.id)} aria-label="Done" />
      <div class="grow" onClick={() => openModal({ kind: 'task', taskId: t.id })} role="button">
        <div>{t.text}</div>
        <div class="small muted">
          {[p?.name, f && (f.aliases[0] ?? f.name)].filter(Boolean).join(' · ')}
          {t.trigger && <> · <span class="trig">when {firmName(data, t.trigger.firmId)} → {t.trigger.status}</span></>}
        </div>
      </div>
      {t.due && <span class={cx('due', late && 'late')}>{relDays(t.due)}</span>}
    </div>
  );
}
