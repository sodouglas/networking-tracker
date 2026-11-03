import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Data, ID, PersonStatus } from '../types';
import { cx, norm, similar } from '../util';
import { closeModal } from './nav';

export function Modal(props: { title: string; onClose?: () => void; children: ComponentChildren; footer?: ComponentChildren; wide?: boolean }) {
  const close = props.onClose ?? closeModal;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div class="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class={cx('modal', props.wide && 'wide')} role="dialog" aria-label={props.title}>
        <header><h2>{props.title}</h2><button class="icon" onClick={close} aria-label="Close">×</button></header>
        <div class="modal-body">{props.children}</div>
        {props.footer && <footer>{props.footer}</footer>}
      </div>
    </div>
  );
}

export function Field(props: { label: string; children: ComponentChildren; hint?: string; span?: 1 | 2 }) {
  return (
    <label class={cx('field', props.span === 2 && 'span2')}>
      <span class="lbl">{props.label}</span>
      {props.children}
      {props.hint && <span class="hint">{props.hint}</span>}
    </label>
  );
}

type InputProps = { value: string; onInput: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean; inputMode?: string; class?: string };
export const Text = ({ value, onInput, ...rest }: InputProps) => (
  <input {...(rest as any)} value={value} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
);
export const Area = ({ value, onInput, rows = 3, ...rest }: { value: string; onInput: (v: string) => void; rows?: number; placeholder?: string }) => (
  <textarea {...rest} rows={rows} value={value} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />
);
export function Select<T extends string>(props: { value: T; options: readonly T[] | { value: T; label: string }[]; onChange: (v: T) => void; blank?: string }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as T)}>
      {props.blank != null && <option value="">{props.blank}</option>}
      {props.options.map((o: any) => typeof o === 'string'
        ? <option value={o}>{o}</option>
        : <option value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Rating(props: { value: number | null; onChange?: (v: number | null) => void; title?: string }) {
  return (
    <span class={cx('rating', !props.onChange && 'ro')} title={props.title}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" class={cx('dot', props.value != null && n <= props.value && 'on')}
          disabled={!props.onChange}
          onClick={() => props.onChange?.(props.value === n ? null : n)} aria-label={`${n} of 5`} />
      ))}
    </span>
  );
}

const STATUS_CLS: Record<string, string> = {
  'Prospect': 'grey', 'Outreach sent': 'blue', 'Scheduling': 'amber', 'Spoke': 'green', 'Thanked': 'teal',
  'Keep warm': 'violet', 'No response': 'red', 'Dormant': 'grey',
  'Not Started': 'grey', 'Researching': 'sky', 'Outreach Sent': 'blue', 'Call Scheduled': 'amber', 'Contacted': 'green',
  'Applied': 'violet', 'Interview': 'indigo', 'Offer': 'gold', 'Declined': 'red', 'Not Pursuing': 'slate',
};
export const Pill = ({ s, small }: { s: PersonStatus | string; small?: boolean }) => <span class={cx('pill', STATUS_CLS[s] ?? 'grey', small && 'sm')}>{s}</span>;

export function TagInput(props: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = (t: string) => {
    const v = t.trim();
    if (v && !props.value.includes(v)) props.onChange([...props.value, v]);
    setDraft('');
  };
  const listId = useMemo(() => 'tags-' + Math.random().toString(36).slice(2), []);
  return (
    <div class="tags-input">
      {props.value.map((t) => <span class="tag">{t}<button type="button" onClick={() => props.onChange(props.value.filter((x) => x !== t))} aria-label={`Remove ${t}`}>×</button></span>)}
      <input list={listId} value={draft} placeholder={props.value.length ? '' : props.placeholder ?? 'Add…'}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
          if (e.key === 'Backspace' && !draft && props.value.length) props.onChange(props.value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)} />
      <datalist id={listId}>{(props.suggestions ?? []).filter((s) => !props.value.includes(s)).map((s) => <option value={s} />)}</datalist>
    </div>
  );
}

/** Searchable picker with an optional "create" row. */
export function Combo(props: {
  items: { id: ID; label: string; sub?: string }[]; value: ID | null; onChange: (id: ID | null) => void;
  placeholder?: string; onCreate?: (text: string) => void; autoFocus?: boolean; createLabel?: string;
}) {
  const current = props.items.find((i) => i.id === props.value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (props.autoFocus) ref.current?.focus(); }, []);
  const nq = norm(q);
  const list = (nq ? props.items.filter((i) => norm(i.label + ' ' + (i.sub ?? '')).includes(nq)) : props.items).slice(0, 30);
  const canCreate = props.onCreate && q.trim() && !props.items.some((i) => norm(i.label) === nq);
  const rows = [...list.map((i) => ({ ...i, create: false })), ...(canCreate ? [{ id: '__new', label: q.trim(), create: true, sub: '' }] : [])];
  const choose = (r: (typeof rows)[number]) => {
    if (r.create) props.onCreate!(r.label); else props.onChange(r.id);
    setQ(''); setOpen(false);
  };
  return (
    <div class="combo">
      <input ref={ref} value={open ? q : current?.label ?? ''} placeholder={props.placeholder}
        onFocus={() => { setOpen(true); setQ(''); setHi(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onInput={(e) => { setQ((e.target as HTMLInputElement).value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          if (e.key === 'Enter' && open && rows[hi]) { e.preventDefault(); choose(rows[hi]); }
        }} />
      {open && rows.length > 0 && (
        <ul class="combo-list">
          {rows.map((r, i) => (
            <li class={cx(i === hi && 'hi', r.create && 'create')} onMouseDown={(e) => { e.preventDefault(); choose(r); }} onMouseEnter={() => setHi(i)}>
              {r.create ? <>{props.createLabel ?? '+ Create'} “{r.label}”</> : <>{r.label}{r.sub && <span class="sub">{r.sub}</span>}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const firmItems = (d: Data) => [...d.firms].sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ id: f.id, label: f.name, sub: f.aliases.join(', ') }));
export const personItems = (d: Data) => [...d.people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, label: p.name, sub: d.firms.find((f) => f.id === p.firmId)?.aliases[0] ?? d.firms.find((f) => f.id === p.firmId)?.name ?? '' }));

export function dupPeople(d: Data, name: string, exceptId?: ID) {
  if (name.trim().length < 3) return [];
  return d.people.filter((p) => p.id !== exceptId && similar(p.name, name));
}
export function dupFirms(d: Data, name: string, exceptId?: ID) {
  if (name.trim().length < 3) return [];
  return d.firms.filter((f) => f.id !== exceptId && (similar(f.name, name) || f.aliases.some((a) => similar(a, name))));
}

export const Empty = ({ children }: { children: ComponentChildren }) => <div class="empty">{children}</div>;

export function allTags(d: Data) {
  const s = new Set<string>(['McGill alum', 'Personal', 'Tufts alum', 'Colby alum', 'Met at US Career Day', 'Referral']);
  d.people.forEach((p) => p.tags.forEach((t) => s.add(t)));
  return [...s].sort();
}
