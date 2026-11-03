import { useMemo, useState } from 'preact/hooks';
import type { Data, Interaction, InteractionType, Task, FirmStatus } from '../types';
import { INTERACTION_TYPES, FIRM_STATUSES, CONVERSATION_TYPES } from '../types';
import { actions, newFirm, newPerson } from '../store';
import { interactionsFor, firmStats, shortFirm, firmName, effectiveStatus, taskActive } from '../logic';
import { emailOf, gmailUrl, renderTemplate, snippets } from '../compose';
import { today, uid, fmtDate, similar } from '../util';
import { closeModal, go, toast, type ModalState } from './nav';
import { Area, Combo, Field, Modal, Pill, Rating, Select, Text, dupFirms, dupPeople, firmItems, personItems } from './common';

export function Modals({ data, m }: { data: Data; m: ModalState }) {
  if (!m) return null;
  switch (m.kind) {
    case 'log': return <QuickLog data={data} personId={m.personId} interactionId={m.interactionId} />;
    case 'compose': return <Compose data={data} personId={m.personId} templateId={m.templateId} />;
    case 'merge': return <Merge data={data} type={m.type} id={m.id} />;
    case 'prep': return <Prep data={data} personId={m.personId} />;
    case 'task': return <TaskEditor data={data} taskId={m.taskId} personId={m.personId} firmId={m.firmId} />;
    case 'person-new': return <NewPerson data={data} firmId={m.firmId} />;
    case 'firm-new': return <NewFirm data={data} />;
  }
}

const TYPE_OPTIONS = (Object.keys(INTERACTION_TYPES) as InteractionType[]).map((k) => ({ value: k, label: INTERACTION_TYPES[k] }));

function QuickLog({ data, personId, interactionId }: { data: Data; personId?: string; interactionId?: string }) {
  const existing = data.interactions.find((i) => i.id === interactionId);
  const [i, setI] = useState<Interaction>(existing ?? { id: uid(), personId: personId ?? '', date: today(), type: 'email-out', summary: '', takeaways: '', impression: null });
  const [newName, setNewName] = useState('');
  const [newFirmId, setNewFirmId] = useState<string | null>(null);
  const [newFirmName, setNewFirmName] = useState('');
  const [task, setTask] = useState({ text: '', direction: 'owe' as 'owe' | 'owed', due: '' });
  const up = (p: Partial<Interaction>) => setI({ ...i, ...p });
  const creating = !!newName;
  const dups = creating ? dupPeople(data, newName) : [];
  const valid = (i.personId || creating) && i.date;
  const isConv = CONVERSATION_TYPES.includes(i.type);

  const submit = () => {
    let pid = i.personId;
    let firmId = data.people.find((x) => x.id === pid)?.firmId ?? null;
    if (creating) {
      firmId = newFirmId;
      if (!firmId && newFirmName) { const f = newFirm({ name: newFirmName }); actions.saveFirm(f); firmId = f.id; }
      const p = newPerson({ name: newName, firmId });
      actions.savePerson(p);
      pid = p.id;
    }
    actions.saveInteraction({ ...i, personId: pid });
    if (task.text.trim()) {
      actions.saveTask({ id: uid(), text: task.text.trim(), personId: pid, firmId, direction: task.direction, due: task.due || null, trigger: null, done: false, createdAt: today() });
    }
    toast(existing ? 'Interaction updated' : 'Logged');
    closeModal();
  };

  return (
    <Modal title={existing ? 'Edit interaction' : 'Log interaction'}
      footer={<>
        {existing && <button class="btn ghost danger" onClick={() => { if (confirm('Delete this interaction?')) { actions.deleteInteraction(i.id); closeModal(); } }}>Delete</button>}
        <span class="small muted right">⌘↵ to save</span>
        <button class="btn ghost" onClick={closeModal}>Cancel</button>
        <button class="btn primary" disabled={!valid} onClick={submit}>Save</button>
      </>}>
      <div class="form" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && valid) submit(); }}>
        <Field label="Person" span={2}>
          {creating ? (
            <div class="row-gap"><span class="tag">New: {newName}</span><button class="btn xs ghost" onClick={() => setNewName('')}>change</button></div>
          ) : (
            <Combo items={personItems(data)} value={i.personId || null} onChange={(id) => up({ personId: id ?? '' })} placeholder="Type a name…" autoFocus={!personId} onCreate={setNewName} createLabel="+ New person" />
          )}
        </Field>
        {creating && <>
          {dups.length > 0 && <div class="banner span2">Already have {dups.map((d) => <button class="linkish" onClick={() => { setNewName(''); up({ personId: d.id }); }}>{d.name} ({shortFirm(data, d.firmId) || 'no firm'})</button>)}? Click to use them instead.</div>}
          <Field label="Their firm" span={2}>
            {newFirmName && !newFirmId ? <div class="row-gap"><span class="tag">New firm: {newFirmName}</span><button class="btn xs ghost" onClick={() => setNewFirmName('')}>change</button></div>
              : <Combo items={firmItems(data)} value={newFirmId} onChange={setNewFirmId} placeholder="Optional" onCreate={setNewFirmName} createLabel="+ New firm" />}
          </Field>
        </>}
        <Field label="Type"><Select value={i.type} options={TYPE_OPTIONS} onChange={(type) => up({ type })} /></Field>
        <Field label="Date"><input type="date" value={i.date} max="2100-01-01" onInput={(e) => up({ date: (e.target as HTMLInputElement).value })} /></Field>
        <Field label="Summary" span={2}><Text value={i.summary} onInput={(summary) => up({ summary })} placeholder={isConv ? '20-min Zoom about M&A group' : 'Asked for info interview'} /></Field>
        {(isConv || i.takeaways) && <Field label="Key takeaways" span={2} hint="One per line. These feed follow-up drafts and the firm page."><Area value={i.takeaways} onInput={(takeaways) => up({ takeaways })} rows={4} /></Field>}
        {(isConv || i.impression != null) && <Field label="Impression" hint="How warm / useful was it?"><Rating value={i.impression} onChange={(impression) => up({ impression })} /></Field>}
        {!existing && <>
          <Field label="Add a task (optional)" span={2}>
            <div class="row-gap">
              <select value={task.direction} onChange={(e) => setTask({ ...task, direction: (e.target as HTMLSelectElement).value as any })}><option value="owe">I owe</option><option value="owed">Owed to me</option></select>
              <input class="grow" value={task.text} onInput={(e) => setTask({ ...task, text: (e.target as HTMLInputElement).value })} placeholder="e.g. Send resume / She'll intro me to a 2L" />
              <input type="date" value={task.due} onInput={(e) => setTask({ ...task, due: (e.target as HTMLInputElement).value })} />
            </div>
          </Field>
        </>}
      </div>
    </Modal>
  );
}

