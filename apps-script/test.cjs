// Runs Code.gs against mocked Apps Script services.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');
const src = fs.readFileSync(__dirname + '/Code.gs', 'utf8');

function env({ user = 'friend@gmail.com', files = {}, fetchSha = 'abc123', fetchCode = 200 } = {}) {
  let lastHeaders = null; const logs = []; const moved = []; const doc = { kids: [], title: '', saved: false };
  const props = { FOLDER_ID: 'F1', ALLOWED_EMAILS: 'friend@gmail.com, owner@gmail.com', GITHUB_REPO: 'me/repo' };
  const cache = {};
  let fetches = 0;
  const mkFile = (store, name) => ({
    getName: () => name, getBlob: () => ({ getDataAsString: () => store[name] }), setContent: (t) => { store[name] = t; },
    getUrl: () => 'https://docs.google.com/x/' + name, getId: () => 'id-' + name, setTrashed: () => { delete store[name]; },
  });
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const mkFolder = (store, sub) => ({
    getFilesByName: (n) => iter(n in store ? [mkFile(store, n)] : []),
    getFiles: () => iter(Object.keys(store).map((n) => mkFile(store, n))),
    createFile: (n, t) => { store[n] = t; return mkFile(store, n); },
    getFoldersByName: (n) => iter(sub[n] ? [mkFolder(sub[n], {})] : []),
    createFolder: (n) => { sub[n] = {}; return mkFolder(sub[n], {}); },
  });
  const subfolders = {};
  const root = mkFolder(files, subfolders);
  const sheets = {};
  let ssCreated = 0;
  const mkSheet = (name) => {
    const s = { name, values: null, protections: 0, frozen: 0 };
    return Object.assign(s, {
      clearContents: () => { s.values = null; },
      getRange: (a, b, rows, cols) => (typeof a === 'string'
        ? { setValue: (v) => { s.d1 = v; } }
        : { setValues: (v) => { assert.equal(v.length, rows); assert(v.every((r) => r.length === cols)); s.values = v; }, setFontWeight: () => {} }),
      setFrozenRows: (n) => { s.frozen = n; },
      getProtections: () => Array(s.protections),
      protect: () => ({ setWarningOnly: (w) => { assert(w); s.protections++; return { setDescription: () => {} }; } }),
    });
  };
  const ss = {
    getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = mkSheet(n)),
    getSheets: () => Object.values(sheets), deleteSheet: (s) => { delete sheets[s.name]; }, getUrl: () => 'https://sheet', getId: () => 'SS',
  };
  const sb = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    Session: { getActiveUser: () => ({ getEmail: () => user }) },
    DriveApp: { getFolderById: (id) => { assert.equal(id, 'F1'); return root; }, getFileById: (id) => ({ moveTo: (f) => { moved.push({ id, f }); if (id !== 'DOC1') files['Networking Tracker (read-only)'] = 'sheet'; } }) },
    DocumentApp: {
      ParagraphHeading: { HEADING1: 'H1', HEADING2: 'H2', HEADING3: 'H3', NORMAL: 'NORMAL' }, GlyphType: { BULLET: 'BULLET' }, ElementType: { PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM' },
      create: (title) => { doc.title = title; doc.kids = [{ kind: 'PARAGRAPH', text: '' }]; const k = doc.kids;
        const body = {
          appendParagraph: (t) => { const x = { kind: 'PARAGRAPH', text: t, heading: 'NORMAL' }; k.push(x); return { setHeading: (h) => { x.heading = h; } }; },
          appendListItem: (t) => { const x = { kind: 'LIST_ITEM', text: t }; k.push(x); return { setGlyphType: () => {} }; },
          getChild: (i) => ({ _k: k[i], getType: () => k[i].kind, asParagraph: () => ({ getText: () => k[i].text }) }),
          getNumChildren: () => k.length, removeChild: (c) => { k.splice(k.indexOf(c._k), 1); },
        };
        return { getBody: () => body, saveAndClose: () => { doc.saved = true; }, getId: () => 'DOC1', getUrl: () => 'https://docs.google.com/document/d/DOC1/edit' }; },
    },
    SpreadsheetApp: { create: () => { ssCreated++; sheets.Sheet1 = mkSheet('Sheet1'); return ss; }, openById: () => ss, ProtectionType: { SHEET: 'SHEET' } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, t) => [...crypto.createHash('md5').update(t, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      formatDate: () => '2026-11-03',
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v, ttl) => { cache[k] = v; cache['ttl:' + k] = ttl; }, remove: (k) => { delete cache[k]; } }) },
    console: { log: (m) => logs.push(m), warn: (m) => logs.push(m) },
    UrlFetchApp: { fetch: (url, opts) => { fetches++; lastHeaders = opts && opts.headers; assert(url.includes('/repos/me/repo/commits/main')); return { getResponseCode: () => fetchCode, getContentText: () => (fetchCode === 200 ? fetchSha + '\n' : '{"message":"API rate limit exceeded"}') }; } },
    HtmlService: {
      createHtmlOutput: (h) => ({ html: h, setTitle() { return this; } }),
      createTemplateFromFile: () => ({ evaluate() { return { base: this.base, setTitle() { return this; }, addMetaTag() { return this; } }; } }),
    },
  };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  return { sb, files, subfolders, sheets, props, cache, logs, moved, doc, get headers() { return lastHeaders; }, get fetches() { return fetches; }, get ssCreated() { return ssCreated; } };
}
const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
const doc = (n) => JSON.stringify({ people: Array(n).fill({}), firms: [] });

