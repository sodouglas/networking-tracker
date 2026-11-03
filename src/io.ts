import * as XLSX from 'xlsx';
import type { Data, Firm, Person, Interaction, InteractionType } from './types';
import { INTERACTION_TYPES, FIRM_STATUSES } from './types';
import { effectiveStatus, firmName, reminders, taskActive, metrics, firmStats } from './logic';
import { download, isoDate, lev, norm, similar, today, uid } from './util';
import { newFirm, newPerson } from './store';

// ---------- exports ----------
function tables(d: Data) {
  const person = (id?: string | null) => d.people.find((p) => p.id === id)?.name ?? '';
  return {
    Firms: d.firms.map((f) => {
      const s = firmStats(d, f);
      return {
        'Firm Name': f.name, 'Other names': f.aliases.join('; '), Type: f.kind, Market: f.market, Offices: f.offices,
        'Firm Size': f.size, Tiers: f.tiers.join('; '), 'Practice Areas of Interest': f.practiceAreas,
        'How I Found Them': f.howFound, Status: f.status, 'Interest (1-5)': f.interest ?? '',
        'People': s.peopleCount, 'Spoke with': s.spokeCount,
        'Avg impression': s.avgImpression ? Number(s.avgImpression.toFixed(1)) : '',
        'Last contact': s.lastContact ?? '', Notes: f.notes, Links: f.links.join(' '),
      };
    }),
    People: d.people.map((p) => ({
      Name: p.name, Firm: firmName(d, p.firmId), 'Past employers': p.pastEmployers, Role: p.role, Title: p.title,
      'Grad year': p.gradYear ?? '', School: p.school, Tags: p.tags.join('; '), Email: p.email, LinkedIn: p.linkedin,
      'Other channel': p.otherChannel, Status: effectiveStatus(d, p), 'Where met': p.whereMet,
      'Personal details': p.personal, Notes: p.notes, 'Follow-up flag': p.flag ? (p.flag.note || 'yes') : '',
    })),
    Interactions: [...d.interactions].sort((a, b) => a.date.localeCompare(b.date)).map((i) => {
      const p = d.people.find((x) => x.id === i.personId);
      return {
        Date: i.date, Person: p?.name ?? '', Firm: firmName(d, p?.firmId), Type: INTERACTION_TYPES[i.type],
        Summary: i.summary, Takeaways: i.takeaways, Impression: i.impression ?? '', Link: i.link ?? '',
      };
    }),
    Tasks: d.tasks.map((t) => ({
      Task: t.text, Person: person(t.personId), Firm: firmName(d, t.firmId),
      Direction: t.direction === 'owe' ? 'I owe' : 'Owed to me',
      Due: t.due ?? '', Trigger: t.trigger ? `When ${firmName(d, t.trigger.firmId)} → ${t.trigger.status}` : '',
      Done: t.done ? 'Y' : '',
    })),
    Deadlines: [...d.deadlines].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({
      Date: x.date, Time: x.time ?? '', Name: x.name, Program: x.program, Firm: firmName(d, x.firmId),
      Verified: x.verified ? 'Y' : 'N', Source: x.source, Notes: x.notes,
    })),
  };
}

/** Tables for the read-only Google Sheet: one tab per table, plus a summary. */
export function sheetTables(d: Data) {
  const m = metrics(d);
  const out: { name: string; headers: string[]; rows: (string | number)[][] }[] = [{
    name: 'Summary', headers: ['Metric', 'Value'], rows: [
      ['People tracked', d.people.length], ['Firms tracked', d.firms.length],
      ...Object.entries(m.statusCounts).map(([k, v]) => [`People — ${k}`, v] as [string, number]),
      ['Outreach this week', m.outThis], ['Outreach last week', m.outLast],
      ['Response rate', m.responseRate == null ? '' : `${m.responseRate}%`],
      ['Follow-ups owed', m.followUpsOwed], ['Firms in play with no conversation', m.firmsNoConvo.length],
    ],
  }];
  for (const [name, rows] of Object.entries(tables(d))) {
    const headers = Object.keys(rows[0] ?? {});
    out.push({ name, headers, rows: rows.map((r: any) => headers.map((h) => r[h] ?? '')) });
  }
  return out;
}