function Compose({ data, personId, templateId }: { data: Data; personId: string; templateId?: string }) {
  const p = data.people.find((x) => x.id === personId)!;
  const [tid, setTid] = useState(templateId ?? data.templates[0]?.id);
  const opts = useMemo(() => snippets(data, p), []);
  const [picked, setPicked] = useState<string[]>([]);
  const t = data.templates.find((x) => x.id === tid) ?? data.templates[0];
  const gen = renderTemplate(t, data, p, picked);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const subj = subject ?? gen.subject, bod = body ?? gen.body;
  const [to, setTo] = useState(emailOf(p));
  const edited = subject != null || body != null;
  const reset = () => { setSubject(null); setBody(null); };
  const words = bod.split(/\s+/).filter(Boolean).length;
  const markSent = () => {
    actions.saveInteraction({ id: uid(), personId: p.id, date: today(), type: t.kind, summary: `Sent: ${subj}`, takeaways: '', impression: null });
    toast('Logged as sent');
    closeModal();
  };
  return (
    <Modal wide title={`Draft to ${p.name}`}
      footer={<>
        <span class="small muted">{words} words{words > 130 ? ' — consider trimming' : ''}</span>
        <button class="btn ghost right" onClick={() => { navigator.clipboard.writeText(`${subj}\n\n${bod}`); toast('Copied'); }}>Copy</button>
        <a class="btn ghost" href={gmailUrl(to, subj, bod)} target="_blank" rel="noreferrer">Open in Gmail ↗</a>
        <button class="btn primary" onClick={markSent} title="Logs this email on the timeline">Mark sent</button>
      </>}>
      <div class="compose">
        <div class="form">
          <Field label="Template">
            <Select value={tid} options={data.templates.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => { if (!edited || confirm('Discard your edits and switch template?')) { reset(); setTid(v); } }} />
          </Field>
          <Field label="To"><Text value={to} onInput={setTo} /></Field>
          <Field label="Subject" span={2}><Text value={subj} onInput={setSubject} /></Field>
          <Field label="Body" span={2}><Area value={bod} onInput={setBody} rows={14} /></Field>
          {edited && <button class="btn xs ghost" onClick={reset}>Regenerate from template</button>}
        </div>
        <aside class="snips">
          <h4>Insert as {'{{detail}}'}</h4>
          {opts.length === 0 && <p class="small muted">No notes yet for {p.name.split(' ')[0]}. Add takeaways when you log a conversation.</p>}
          {opts.map((s) => (
            <label class="check small">
              <input type="checkbox" checked={picked.includes(s)} disabled={edited} onChange={() => setPicked((x) => x.includes(s) ? x.filter((y) => y !== s) : [...x, s])} />
              <span>{s}</span>
            </label>
          ))}
          {edited && <p class="small muted">Edits made by hand — regenerate to use these.</p>}
          <p class="small muted">Notes are raw — reword them so they read as a sentence to the recipient.</p>
          <p class="small muted">Gmail opens a draft. Send it there, then click <b>Mark sent</b> here.</p>
        </aside>
      </div>
    </Modal>
  );
}

