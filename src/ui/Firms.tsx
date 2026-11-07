import { useState } from 'preact/hooks';
import type { Data, Firm } from '../types';
import { FIRM_STATUSES, MARKETS, INTERACTION_TYPES, CONVERSATION_TYPES } from '../types';
import { effectiveStatus, firmStats, lastInteraction } from '../logic';
import { actions } from '../store';
import { fmtDate, norm, cx } from '../util';
import { go, openModal } from './nav';
import { Area, Empty, Field, Pill, Rating, Select, TagInput, Text, dupFirms } from './common';
import { TaskRow } from './Today';

export const TIER_SUGGESTIONS = ['Seven Sisters', 'Bay Street', 'Vault 10', 'Vault 25', 'V50', 'Boutique', 'Elite US', 'Magic Circle', 'In-house'];

type SortKey = 'name' | 'market' | 'status' | 'interest' | 'people' | 'spoke' | 'impression' | 'last' | 'deadline';
type Row = { f: Firm; s: ReturnType<typeof firmStats> };
type Val = string | number | null;
/** Sort order for the Status column: what needs attention first. */
const STATUS_ORDER = ['Applied', 'Researching', 'Outreach Sent', 'Call Scheduled', 'Contacted', 'Interview', 'Offer', 'Not Started', 'Declined', 'Not Pursuing'];
const ROW_CLS: Record<string, string> = { Applied: 'row-green', Researching: 'row-yellow', Contacted: 'row-yellow' };
/** Market filter defaults to NYC and remembers the last choice while the app is open. */
let marketPref = 'NYC';
const SORT_VALUE: Record<SortKey, (r: Row) => Val> = {
  name: (r) => r.f.name.toLowerCase(),
  market: (r) => r.f.market || null,
  status: (r) => { const i = STATUS_ORDER.indexOf(r.f.status); return i < 0 ? STATUS_ORDER.length : i; },
  interest: (r) => r.f.interest ?? null,
  people: (r) => r.s.peopleCount,
  spoke: (r) => r.s.spokeCount,
  impression: (r) => r.s.avgImpression,
  last: (r) => r.s.lastContact,
  deadline: (r) => r.s.nextDeadline?.date ?? null,
};
// Text columns start A→Z; numeric and date columns start with the biggest / latest first.
const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  name: 'asc', market: 'asc', status: 'asc', interest: 'desc', people: 'desc', spoke: 'desc', impression: 'desc', last: 'desc', deadline: 'asc',
};

