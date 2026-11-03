import { useState } from 'preact/hooks';
import type { Data, Template, InteractionType } from '../types';
import { INTERACTION_TYPES } from '../types';
import { actions } from '../store';
import { DEFAULT_TEMPLATES, TEMPLATE_HELP } from '../seed';
import { uid, cx } from '../util';
import { Area, Field, Select, Text } from './common';

export function Templates({ data }: { data: Data }) {
  const [sel, setSel] = useState(data.templates[0]?.id ?? '');
  const t = data.templates.find((x) => x.id === sel);
  const save = (patch: Partial<Template>) => actions.updateData((d) => { const x = d.templates.find((y) => y.id === sel); if (x) Object.assign(x, patch); });
  const add = () => { const id = uid(); actions.updateData((d) => d.templates.push({ id, name: 'New template', kind: 'email-out', subject: '', body: 'Hi {{first}},\n\n\n\nBest,\n{{signature}}' })); setSel(id); };
  const original = DEFAULT_TEMPLATES.find((x) => x.id === sel);
  return (
    <div class="page">
      <div class="page-head"><h1>Templates</h1><button class="btn primary right" onClick={add}>+ Template</button></div>
      <div class="split">
        <nav class="side-list">
          {data.templates.map((x) => <button class={cx(x.id === sel && 'on')} onClick={() => setSel(x.id)}>{x.name}</button>)}
        </nav>
        {t ? (
          <section class="card grow">
            <div class="form">
              <Field label="Name"><Text value={t.name} onInput={(name) => save({ name })} /></Field>
              <Field label="When marked sent, log as">
                <Select value={t.kind} options={(['email-out', 'thank-you', 'check-in'] as InteractionType[]).map((k) => ({ value: k, label: INTERACTION_TYPES[k] }))} onChange={(kind) => save({ kind })} />
              </Field>
              <Field label="Subject" span={2}><Text value={t.subject} onInput={(subject) => save({ subject })} /></Field>
              <Field label="Body" span={2}><Area value={t.body} onInput={(body) => save({ body })} rows={14} /></Field>
            </div>
            <div class="row-gap">
              {original && <button class="btn sm ghost" onClick={() => save({ ...original })}>Reset to default</button>}
              <button class="btn sm ghost danger right" onClick={() => { if (confirm('Delete this template?')) { actions.updateData((d) => { d.templates = d.templates.filter((x) => x.id !== sel); }); setSel(data.templates[0]?.id ?? ''); } }}>Delete</button>
            </div>
            <h4>Placeholders</h4>
            <table class="grid compact help">{TEMPLATE_HELP.map(([k, v]) => <tr><td><code>{k}</code></td><td>{v}</td></tr>)}</table>
            <p class="small muted">Keep it under ~120 words. Recipients read on phones between meetings.</p>
          </section>
        ) : <section class="card grow">Pick a template.</section>}
      </div>
    </div>
  );
}

export function Questions({ data }: { data: Data }) {
  const cats = [...new Set(data.questions.map((q) => q.category))];
  const [draft, setDraft] = useState({ category: cats[0] ?? 'General', text: '' });
  return (
    <div class="page">
      <div class="page-head"><h1>Question bank</h1><span class="muted">Pick from these on a person’s prep sheet before a call.</span></div>
      <section class="card">
        <div class="row-gap add-q">
          <input list="qcats" value={draft.category} onInput={(e) => setDraft({ ...draft, category: (e.target as HTMLInputElement).value })} placeholder="Category" style={{ width: '160px' }} />
          <datalist id="qcats">{cats.map((c) => <option value={c} />)}</datalist>
          <input class="grow" value={draft.text} placeholder="Add a question…" onInput={(e) => setDraft({ ...draft, text: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.text.trim()) { actions.updateData((d) => d.questions.push({ id: uid(), category: draft.category || 'General', text: draft.text.trim() })); setDraft({ ...draft, text: '' }); } }} />
        </div>
      </section>
      <div class="qgrid">
        {cats.map((c) => (
          <section class="card">
            <h3>{c}</h3>
            <ul class="qlist">
              {data.questions.filter((q) => q.category === c).map((q) => (
                <li>
                  <span contentEditable onBlur={(e) => { const text = (e.target as HTMLElement).innerText.trim(); if (text && text !== q.text) actions.updateData((d) => { const x = d.questions.find((y) => y.id === q.id); if (x) x.text = text; }); }}>{q.text}</span>
                  <button class="btn xs ghost" onClick={() => actions.updateData((d) => { d.questions = d.questions.filter((y) => y.id !== q.id); })} aria-label="Delete question">×</button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
