/************************************************************************
 * מערכת כשרות המקוואות — API לאפליקציה האחודה (Api.gs)
 * ========================================================
 * מגיש לאפליקציה (app/) את כל הנתונים כ-JSON, ישירות מהגיליונות:
 *   - גיליון המקוואות (בסיס הנתונים, פעולות, פיקוח, משימות, פקקים)
 *   - יומן הדיווחים מהוואטסאפ (הגיליון של מערכת V2, שאליו הסקריפט מחובר)
 *
 * הגדרות (Script Properties):
 *   MIKVAOT_SHEET_ID — מזהה גיליון המקוואות (מהכתובת: /spreadsheets/d/<ID>/edit)
 *   API_TOKEN        — (רשות) טוקן שהאפליקציה שולחת ב-?token=. ריק = ללא אימות.
 *
 * כתובות:
 *   <WebApp URL>?action=data      — כל הנתונים (מקוואות + וואטסאפ)
 *   <WebApp URL>?action=whatsapp  — רק דיווחי הוואטסאפ
 *   <WebApp URL>?action=ping      — בדיקת הגדרות
 *
 * מבנה ה-JSON זהה ל-app/data.js (tools/export_excel.py), כך שהאפליקציה
 * עובדת אותו דבר מול קובץ סטטי ומול הגיליון החי.
 ************************************************************************/

const API = {
  SHEET_ID_PROP: 'MIKVAOT_SHEET_ID',
  TOKEN_PROP: 'API_TOKEN',
  SHEETS: {
    master: 'בסיס הנתונים',
    actions: 'אוצר זריעה',
    inspections: 'פיקוח הלכתי מערכת',
    tasks: 'משימות לריקון והחלפת מי גשמים',
    plugs: '-פקקים מילוי חוזר',
  },
  WA_LIMIT: 3000, // כמה דיווחי וואטסאפ אחרונים להחזיר
};

// שדות כרטיס המקווה: [עמודה (0-based), מפתח, כותרת]
const API_MASTER_FIELDS = [
  [0, 'name', 'שם המקוה'], [1, 'council', 'מועצה'], [2, 'place', 'מקום'], [3, 'address', 'כתובת'],
  [4, 'activity', 'פעילות המקוה'], [5, 'supervised', 'בפיקוח'], [6, 'notes', 'הערות'],
  [7, 'certificate', 'תוקף תעודה'], [8, 'lastVisit', 'ביקור אחרון'], [9, 'attendant', 'שם הבלנית / אחראי'],
  [10, 'phone', 'טלפון'], [11, 'mikvehPhone', 'טלפון מקווה'], [12, 'ownership', 'בעלות'],
  [13, 'reservoir', 'מאגר'], [14, 'reservoirEmptied', 'ריקון מאגר אחרון'], [15, 'otzarLocation', 'מיקום האוצרות'],
  [16, 'otzarZeria', 'אוצר זריעה'], [17, 'zeriaReplaced', 'החלפת זריעה אחרונה'], [18, 'otzarHashaka', 'אוצר השקה'],
  [19, 'hashakaType', 'סוג השקה'], [20, 'hashakaReplaced', 'החלפת השקה אחרונה'], [21, 'chabadReplaced', 'החלפת אוצר חב"ד'],
  [22, 'filter', 'פילטר'], [23, 'kelim', 'מקוה כלים'], [24, 'masterKey', 'מפתח מסטר'], [25, 'masterKeyWhich', 'איזה מפתח'],
  [26, 'socket', 'שקע ליד האוצרות'], [27, 'hoseTap', 'ברז לצינור'], [28, 'localityType', 'מושב/עיר'], [29, 'region', 'איזור'],
  [30, 'hoursSummer', 'שעות פתיחה קיץ'], [31, 'hoursWinter', 'שעות פתיחה חורף'], [32, 'hoursErev', 'שעות פתיחה ערב שבת וחג'],
  [33, 'hoursMotzash', 'שעות פתיחה מוצ"ש ויו"ט'], [34, 'accessibility', 'רמת הנגשה'], [35, 'coordination', 'תאום מראש'],
  [36, 'notes2', 'הערות נוספות'], [47, 'lastInspection', 'פיקוח אחרון'], [49, 'oldListDate', 'רשימה ישנה'],
];