// allow-list
let e = env({ user: 'stranger@gmail.com' });
assert(e.sb.doGet().html.includes('stranger@gmail.com'));
assert.throws(() => e.sb.loadData(), /Not allowed/);
e = env({ user: '' });
assert.throws(() => e.sb.saveData(doc(1), ''), /Not allowed/);
console.log('allow-list ok');

// doGet pins CDN to commit and caches it
e = env();
assert.equal(e.sb.doGet().base, 'https://cdn.jsdelivr.net/gh/me/repo@abc123/release');
e.sb.doGet();
assert.equal(e.fetches, 1, 'commit lookup cached');
// GitHub failing (rate limit): keep the last good commit, retry within a minute, say why in refreshNow
e = env({ fetchCode: 403 });
e.props.LAST_REF = 'oldsha1';
assert.equal(e.sb.doGet().base, 'https://cdn.jsdelivr.net/gh/me/repo@oldsha1/release', 'falls back to last good commit');
assert(e.cache['ttl:ref'] <= 60, 'failed lookups are retried soon, not after 5 min');
e.sb.refreshNow();
assert(/rate limit/.test(e.logs.join(' ')) && /stuck on oldsha1/.test(e.logs.join(' ')), 'refreshNow explains');
// recovers once GitHub answers; refreshNow drops the cached commit; token is sent when set
e = env(); e.props.GITHUB_TOKEN = 'tok';
e.sb.doGet(); assert.equal(e.headers.Authorization, 'Bearer tok');
assert.equal(e.props.LAST_REF, 'abc123');
e.sb.refreshNow(); assert.equal(e.fetches, 2); assert(/commit abc123/.test(e.logs.join(' ')));
console.log('doGet ok');

