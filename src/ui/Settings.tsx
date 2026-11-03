import { useEffect, useState } from 'preact/hooks';
import type { Data, Settings as S } from '../types';
import { actions, backupManual, changeFolder, getState, listBackups, restoreBackup, save, normalize } from '../store';
import { mirrorNow } from '../gas';
import { CSV_TABLES, applyImport, exportCsv, exportIcs, exportJson, exportVcf, exportXlsx, importFile, type ImportResult } from '../io';
import { Area, Field, Modal, Text } from './common';
import { toast } from './nav';
import { render } from '../compose';
import { newPerson } from '../store';

export function Settings({ data }: { data: Data }) {
  const st = getState();
  const s = data.settings;
  const upd = (p: Partial<S>) => actions.updateData((d) => Object.assign(d.settings, p));
  const [backups, setBackups] = useState<{ name: string; modified: number }[]>([]);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const refresh = () => listBackups().then(setBackups);
  useEffect(() => { refresh(); }, []);

  const onImport = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      if (f.name.endsWith('.json')) {
        const raw = JSON.parse(await f.text());
        if (confirm(`Replace ALL current data with ${f.name}? (${raw.people?.length ?? 0} people, ${raw.firms?.length ?? 0} firms). A backup of the current file is made first.`)) {
          await backupManual();
          actions.replaceAll(normalize(raw));
          toast('Data replaced');
        }
        return;
      }
      setPreview(await importFile(f, data));
    } catch (err: any) {
      alert('Could not read that file: ' + (err?.message ?? err));
    }
  };

  const sample = render('{{signature}}', data, newPerson({ name: 'Jordan Lee' }), []);

  return (
    <div class="page">
      <div class="page-head"><h1>Settings</h1></div>
      <div class="cols two">
        <section class="card">
          <h3>You</h3>
          <div class="form">
            <Field label="Your name"><Text value={s.name} onInput={(name) => upd({ name })} /></Field>
            <Field label="Your email"><Text value={s.email} onInput={(email) => upd({ email })} /></Field>
            <Field label="School"><Text value={s.school} onInput={(school) => upd({ school })} /></Field>
            <Field label="Year"><Text value={s.year} onInput={(year) => upd({ year })} /></Field>
            <Field label="Email signature" span={2} hint={`Preview: ${sample.replace(/\n/g, ' / ')}`}><Area value={s.signature} onInput={(signature) => upd({ signature })} rows={3} /></Field>
          </div>
          <h3>Reminders</h3>
          <div class="form">
            <Field label="Check in after (weeks of silence)"><input type="number" min={2} max={52} value={s.silenceWeeks} onInput={(e) => upd({ silenceWeeks: Number((e.target as HTMLInputElement).value) || 8 })} /></Field>
            <Field label="Mark “No response” after (days)"><input type="number" min={3} max={60} value={s.noReplyDays} onInput={(e) => upd({ noReplyDays: Number((e.target as HTMLInputElement).value) || 14 })} /></Field>
          </div>
        </section>

        <section class="card">
          <h3>Data file</h3>
          {st.backend === 'gas' ? (
            <>
              <p>Saved to <b>tracker.json</b> in the shared Google Drive folder{st.user ? <> · signed in as {st.user}</> : null}.</p>
              <p class="small muted">{st.saveState === 'error' ? <span class="err">{st.saveError}</span> : st.lastSaved ? `Last saved ${st.lastSaved.toLocaleTimeString()}` : 'Up to date'}. A daily backup is kept in the folder’s <i>backups</i> subfolder.</p>
              <h4>Google Sheet (read-only view)</h4>
              <p class="small muted">Updated a few seconds after each save. Edits made in the sheet are not read back — change things here.</p>
              <div class="row-gap">
                {st.sheetUrl && <a class="btn ghost" href={st.sheetUrl} target="_blank" rel="noreferrer">Open sheet ↗</a>}
                <button class="btn ghost" onClick={() => mirrorNow().then(() => toast('Sheet updated'))}>Update sheet now</button>
                {st.sheetSynced && <span class="small muted">updated {st.sheetSynced.toLocaleTimeString()}</span>}
              </div>
            </>
          ) : st.memory ? (
            <p class="banner warn">Not connected to a folder — changes are lost when you close this tab. Use “Download JSON” below, or reload and pick a folder.</p>
          ) : (
            <>
              <p>Saving to <b>{st.dir?.name}/tracker.json</b> · {st.saveState === 'error' ? <span class="err">save failed: {st.saveError}</span> : st.lastSaved ? `last saved ${st.lastSaved.toLocaleTimeString()}` : 'saved'}</p>
              <div class="row-gap">
                <button class="btn ghost" onClick={() => changeFolder().then(refresh).catch(() => {})}>Change folder…</button>
                <button class="btn ghost" onClick={async () => { await backupManual(); await refresh(); toast('Backup saved'); }}>Back up now</button>
                <button class="btn ghost" onClick={() => save().then(() => toast('Saved'))}>Save now</button>
              </div>
              <h4>Backups <span class="muted small">(last 10, taken every 30 min while you work)</span></h4>
              {backups.length === 0 && <p class="small muted">None yet.</p>}
              <ul class="backups">
                {backups.map((b) => (
                  <li><span class="grow">{new Date(b.modified).toLocaleString('en-CA')}</span>
                    <button class="btn xs ghost" onClick={async () => { if (confirm('Restore this backup? Current data is backed up first.')) { await backupManual(); await restoreBackup(b.name); await refresh(); toast('Restored'); } }}>Restore</button></li>
                ))}
              </ul>
            </>
          )}

          <h3>Export</h3>
          <div class="row-gap wrap">
            <button class="btn ghost" onClick={() => exportXlsx(data)}>Excel (.xlsx)</button>
            <button class="btn ghost" onClick={() => exportIcs(data)}>Calendar (.ics)</button>
            <button class="btn ghost" onClick={() => exportVcf(data)}>Contacts (vCard)</button>
            <button class="btn ghost" onClick={() => exportJson(data)}>Download JSON</button>
          </div>
          <div class="row-gap wrap small"><span class="muted">CSV:</span>{CSV_TABLES.map((t) => <button class="btn xs ghost" onClick={() => exportCsv(data, t)}>{t}</button>)}</div>

          <h3>Import</h3>
          <p class="small muted">Excel/CSV in the original tracker layout, any sheet with a “Name” column, or LinkedIn’s <i>Connections.csv</i> (LinkedIn → Settings → Data privacy → Get a copy of your data → Connections). Duplicates are skipped. A .json file replaces everything.</p>
          <label class="btn ghost file">Choose file…<input type="file" accept=".xlsx,.xls,.csv,.json" onChange={onImport} hidden /></label>
        </section>
      </div>
      {preview && (
        <Modal title="Import preview" onClose={() => setPreview(null)}
          footer={<><button class="btn ghost right" onClick={() => setPreview(null)}>Cancel</button>
            <button class="btn primary" disabled={!preview.people.length && !preview.firms.length && !preview.updates.length} onClick={() => { actions.updateData((d) => applyImport(d, preview)); setPreview(null); toast('Imported'); }}>Import</button></>}>
          <p><b>{preview.people.length}</b> new people, <b>{preview.firms.length}</b> new firms, <b>{preview.interactions.length}</b> interactions.</p>
          {preview.updates.length > 0 && <p class="small"><b>{preview.updates.length}</b> firms you already have get missing details filled in (market, offices, tags, short names; notes only if empty): {preview.updates.map((u) => u.name).join(', ')}</p>}
          {preview.firms.length > 0 && <p class="small">New firms: {preview.firms.map((f) => f.name).join(', ')}</p>}
          {preview.people.length > 0 && <p class="small">New people: {preview.people.slice(0, 40).map((p) => p.name).join(', ')}{preview.people.length > 40 ? '…' : ''}</p>}
          {preview.skipped.length > 0 && <details><summary class="small">{preview.skipped.length} skipped</summary><ul class="small">{preview.skipped.map((x) => <li>{x}</li>)}</ul></details>}
        </Modal>
      )}
    </div>
  );
}
