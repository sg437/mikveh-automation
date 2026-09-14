/* מעטפת מינימלית של Apps Script, כדי להריץ את קוד השרת האמיתי מחוץ לגוגל. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = '/home/user/mikveh-automation';

function makeSheet(name, rtl) {
  const rows = [];
  const sh = {
    name,
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    appendRow: (r) => { rows.push(r.slice()); },
    setFrozenRows: () => sh,
    setRightToLeft: () => sh,
    _rows: rows,
    getRange: (r, c, nr, nc) => {
      nr = nr === undefined ? 1 : nr; nc = nc === undefined ? 1 : nc;
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = rows[r - 1 + i] || [];
            const line = [];
            for (let j = 0; j < nc; j++) line.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
            out.push(line);
          }
          return out;
        },
        getValue: () => { const row = rows[r - 1] || []; return row[c - 1] === undefined ? '' : row[c - 1]; },
        // חיפוש טקסט בטווח (isDuplicate_ מחפש כך idMessage בתור הנכנס)
        createTextFinder: (text) => {
          const finder = {
            matchEntireCell: () => finder,
            matchCase: () => finder,
            matchFormulaText: () => finder,
            ignoreDiacritics: () => finder,
          };
          finder.findNext = () => {
            for (let i = 0; i < nr; i++) {
              const row = rows[r - 1 + i] || [];
              for (let j = 0; j < nc; j++) {
                if (String(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]) === String(text)) {
                  return { getRow: () => r + i, getColumn: () => c + j };
                }
              }
            }
            return null;
          };
          return finder;
        },
        setValue: (v) => { while (rows.length < r) rows.push([]); const row = rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; },
        setValues: (vals) => {
          vals.forEach((line, i) => {
            const ri = r - 1 + i;
            while (rows.length <= ri) rows.push([]);
            const row = rows[ri];
            line.forEach((v, j) => { while (row.length < c + j) row.push(''); row[c - 1 + j] = v; });
          });
        },
      };
    },
  };
  return sh;
}

function makeSpreadsheet() {
  const sheets = {};
  return {
    _sheets: sheets,
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    _add: (n, rows) => { const sh = makeSheet(n); rows.forEach((r) => sh.appendRow(r)); sheets[n] = sh; return sh; },
  };
}

function load(files, extra) {
  const ss = makeSpreadsheet();
  let uuid = 0;
  const sandbox = {
    console,
    SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss },
    Utilities: {
      getUuid: () => 'uuid-' + (++uuid).toString().padStart(4, '0') + '-aaaaaaaa',
      formatDate: (d, tz, fmt) => {
        const D = d instanceof Date ? d : new Date(d);
        const p = (n, w) => String(n).padStart(w || 2, '0');
        return fmt
          .replace("yyyy", p(D.getFullYear(), 4))
          .replace("MM", p(D.getMonth() + 1))
          .replace("dd", p(D.getDate()))
          .replace("HH", p(D.getHours()))
          .replace("mm", p(D.getMinutes()))
          .replace("ss", p(D.getSeconds()))
          .replace(/'/g, '');
      },
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (sandbox.__props[k] === undefined ? null : sandbox.__props[k]), setProperty: () => {} }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    __props: { MIKVAOT_SHEET_ID: 'sheet', NOTIFY_WHATSAPP: '', GOOGLE_CLIENT_ID: 'cid' },
    __ss: ss,
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  files.forEach((f) => {
    const code = fs.readFileSync(path.join(REPO, f), 'utf8');
    try { vm.runInContext(code, sandbox, { filename: f }); }
    catch (e) { throw new Error('failed loading ' + f + ': ' + e.message); }
  });
  if (extra) vm.runInContext(extra, sandbox, { filename: 'extra' });
  return sandbox;
}

module.exports = { load, makeSpreadsheet };