function Merge({ data, type, id }: { data: Data; type: 'person' | 'firm'; id: string }) {
  const isP = type === 'person';
  const self: any = isP ? data.people.find((x) => x.id === id) : data.firms.find((x) => x.id === id);
  const all: any[] = isP ? data.people : data.firms;
  const likely = all.filter((x) => x.id !== id && similar(x.name, self.name));
  const [target, setTarget] = useState<string | null>(likely[0]?.id ?? null);
  const tgt = all.find((x) => x.id === target);
  const items = isP ? personItems(data) : firmItems(data);
  return (
    <Modal title={`Merge ${self.name}`}
      footer={<><button class="btn ghost right" onClick={closeModal}>Cancel</button>
        <button class="btn primary" disabled={!tgt} onClick={() => {
          if (isP) actions.mergePeople(tgt.id, id); else actions.mergeFirms(tgt.id, id);
          toast('Merged'); closeModal(); go(`${isP ? 'people' : 'firms'}/${tgt.id}`);
        }}>Merge</button></>}>
      <p class="small">Everything attached to <b>{self.name}</b> ({isP ? 'interactions, tasks' : 'people, tasks, deadlines'}) moves to the record you pick. Empty fields there are filled from this one; notes are combined. <b>{self.name}</b> is then removed.</p>
      {likely.length > 0 && <div class="row-gap wrap">{likely.map((l) => <button class={'btn sm ' + (target === l.id ? 'primary' : 'ghost')} onClick={() => setTarget(l.id)}>{l.name}</button>)}</div>}
      <Field label="Merge into"><Combo items={items.filter((x) => x.id !== id)} value={target} onChange={setTarget} placeholder="Search…" /></Field>
    </Modal>
  );
}