export function FirmsList({ data }: { data: Data }) {
  const [q, setQ] = useState('');
  const [market, setMarketState] = useState(marketPref);
  const setMarket = (m: string) => { marketPref = m; setMarketState(m); };
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'status', dir: 'asc' });
  const pick = (key: SortKey) => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }));
  const sign = sort.dir === 'asc' ? 1 : -1;
  const rows = data.firms.map((f) => ({ f, s: firmStats(data, f) }))
    .filter(({ f }) => (!market || f.market === market) && (!status || f.status === status)
      && (!q || norm([f.name, f.aliases.join(' '), f.practiceAreas, f.notes, f.tiers.join(' '), f.offices, f.market].join(' ')).includes(norm(q))))
    .sort((a, b) => {
      const x = SORT_VALUE[sort.key](a), y = SORT_VALUE[sort.key](b);
      if (x == null || y == null) return x == null && y == null ? a.f.name.localeCompare(b.f.name) : x == null ? 1 : -1; // empty values always last
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      if (c === 0 && sort.key === 'status') return (b.f.interest ?? 0) - (a.f.interest ?? 0) || a.f.name.localeCompare(b.f.name); // within a status: most interesting first
      return c * sign || a.f.name.localeCompare(b.f.name);
    });
  const Th = ({ k, children, num }: { k: SortKey; children: string; num?: boolean }) => (
    <th class={cx('sortable', num && 'num', sort.key === k && 'on', sort.key === k && sort.dir)} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => pick(k)}>{children}</th>
  );
  return (
    <div class="page">
      <div class="page-head">
        <h1>Firms <span class="count">{rows.length}</span></h1>
        <button class="btn primary right" onClick={() => openModal({ kind: 'firm-new' })}>+ Firm</button>
      </div>
      <div class="filters">
        <input class="search" placeholder="Search firms, practice areas, notes…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <Select value={market} options={MARKETS} onChange={setMarket} blank="Any market" />
        <Select value={status} options={FIRM_STATUSES} onChange={setStatus} blank="Any status" />
      </div>
      {rows.length === 0 ? <Empty>No firms yet.</Empty> : (
        <table class="grid">
          <thead><tr><Th k="name">Firm</Th><Th k="market">Market</Th><Th k="status">Status</Th><Th k="interest">Interest</Th><Th k="people" num>People</Th><Th k="spoke" num>Spoke</Th><Th k="impression">Impression</Th><Th k="last">Last contact</Th><Th k="deadline">Next deadline</Th></tr></thead>
          <tbody>
            {rows.map(({ f, s }) => (
              <tr class={ROW_CLS[f.status]} onClick={() => go(`firms/${f.id}`)}>
                <td class="strong">{f.name}{f.kind === 'company' && <span class="tag sm">company</span>}{f.review && <span class="flag" title={f.review}>review</span>}
                  {f.tiers.length > 0 && <div class="small muted">{f.tiers.join(' · ')}</div>}</td>
                <td>{f.market}</td>
                <td onClick={(e) => e.stopPropagation()}><Select compact value={f.status} options={FIRM_STATUSES} onChange={(status) => actions.saveFirm({ ...f, status })} /></td>
                <td onClick={(e) => e.stopPropagation()}><Rating value={f.interest} onChange={(interest) => actions.saveFirm({ ...f, interest })} title="Click to set interest" /></td>
                <td class="num">{s.peopleCount}</td>
                <td class={cx('num', s.spokeCount === 0 && 'muted')}>{s.spokeCount}</td>
                <td>{s.avgImpression ? s.avgImpression.toFixed(1) : <span class="muted">—</span>}</td>
                <td class="muted">{fmtDate(s.lastContact) || '—'}</td>
                <td class="muted">{s.nextDeadline ? fmtDate(s.nextDeadline.date) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function FirmDetail({ data, id }: { data: Data; id: string }) {
  const f = data.firms.find((x) => x.id === id);
  if (!f) return <div class="page"><Empty>Firm not found. <a href="#/firms">Back</a></Empty></div>;
  const upd = (patch: Partial<Firm>) => actions.saveFirm({ ...f, ...patch });
  const s = firmStats(data, f);
  const tasks = data.tasks.filter((t) => t.firmId === f.id || t.trigger?.firmId === f.id || s.people.some((p) => p.id === t.personId));
  const deadlines = data.deadlines.filter((d) => d.firmId === f.id).sort((a, b) => a.date.localeCompare(b.date));
  const notes = data.interactions.filter((i) => s.people.some((p) => p.id === i.personId) && (i.takeaways || (CONVERSATION_TYPES.includes(i.type) && i.summary))).sort((a, b) => b.date.localeCompare(a.date));
  const dups = dupFirms(data, f.name, f.id);
  return (
    <div class="page detail">
      <div class="page-head">
        <a href="#/firms" class="back">← Firms</a>
        <h1>{f.name || 'Unnamed firm'}</h1>
        <Pill s={f.status} />
        <div class="right row-gap">
          <button class="btn ghost" onClick={() => openModal({ kind: 'person-new', firmId: f.id })}>+ Person here</button>
        </div>
      </div>
      {f.review && <div class="banner warn">Needs review: {f.review} <button class="btn sm ghost" onClick={() => upd({ review: undefined })}>Clear flag</button></div>}
      {dups.length > 0 && <div class="banner">Possible duplicate of {dups.map((d) => <a href={`#/firms/${d.id}`}>{d.name}</a>)}. <button class="btn sm ghost" onClick={() => openModal({ kind: 'merge', type: 'firm', id: f.id })}>Merge…</button></div>}
      {f.status === 'Applied' || f.status === 'Interview' ? null : tasks.some((t) => t.trigger && !t.done) &&
        <div class="banner">{tasks.filter((t) => t.trigger && !t.done).length} task(s) will appear on Today when this firm’s status reaches “Applied”.</div>}

      <div class="detail-grid">
        <section class="card">
          <h3>Details</h3>
          <div class="form">
            <Field label="Name" span={2}><Text value={f.name} onInput={(v) => upd({ name: v })} /></Field>
            <Field label="Other names" span={2} group hint="Short names and spellings, so imports and search match."><TagInput value={f.aliases} onChange={(aliases) => upd({ aliases })} /></Field>
            <Field label="Status"><Select value={f.status} options={FIRM_STATUSES} onChange={(status) => upd({ status })} /></Field>
            <Field label="Interest" group><Rating value={f.interest} onChange={(interest) => upd({ interest })} /></Field>
            <Field label="Market"><Select value={f.market} options={MARKETS} onChange={(market) => upd({ market })} blank="—" /></Field>
            <Field label="Type"><Select value={f.kind} options={[{ value: 'firm', label: 'Law firm' }, { value: 'company', label: 'Company / in-house' }]} onChange={(kind) => upd({ kind })} /></Field>
            <Field label="Offices"><Text value={f.offices} onInput={(v) => upd({ offices: v })} /></Field>
            <Field label="Size"><Text value={f.size} onInput={(v) => upd({ size: v })} placeholder="e.g. 600+ in NYC" /></Field>
            <Field label="Tier tags" span={2} group><TagInput value={f.tiers} onChange={(tiers) => upd({ tiers })} suggestions={TIER_SUGGESTIONS} /></Field>
            <Field label="Practice areas of interest" span={2}><Text value={f.practiceAreas} onInput={(v) => upd({ practiceAreas: v })} /></Field>
            <Field label="How I found them" span={2}><Text value={f.howFound} onInput={(v) => upd({ howFound: v })} /></Field>
            <Field label="Culture notes / impressions" span={2}><Area value={f.notes} onInput={(v) => upd({ notes: v })} rows={5} /></Field>
            <Field label="Links" span={2} hint="Careers page, student program, bios — one per line">
              <Area value={f.links.join('\n')} onInput={(v) => upd({ links: v.split('\n').map((x) => x.trim()).filter(Boolean) })} rows={2} />
            </Field>
          </div>
          {f.links.length > 0 && <div class="links">{f.links.map((l) => <a href={l} target="_blank" rel="noreferrer">{l.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50)}</a>)}</div>}
          <div class="row-gap danger-zone">
            <button class="btn sm ghost" onClick={() => openModal({ kind: 'merge', type: 'firm', id: f.id })}>Merge into…</button>
            <button class="btn sm ghost danger" onClick={() => { if (confirm(`Delete ${f.name}? People stay, but lose their firm.`)) { actions.deleteFirm(f.id); go('firms'); } }}>Delete</button>
          </div>
        </section>

        <div class="stack">
          <section class="card">
            <h3>People <span class="count">{s.peopleCount}</span> <span class="muted small">· spoke with {s.spokeCount}{s.avgImpression ? ` · avg impression ${s.avgImpression.toFixed(1)}` : ''}</span></h3>
            {s.people.length === 0 && <Empty>No one here yet.</Empty>}
            {s.people.map((p) => {
              const last = lastInteraction(data, p.id);
              return (
                <div class="row">
                  <a class="strong grow" href={`#/people/${p.id}`}>{p.name} <span class="muted small">{p.role}</span></a>
                  <span class="muted small">{last ? `${INTERACTION_TYPES[last.type]} · ${fmtDate(last.date)}` : ''}</span>
                  <Pill s={effectiveStatus(data, p)} small />
                </div>
              );
            })}
          </section>
          <section class="card">
            <h3>Tasks <button class="btn sm ghost right" onClick={() => openModal({ kind: 'task', firmId: f.id })}>+ Task</button></h3>
            {tasks.length === 0 && <Empty>No tasks.</Empty>}
            {tasks.map((t) => <TaskRow data={data} t={t} />)}
          </section>
          <section class="card">
            <h3>Deadlines</h3>
            {deadlines.length === 0 && <Empty>None. Add them in <a href="#/calendar">Calendar</a>.</Empty>}
            {deadlines.map((d) => <div class="row"><span class="strong">{fmtDate(d.date)}</span><span class="grow">{d.name}</span>{!d.verified && <span class="flag">verify</span>}</div>)}
          </section>
          <section class="card">
            <h3>What people said</h3>
            {notes.length === 0 && <Empty>Notes from conversations with people here will collect here.</Empty>}
            {notes.map((i) => {
              const p = data.people.find((x) => x.id === i.personId)!;
              return <div class="quote"><div class="small muted">{p.name} · {fmtDate(i.date)}</div>{i.takeaways || i.summary}</div>;
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