// load / save / conflict / backup
e = env({ files: { 'tracker.json': doc(2), 'gmail-log.json': JSON.stringify({ messages: [{ key: 'm1:p1' }] }) } });
let r = e.sb.loadData();
assert.equal(r.hash, md5(doc(2)));
assert.equal(r.emails.length, 1);
assert.equal(r.user, 'friend@gmail.com');
let s = e.sb.saveData(doc(3), r.hash);
assert(s.ok && s.hash === md5(doc(3)));
assert.equal(e.files['tracker.json'], doc(3));
assert.equal(e.subfolders.backups['tracker-web-2026-11-03.json'], doc(2), 'daily backup holds previous state');
s = e.sb.saveData(doc(4), r.hash); // stale base
assert(s.conflict && !s.ok);
assert.equal(e.files['tracker.json'], doc(3), 'conflict does not write');
s = e.sb.saveData(doc(4), ''); // keep mine
assert(s.ok && e.files['tracker.json'] === doc(4));
assert.equal(e.subfolders.backups['tracker-web-2026-11-03.json'], doc(2), 'only one backup per day');
assert.equal(e.sb.getHash(), md5(doc(4)));
assert.throws(() => e.sb.saveData('{broken', ''), /JSON/);
assert.throws(() => e.sb.saveData('{"a":1}', ''), /Not a tracker/);
console.log('save/conflict/backup ok');

// first save with no file
e = env();
r = e.sb.loadData();
assert.equal(r.text, null);
assert(e.sb.saveData(doc(1), '').ok);
console.log('create ok');

// mirror
e = env({ files: { 'tracker.json': doc(1) } });
const url = e.sb.mirrorSheet([
  { name: 'Summary', headers: ['Metric', 'Value'], rows: [['People', 3]] },
  { name: 'People', headers: ['Name', 'Notes'], rows: [['Ann', '=HYPERLINK("x")'], ['Bo', '+1 call']] },
  { name: 'Tasks', headers: [], rows: [] },
]);
assert.equal(url, 'https://sheet');
assert.equal(e.ssCreated, 1);
assert(!e.sheets.Sheet1, 'default tab removed');
assert.deepEqual(e.sheets.People.values, [['Name', 'Notes'], ['Ann', "'=HYPERLINK(\"x\")"], ['Bo', "'+1 call"]]);
assert.equal(e.sheets.People.frozen, 1);
assert.equal(e.sheets.People.protections, 1);
assert(String(e.sheets.Summary.d1).startsWith('Last synced'));
e.sb.mirrorSheet([{ name: 'People', headers: ['Name'], rows: [['Cy']] }]);
assert.equal(e.ssCreated, 1, 'reuses sheet');
assert.equal(e.sheets.People.protections, 1, 'protection added once');
assert.deepEqual(e.sheets.People.values, [['Name'], ['Cy']]);
console.log('mirror ok');

// notes doc: built from the app's spec, lands in Notes/, only for allowed users
e = env();
const spec = { title: '2026-11-03 · Phone call · Kerry', blocks: [
  { type: 'h1', text: 'Phone call with Kerry' }, { type: 'p', text: 'Associate · Sidley' }, { type: 'h2', text: 'Notes' }, { type: 'p', text: '' }, { type: 'bullet', text: 'Q one' }] };
const made = e.sb.createNotesDoc(spec);
assert.equal(made.url, 'https://docs.google.com/document/d/DOC1/edit');
assert.equal(e.doc.title, spec.title);
assert.deepEqual(e.doc.kids.map((k) => [k.kind, k.text, k.heading]), [['PARAGRAPH', 'Phone call with Kerry', 'H1'], ['PARAGRAPH', 'Associate · Sidley', 'NORMAL'], ['PARAGRAPH', 'Notes', 'H2'], ['PARAGRAPH', '', 'NORMAL'], ['LIST_ITEM', 'Q one', undefined]], 'blank first paragraph removed, headings applied');
assert(e.doc.saved && e.moved.length === 1 && e.moved[0].id === 'DOC1' && e.subfolders.Notes, 'moved into Notes/');
e.sb.createNotesDoc(spec);
assert.equal(Object.keys(e.subfolders).filter((k) => k === 'Notes').length, 1, 'Notes folder reused');
assert.throws(() => e.sb.createNotesDoc({}), /Bad notes spec/);
e = env({ user: 'stranger@gmail.com' });
assert.throws(() => e.sb.createNotesDoc(spec), /Not allowed/);
console.log('notes doc ok');