function Prep({ data, personId }: { data: Data; personId: string }) {
  const p = data.people.find((x) => x.id === personId)!;
  const f = data.firms.find((x) => x.id === p.firmId);
  const fs = f ? firmStats(data, f) : null;
  const mine = interactionsFor(data, p.id).reverse();
  const others = fs ? data.interactions.filter((i) => i.personId !== p.id && fs.people.some((x) => x.id === i.personId) && (i.takeaways || (CONVERSATION_TYPES.includes(i.type) && i.summary))).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const tasks = data.tasks.filter((t) => (t.personId === p.id || (f && t.firmId === f.id)) && taskActive(data, t));
  const [qs, setQs] = useState<string[]>([]);
  const cats = [...new Set(data.questions.map((q) => q.category))];
  return (
    <Modal wide title={`Prep: ${p.name}`} footer={<><span class="small muted">Tick questions, then print or keep this open during the call.</span><button class="btn ghost right" onClick={() => window.print()}>Print</button><button class="btn primary" onClick={() => { closeModal(); }}>Done</button></>}>
      <div class="prep printable">
        <div class="prep-cols">
          <div>
            <h4>{p.name}</h4>
            <p>{[p.title || p.role, f?.name, p.gradYear && `Class of ${p.gradYear}`].filter(Boolean).join(' · ')}</p>
            <p class="small"><Pill s={effectiveStatus(data, p)} small /> {p.tags.map((t) => <span class="tag sm">{t}</span>)}</p>
            {p.whereMet && <p class="small"><b>Met:</b> {p.whereMet}</p>}
            {p.pastEmployers && <p class="small"><b>Before:</b> {p.pastEmployers}</p>}
            {p.personal && <p class="small"><b>Remember:</b> {p.personal}</p>}
            {p.notes && <p class="small pre">{p.notes}</p>}
            <h4>History with {p.name.split(' ')[0]}</h4>
            {mine.length === 0 ? <p class="small muted">First contact.</p> : <ul class="tight small">{mine.map((i) => <li><b>{fmtDate(i.date)}</b> {INTERACTION_TYPES[i.type]}{i.summary && ` — ${i.summary}`}{i.takeaways && <div class="pre muted">{i.takeaways}</div>}</li>)}</ul>}
            {tasks.length > 0 && <><h4>Open items</h4><ul class="tight small">{tasks.map((t) => <li>{t.direction === 'owe' ? 'I owe: ' : 'Waiting on: '}{t.text}</li>)}</ul></>}
          </div>
          <div>
            {f ? <>
              <h4>{f.name}</h4>
              <p class="small">{[f.market, f.size, f.tiers.join(', ')].filter(Boolean).join(' · ')}</p>
              <p class="small"><Pill s={f.status} small /> interest <Rating value={f.interest} /></p>
              {f.practiceAreas && <p class="small"><b>Interested in:</b> {f.practiceAreas}</p>}
              {f.notes && <p class="small pre">{f.notes}</p>}
              <h4>What others at {shortFirm(data, f.id)} said</h4>
              {others.length === 0 ? <p class="small muted">Nothing yet.</p> : <ul class="tight small">{others.slice(0, 8).map((i) => <li><b>{data.people.find((x) => x.id === i.personId)?.name}</b> ({fmtDate(i.date)}): {i.takeaways || i.summary}</li>)}</ul>}
            </> : <p class="muted">No firm set.</p>}
          </div>
        </div>
        <h4>Questions</h4>
        <div class="qpick no-print">
          {cats.map((c) => (
            <details open={c === 'Their path' || c === 'The work'}>
              <summary>{c}</summary>
              {data.questions.filter((q) => q.category === c).map((q) => (
                <label class="check small"><input type="checkbox" checked={qs.includes(q.text)} onChange={() => setQs((x) => x.includes(q.text) ? x.filter((y) => y !== q.text) : [...x, q.text])} /> {q.text}</label>
              ))}
            </details>
          ))}
        </div>
        {qs.length > 0 && <ol class="picked">{qs.map((q) => <li>{q}</li>)}</ol>}
      </div>
    </Modal>
  );
}

