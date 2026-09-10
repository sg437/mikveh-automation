/************************************************************************
 * כתיבה מהאפליקציה האחודה לגיליון (ApiWrite.gs)
 * ========================================================
 * POST <WebApp URL>?action=<פעולה>&token=<API_TOKEN>
 * גוף הבקשה (JSON): { user: {name, phone}, data: {...} }
 *
 * פעולות:
 *   addAction     — דיווח פעולה (ריקון מאגר, החלפת אוצר, חידוש תעודה, ביקור, תיקון...)
 *                   נרשם בלשונית "אוצר זריעה" באותו מבנה של טפסי Google.
 *   addInspection — דו"ח פיקוח מלא, נרשם בלשונית "פיקוח הלכתי" (79 עמודות, כמו הטופס).
 *   addMessage    — הודעה בדיון (כללי או על מקווה), נרשמת בלשונית "דיונים"
 *                   (נוצרת אוטומטית בגיליון המקוואות).
 *
 * כל תשובה: { ok: true, record: {...} } או { error: '...' }.
 * הרשומה המוחזרת באותו מבנה כמו ב-Api.js, כדי שהאפליקציה תציג אותה מיד.
 ************************************************************************/

const WRITE = {
  ACTIONS_SHEET: 'אוצר זריעה',
  RAW_INSPECTION_SHEET: 'פיקוח הלכתי',
  MESSAGES_SHEET: 'דיונים',
  MESSAGES_HEADERS: ['מזהה', 'זמן', 'מקווה', 'כותב', 'טלפון', 'טקסט', 'תגובה ל', 'מקור', 'קבוצה'],
  GROUPS_SHEET: 'קבוצות דיון',
  GROUPS_HEADERS: ['מזהה', 'שם', 'נושא', 'חברים (מזהי משתמש)', 'פתוחה לכולם', 'נוצרה', 'נוצרה ע"י', 'פעילה'],
  REACTIONS_SHEET: 'תגובות',
  REACTIONS_HEADERS: ['מזהה הודעה', 'משתמש', 'שם', 'אימוג\'י', 'זמן'],
  WORK_SHEET: 'שיבוצים',
  WORK_HEADERS: ['מזהה', 'זמן פתיחה', 'סוג', 'מקווה', 'סטטוס', 'נלקח ע"י', 'טלפון', 'זמן לקיחה', 'זמן ביצוע', 'הערה', 'נפתח ע"י'],
  WORK_LIMIT: 3000,
  MSG_LIMIT: 3000,
  INSPECTION_COLS: 79,
  ACTION_COLS: 22,
  MAX_TEXT: 4000,
};

function apiWritePost_(e, action) {
  try {
    const token = getProp_(API.TOKEN_PROP);
    const given = (e.parameter && e.parameter.token) || '';
    if (token && given !== token) return jsonResponse_({ error: 'unauthorized' });

    const body = JSON.parse(e.postData.contents || '{}');
    const data = body.data || {};
    const ss = apiSpreadsheet_();

    // ---- כניסה / יציאה (ללא סשן) ----
    if (action === 'login') return jsonResponse_(authLogin_(ss, data));
    if (action === 'logout') return jsonResponse_(authLogout_(ss, body.token));

    // ---- זיהוי המשתמש: סשן (כשיש משתמשים מוגדרים) או שם מהמכשיר (מצב ישן) ----
    let user;
    if (authEnabled_()) {
      user = authSession_(ss, body.token);
      if (!user) return jsonResponse_({ error: 'נדרשת כניסה עם Google', code: 'auth' });
      if (!authCan_(user, action)) return jsonResponse_({ error: 'אין לך הרשאה לפעולה זו (' + user.role + ')' });
      if (action === 'updateMe') { data._token = body.token; return jsonResponse_(authUpdateMe_(ss, data, user)); }
    } else {
      user = body.user || {};
      user.name = String(user.name || '').trim().slice(0, 80);
      user.phone = String(user.phone || '').trim().slice(0, 30);
      if (!user.name) return jsonResponse_({ error: 'חסר שם משתמש (הגדרות ➜ המשתמש שלי)' });
    }

    if (action === 'addMedia') return jsonResponse_(addMedia_(ss, data, user)); // בלי נעילה – העלאה איטית
    if (['users', 'addUser', 'updateUser'].indexOf(action) >= 0) return jsonResponse_(authAdmin_(ss, action, data, user));

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (action === 'addAction') return jsonResponse_(writeAction_(ss, data, user));
      if (action === 'addInspection') return jsonResponse_(writeInspection_(ss, data, user));
      if (action === 'addMessage') return jsonResponse_(writeMessage_(ss, data, user));
      if (action === 'addWorkItems') return jsonResponse_(addWorkItems_(ss, data, user));
      if (action === 'updateWorkItem') return jsonResponse_(updateWorkItem_(ss, data, user));
      if (action === 'updateMikveh') return jsonResponse_(updateMikveh_(ss, data, user));
      if (action === 'addMikveh') return jsonResponse_(addMikveh_(ss, data, user));
      if (action === 'addGroup') return jsonResponse_(addGroup_(ss, data, user));
      if (action === 'updateGroup') return jsonResponse_(updateGroup_(ss, data, user));
      if (action === 'react') return jsonResponse_(react_(ss, data, user));
    } finally {
      lock.releaseLock();
    }
    return jsonResponse_({ error: 'unknown action: ' + action });
  } catch (err) {
    return jsonResponse_({ error: String(err && err.message || err) });
  }
}