// מדורי דוח הפיקוח: [מפתח, כותרת, עמודה ראשונה, עמודה אחרונה (לא כולל)]
const API_INSPECTION_SECTIONS = [
  ['roof', 'גג', 15, 22], ['reservoir', 'מאגר', 22, 30], ['zeria', 'אוצר זריעה', 30, 40],
  ['hashaka', 'אוצר השקה', 40, 48], ['bor', 'בור טבילה', 48, 61], ['technical', 'טכני ומבנה', 61, 77],
  ['chabad', "אוצר השקה חב''ד", 77, 84],
];

// ==================== נקודת כניסה ====================

function apiHandle_(e, action) {
  try {
    const token = getProp_(API.TOKEN_PROP);
    const given = (e.parameter && e.parameter.token) || '';
    if (token && given !== token) {
      return jsonResponse_({ error: 'unauthorized' });
    }
    if (action === 'ping') return jsonResponse_(apiPing_());
    if (action === 'whatsapp') return jsonResponse_({ whatsapp: apiWhatsapp_() });
    if (action === 'messages') return jsonResponse_({ messages: apiMessages_(apiSpreadsheet_(), (e.parameter && e.parameter.since) || '') });
    if (action === 'sync') {
      const ss = apiSpreadsheet_();
      const ids = {};
      apiMikvaot_(ss).forEach(function (m) { ids[apiNorm_(m.name)] = m.id; });
      const work = apiWork_(ss);
      work.forEach(function (w) { const mid = ids[apiNorm_(w.mikveh)]; if (mid) w.mikvehId = mid; });
      return jsonResponse_({ messages: apiMessages_(ss, (e.parameter && e.parameter.since) || ''), work: work });
    }
    if (action === 'data') return jsonResponse_(apiBuildData_());
    return jsonResponse_({ error: 'unknown action: ' + action });
  } catch (err) {
    return jsonResponse_({ error: String(err && err.message || err) });
  }
}

function apiPing_() {
  const id = getProp_(API.SHEET_ID_PROP);
  const out = { ok: true, mikvaotSheet: !!id, tokenRequired: !!getProp_(API.TOKEN_PROP), time: new Date().toISOString() };
  if (id) {
    const ss = SpreadsheetApp.openById(id);
    out.mikvaotSheetName = ss.getName();
    out.sheets = Object.keys(API.SHEETS).map(function (k) {
      const sh = ss.getSheetByName(API.SHEETS[k]);
      return { key: k, name: API.SHEETS[k], found: !!sh, rows: sh ? sh.getLastRow() : 0 };
    });
  }
  return out;
}

/** גיליון המקוואות (לפי MIKVAOT_SHEET_ID). */
function apiSpreadsheet_() {
  const id = getProp_(API.SHEET_ID_PROP);
  if (!id) throw new Error('המאפיין MIKVAOT_SHEET_ID לא מוגדר ב-Script Properties');
  return SpreadsheetApp.openById(id);
}

/** בונה את כל חבילת הנתונים. */
function apiBuildData_() {
  const ss = apiSpreadsheet_();

  const mikvaot = apiMikvaot_(ss);
  const actions = apiActions_(ss);
  const inspections = apiInspections_(ss);
  const tasks = apiTasks_(ss);
  const plugs = apiPlugs_(ss);
  const whatsapp = apiWhatsapp_();
  const messages = apiMessages_(ss, '');
  const work = apiWork_(ss);

  // קישור לפי שם מקווה מנורמל
  const ids = {};
  mikvaot.forEach(function (m) { ids[apiNorm_(m.name)] = m.id; });
  [actions, inspections, tasks, whatsapp, messages, work].forEach(function (coll) {
    coll.forEach(function (rec) {
      const mid = ids[apiNorm_(rec.mikveh)];
      if (mid) rec.mikvehId = mid;
    });
  });

  const labels = {};
  API_MASTER_FIELDS.forEach(function (f) { labels[f[1]] = f[2]; });
  return {
    meta: {
      exportedAt: new Date().toISOString(),
      source: 'sheet',
      spreadsheet: ss.getName(),
      counts: { mikvaot: mikvaot.length, actions: actions.length, inspections: inspections.length, tasks: tasks.length, whatsapp: whatsapp.length, messages: messages.length },
      fieldLabels: labels,
    },
    mikvaot: mikvaot, actions: actions, inspections: inspections, tasks: tasks, plugs: plugs, whatsapp: whatsapp, messages: messages, work: work,
  };
}

// ==================== קריאת הגיליונות ====================

function apiRows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('הלשונית "' + name + '" לא נמצאה בגיליון המקוואות');
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1) return [];
  return sh.getRange(1, 1, lastRow, lastCol).getValues();
}