export function exportXlsx(d: Data) {
  const wb = XLSX.utils.book_new();
  const m = metrics(d);
  const dash = [
    ['Networking Dashboard', `Exported ${today()}`], [],
    ['People tracked', d.people.length], ['Firms tracked', d.firms.length],
    ...Object.entries(m.statusCounts).map(([k, v]) => [`People — ${k}`, v]),
    ['Outreach this week', m.outThis], ['Outreach last week', m.outLast],
    ['Response rate', m.responseRate == null ? '—' : `${m.responseRate}%`],
    ['Follow-ups owed', m.followUpsOwed], ['Firms with no conversation yet', m.firmsNoConvo.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dash), 'Dashboard');
  for (const [name, rows] of Object.entries(tables(d))) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const keys = Object.keys(rows[0] ?? {});
    ws['!cols'] = keys.map((k) => ({ wch: Math.min(60, Math.max(k.length + 2, ...rows.map((r: any) => String(r[k] ?? '').length).slice(0, 200), 8)) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  download(`networking-tracker-${today()}.xlsx`, out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function exportCsv(d: Data, table: keyof ReturnType<typeof tables>) {
  const ws = XLSX.utils.json_to_sheet(tables(d)[table]);
  download(`${table.toLowerCase()}-${today()}.csv`, '\ufeff' + XLSX.utils.sheet_to_csv(ws), 'text/csv');
}
export const CSV_TABLES = ['Firms', 'People', 'Interactions', 'Tasks', 'Deadlines'] as const;

const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
const icsDate = (s: string) => s.replace(/-/g, '');
function fold(line: string) {
  const out: string[] = [];
  while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
  out.push(line);
  return out.join('\r\n');
}

export function exportIcs(d: Data) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ev: string[] = [];
  const add = (uidv: string, date: string, title: string, desc = '') => {
    const next = isoDate(new Date(new Date(date + 'T12:00:00').getTime() + 86400000));
    ev.push(['BEGIN:VEVENT', `UID:${uidv}@networking-tracker`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(date)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`, fold(`SUMMARY:${icsEsc(title)}`), desc ? fold(`DESCRIPTION:${icsEsc(desc)}`) : '',
      'END:VEVENT'].filter(Boolean).join('\r\n'));
  };
  for (const x of d.deadlines) add(`dl-${x.id}`, x.date, `${x.verified ? '' : '[verify] '}${x.name}`, [x.time, x.notes, x.source].filter(Boolean).join('\n'));
  for (const t of d.tasks) if (t.due && taskActive(d, t)) add(`task-${t.id}`, t.due, `${t.direction === 'owe' ? 'To do' : 'Waiting on'}: ${t.text}`);
  for (const r of reminders(d)) {
    if (r.kind === 'no-reply') continue;
    const p = d.people.find((x) => x.id === r.personId);
    add(`rem-${r.key}`, r.due < today() ? today() : r.due, `${r.kind === 'thank-you' ? 'Thank-you' : 'Check in'}: ${p?.name ?? ''}`, r.label);
  }
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Networking Tracker//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Networking Tracker', ...ev, 'END:VCALENDAR'].join('\r\n');
  download(`networking-tracker-${today()}.ics`, body, 'text/calendar');
}

export function exportVcf(d: Data, people = d.people) {
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const cards = people.map((p) => {
    const parts = p.name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop()! : '';
    const email = (p.email.match(/[^\s/<>;,]+@[^\s/<>;,]+/) ?? [])[0];
    return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(p.name)}`, `N:${esc(last)};${esc(parts.join(' '))};;;`,
      firmName(d, p.firmId) ? `ORG:${esc(firmName(d, p.firmId))}` : '', p.title || p.role ? `TITLE:${esc(p.title || p.role)}` : '',
      email ? `EMAIL;TYPE=INTERNET:${email}` : '', p.linkedin ? `URL:${p.linkedin.startsWith('http') ? p.linkedin : 'https://' + p.linkedin}` : '',
      `NOTE:${esc([p.tags.join(', '), p.whereMet && 'Met: ' + p.whereMet, p.personal].filter(Boolean).join(' | '))}`,
      'END:VCARD'].filter(Boolean).join('\r\n');
  });
  download(`contacts-${today()}.vcf`, cards.join('\r\n'), 'text/vcard');
}

export function exportJson(d: Data) {
  download(`tracker-${today()}.json`, JSON.stringify(d, null, 2), 'application/json');
}

// ---------- imports ----------
export interface ImportResult {
  firms: Firm[];
  people: Person[];
  interactions: Interaction[];
  updates: { id: string; name: string; patch: Partial<Firm> }[];
  skipped: string[];
}

const pick = (row: Record<string, any>, ...names: string[]) => {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => x.trim().toLowerCase().startsWith(n.toLowerCase()));
    if (k && row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
};

function toIso(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{5}$/.test(v)) { const d = XLSX.SSF.parse_date_code(Number(v)); return isoDate(new Date(d.y, d.m - 1, d.d)); }
  const t = Date.parse(v.replace(/\bSept\b/, 'Sep'));
  return isNaN(t) ? null : isoDate(new Date(t));
}

const FORMAT_MAP: [RegExp, InteractionType][] = [
  [/video|zoom|teams/i, 'video'], [/phone|call/i, 'call'], [/coffee/i, 'coffee'], [/career fair/i, 'career-fair'],
  [/reception|info session|event/i, 'reception'], [/in person/i, 'in-person'],
];

/** Import from the original workbook layout, a generic contacts sheet, or LinkedIn Connections.csv. */
export async function importFile(file: File, d: Data): Promise<ImportResult> {
  // CSV files are read as UTF-8 text (SheetJS would otherwise guess the encoding and garble accents without a BOM).
  const wb = /\.(csv|tsv|txt)$/i.test(file.name)
    ? XLSX.read((await file.text()).replace(/^\ufeff/, ''), { type: 'string', cellDates: true, dateNF: 'yyyy-mm-dd' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
  const res: ImportResult = { firms: [], people: [], interactions: [], updates: [], skipped: [] };
  const allFirms = () => [...d.firms, ...res.firms];
  const findFirm = (name: string) => {
    if (!name) return null;
    let f = allFirms().find((x) => similar(x.name, name) || x.aliases.some((a) => similar(a, name)));
    if (!f) { f = newFirm({ name, howFound: `Imported ${today()}` }); res.firms.push(f); }
    return f.id;
  };
  const exists = (name: string) => [...d.people, ...res.people].some((p) => similar(p.name, name));

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    let rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
    // LinkedIn export has a few lines of notes above the header.
    const hdr = rows.findIndex((r) => r.some((c) => /^(first name|name|contact name|firm name)$/i.test(String(c).trim())));
    if (hdr < 0) continue;
    const header = rows[hdr].map((c) => String(c).trim());
    const objs = rows.slice(hdr + 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
    const isFirmSheet = header.includes('Firm Name') && !header.some((h) => /contact name|^name$|first name/i.test(h));

    for (const row of objs) {
      if (isFirmSheet) {
        const name = pick(row, 'Firm Name');
        if (!name || /^example/i.test(name)) continue;
        const list = (s: string) => s.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
        const aliases = list(pick(row, 'Other names', 'Aliases'));
        // Full names may match loosely; aliases only match (almost) exactly, so "Cassels" doesn't hit "Blake, Cassels".
        const eq = (a: string, b: string) => { const x = norm(a), y = norm(b); return x.length >= 4 && (x === y || (Math.min(x.length, y.length) >= 6 && lev(x, y) <= 1)); };
        const dup = allFirms().find((x) => similar(x.name, name)
          || x.aliases.some((a) => eq(a, name)) || aliases.some((k) => eq(k, x.name) || x.aliases.some((a) => eq(a, k))));
        const tiersIn = list(pick(row, 'Tiers'));
        if (dup) {
          // Existing firm: only fill in what's empty, and add new tags/aliases. Never overwrite her notes or status.
          const patch: Partial<Firm> = {};
          const fill = (k: 'market' | 'offices' | 'size', v: string) => { if (v && !dup[k]) patch[k] = v; };
          fill('market', pick(row, 'Market')); fill('offices', pick(row, 'Office')); fill('size', pick(row, 'Firm Size'));
          const t = tiersIn.filter((x) => !dup.tiers.includes(x));
          if (t.length) patch.tiers = [...dup.tiers, ...t];
          const al = aliases.filter((a) => a !== dup.name && !dup.aliases.includes(a));
          if (al.length) patch.aliases = [...dup.aliases, ...al];
          const n = pick(row, 'General Notes', 'Notes');
          if (n && !dup.notes) patch.notes = n;
          if (Object.keys(patch).length && d.firms.some((f) => f.id === dup.id)) res.updates.push({ id: dup.id, name: dup.name, patch });
          else res.skipped.push(`${name} (already in tracker as ${dup.name})`);
          continue;
        }
        const status = pick(row, 'Status');
        res.firms.push(newFirm({
          name, aliases, offices: pick(row, 'Office'), practiceAreas: pick(row, 'Practice'), size: pick(row, 'Firm Size'),
          market: pick(row, 'Market'), tiers: tiersIn, links: list(pick(row, 'Links')).flatMap((l) => l.split(/\s+/)),
          kind: /company|in-house/i.test(pick(row, 'Type')) ? 'company' : 'firm',
          howFound: pick(row, 'How I Found'), interest: Number(pick(row, 'Interest')) || null,
          status: ((FIRM_STATUSES as readonly string[]).includes(status) ? status : 'Researching') as any, notes: pick(row, 'General Notes', 'Notes'),
        }));
        continue;
      }
      const first = pick(row, 'First Name');
      const name = first ? `${first} ${pick(row, 'Last Name')}`.trim() : pick(row, 'Contact Name', 'Name');
      if (!name || /^example/i.test(pick(row, 'Firm Name', 'Firm'))) continue;
      if (exists(name)) { res.skipped.push(`${name} (already in tracker)`); continue; }
      const firmId = findFirm(pick(row, 'Company', 'Firm Name', 'Firm'));
      const linked = pick(row, 'URL', 'LinkedIn');
      const contact = pick(row, 'Email Address', 'Email');
      const p = newPerson({
        name, firmId, title: pick(row, 'Position', 'Title'), gradYear: Number(pick(row, 'Year of Graduation', 'Grad')) || null,
        email: contact.includes('@') ? contact : '', otherChannel: contact && !contact.includes('@') ? contact : '',
        linkedin: linked, whereMet: pick(row, 'How We Connected', 'Connection'),
        tags: [pick(row, 'Contact Type'), first ? 'LinkedIn' : ''].filter(Boolean),
        notes: [pick(row, 'Key Notes', 'Notes'), pick(row, 'Connected On') && `LinkedIn connection since ${pick(row, 'Connected On')}`].filter(Boolean).join('\n'),
        createdAt: today(),
      });
      res.people.push(p);
      const out = toIso(pick(row, 'Date of Outreach'));
      if (out) res.interactions.push({ id: uid(), personId: p.id, date: out, type: 'email-out', summary: pick(row, 'How We Connected') || 'Outreach', takeaways: '', impression: null });
      const conv = toIso(pick(row, 'Date of Conversation'));
      if (conv) {
        const fmt = pick(row, 'Conversation Format');
        const type = FORMAT_MAP.find(([re]) => re.test(fmt))?.[1] ?? 'call';
        res.interactions.push({ id: uid(), personId: p.id, date: conv, type, summary: fmt, takeaways: pick(row, 'Key Notes'), impression: null });
      }
      const fu = toIso(pick(row, 'Follow-Up Date'));
      if (fu && /^y/i.test(pick(row, 'Follow-Up Sent'))) res.interactions.push({ id: uid(), personId: p.id, date: fu, type: 'thank-you', summary: 'Thank-you sent', takeaways: '', impression: null });
    }
  }
  return res;
}

export function applyImport(d: Data, r: ImportResult) {
  d.firms.push(...r.firms);
  d.people.push(...r.people);
  d.interactions.push(...r.interactions);
  for (const u of r.updates) {
    const f = d.firms.find((x) => x.id === u.id);
    if (f) Object.assign(f, u.patch);
  }
}