// ==================== עזרים ====================

/** שם המקווה הקנוני מבסיס הנתונים (לפי השוואה מנורמלת), או null. */
function canonicalMikveh_(ss, name) {
  const key = apiNorm_(name);
  if (!key) return null;
  const sh = ss.getSheetByName(API.SHEETS.master);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const names = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < names.length; i++) {
    const n = apiClean_(names[i][0]);
    if (n && apiNorm_(n) === key) return n;
  }
  return null;
}

function txt_(v, max) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) v = v.filter(Boolean).join(', ');
  return String(v).trim().slice(0, max || WRITE.MAX_TEXT);
}

/** "YYYY-MM-DD" (או ISO) -> Date בצהריים (כדי שלא יזוז יום בגלל אזור זמן), אחרת עכשיו. */
function dateOf_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date();
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  return isNaN(d) ? new Date() : d;
}

// ==================== פעולה ====================

function writeAction_(ss, d, user) {
  const mikveh = canonicalMikveh_(ss, d.mikveh);
  if (!mikveh) return { error: 'המקווה "' + txt_(d.mikveh, 80) + '" לא נמצא בבסיס הנתונים' };
  const action = txt_(d.action, 60);
  if (!action) return { error: 'חסר סוג פעולה' };
  const sh = ss.getSheetByName(WRITE.ACTIONS_SHEET);
  if (!sh) return { error: 'הלשונית "' + WRITE.ACTIONS_SHEET + '" לא נמצאה' };

  const when = d.date ? dateOf_(d.date) : new Date();
  const row = [];
  for (let i = 0; i < WRITE.ACTION_COLS; i++) row.push('');
  row[0] = when;
  row[1] = txt_(d.rabbi, 80) || user.name;
  row[2] = mikveh;
  row[3] = txt_(d.attendant, 80);
  row[4] = txt_(d.phone, 40) || user.phone;
  row[5] = action;
  row[6] = txt_(d.otzar, 20);
  row[7] = txt_(d.drained, 200);
  row[8] = txt_(d.sealed, 40);
  row[9] = txt_(d.filled, 60);
  row[10] = txt_(d.note);
  row[12] = txt_(d.roofDone, 200);
  row[13] = txt_(d.roofSealed, 40);
  row[14] = txt_(d.reservoirSealed, 40);
  row[15] = txt_(d.note2);
  row[19] = d.liters ? Number(d.liters) || '' : '';
  row[20] = txt_(d.validMonth, 20);
  row[21] = txt_(d.validYear, 20);
  sh.appendRow(row);

  const record = apiCompact_({
    ts: apiIsoDate_(when), rabbi: row[1], mikveh: mikveh, attendant: row[3], phone: row[4], action: action, otzar: row[6],
    drained: row[7], sealed: row[8], filled: row[9], note: row[10], roofDone: row[12], roofSealed: row[13],
    reservoirSealed: row[14], note2: row[15], liters: row[19] || null, validMonth: row[20], validYear: row[21],
    mikvehId: apiNorm_(mikveh), source: 'app', by: user.name,
  });
  return { ok: true, record: record };
}