function apiMikvaot_(ss) {
  const rows = apiRows_(ss, API.SHEETS.master);
  const out = [], seen = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = apiClean_(r[0]);
    if (!name) continue;
    const rec = {};
    API_MASTER_FIELDS.forEach(function (f) { rec[f[1]] = f[0] < r.length ? apiClean_(r[f[0]]) : null; });
    const code = apiNum_(r[50]);
    rec.code = typeof code === 'number' ? String(code) : null;
    rec.id = apiNorm_(name);
    if (seen[rec.id]) rec.id += ' (' + (i + 1) + ')';
    seen[rec.id] = true;
    rec.certificateDate = apiIso_(r[46]);
    rec.lastInspectionDate = apiIso_(r[45]);
    rec.lastRenewalDate = apiIso_(r[44]);
    out.push(rec);
  }
  return out;
}

function apiActions_(ss) {
  const rows = apiRows_(ss, API.SHEETS.actions);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const ts = apiIso_(r[0]), name = apiClean_(r[2]);
    if (!name && !ts) continue;
    const rec = apiCompact_({
      ts: ts, rabbi: apiClean_(r[1]), mikveh: name, attendant: apiClean_(r[3]), phone: apiClean_(r[4]),
      action: (apiClean_(r[5]) || '').trim(), otzar: apiClean_(r[6]), drained: apiClean_(r[7]), sealed: apiClean_(r[8]),
      filled: apiClean_(r[9]), note: apiClean_(r[10]), roofDone: apiClean_(r[12]), roofSealed: apiClean_(r[13]),
      reservoirSealed: apiClean_(r[14]), note2: apiClean_(r[15]), liters: apiNum_(r[19]),
      validMonth: apiClean_(r[20]), validYear: apiClean_(r[21]),
    });
    out.push(rec);
  }
  out.sort(function (a, b) { return (a.ts || '') < (b.ts || '') ? -1 : 1; });
  return out;
}

function apiInspections_(ss) {
  const rows = apiRows_(ss, API.SHEETS.inspections);
  const hdr = rows[0].map(function (h) { return (apiClean_(h) || '').trim(); });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const ts = apiIso_(r[1]), name = apiClean_(r[0]);
    if (!ts || !name) continue;
    const sections = API_INSPECTION_SECTIONS.map(function (s) {
      const fields = [];
      for (let c = s[2]; c < s[3] && c < r.length; c++) {
        const v = apiClean_(r[c]);
        if (v !== null) fields.push([hdr[c], v]);
      }
      return { key: s[0], title: s[1], fields: fields };
    });
    out.push({
      ts: ts, hebDate: apiClean_(r[8]), mikveh: name, council: apiClean_(r[9]), rabbi: apiClean_(r[12]),
      contact: apiClean_(r[13]), phone: apiClean_(r[14]),
      urgent: apiNum_(r[3]) || 0, needed: apiNum_(r[4]) || 0,
      reservoirEmpty: apiClean_(r[5]), zeriaReplace: apiClean_(r[6]), hashakaReplace: apiClean_(r[7]), chabadReplace: apiClean_(r[90]),
      sections: sections, guidance: apiClean_(r[84]), address: apiClean_(r[89]),
      lastReplaced: { zeria: apiClean_(r[85]), hashaka: apiClean_(r[86]), reservoir: apiClean_(r[87]), chabad: apiClean_(r[88]) },
      repairs: { reservoir: apiNum_(r[92]) || 0, zeria: apiNum_(r[93]) || 0, hashaka: apiNum_(r[95]) || 0, chabad: apiNum_(r[97]) || 0, bor: apiNum_(r[99]) || 0, roof: apiNum_(r[100]) || 0 },
    });
  }
  out.sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
  return out;
}

function apiTasks_(ss) {
  const rows = apiRows_(ss, API.SHEETS.tasks);
  const out = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const name = apiClean_(r[11]);
    if (!name) continue;
    out.push({
      mikveh: name, council: apiClean_(r[12]), action: apiClean_(r[13]), priority: apiClean_(r[14]), state: apiClean_(r[15]),
      repairs: apiNum_(r[16]) || 0, roofRepairs: apiNum_(r[17]) || 0, reservoir: apiClean_(r[18]),
      needsEmptying: apiClean_(r[19]), roofPlug: apiClean_(r[20]),
    });
  }
  return out;
}

