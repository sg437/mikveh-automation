/************************************************************************
 * פרויקטי בנייה ושיפוץ (Projects.gs)
 * ========================================================
 * לכל מקווה בבנייה או בשיפוץ יש פרויקט עם צ'ק-ליסט של תשעה שלבים,
 * מפקח אחראי, קבלן, ותמונות. מחליף את אפליקציית Daft-cashrut.
 *
 * פרויקט יכול להיפתח גם על מקווה שעדיין אינו בבסיס הנתונים – מקווה
 * בבנייה מלווים מהיום הראשון, הרבה לפני שהוא פעיל. לכן שם המקווה נשמר
 * כטקסט חופשי, ומקושר ל-mikvehId רק אם נמצאה התאמה.
 *
 * לשוניות: "פרויקטים" ו"שלבי פרויקט" (נוצרות אוטומטית).
 ************************************************************************/

const PROJECTS = {
  SHEET: 'פרויקטים',
  HEADERS: ['מזהה', 'נפתח', 'מקווה', 'יישוב', 'סוג', 'סטטוס', 'קבלן', 'מפקח אחראי',
    'תאריך התחלה', 'סיום משוער', 'הערה', 'נפתח ע"י', 'עודכן'],
  STAGES_SHEET: 'שלבי פרויקט',
  STAGES_HEADERS: ['מזהה פרויקט', 'שלב', 'סטטוס', 'תאריך', 'אושר ע"י', 'הערה', 'עודכן'],
  TYPES: ['בנייה', 'שיפוץ'],
  STATUSES: ['בתכנון', 'בביצוע', 'מושהה', 'הושלם'],
  STAGE_STATUSES: ['ממתין', 'בביצוע', 'אושר', 'נדרש תיקון'],
  LIMIT: 500,
};

/**
 * שלבי הצ'ק-ליסט, לפי סדר העבודה בשטח.
 * לשינוי הרשימה – לערוך כאן בלבד; שלבים שכבר נרשמו בגיליון נשמרים לפי
 * המפתח, כך שהוספה או שינוי ניסוח אינם מאבדים נתונים קיימים.
 */
const PROJECT_STAGES = [
  { key: 'plans', label: 'אישור תוכניות לפני תחילת העבודה' },
  { key: 'roof', label: 'גג איסוף מי גשמים — שיפועים ומרזבים' },
  { key: 'reservoir', label: 'המאגר — מידות, איטום, חיבורים' },
  { key: 'zeria', label: 'אוצר זריעה — מידות ופתח' },
  { key: 'hashaka', label: 'אוצר השקה — מידות ופתח ההשקה' },
  { key: 'bor', label: 'בור הטבילה' },
  { key: 'walls', label: 'ביקורת לפני סגירת קירות', critical: true },
  { key: 'fill', label: 'מילוי ראשון' },
  { key: 'cert', label: 'תעודת כשרות' },
];

