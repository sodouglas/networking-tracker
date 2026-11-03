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

/** `group` = the field holds several buttons (tag chips, rating dots). A <label> would pass any click on it
 *  to the first button, so these render a plain <div> instead. */
export function Field(props: { label: string; children: ComponentChildren; hint?: string; span?: 1 | 2; group?: boolean }) {
  const Tag = props.group ? 'div' : 'label';
  return (
    <Tag class={cx('field', props.span === 2 && 'span2')}>
      <span class="lbl">{props.label}</span>
      {props.children}
      {props.hint && <span class="hint">{props.hint}</span>}
    </Tag>
  );
}

type InputProps = { value: string; onInput: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean; inputMode?: string; class?: string };
export const Text = ({ value, onInput, ...rest }: InputProps) => (
  <input {...(rest as any)} value={value} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
);
export const Area = ({ value, onInput, rows = 3, ...rest }: { value: string; onInput: (v: string) => void; rows?: number; placeholder?: string }) => (
  <textarea {...rest} rows={rows} value={value} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />
);
export type MenuItem = { value: string; label: string; sub?: string };

/** Floating list used by Select and the suggestion inputs. Fixed-position so scrolling parents and modals never clip it. */
function Menu(props: { anchor: HTMLElement | null; items: MenuItem[]; hi: number; selected?: string; onPick: (v: string) => void; onHover: (i: number) => void }) {
  const [, tick] = useState(0);
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const re = (e: Event) => { if (e.type === 'scroll' && ref.current?.contains(e.target as Node)) return; tick((n) => n + 1); };
    window.addEventListener('resize', re); window.addEventListener('scroll', re, true);
    return () => { window.removeEventListener('resize', re); window.removeEventListener('scroll', re, true); };
  }, []);
  useEffect(() => { ref.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }); }, [props.hi]);
  const r = props.anchor?.getBoundingClientRect();
  if (!r || !props.items.length) return null;
  const below = window.innerHeight - r.bottom;
  const want = Math.min(260, props.items.length * 30 + 8);
  const up = below < want && r.top > below;
  const px = (n: number) => `${Math.round(n)}px`;
  const style: Record<string, string> = { left: px(r.left), minWidth: px(r.width),
    ...(up ? { bottom: px(window.innerHeight - r.top + 2), maxHeight: px(Math.min(260, r.top - 8)) } : { top: px(r.bottom + 2), maxHeight: px(Math.min(260, below - 8)) }) };
  return (
    <ul class="menu" role="listbox" ref={ref} style={style} onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
      {props.items.map((it, i) => (
        <li role="option" aria-selected={it.value === props.selected} class={cx(i === props.hi && 'hi', it.value === props.selected && 'on')}
          onMouseMove={() => i !== props.hi && props.onHover(i)} onClick={(e) => { e.preventDefault(); props.onPick(it.value); }}>
          <span class="grow">{it.label}</span>{it.sub && <span class="sub">{it.sub}</span>}{it.value === props.selected && <span class="tick">✓</span>}
        </li>
      ))}
    </ul>
  );
}

/** Keyboard handling shared by the suggestion inputs. Returns true when it handled the key. */
function listKeys(e: KeyboardEvent, s: { open: boolean; setOpen: (b: boolean) => void; hi: number; setHi: (n: number) => void; count: number; pick: () => void }) {
  if (e.key === 'ArrowDown' && s.count) { e.preventDefault(); s.setOpen(true); s.setHi(Math.min(s.count - 1, s.hi + 1)); return true; }
  if (e.key === 'ArrowUp' && s.open && s.count) { e.preventDefault(); s.setHi(Math.max(0, s.hi - 1)); return true; }
  if (e.key === 'Enter' && s.open && s.hi >= 0 && s.hi < s.count) { e.preventDefault(); s.pick(); return true; }
  if (e.key === 'Escape' && s.open) { e.preventDefault(); e.stopPropagation(); s.setOpen(false); return true; }
  return false;
}