function apiPlugs_(ss) {
  const rows = apiRows_(ss, API.SHEETS.plugs);
  const groups = {
    openOnRoof: { title: 'פקק על הגג', cols: [0, 1, 2, 4, null] },
    openForFill: { title: 'פקק פתוח למילוי', cols: [5, 6, 7, null, 8] },
    needRefill: { title: 'טעון מילוי חוזר', cols: [9, 10, 11, null, 12] },
  };
  const out = {};
  Object.keys(groups).forEach(function (k) {
    const c = groups[k].cols, items = [];
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      const name = c[1] < r.length ? apiClean_(r[c[1]]) : null;
      if (!name) continue;
      items.push({
        hebDate: apiClean_(r[c[0]]), mikveh: name, council: apiClean_(r[c[2]]),
        note: c[3] !== null ? apiClean_(r[c[3]]) : null, otzar: c[4] !== null ? apiClean_(r[c[4]]) : null,
      });
    }
    out[k] = { title: groups[k].title, items: items };
  });
  return out;
}

/** דיווחי הוואטסאפ מלשונית "יומן דיווחים" (הגיליון של מערכת V2). */
function apiWhatsapp_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.REPORT_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow();
  const first = Math.max(2, last - API.WA_LIMIT + 1);
  const values = sh.getRange(first, 1, last - first + 1, RCOLS.ID_STATUS).getValues();
  const out = [];
  values.forEach(function (v) {
    const rec = {
      ts: apiIso_(v[RCOLS.STAMP - 1]) || apiClean_(v[RCOLS.STAMP - 1]),
      sender: apiClean_(v[RCOLS.SENDER - 1]), phone: apiClean_(v[RCOLS.PHONE - 1]),
      text: apiClean_(v[RCOLS.TEXT - 1]), mikveh: apiClean_(v[RCOLS.MIKVEH - 1]), settlement: apiClean_(v[RCOLS.SETTLEMENT - 1]),
      defect: apiClean_(v[RCOLS.DEFECT - 1]), summary: apiClean_(v[RCOLS.SUMMARY - 1]), id: apiClean_(v[RCOLS.ID_MESSAGE - 1]),
      media: (apiClean_(v[RCOLS.MEDIA_LINKS - 1]) || '').split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean),
      archive: apiClean_(v[RCOLS.RAW_LINK - 1]), status: apiClean_(v[RCOLS.ID_STATUS - 1]),
    };
    if (rec.ts || rec.text || rec.id) out.push(apiCompact_(rec));
  });
  out.reverse(); // החדש ראשון
  return out;
}

// ==================== עזרים ====================

const API_EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function apiClean_(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v) ? null : apiIsoDate_(v);
  const s = String(v).trim();
  if (!s || s === '#N/A' || s === '#REF!' || s === '#VALUE!' || s === '#DIV/0!' || s === '#ERROR!') return null;
  return s;
}

function apiNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(String(v).trim());
  return isNaN(n) ? apiClean_(v) : n;
}

/** תאריך (Date / מספר אקסל / מחרוזת ISO) -> "YYYY-MM-DDTHH:mm:ss" בשעון ישראל. */
function apiIso_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : apiIsoDate_(v);
  if (typeof v === 'number') {
    if (v < 30000 || v > 80000) return null;
    return apiIsoDate_(new Date(API_EXCEL_EPOCH + v * 86400000), true);
  }
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return apiIso_(Number(s)); // מספר אקסל שנשמר כטקסט
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 19);
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) + 'T' +
      ('0' + (m[4] || '0')).slice(-2) + ':' + ('0' + (m[5] || '0')).slice(-2) + ':' + ('0' + (m[6] || '0')).slice(-2);
  }
  return null;
}

function apiIsoDate_(d, utc) {
  return Utilities.formatDate(d, utc ? 'UTC' : CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

/** נרמול שם מקווה – זהה ל-tools/export_excel.py ול-app.js. */
function apiNorm_(name) {
  if (!name) return '';
  return String(name).replace(/[–—]/g, '-').replace(/״/g, '"').replace(/''/g, '"').replace(/׳/g, "'")
    .replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim();
}

function apiCompact_(obj) {
  const out = {};
  Object.keys(obj).forEach(function (k) {
    const v = obj[k];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
    out[k] = v;
  });
  return out;
}

/** בדיקה ידנית מתוך עורך ה-Apps Script: מריץ את ה-API ומדפיס סיכום. */
function testApi() {
  const data = apiBuildData_();
  Logger.log(JSON.stringify(data.meta));
  Logger.log('דוגמה: ' + JSON.stringify(data.mikvaot[0]));
  Logger.log('וואטסאפ אחרון: ' + JSON.stringify(data.whatsapp[0] || null));
}
