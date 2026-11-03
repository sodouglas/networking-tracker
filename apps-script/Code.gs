/**
 * Networking Tracker: Apps Script web app (server side).
 *
 * - Serves the app to allow-listed Google accounts only.
 * - Stores data in tracker.json in the shared Drive folder (same file the Gmail sync reads).
 * - Mirrors every save into a read-only Google Sheet.
 * - Loads the app's code from the public GitHub repo via jsDelivr, pinned to the latest commit.
 *
 * Settings live in Project Settings → Script properties:
 *   FOLDER_ID       Drive folder holding tracker.json
 *   ALLOWED_EMAILS  comma-separated Google accounts allowed to open the app
 *   GITHUB_REPO     owner/repo that holds release/app.js (e.g. sodouglas/networking-tracker)
 *   GITHUB_BRANCH   optional, default "main"
 */

const DATA_FILE = 'tracker.json';
const GMAIL_LOG = 'gmail-log.json';
const SHEET_NAME = 'Networking Tracker (read-only)';
const BACKUP_DIR = 'backups';
const KEEP_DAILY_BACKUPS = 30;

// ---------- web app ----------

function doGet() {
  const email = currentUser_();
  if (!isAllowed_(email)) {
    return HtmlService.createHtmlOutput(
      '<p style="font:15px sans-serif;margin:40px">This tracker is private. Signed in as <b>' +
      escapeHtml_(email || 'unknown') + '</b>, which is not on the allowed list.</p>'
    ).setTitle('Networking Tracker');
  }
  const t = HtmlService.createTemplateFromFile('index');
  t.base = assetBase_();
  return t.evaluate()
    .setTitle('Networking Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- called from the app (google.script.run) ----------

function loadData() {
  guard_();
  const folder = folder_();
  const f = firstFile_(folder, DATA_FILE);
  const text = f ? f.getBlob().getDataAsString() : null;
  return {
    text: text,
    hash: text ? md5_(text) : '',
    emails: readGmailLog_(folder),
    user: currentUser_(),
    sheetUrl: sheetUrl_(folder),
  };
}

function getHash() {
  guard_();
  const f = firstFile_(folder_(), DATA_FILE);
  return f ? md5_(f.getBlob().getDataAsString()) : '';
}

/**
 * Save the whole tracker. baseHash is the version the app loaded; if the file changed since
 * (another device or tab), nothing is written and { conflict: true } comes back.
 * An empty baseHash forces the write ("keep mine").
 */
function saveData(text, baseHash) {
  guard_();
  const parsed = JSON.parse(text); // refuse anything that isn't valid JSON
  if (!parsed || !Array.isArray(parsed.people) || !Array.isArray(parsed.firms)) throw new Error('Not a tracker file');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const folder = folder_();
    const f = firstFile_(folder, DATA_FILE);
    const current = f ? f.getBlob().getDataAsString() : '';
    const currentHash = current ? md5_(current) : '';
    if (baseHash && current && currentHash !== baseHash) return { conflict: true, hash: currentHash };
    if (current) dailyBackup_(folder, current);
    if (f) f.setContent(text);
    else folder.createFile(DATA_FILE, text, 'application/json');
    return { ok: true, hash: md5_(text) };
  } finally {
    lock.releaseLock();
  }
}

/** tables: [{ name, headers, rows }] built by the app. Returns the sheet URL. */
function mirrorSheet(tables) {
  guard_();
  const folder = folder_();
  const ss = getOrCreateSheet_(folder);
  tables.forEach(function (t) {
    const sh = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
    sh.clearContents();
    const values = [t.headers].concat(t.rows.map(function (r) { return r.map(safeCell_); }));
    if (t.headers.length) {
      sh.getRange(1, 1, values.length, t.headers.length).setValues(values);
      sh.getRange(1, 1, 1, t.headers.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
      sh.protect().setWarningOnly(true).setDescription('Written by the Networking Tracker app. Edit in the app; changes here are overwritten.');
    }
  });
  const stray = ss.getSheetByName('Sheet1');
  if (stray && ss.getSheets().length > 1) ss.deleteSheet(stray);
  const about = ss.getSheetByName('Summary');
  if (about) about.getRange('D1').setValue('Last synced: ' + new Date().toLocaleString());
  return ss.getUrl();
}

// ---------- helpers ----------

function props_() { return PropertiesService.getScriptProperties(); }

function currentUser_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}

function isAllowed_(email) {
  const list = String(props_().getProperty('ALLOWED_EMAILS') || '').toLowerCase().split(/[\s,;]+/).filter(String);
  return !!email && list.indexOf(email) >= 0;
}

function guard_() {
  if (!isAllowed_(currentUser_())) throw new Error('Not allowed');
}

function folder_() {
  const id = props_().getProperty('FOLDER_ID');
  if (!id) throw new Error('FOLDER_ID script property is not set');
  return DriveApp.getFolderById(id);
}

function firstFile_(folder, name) {
  const it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

function md5_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function readGmailLog_(folder) {
  const f = firstFile_(folder, GMAIL_LOG);
  if (!f) return [];
  try { return JSON.parse(f.getBlob().getDataAsString()).messages || []; } catch (e) { return []; }
}

function dailyBackup_(folder, text) {
  const it = folder.getFoldersByName(BACKUP_DIR);
  const dir = it.hasNext() ? it.next() : folder.createFolder(BACKUP_DIR);
  const name = 'tracker-web-' + Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd') + '.json';
  if (dir.getFilesByName(name).hasNext()) return; // one per day: the first save of the day keeps the previous day's state
  dir.createFile(name, text, 'application/json');
  const files = [];
  const all = dir.getFiles();
  while (all.hasNext()) {
    const x = all.next();
    if (/^tracker-web-\d{4}-\d{2}-\d{2}\.json$/.test(x.getName())) files.push(x);
  }
  files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  files.slice(KEEP_DAILY_BACKUPS).forEach(function (x) { x.setTrashed(true); });
}

function sheetUrl_(folder) {
  const it = folder.getFilesByName(SHEET_NAME);
  return it.hasNext() ? it.next().getUrl() : '';
}

function getOrCreateSheet_(folder) {
  const it = folder.getFilesByName(SHEET_NAME);
  if (it.hasNext()) return SpreadsheetApp.openById(it.next().getId());
  const ss = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  return ss;
}

/** Stop text like "=HYPERLINK(...)" or "+1 ..." from being read as a formula. */
function safeCell_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

/** jsDelivr URL for release/, pinned to the branch's latest commit so updates show up within ~5 minutes. */
function assetBase_() {
  const repo = props_().getProperty('GITHUB_REPO');
  const branch = props_().getProperty('GITHUB_BRANCH') || 'main';
  if (!repo) throw new Error('GITHUB_REPO script property is not set');
  const cache = CacheService.getScriptCache();
  let ref = cache.get('ref');
  if (!ref) {
    try {
      const res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/commits/' + branch,
        { headers: { Accept: 'application/vnd.github.sha' }, muteHttpExceptions: true });
      if (res.getResponseCode() === 200) ref = res.getContentText().trim();
    } catch (e) { /* fall back below */ }
    ref = ref || props_().getProperty('LAST_REF') || branch;
    cache.put('ref', ref, 300);
    if (ref !== branch) props_().setProperty('LAST_REF', ref);
  }
  return 'https://cdn.jsdelivr.net/gh/' + repo + '@' + ref + '/release';
}
