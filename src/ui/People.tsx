import { useState } from 'preact/hooks';
import type { Data, Person } from '../types';
import { PERSON_STATUSES, ROLES, INTERACTION_TYPES, CONVERSATION_TYPES } from '../types';
import { effectiveStatus, interactionsFor, lastInteraction, shortFirm, firmName, derivedStatus } from '../logic';
import { actions } from '../store';
import { fmtDate, norm, relDays, cx, today } from '../util';
import { byWhen, timeLabel } from '../meetings';
import { exportVcf } from '../io';
import { emailOf } from '../compose';
import { isUrl } from '../notes';
import { go, hashQuery, openModal } from './nav';
import { Area, Combo, Empty, Field, Pill, Rating, Select, TagInput, Text, allTags, firmItems, dupPeople } from './common';
import { TaskRow } from './Today';

type SortKey = 'name' | 'firm' | 'status' | 'last';

export function PeopleList({ data }: { data: Data }) {
  const q0 = hashQuery();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(q0.get('status') ?? '');
  const [firm, setFirm] = useState(q0.get('firm') ?? '');
  const [tag, setTag] = useState('');
  const [role, setRole] = useState('');
  const [sort, setSort] = useState<SortKey>('last');

  const rows = data.people.map((p) => ({ p, s: effectiveStatus(data, p), last: lastInteraction(data, p.id), firm: shortFirm(data, p.firmId) }))
    .filter(({ p, s, firm: fn }) => {
      if (status && s !== status) return false;
      if (firm && p.firmId !== firm) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (role && p.role !== role) return false;
      if (q) {
        const hay = norm([p.name, fn, p.title, p.tags.join(' '), p.notes, p.personal, p.school, p.whereMet].join(' '));
        if (!norm(q).split(' ').every((w) => hay.includes(w))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'name') return a.p.name.localeCompare(b.p.name);
      if (sort === 'firm') return a.firm.localeCompare(b.firm) || a.p.name.localeCompare(b.p.name);
      if (sort === 'status') return PERSON_STATUSES.indexOf(a.s) - PERSON_STATUSES.indexOf(b.s);
      return (b.last?.date ?? '').localeCompare(a.last?.date ?? '') || a.p.name.localeCompare(b.p.name);
    });

  const Th = ({ k, children }: { k: SortKey; children: string }) => (
    <th class={cx('sortable', sort === k && 'on')} onClick={() => setSort(k)}>{children}</th>
  );

  return (
    <div class="page">
      <div class="page-head">
        <h1>People <span class="count">{rows.length}{rows.length !== data.people.length ? ` of ${data.people.length}` : ''}</span></h1>
        <div class="right row-gap">
          <button class="btn ghost" onClick={() => exportVcf(data, rows.map((r) => r.p))} title="Export the people shown as vCard">Export vCard</button>
          <button class="btn primary" onClick={() => openModal({ kind: 'person-new' })}>+ Person</button>
        </div>
      </div>
      <div class="filters">
        <input class="search" placeholder="Search names, notes, tags…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <Select value={status} options={PERSON_STATUSES} onChange={setStatus} blank="Any status" />
        <Select value={firm} options={firmItems(data).map((f) => ({ value: f.id, label: f.label }))} onChange={setFirm} blank="Any firm" />
        <Select value={role} options={ROLES} onChange={setRole} blank="Any role" />
        <Select value={tag} options={allTags(data)} onChange={setTag} blank="Any tag" />
        {(q || status || firm || tag || role) && <button class="btn ghost sm" onClick={() => { setQ(''); setStatus(''); setFirm(''); setTag(''); setRole(''); }}>Clear</button>}
      </div>
      {rows.length === 0 ? <Empty>No one matches.</Empty> : (
        <table class="grid">
          <thead><tr><Th k="name">Name</Th><Th k="firm">Firm</Th><th>Role</th><th>Tags</th><Th k="status">Status</Th><Th k="last">Last contact</Th><th /></tr></thead>
          <tbody>
            {rows.map(({ p, s, last, firm: fn }) => (
              <tr class={ROW_CLS[s]} onClick={() => go(`people/${p.id}`)}>
                <td class="strong">{p.name}{p.review && <span class="flag" title={p.review}>review</span>}</td>
                <td>{fn}</td>
                <td class="muted">{[p.role, p.gradYear && `’${String(p.gradYear).slice(2)}`].filter(Boolean).join(' ')}</td>
                <td>{p.tags.slice(0, 3).map((t) => <span class="tag sm">{t}</span>)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <Select compact value={s} options={PERSON_STATUSES} onChange={(status) => actions.savePerson({ ...p, status, statusManual: true })} />
                  {p.statusManual && <span class="muted small" title="Set by hand"> ✎</span>}
                </td>
                <td class="muted">{last ? <>{fmtDate(last.date)} <span class="small">· {INTERACTION_TYPES[last.type]}</span></> : '—'}</td>
                <td class="actions" onClick={(e) => e.stopPropagation()}>
                  <button class="btn sm ghost" onClick={() => openModal({ kind: 'log', personId: p.id })}>Log</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Whole-row tint for the statuses that need a glance. */
const ROW_CLS: Record<string, string> = { 'Action required': 'row-red', 'Scheduling': 'row-yellow', 'Scheduled': 'row-green', 'Thanked': 'row-green' };

export function PersonDetail({ data, id }: { data: Data; id: string }) {
  const p = data.people.find((x) => x.id === id);
  if (!p) return <div class="page"><Empty>Person not found. <a href="#/people">Back to people</a></Empty></div>;
  const upd = (patch: Partial<Person>) => actions.savePerson({ ...p, ...patch });
  const list = interactionsFor(data, p.id).reverse();
  const s = effectiveStatus(data, p);
  const auto = derivedStatus(interactionsFor(data, p.id), data.settings.noReplyDays);
  const tasks = data.tasks.filter((t) => t.personId === p.id).sort((a, b) => Number(a.done) - Number(b.done));
  const email = emailOf(p);
  const booked = data.meetings.filter((m) => m.personId === p.id).sort(byWhen);
  const dups = dupPeople(data, p.name, p.id);

  return (
    <div class="page detail">
      <div class="page-head">
        <a href="#/people" class="back">← People</a>
        <h1>{p.name || 'Unnamed'}</h1>
        <Pill s={s} />
        <span class="small muted">Firm: {firmName(data, p.firmId) || '—'} {p.firmId && <a href={`#/firms/${p.firmId}`}>open firm →</a>}</span>
        <div class="right row-gap">
          <button class="btn ghost" onClick={() => openModal({ kind: 'meeting', personId: p.id })}>Schedule</button>
          <button class="btn ghost" onClick={() => openModal({ kind: 'prep', personId: p.id })}>Prep sheet</button>
          <button class="btn ghost" onClick={() => openModal({ kind: 'compose', personId: p.id })} title={email ? '' : 'No email on file — you can still draft and copy the text'}>Draft message</button>
          <button class="btn primary" onClick={() => openModal({ kind: 'log', personId: p.id })}>Log interaction</button>
        </div>
      </div>
      {p.review && <div class="banner warn">Needs review: {p.review} <button class="btn sm ghost" onClick={() => upd({ review: undefined })}>Clear flag</button></div>}
      {dups.length > 0 && <div class="banner">Possible duplicate of {dups.map((d) => <a href={`#/people/${d.id}`}>{d.name}</a>)}. <button class="btn sm ghost" onClick={() => openModal({ kind: 'merge', type: 'person', id: p.id })}>Merge…</button></div>}

      <div class="detail-grid">
        <section class="card">
          <h3>Details</h3>
          <div class="form">
            <Field label="Name"><Text value={p.name} onInput={(v) => upd({ name: v })} /></Field>
            <Field label="Firm">
              <Combo items={firmItems(data)} value={p.firmId} onChange={(firmId) => upd({ firmId })} placeholder="Choose firm…"
                onCreate={(name) => { const f = { ...newFirmLite(name) }; actions.saveFirm(f); upd({ firmId: f.id }); }} />
            </Field>
            <Field label="Role"><Select value={p.role} options={ROLES} onChange={(role) => upd({ role })} blank="—" /></Field>
            <Field label="Title / practice group"><Text value={p.title} onInput={(v) => upd({ title: v })} /></Field>
            <Field label="Grad year"><Text value={p.gradYear ? String(p.gradYear) : ''} inputMode="numeric" onInput={(v) => upd({ gradYear: Number(v) || null })} /></Field>
            <Field label="School"><Text value={p.school} onInput={(v) => upd({ school: v })} placeholder="e.g. McGill" /></Field>
            <Field label="Connection tags" span={2} group hint="Pick a suggestion or type your own and press Enter. New tags appear in the suggestions and the People filter. ⌘Z brings back a removed tag."><TagInput key={p.id} value={p.tags} onChange={(tags) => upd({ tags })} suggestions={allTags(data)} /></Field>
            <Field label="Email"><Text value={p.email} onInput={(v) => upd({ email: v })} type="email" /></Field>
            <Field label="LinkedIn">
              <div class="with-link"><Text value={p.linkedin} onInput={(v) => upd({ linkedin: v })} />
                {p.linkedin && <a href={p.linkedin.startsWith('http') ? p.linkedin : 'https://' + p.linkedin} target="_blank" rel="noreferrer">open</a>}</div>
            </Field>
            <Field label="Other channel" hint="Text, Instagram, phone…"><Text value={p.otherChannel} onInput={(v) => upd({ otherChannel: v })} /></Field>
            <Field label="Where we met"><Text value={p.whereMet} onInput={(v) => upd({ whereMet: v })} /></Field>
            <Field label="Past employers" span={2}><Text value={p.pastEmployers} onInput={(v) => upd({ pastEmployers: v })} placeholder="e.g. White & Case (Associate)" /></Field>
            <Field label="Status" hint={p.statusManual ? `Set by hand. From the timeline it would be “${auto}”.` : 'Updates from the timeline.'}>
              <div class="row-gap">
                <Select value={s} options={PERSON_STATUSES} onChange={(status) => upd({ status, statusManual: true })} />
                {p.statusManual && <button class="btn sm ghost" onClick={() => upd({ statusManual: false, status: auto })}>Use auto</button>}
              </div>
            </Field>
            <Field label="Personal details to remember" span={2} hint="Hobbies, hometown, pets — what makes a follow-up feel personal.">
              <Area value={p.personal} onInput={(v) => upd({ personal: v })} rows={2} />
            </Field>
            <Field label="Notes" span={2}><Area value={p.notes} onInput={(v) => upd({ notes: v })} rows={3} /></Field>
          </div>
          <div class="row-gap danger-zone">
            <button class="btn sm ghost" onClick={() => openModal({ kind: 'merge', type: 'person', id: p.id })}>Merge into…</button>
            <button class="btn sm ghost danger" onClick={() => { if (confirm(`Delete ${p.name} and their ${list.length} interactions?`)) { actions.deletePerson(p.id); go('people'); } }}>Delete</button>
          </div>
        </section>

        <div class="stack">
          {booked.length > 0 && (
            <section class="card">
              <h3>Scheduled</h3>
              {booked.map((m) => (
                <div class="row">
                  <div class="grow"><span class="strong">{fmtDate(m.date)}</span>{m.time && <span class="muted"> · {timeLabel(m.time)}</span>} <span class="muted">· {INTERACTION_TYPES[m.type]}{m.where ? ` · ${m.where.slice(0, 40)}` : ''}</span></div>
                  {isUrl(m.notesUrl) && <a class="small" href={m.notesUrl} target="_blank" rel="noreferrer">Notes ↗</a>}
                  <button class={cx('btn sm', m.date >= today() && 'ghost')} onClick={() => openModal({ kind: 'log', meetingId: m.id })}>Log it</button>
                  <button class="btn sm ghost" onClick={() => openModal({ kind: 'meeting', meetingId: m.id })}>Edit</button>
                </div>
              ))}
            </section>
          )}
          <section class="card">
            <h3>Tasks <button class="btn sm ghost right" onClick={() => openModal({ kind: 'task', personId: p.id, firmId: p.firmId ?? undefined })}>+ Task</button></h3>
            {tasks.length === 0 && <Empty>No tasks.</Empty>}
            {tasks.map((t) => <TaskRow data={data} t={t} />)}
          </section>
          <section class="card">
            <h3>Timeline <span class="count">{list.length}</span></h3>
            {list.length === 0 && <Empty>No interactions yet. Log your first outreach.</Empty>}
            <ol class="timeline">
              {list.map((i) => (
                <li class={cx(CONVERSATION_TYPES.includes(i.type) && 'conv')}>
                  <div class="t-head">
                    <span class="strong">{INTERACTION_TYPES[i.type]}</span>
                    <span class="muted small">{fmtDate(i.date)} · {relDays(i.date)}</span>
                    {i.impression != null && <Rating value={i.impression} title="Impression" />}
                    {isUrl(i.notesUrl) && <a class="small" href={i.notesUrl} target="_blank" rel="noreferrer">Notes ↗</a>}
                    {i.link && <a class="small" href={i.link} target="_blank" rel="noreferrer">Open in Gmail ↗</a>}
                    {i.source === 'gmail' && <span class="tag sm" title="Added automatically from Gmail">Gmail</span>}
                    <button class="btn xs ghost right" onClick={() => openModal({ kind: 'log', personId: p.id, interactionId: i.id })}>Edit</button>
                  </div>
                  {i.summary && <div>{i.summary}</div>}
                  {i.takeaways && <div class="takeaways">{i.takeaways}</div>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

import { newFirm } from '../store';
const newFirmLite = (name: string) => newFirm({ name });