// ==================== דו"ח פיקוח ====================

function writeInspection_(ss, d, user) {
  const mikveh = canonicalMikveh_(ss, d.mikveh);
  if (!mikveh) return { error: 'המקווה "' + txt_(d.mikveh, 80) + '" לא נמצא בבסיס הנתונים' };
  const sh = ss.getSheetByName(WRITE.RAW_INSPECTION_SHEET);
  if (!sh) return { error: 'הלשונית "' + WRITE.RAW_INSPECTION_SHEET + '" לא נמצאה' };
  const src = Array.isArray(d.row) ? d.row : [];
  const when = d.date ? dateOf_(d.date) : new Date();
  const row = [];
  for (let i = 0; i < WRITE.INSPECTION_COLS; i++) row.push(txt_(src[i], 1000));
  row[0] = mikveh;
  row[1] = when;
  row[2] = txt_(d.rabbi, 80) || user.name;
  row[3] = txt_(d.contact, 80);
  row[4] = txt_(d.phone, 40);
  sh.appendRow(row);
  return { ok: true, record: { ts: apiIsoDate_(when), mikveh: mikveh, mikvehId: apiNorm_(mikveh), rabbi: row[2], by: user.name } };
}

// ==================== דיונים ====================

function messagesSheet_(ss) {
  let sh = ss.getSheetByName(WRITE.MESSAGES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WRITE.MESSAGES_SHEET);
    sh.appendRow(WRITE.MESSAGES_HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function writeMessage_(ss, d, user) {
  const text = txt_(d.text);
  if (!text) return { error: 'הודעה ריקה' };
  let mikveh = '';
  if (d.mikveh) {
    mikveh = canonicalMikveh_(ss, d.mikveh);
    if (!mikveh) return { error: 'המקווה "' + txt_(d.mikveh, 80) + '" לא נמצא בבסיס הנתונים' };
  }
  const group = txt_(d.group, 60);
  if (group && !d._system) {
    const g = apiGroups_(ss).filter(function (x) { return x.id === group; })[0];
    if (!g) return { error: 'הקבוצה לא נמצאה' };
    if (!g.open && user.id && g.members.indexOf(user.id) < 0) return { error: 'אינך חבר/ה בקבוצה הזו' };
  }
  const sh = messagesSheet_(ss);
  const id = Utilities.getUuid();
  const now = new Date();
  sh.appendRow([id, now, mikveh, user.name, user.phone, text, txt_(d.replyTo, 60), 'app', group]);
  // אזכור @שם ➜ התראה אישית
  if (text.indexOf('@') >= 0 && !d._system) {
    const mentioned = authUsers_(ss).filter(function (u) { return u.active && u.phone && u.name && text.indexOf('@' + u.name) >= 0 && u.name !== user.name; });
    if (mentioned.length) notifyUsers_(mentioned, '💬 ' + user.name + ' הזכיר/ה אותך ב' + (mikveh ? 'דיון על ' + mikveh : 'דיון הכללי') + ':\n' + text.slice(0, 300) + '\n\nלתגובה: פתח/י את מערכת המקוואות ➜ דיונים');
  }
  return { ok: true, record: { id: id, ts: apiIsoDate_(now), mikveh: mikveh || null, mikvehId: mikveh ? apiNorm_(mikveh) : null, group: group || null, author: user.name, authorId: user.id || null, phone: user.phone, text: text, replyTo: txt_(d.replyTo, 60) || null, source: 'app' } };
}

/** כל ההודעות (עד MSG_LIMIT האחרונות), בסדר עולה. since = ISO: רק הודעות חדשות ממנו. */
function apiMessages_(ss, since) {
  const sh = ss.getSheetByName(WRITE.MESSAGES_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow();
  const first = Math.max(2, last - WRITE.MSG_LIMIT + 1);
  const values = sh.getRange(first, 1, last - first + 1, WRITE.MESSAGES_HEADERS.length).getValues();
  const out = [];
  values.forEach(function (v) {
    const ts = apiIso_(v[1]);
    if (!ts || !v[0]) return;
    if (since && ts <= since) return;
    out.push(apiCompact_({
      id: String(v[0]), ts: ts, mikveh: apiClean_(v[2]), author: apiClean_(v[3]), phone: apiClean_(v[4]),
      text: apiClean_(v[5]), replyTo: apiClean_(v[6]), source: apiClean_(v[7]) || 'app', group: apiClean_(v[8]),
    }));
  });
  if (since) {
    // קישור למקווה גם בתשובה החלקית
    const ids = {};
    apiMikvaot_(ss).forEach(function (m) { ids[apiNorm_(m.name)] = m.id; });
    out.forEach(function (r) { const mid = ids[apiNorm_(r.mikveh)]; if (mid) r.mikvehId = mid; });
  }
  return out;
}

// ==================== חלוקת עבודה (שיבוצים) ====================

const WORK_TYPES = { fill: 'מילוי מאגר / החלפת אוצר', cert: 'חידוש תעודה', other: 'משימה' };

function workSheet_(ss) {
  let sh = ss.getSheetByName(WRITE.WORK_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WRITE.WORK_SHEET);
    sh.appendRow(WRITE.WORK_HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function workRecord_(v) {
  return apiCompact_({
    id: String(v[0]), ts: apiIso_(v[1]), type: apiClean_(v[2]) || 'other', mikveh: apiClean_(v[3]), status: apiClean_(v[4]) || 'open',
    takenBy: apiClean_(v[5]), takenPhone: apiClean_(v[6]), takenAt: apiIso_(v[7]), doneAt: apiIso_(v[8]), note: apiClean_(v[9]), by: apiClean_(v[10]),
  });
}

/** פתיחת משימות לחלוקה + הודעת מערכת בדיון הכללי. data.items = [{mikveh, type, note}] */
function addWorkItems_(ss, d, user) {
  const items = Array.isArray(d.items) ? d.items.slice(0, 200) : [];
  if (!items.length) return { error: 'לא נבחרו מקוואות' };
  const sh = workSheet_(ss);
  const now = new Date();
  const records = [], names = [];
  items.forEach(function (it) {
    const mikveh = canonicalMikveh_(ss, it.mikveh);
    if (!mikveh) return;
    const type = WORK_TYPES[it.type] ? it.type : 'other';
    const id = Utilities.getUuid();
    sh.appendRow([id, now, type, mikveh, 'open', '', '', '', '', txt_(it.note, 200), user.name]);
    records.push({ id: id, ts: apiIsoDate_(now), type: type, mikveh: mikveh, mikvehId: apiNorm_(mikveh), status: 'open', note: txt_(it.note, 200) || null, by: user.name });
    names.push(mikveh);
  });
  if (!records.length) return { error: 'אף מקווה לא נמצא בבסיס הנתונים' };
  const typeLabel = WORK_TYPES[records[0].type];
  const text = '📋 ' + user.name + ' פתח/ה ' + records.length + ' משימות לחלוקה (' + typeLabel + '): ' + names.join(', ') + '.\nלבחירה: מסך "חלוקת עבודה" ➜ "אני לוקח".';
  const msg = writeMessage_(ss, { mikveh: '', text: text, _system: true }, { name: user.name, phone: user.phone });
  if (msg.record) msg.record.source = 'system';
  // התראה למפקחים ולמנהלים (חוץ מהפותח)
  notifyUsers_(authUsers_(ss).filter(function (u) { return u.active && u.phone && (u.role === 'מפקח' || u.role === 'מנהל') && u.name !== user.name; }),
    '📋 ' + user.name + ' פתח/ה ' + records.length + ' משימות לחלוקה (' + typeLabel + '): ' + names.slice(0, 15).join(', ') + (names.length > 15 ? ' ועוד' : '') + '\n\nלבחירה: מערכת המקוואות ➜ חלוקת עבודה ➜ "אני לוקח"');
  return { ok: true, records: records, message: msg.record || null };
}

/** עדכון סטטוס: taken (המשתמש לוקח), open (שחרור), done (בוצע). */
function updateWorkItem_(ss, d, user) {
  const sh = workSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return { error: 'המשימה לא נמצאה' };
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let rowNum = -1;
  for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(d.id)) { rowNum = i + 2; break; } }
  if (rowNum < 0) return { error: 'המשימה לא נמצאה' };
  const status = ['open', 'taken', 'done'].indexOf(d.status) >= 0 ? d.status : 'taken';
  const now = new Date();
  const row = sh.getRange(rowNum, 1, 1, WRITE.WORK_HEADERS.length).getValues()[0];
  if (status === 'taken') { row[5] = user.name; row[6] = user.phone; row[7] = now; row[8] = ''; }
  if (status === 'open') { row[5] = ''; row[6] = ''; row[7] = ''; row[8] = ''; }
  if (status === 'done') { if (!row[5]) { row[5] = user.name; row[6] = user.phone; row[7] = now; } row[8] = now; }
  row[4] = status;
  if (d.note !== undefined) row[9] = txt_(d.note, 200);
  sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
  const rec = workRecord_(row);
  rec.mikvehId = apiNorm_(rec.mikveh);
  // הודעת מערכת בדיון הכללי כדי שכולם יראו מי לקח מה
  const m = String(rec.mikveh || '');
  const text = status === 'taken' ? '✋ ' + user.name + ' לוקח/ת: ' + m + ' (' + WORK_TYPES[rec.type] + ')'
    : status === 'done' ? '✅ ' + user.name + ' סיים/ה: ' + m + ' (' + WORK_TYPES[rec.type] + ')'
    : '↩️ ' + user.name + ' שחרר/ה: ' + m;
  const msg = writeMessage_(ss, { mikveh: '', text: text, _system: true }, user);
  if (msg.record) msg.record.source = 'system';
  // התראה למי שפתח את המשימה
  if (rec.by && rec.by !== user.name) {
    notifyUsers_(authUsers_(ss).filter(function (u) { return u.active && u.phone && u.name === rec.by; }), text);
  }
  return { ok: true, record: rec, message: msg.record || null };
}

/** כל המשימות (עד WORK_LIMIT האחרונות). */
function apiWork_(ss) {
  const sh = ss.getSheetByName(WRITE.WORK_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow();
  const first = Math.max(2, last - WRITE.WORK_LIMIT + 1);
  const values = sh.getRange(first, 1, last - first + 1, WRITE.WORK_HEADERS.length).getValues();
  const out = [];
  values.forEach(function (v) { if (v[0]) out.push(workRecord_(v)); });
  return out;
}

// ==================== פרטי המקווה (בסיס הנתונים) ====================

/** שדות שמותר לערוך מהאפליקציה: מפתח -> עמודה (0-based) בלשונית "בסיס הנתונים".
 *  עמודות התאריכים והתעודה (7, 8, 14, 17, 20, 37+) מחושבות בגיליון ולא נערכות כאן. */
const MIKVEH_EDITABLE = {
  council: 1, place: 2, address: 3, activity: 4, supervised: 5, notes: 6, attendant: 9, phone: 10, mikvehPhone: 11,
  ownership: 12, reservoir: 13, otzarLocation: 15, otzarZeria: 16, otzarHashaka: 18, hashakaType: 19, chabadReplaced: 21,
  filter: 22, kelim: 23, masterKey: 24, masterKeyWhich: 25, socket: 26, hoseTap: 27, localityType: 28, region: 29,
  hoursSummer: 30, hoursWinter: 31, hoursErev: 32, hoursMotzash: 33, accessibility: 34, coordination: 35, notes2: 36,
};

function mikvehRow_(ss, name) {
  const key = apiNorm_(name);
  const sh = ss.getSheetByName(API.SHEETS.master);
  const last = sh.getLastRow();
  const names = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < names.length; i++) {
    const n = apiClean_(names[i][0]);
    if (n && apiNorm_(n) === key) return { sh: sh, rowNum: i + 2, name: n };
  }
  return null;
}

function applyMikvehFields_(sh, rowNum, fields) {
  const changed = [];
  Object.keys(fields || {}).forEach(function (k) {
    const col = MIKVEH_EDITABLE[k];
    if (col === undefined) return;
    sh.getRange(rowNum, col + 1).setValue(txt_(fields[k], 500));
    changed.push(k);
  });
  return changed;
}

function updateMikveh_(ss, d, user) {
  if (user.role && ['מנהל', 'מפקח'].indexOf(user.role) < 0) return { error: 'עריכת פרטים למנהל ולמפקח בלבד' };
  const r = mikvehRow_(ss, d.mikveh);
  if (!r) return { error: 'המקווה "' + txt_(d.mikveh, 80) + '" לא נמצא' };
  const changed = applyMikvehFields_(r.sh, r.rowNum, d.fields);
  if (!changed.length) return { error: 'לא נשלחו שדות לעדכון' };
  const labels = {};
  API_MASTER_FIELDS.forEach(function (f) { labels[f[1]] = f[2]; });
  const text = '✏️ ' + user.name + ' עדכן/ה פרטים: ' + changed.map(function (k) { return labels[k] || k; }).join(', ');
  const msg = writeMessage_(ss, { mikveh: r.name, text: text, _system: true }, user);
  if (msg.record) msg.record.source = 'system';
  return { ok: true, changed: changed, message: msg.record || null };
}

function addMikveh_(ss, d, user) {
  if (user.role && ['מנהל', 'מפקח'].indexOf(user.role) < 0) return { error: 'הוספת מקווה למנהל ולמפקח בלבד' };
  const name = txt_(d.name, 120);
  if (!name) return { error: 'חסר שם מקווה' };
  if (mikvehRow_(ss, name)) return { error: 'כבר קיים מקווה בשם הזה' };
  const sh = ss.getSheetByName(API.SHEETS.master);
  const row = [];
  for (let i = 0; i < 37; i++) row.push('');
  row[0] = name;
  Object.keys(d.fields || {}).forEach(function (k) { const col = MIKVEH_EDITABLE[k]; if (col !== undefined) row[col] = txt_(d.fields[k], 500); });
  sh.appendRow(row);
  const rec = { id: apiNorm_(name), name: name };
  API_MASTER_FIELDS.forEach(function (f) { if (f[0] < row.length && row[f[0]] !== '') rec[f[1]] = row[f[0]]; });
  const msg = writeMessage_(ss, { mikveh: name, text: '🆕 ' + user.name + ' הוסיף/ה את המקווה למערכת', _system: true }, user);
  if (msg.record) msg.record.source = 'system';
  return { ok: true, record: rec, message: msg.record || null };
}

// ==================== קבוצות דיון ====================

function groupsSheet_(ss) {
  let sh = ss.getSheetByName(WRITE.GROUPS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WRITE.GROUPS_SHEET);
    sh.appendRow(WRITE.GROUPS_HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function apiGroups_(ss) {
  const sh = ss.getSheetByName(WRITE.GROUPS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, WRITE.GROUPS_HEADERS.length).getValues();
  const out = [];
  values.forEach(function (v, i) {
    if (!v[0]) return;
    out.push({ id: String(v[0]), name: apiClean_(v[1]) || '', topic: apiClean_(v[2]) || '',
      members: String(v[3] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
      open: String(v[4]) === 'כן', ts: apiIso_(v[5]), by: apiClean_(v[6]) || '', active: String(v[7]) !== 'לא', rowNum: i + 2 });
  });
  return out.filter(function (g) { return g.active; }).map(function (g) { delete g.rowNum; return g; });
}

function addGroup_(ss, d, user) {
  const name = txt_(d.name, 80);
  if (!name) return { error: 'חסר שם קבוצה' };
  const sh = groupsSheet_(ss);
  const id = Utilities.getUuid().slice(0, 8);
  const members = (Array.isArray(d.members) ? d.members : []).map(function (x) { return String(x).trim(); }).filter(Boolean);
  if (user.id && members.indexOf(user.id) < 0) members.push(user.id);
  const now = new Date();
  sh.appendRow([id, name, txt_(d.topic, 200), members.join(','), d.open ? 'כן' : 'לא', now, user.name, 'כן']);
  const rec = { id: id, name: name, topic: txt_(d.topic, 200), members: members, open: !!d.open, ts: apiIsoDate_(now), by: user.name, active: true };
  // התראה לחברים
  const users = authUsers_(ss).filter(function (u) { return u.active && u.phone && members.indexOf(u.id) >= 0 && u.name !== user.name; });
  notifyUsers_(users, '👥 ' + user.name + ' צירף/ה אותך לקבוצת הדיון "' + name + '"' + (rec.topic ? ' (' + rec.topic + ')' : '') + '\n\nמערכת המקוואות ➜ דיונים');
  return { ok: true, record: rec };
}

function updateGroup_(ss, d, user) {
  const sh = groupsSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return { error: 'הקבוצה לא נמצאה' };
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let rowNum = -1;
  for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(d.id)) { rowNum = i + 2; break; } }
  if (rowNum < 0) return { error: 'הקבוצה לא נמצאה' };
  const row = sh.getRange(rowNum, 1, 1, WRITE.GROUPS_HEADERS.length).getValues()[0];
  if (user.role && user.role !== 'מנהל' && apiClean_(row[6]) !== user.name) return { error: 'רק מי שפתח/ה את הקבוצה או מנהל יכולים לערוך אותה' };
  if (d.name) row[1] = txt_(d.name, 80);
  if (d.topic !== undefined) row[2] = txt_(d.topic, 200);
  if (Array.isArray(d.members)) row[3] = d.members.map(function (x) { return String(x).trim(); }).filter(Boolean).join(',');
  if (d.open !== undefined) row[4] = d.open ? 'כן' : 'לא';
  if (d.active !== undefined) row[7] = d.active ? 'כן' : 'לא';
  sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
  return { ok: true, record: { id: String(row[0]), name: apiClean_(row[1]), topic: apiClean_(row[2]),
    members: String(row[3] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean), open: String(row[4]) === 'כן',
    ts: apiIso_(row[5]), by: apiClean_(row[6]), active: String(row[7]) !== 'לא' } };
}

// ==================== תגובות (אימוג'י) ====================

function reactionsSheet_(ss) {
  let sh = ss.getSheetByName(WRITE.REACTIONS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WRITE.REACTIONS_SHEET);
    sh.appendRow(WRITE.REACTIONS_HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

/** מוסיף או מסיר תגובה (לחיצה שנייה על אותו אימוג'י מסירה). */
function react_(ss, d, user) {
  const msgId = txt_(d.messageId, 60), emoji = txt_(d.emoji, 8);
  if (!msgId || !emoji) return { error: 'חסרים פרטים' };
  const sh = reactionsSheet_(ss);
  const uid = user.id || user.name;
  const last = sh.getLastRow();
  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, 4).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === msgId && String(values[i][1]) === String(uid) && String(values[i][3]) === emoji) {
        sh.deleteRow(i + 2);
        return { ok: true, removed: true, record: { messageId: msgId, userId: uid, name: user.name, emoji: emoji } };
      }
    }
  }
  sh.appendRow([msgId, uid, user.name, emoji, new Date()]);
  return { ok: true, record: { messageId: msgId, userId: uid, name: user.name, emoji: emoji } };
}

function apiReactions_(ss) {
  const sh = ss.getSheetByName(WRITE.REACTIONS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, WRITE.REACTIONS_HEADERS.length).getValues();
  const out = [];
  values.forEach(function (v) { if (v[0]) out.push({ messageId: String(v[0]), userId: String(v[1]), name: apiClean_(v[2]) || '', emoji: String(v[3]) }); });
  return out;
}