function projectsSheet_(ss) {
  let sh = ss.getSheetByName(PROJECTS.SHEET);
  if (!sh) {
    sh = ss.insertSheet(PROJECTS.SHEET);
    sh.appendRow(PROJECTS.HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function projectStagesSheet_(ss) {
  let sh = ss.getSheetByName(PROJECTS.STAGES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PROJECTS.STAGES_SHEET);
    sh.appendRow(PROJECTS.STAGES_HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function projectRecord_(v) {
  return apiCompact_({
    id: String(v[0]), ts: apiIso_(v[1]), mikveh: apiClean_(v[2]), place: apiClean_(v[3]),
    type: apiClean_(v[4]) || 'בנייה', status: apiClean_(v[5]) || 'בתכנון',
    contractor: apiClean_(v[6]), supervisor: apiClean_(v[7]),
    startDate: apiIso_(v[8]), targetDate: apiIso_(v[9]),
    note: apiClean_(v[10]), by: apiClean_(v[11]), updated: apiIso_(v[12]),
  });
}

/** כל הפרויקטים. mikvehId מתמלא רק אם השם תואם מקווה קיים. */
function apiProjects_(ss) {
  const sh = ss.getSheetByName(PROJECTS.SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow();
  const from = Math.max(2, last - PROJECTS.LIMIT + 1);
  const values = sh.getRange(from, 1, last - from + 1, PROJECTS.HEADERS.length).getValues();
  const out = [];
  values.forEach(function (v) {
    if (!v[0]) return;
    const rec = projectRecord_(v);
    rec.mikvehId = apiNorm_(rec.mikveh);
    out.push(rec);
  });
  out.sort(function (a, b) { return (b.ts || '').localeCompare(a.ts || ''); });
  return out;
}

/** כל שלבי הפרויקטים, כמפה: { מזהה פרויקט: { מפתח שלב: {...} } } */
function apiProjectStages_(ss) {
  const sh = ss.getSheetByName(PROJECTS.STAGES_SHEET);
  if (!sh || sh.getLastRow() < 2) return {};
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, PROJECTS.STAGES_HEADERS.length).getValues();
  const out = {};
  values.forEach(function (v) {
    const pid = String(v[0] || ''), key = apiClean_(v[1]);
    if (!pid || !key) return;
    (out[pid] = out[pid] || {})[key] = apiCompact_({
      status: apiClean_(v[2]) || 'ממתין', date: apiIso_(v[3]),
      by: apiClean_(v[4]), note: apiClean_(v[5]), updated: apiIso_(v[6]),
    });
  });
  return out;
}

/** פתיחת פרויקט. data: {mikveh, place, type, contractor, supervisor, startDate, targetDate, note} */
function addProject_(ss, d, user) {
  const mikveh = txt_(d.mikveh, 120);
  if (!mikveh) return { error: 'חסר שם מקווה' };
  const type = PROJECTS.TYPES.indexOf(d.type) >= 0 ? d.type : 'בנייה';
  const sh = projectsSheet_(ss);
  // מקווה קיים לא אמור לקבל שני פרויקטים פתוחים במקביל
  const open = apiProjects_(ss).filter(function (p) {
    return p.status !== 'הושלם' && apiNorm_(p.mikveh) === apiNorm_(mikveh);
  })[0];
  if (open) return { error: 'כבר קיים פרויקט פתוח על "' + mikveh + '" (' + open.type + ', ' + open.status + ')' };

  const id = Utilities.getUuid().slice(0, 8);
  const now = new Date();
  const row = [id, now, mikveh, txt_(d.place, 80), type, 'בתכנון', txt_(d.contractor, 120),
    txt_(d.supervisor, 80) || user.name, d.startDate ? dateOf_(d.startDate) : '',
    d.targetDate ? dateOf_(d.targetDate) : '', txt_(d.note, 500), user.name, now];
  sh.appendRow(row);

  const rec = projectRecord_(row);
  rec.mikvehId = apiNorm_(mikveh);
  const msg = writeMessage_(ss, { mikveh: canonicalMikveh_(ss, mikveh) ? mikveh : '',
    text: '🏗️ ' + user.name + ' פתח/ה פרויקט ' + type + ': ' + mikveh, _system: true }, user);
  if (msg.record) msg.record.source = 'system';
  return { ok: true, record: rec, message: msg.record || null };
}

/** עדכון פרטי פרויקט. data: {id, ...שדות} */
function updateProject_(ss, d, user) {
  const sh = projectsSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return { error: 'הפרויקט לא נמצא' };
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let rowNum = -1;
  for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(d.id)) { rowNum = i + 2; break; } }
  if (rowNum < 0) return { error: 'הפרויקט לא נמצא' };

  const row = sh.getRange(rowNum, 1, 1, PROJECTS.HEADERS.length).getValues()[0];
  if (d.place !== undefined) row[3] = txt_(d.place, 80);
  if (PROJECTS.TYPES.indexOf(d.type) >= 0) row[4] = d.type;
  if (PROJECTS.STATUSES.indexOf(d.status) >= 0) row[5] = d.status;
  if (d.contractor !== undefined) row[6] = txt_(d.contractor, 120);
  if (d.supervisor !== undefined) row[7] = txt_(d.supervisor, 80);
  if (d.startDate !== undefined) row[8] = d.startDate ? dateOf_(d.startDate) : '';
  if (d.targetDate !== undefined) row[9] = d.targetDate ? dateOf_(d.targetDate) : '';
  if (d.note !== undefined) row[10] = txt_(d.note, 500);
  row[12] = new Date();
  sh.getRange(rowNum, 1, 1, row.length).setValues([row]);

  const rec = projectRecord_(row);
  rec.mikvehId = apiNorm_(rec.mikveh);
  return { ok: true, record: rec };
}

/** עדכון שלב בצ'ק-ליסט. data: {id, stage, status, date, note} */
function updateProjectStage_(ss, d, user) {
  const pid = String(d.id || '');
  const key = String(d.stage || '');
  if (!pid || !key) return { error: 'חסר פרויקט או שלב' };
  if (!PROJECT_STAGES.some(function (s) { return s.key === key; })) return { error: 'שלב לא מוכר' };
  const status = PROJECTS.STAGE_STATUSES.indexOf(d.status) >= 0 ? d.status : 'ממתין';

  const sh = projectStagesSheet_(ss);
  const last = sh.getLastRow();
  let rowNum = -1;
  if (last >= 2) {
    const keys = sh.getRange(2, 1, last - 1, 2).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === pid && apiClean_(keys[i][1]) === key) { rowNum = i + 2; break; }
    }
  }
  const now = new Date();
  // "אושר" ללא תאריך מקבל את היום, כדי שתמיד יהיה תיעוד מתי אושר השלב
  const when = d.date ? dateOf_(d.date) : (status === 'אושר' ? now : '');
  const row = [pid, key, status, when, status === 'ממתין' ? '' : user.name, txt_(d.note, 500), now];
  if (rowNum < 0) sh.appendRow(row); else sh.getRange(rowNum, 1, 1, row.length).setValues([row]);

  const rec = apiCompact_({ status: status, date: apiIsoDate_(when) || null, by: row[4], note: row[5], updated: apiIsoDate_(now) });
  return { ok: true, stage: key, record: rec };
}
