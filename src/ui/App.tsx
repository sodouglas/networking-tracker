import { useEffect, useState } from 'preact/hooks';
import { useStore, init, pickFolder, reconnect, startMemory, listBackups, restoreBackup, fsSupported, getState } from '../store';
import { gasSave, reloadFromServer } from '../gas';
import { metrics } from '../logic';
import { cx } from '../util';
import { openModal, useModal, useRoute, useToast } from './nav';
import { Today } from './Today';
import { PeopleList, PersonDetail } from './People';
import { FirmsList, FirmDetail } from './Firms';
import { Compare } from './Compare';
import { Calendar } from './Calendar';
import { Templates, Questions } from './Library';
import { Settings } from './Settings';
import { Modals } from './Modals';

export function App() {
  const st = useStore();
  useEffect(() => { init(); }, []);
  if (st.mode === 'loading') return <div class="center muted">Loading…</div>;
  if (st.mode === 'setup') return <Setup />;
  if (st.mode === 'reconnect') return <Reconnect />;
  if (st.mode === 'broken') return st.backend === 'gas' ? <GasBroken /> : <Broken />;
  return <Shell />;
}

function Shell() {
  const st = useStore();
  const route = useRoute();
  const modal = useModal();
  const toastMsg = useToast();
  const data = st.data;
  const owed = metrics(data).followUpsOwed;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement).isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); openModal({ kind: 'log' }); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (getState().saveState !== 'saved' || getState().memory) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => { document.title = owed ? `(${owed}) Networking Tracker` : 'Networking Tracker'; }, [owed]);

  const nav: [string, string, number?][] = [
    ['today', 'Today', owed], ['people', 'People', data.people.length], ['firms', 'Firms', data.firms.length],
    ['compare', 'Compare'], ['calendar', 'Calendar'], ['templates', 'Templates'], ['questions', 'Question bank'], ['settings', 'Settings'],
  ];
  const page = route.page;
  return (
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">Networking<br /><span>Tracker</span></div>
        <button class="btn primary log-btn" onClick={() => openModal({ kind: 'log' })}>+ Log <kbd>L</kbd></button>
        <nav>
          {nav.map(([k, label, n]) => (
            <a href={`#/${k}`} class={cx(page === k && 'on')}>{label}{n ? <span class={cx('n', k === 'today' && 'alert')}>{n}</span> : null}</a>
          ))}
        </nav>
        <div class={cx('save', st.saveState)}>
          {st.backend === 'gas' && st.offline ? <span class="err" title={st.saveError}>Offline — saved on this device, will sync</span>
            : st.backend === 'gas' && st.conflict ? <span class="err">Not saved — see banner</span>
            : st.memory ? <span class="err">Not saving — no folder</span>
            : st.saveState === 'error' ? <span class="err" title={st.saveError}>Save failed — see Settings</span>
            : st.saveState === 'saved' ? <>Saved{st.lastSaved ? ` ${st.lastSaved.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</>
            : 'Saving…'}
        </div>
      </aside>
      <main>
        {st.conflict && (
          <div class="banner warn conflict">
            This tracker was changed on another device or tab since you opened it, so your latest change wasn’t saved.
            <button class="btn sm" onClick={() => reloadFromServer()}>Load the latest (drop my change)</button>
            <button class="btn sm ghost" onClick={() => { if (confirm('Overwrite the other change with what you see here?')) gasSave(true); }}>Keep mine</button>
          </div>
        )}
        {page === 'today' && <Today data={data} />}
        {page === 'people' && (route.id ? <PersonDetail data={data} id={route.id} /> : <PeopleList data={data} />)}
        {page === 'firms' && (route.id ? <FirmDetail data={data} id={route.id} /> : <FirmsList data={data} />)}
        {page === 'compare' && <Compare data={data} />}
        {page === 'calendar' && <Calendar data={data} />}
        {page === 'templates' && <Templates data={data} />}
        {page === 'questions' && <Questions data={data} />}
        {page === 'settings' && <Settings data={data} />}
      </main>
      <Modals data={data} m={modal} />
      {toastMsg && <div class="toast">{toastMsg}</div>}
    </div>
  );
}

function Setup() {
  const st = useStore();
  const [err, setErr] = useState('');
  const supported = fsSupported();
  const choose = async () => {
    setErr('');
    try { await pickFolder(); } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErr(e?.name === 'SecurityError' || /system files|blocked/i.test(e?.message ?? '')
        ? 'Chrome won’t allow that folder. Pick a folder inside your home folder, e.g. My Drive → Networking Tracker.'
        : `Couldn’t use that folder: ${e?.message ?? e}`);
    }
  };
  const loadJson = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { startMemory(JSON.parse(await f.text())); } catch (x: any) { setErr('Not a valid tracker file: ' + x.message); }
  };
  return (
    <div class="setup">
      <div class="setup-card">
        <h1>Networking Tracker</h1>
        <p>Your contacts, conversations and follow-ups live in one file, <code>tracker.json</code>, in a folder you choose. Nothing is sent anywhere.</p>
        {supported ? <>
          <ol class="steps">
            <li>Click <b>Choose folder</b> and pick <b>My Drive → Networking Tracker</b> (Google Drive keeps it backed up).</li>
            <li>Chrome asks to let this page edit files there. Choose <b>Allow on every visit</b> if offered.</li>
            <li>If the folder already has a <code>tracker.json</code>, it opens. Otherwise you start fresh.</li>
          </ol>
          <button class="btn primary big" onClick={choose}>Choose folder…</button>
        </> : (
          <p class="banner warn">This browser can’t save to a folder. Open this file in <b>Google Chrome</b> for automatic saving. You can still look around below, but you’ll have to download your data before closing.</p>
        )}
        {err && <p class="banner warn">{err}</p>}
        <details class="small">
          <summary>Other options</summary>
          <p><label class="btn ghost sm file">Open a tracker.json without saving<input type="file" accept=".json,application/json" onChange={loadJson} hidden /></label></p>
          <p><button class="btn ghost sm" onClick={() => startMemory()}>Try it with no data</button></p>
        </details>
        {st.memory && <p class="small muted">Running without a folder.</p>}
      </div>
    </div>
  );
}

function Reconnect() {
  const st = useStore();
  const [err, setErr] = useState('');
  return (
    <div class="setup">
      <div class="setup-card">
        <h1>Welcome back</h1>
        <p>Chrome needs your OK to keep editing <b>{st.dir?.name}/tracker.json</b>.</p>
        <button class="btn primary big" onClick={() => reconnect().catch((e) => setErr(String(e?.message ?? e)))}>Continue</button>
        {err && <p class="banner warn">{err}</p>}
        <p class="small"><button class="linkish" onClick={() => pickFolder().catch(() => {})}>Use a different folder</button></p>
      </div>
    </div>
  );
}

function GasBroken() {
  const st = useStore();
  return (
    <div class="setup">
      <div class="setup-card">
        <h1>Couldn’t load the tracker</h1>
        <p class="banner warn">{st.loadError}</p>
        <p>Check your connection and try again. If it keeps failing, the setup guide in the Drive folder has a troubleshooting section.</p>
        <button class="btn primary" onClick={() => location.reload()}>Try again</button>
      </div>
    </div>
  );
}

function Broken() {
  const st = useStore();
  const [list, setList] = useState<{ name: string; modified: number }[]>([]);
  useEffect(() => { listBackups().then(setList); }, []);
  return (
    <div class="setup">
      <div class="setup-card">
        <h1>Couldn’t read tracker.json</h1>
        <p class="banner warn">{st.loadError}</p>
        <p>This can happen if the file was edited by hand or Google Drive is mid-sync. Wait a minute and reload, or restore a backup:</p>
        {list.length === 0 && <p class="muted">No backups found in this folder.</p>}
        <ul class="backups">{list.map((b) => <li><span class="grow">{new Date(b.modified).toLocaleString('en-CA')}</span><button class="btn sm" onClick={() => restoreBackup(b.name)}>Restore</button></li>)}</ul>
        <p class="small"><button class="btn ghost sm" onClick={() => location.reload()}>Reload</button> <button class="linkish" onClick={() => pickFolder().catch(() => {})}>Choose another folder</button></p>
      </div>
    </div>
  );
}