/** Drop-in replacement for <select> with our own list instead of the browser's. */
export function Select<T extends string>(props: { value: T; options: readonly T[] | { value: T; label: string }[]; onChange: (v: T) => void; blank?: string }) {
  const items: MenuItem[] = [
    ...(props.blank != null ? [{ value: '', label: props.blank }] : []),
    ...(props.options as any[]).map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.value as string, label: o.label as string })),
  ];
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const idx = items.findIndex((i) => i.value === props.value);
  const show = () => { setHi(Math.max(0, idx)); setOpen(true); };
  const pick = (v: string) => { setOpen(false); if (v !== props.value) props.onChange(v as T); };
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (!open) show(); else setHi((h) => Math.max(0, Math.min(items.length - 1, h + (k === 'ArrowDown' ? 1 : -1))));
    } else if (k === 'Home' || k === 'End') {
      if (open) { e.preventDefault(); setHi(k === 'Home' ? 0 : items.length - 1); }
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (!open) show(); else if (items[hi]) pick(items[hi].value);
    } else if (k === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    } else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + k.toLowerCase(), at: now };
      const m = items.findIndex((i) => i.label.toLowerCase().startsWith(typed.current.text));
      if (m >= 0) { if (open) setHi(m); else pick(items[m].value); }
    }
  };
  return (
    <>
      <button type="button" ref={btn} class={cx('sel', open && 'open', props.value === '' && 'ph')} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKeyDown} onBlur={() => setOpen(false)}>
        <span class="sel-label">{idx >= 0 ? items[idx].label : props.value}</span>
      </button>
      {open && <Menu anchor={btn.current} items={items} hi={hi} selected={props.value} onPick={pick} onHover={setHi} />}
    </>
  );
}

/** Text box with our own suggestion list (typing anything is still allowed). */
export function Suggest(props: { value: string; onInput: (v: string) => void; suggestions: string[]; placeholder?: string; style?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);
  const q = norm(props.value);
  const items: MenuItem[] = props.suggestions.filter((x) => x !== props.value && (!q || norm(x).includes(q))).map((x) => ({ value: x, label: x }));
  const pick = (v: string) => { props.onInput(v); setOpen(false); setHi(-1); };
  return (
    <>
      <input ref={ref} value={props.value} placeholder={props.placeholder} style={props.style} autoComplete="off"
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onInput={(e) => { props.onInput((e.target as HTMLInputElement).value); setOpen(true); setHi(-1); }}
        onKeyDown={(e) => { listKeys(e, { open, setOpen, hi, setHi, count: items.length, pick: () => pick(items[hi].value) }); }} />
      {open && <Menu anchor={ref.current} items={items} hi={hi} onPick={pick} onHover={setHi} />}
    </>
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
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Removed tags, newest last, so ⌘Z / Ctrl+Z can put them back where they were.
  const removed = useRef<{ tag: string; index: number }[]>([]);
  const latest = useRef(props.value); latest.current = props.value;
  const onChange = useRef(props.onChange); onChange.current = props.onChange;
  const add = (t: string) => {
    const v = t.trim();
    if (v && !props.value.includes(v)) props.onChange([...props.value, v]);
    setDraft(''); setHi(-1);
  };
  const dq = norm(draft);
  const items: MenuItem[] = (props.suggestions ?? []).filter((x) => !props.value.includes(x) && (!dq || norm(x).includes(dq))).map((x) => ({ value: x, label: x }));
  const remove = (tag: string) => {
    const index = props.value.indexOf(tag);
    if (index < 0) return;
    removed.current.push({ tag, index });
    props.onChange(props.value.filter((x) => x !== tag));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z' || !removed.current.length) return;
      // Leave the browser's own undo alone while typing in some other box, or in this one with text in it.
      const a = document.activeElement as HTMLElement | null;
      const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
      if (typing && !(a === inputRef.current && !inputRef.current!.value)) return;
      e.preventDefault();
      const { tag, index } = removed.current.pop()!;
      const cur = latest.current;
      if (cur.includes(tag)) return;
      const next = [...cur]; next.splice(Math.min(index, next.length), 0, tag);
      onChange.current(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="tags-input" ref={boxRef} onClick={(e) => { if (e.target === e.currentTarget) inputRef.current?.focus(); }}>
      {props.value.map((t) => <span class="tag">{t}<button type="button" onClick={() => remove(t)} aria-label={`Remove ${t}`} title="Remove (⌘Z to undo)">×</button></span>)}
      <input ref={inputRef} value={draft} placeholder={props.value.length ? '' : props.placeholder ?? 'Add…'} autoComplete="off"
        onFocus={() => setOpen(true)}
        onInput={(e) => { setDraft((e.target as HTMLInputElement).value); setOpen(true); setHi(-1); }}
        onKeyDown={(e) => {
          if (listKeys(e, { open, setOpen, hi, setHi, count: items.length, pick: () => add(items[hi].value) })) return;
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
          if (e.key === 'Backspace' && !draft && props.value.length) remove(props.value[props.value.length - 1]);
        }}
        onBlur={() => { setOpen(false); if (draft) add(draft); }} />
      {open && <Menu anchor={boxRef.current} items={items} hi={hi} onPick={add} onHover={setHi} />}
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