function TaskEditor({ data, taskId, personId, firmId }: { data: Data; taskId?: string; personId?: string; firmId?: string }) {
  const existing = data.tasks.find((t) => t.id === taskId);
  const [t, setT] = useState<Task>(existing ?? { id: uid(), text: '', personId: personId ?? null, firmId: firmId ?? null, direction: 'owe', due: null, trigger: null, done: false, createdAt: today() });
  const up = (p: Partial<Task>) => setT({ ...t, ...p });
  const mode = t.trigger ? 'trigger' : t.due ? 'date' : 'none';
  return (
    <Modal title={existing ? 'Edit task' : 'New task'}
      footer={<>
        {existing && <button class="btn ghost danger" onClick={() => { actions.deleteTask(t.id); closeModal(); }}>Delete</button>}
        <button class="btn ghost right" onClick={closeModal}>Cancel</button>
        <button class="btn primary" disabled={!t.text.trim() || (mode === 'trigger' && !t.trigger?.firmId)} onClick={() => { actions.saveTask(t); closeModal(); }}>Save</button>
      </>}>
      <div class="form">
        <Field label="Task" span={2}><Text value={t.text} onInput={(text) => up({ text })} placeholder="e.g. Tell Ray when I apply" autoFocus /></Field>
        <Field label="Direction"><Select value={t.direction} options={[{ value: 'owe', label: 'I owe this' }, { value: 'owed', label: 'Someone owes me' }]} onChange={(direction) => up({ direction })} /></Field>
        <Field label="Person"><Combo items={personItems(data)} value={t.personId ?? null} onChange={(pid) => up({ personId: pid, firmId: t.firmId ?? data.people.find((x) => x.id === pid)?.firmId ?? null })} placeholder="Optional" /></Field>
        <Field label="Firm"><Combo items={firmItems(data)} value={t.firmId ?? null} onChange={(fid) => up({ firmId: fid })} placeholder="Optional" /></Field>
        <Field label="When">
          <Select value={mode} options={[{ value: 'none', label: 'No date' }, { value: 'date', label: 'On a date' }, { value: 'trigger', label: 'When a firm’s status changes' }]}
            onChange={(v) => up(v === 'date' ? { due: t.due ?? today(), trigger: null } : v === 'trigger' ? { due: null, trigger: { firmId: t.firmId ?? '', status: 'Applied' } } : { due: null, trigger: null })} />
        </Field>
        {mode === 'date' && <Field label="Due"><input type="date" value={t.due ?? ''} onInput={(e) => up({ due: (e.target as HTMLInputElement).value || null })} /></Field>}
        {mode === 'trigger' && <>
          <Field label="When firm"><Combo items={firmItems(data)} value={t.trigger!.firmId || null} onChange={(fid) => up({ trigger: { ...t.trigger!, firmId: fid ?? '' } })} placeholder="Pick firm" /></Field>
          <Field label="reaches status" hint="The task appears on Today once the firm’s status gets here.">
            <Select value={t.trigger!.status} options={FIRM_STATUSES.filter((s) => !['Declined', 'Not Pursuing', 'Not Started'].includes(s))} onChange={(status) => up({ trigger: { ...t.trigger!, status: status as FirmStatus } })} />
          </Field>
        </>}
        {existing && <label class="check"><input type="checkbox" checked={t.done} onChange={() => up({ done: !t.done, doneAt: !t.done ? today() : null })} /> Done</label>}
      </div>
    </Modal>
  );
}

function NewPerson({ data, firmId }: { data: Data; firmId?: string }) {
  const [p, setP] = useState(newPerson({ firmId: firmId ?? null }));
  const dups = dupPeople(data, p.name);
  return (
    <Modal title="New person" footer={<><button class="btn ghost right" onClick={closeModal}>Cancel</button>
      <button class="btn primary" disabled={!p.name.trim()} onClick={() => { actions.savePerson({ ...p, name: p.name.trim() }); closeModal(); go(`people/${p.id}`); }}>Create</button></>}>
      <div class="form">
        <Field label="Name" span={2}><Text value={p.name} onInput={(name) => setP({ ...p, name })} autoFocus /></Field>
        {dups.length > 0 && <div class="banner span2">Possible duplicate: {dups.map((d) => <a href={`#/people/${d.id}`} onClick={closeModal}>{d.name} ({shortFirm(data, d.firmId) || 'no firm'})</a>)}</div>}
        <Field label="Firm" span={2}><Combo items={firmItems(data)} value={p.firmId} onChange={(id) => setP({ ...p, firmId: id })} placeholder="Optional"
          onCreate={(name) => { const f = newFirm({ name }); actions.saveFirm(f); setP({ ...p, firmId: f.id }); }} /></Field>
        <Field label="Email"><Text value={p.email} onInput={(email) => setP({ ...p, email })} /></Field>
        <Field label="LinkedIn"><Text value={p.linkedin} onInput={(linkedin) => setP({ ...p, linkedin })} /></Field>
      </div>
      <p class="small muted">Starts as a Prospect. More fields on the next screen.</p>
    </Modal>
  );
}

function NewFirm({ data }: { data: Data }) {
  const [f, setF] = useState(newFirm());
  const dups = dupFirms(data, f.name);
  return (
    <Modal title="New firm" footer={<><button class="btn ghost right" onClick={closeModal}>Cancel</button>
      <button class="btn primary" disabled={!f.name.trim()} onClick={() => { actions.saveFirm({ ...f, name: f.name.trim() }); closeModal(); go(`firms/${f.id}`); }}>Create</button></>}>
      <div class="form">
        <Field label="Full name" span={2} hint="Use the official name; add short names on the next screen."><Text value={f.name} onInput={(name) => setF({ ...f, name })} autoFocus /></Field>
        {dups.length > 0 && <div class="banner span2">Possible duplicate: {dups.map((d) => <a href={`#/firms/${d.id}`} onClick={closeModal}>{d.name}</a>)}</div>}
      </div>
    </Modal>
  );
}

export { firmName };
