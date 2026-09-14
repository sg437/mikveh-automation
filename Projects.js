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
 * מחזור החיים של מקווה קיים: פתיחת פרויקט מסמנת אותו "בשיפוץ" (כלומר לא פעיל),
 * ואישור הסיום מחזיר אותו ל"פעיל". פרויקט על מקווה חדש מוסיף אותו לבסיס
 * הנתונים באישור הסיום, ולא לפני כן.
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

/** מאיפה הגיע שם המקווה בטופס הפתיחה. */
const PROJECT_MIKVEH_MODES = ['exists', 'new', 'unlisted'];

/** האם השם הוא של משתמש פעיל במערכת. */
function projectIsStaff_(ss, name) {
  if (typeof authUsers_ !== 'function') return false;
  return authUsers_(ss).some(function (u) { return u.active && u.name === name; });
}

/**
 * מפקח אחראי. מנהל רשאי להציב כל משתמש פעיל במערכת; לכל תפקיד אחר הערך
 * נשאר כפי שהוא (fallback) – כדי שלא ייווצרו שמות חופשיים בגיליון.
 */
function projectSupervisor_(ss, wanted, user, fallback) {
  const name = txt_(wanted, 80);
  if (!name || name === fallback || name === user.name) return name || fallback;
  if (user.role === 'מנהל' && projectIsStaff_(ss, name)) return name;
  return fallback;
}

/** שינוי "פעילות המקוה" בבסיס הנתונים. מחזיר null אם המקווה אינו שם. */
function projectSetActivity_(ss, name, activity) {
  if (typeof mikvehRow_ !== 'function') return null;
  const r = mikvehRow_(ss, name);
  if (!r) return null;
  const col = MIKVEH_EDITABLE.activity + 1;
  const before = apiClean_(r.sh.getRange(r.rowNum, col).getValue());
  if (before !== activity) r.sh.getRange(r.rowNum, col).setValue(activity);
  return { id: apiNorm_(r.name), name: r.name, activity: activity, before: before, changed: before !== activity };
}

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

/**
 * פתיחת פרויקט.
 * data: {mikveh, mikvehMode, markInactive, place, type, contractor, supervisor,
 *        startDate, targetDate, note}
 *
 * mikvehMode: exists = נבחר מבסיס הנתונים · new = מקווה חדש לגמרי ·
 * unlisted = קיים בשטח אך אינו ברשימה. מקווה שנמצא בבסיס הנתונים מסומן
 * "בשיפוץ" עם פתיחת הפרויקט, אלא אם ביקשו אחרת.
 */
function addProject_(ss, d, user) {
  const mikveh = txt_(d.mikveh, 120);
  if (!mikveh) return { error: 'חסר שם מקווה' };
  const type = PROJECTS.TYPES.indexOf(d.type) >= 0 ? d.type : 'בנייה';
  const mode = PROJECT_MIKVEH_MODES.indexOf(d.mikvehMode) >= 0 ? d.mikvehMode : '';
  const known = typeof mikvehRow_ === 'function' && !!mikvehRow_(ss, mikveh);
  if (mode === 'exists' && !known) {
    return { error: 'המקווה "' + mikveh + '" אינו בבסיס הנתונים. בחר מהרשימה, או סמן שהוא חדש / אינו מופיע ברשימה.' };
  }
  if (mode === 'new' && known) {
    return { error: 'המקווה "' + mikveh + '" כבר קיים בבסיס הנתונים. בחר אותו מהרשימה.' };
  }
  const sh = projectsSheet_(ss);
  // מקווה קיים לא אמור לקבל שני פרויקטים פתוחים במקביל
  const open = apiProjects_(ss).filter(function (p) {
    return p.status !== 'הושלם' && apiNorm_(p.mikveh) === apiNorm_(mikveh);
  })[0];
  if (open) return { error: 'כבר קיים פרויקט פתוח על "' + mikveh + '" (' + open.type + ', ' + open.status + ')' };

  const id = Utilities.getUuid().slice(0, 8);
  const now = new Date();
  const row = [id, now, mikveh, txt_(d.place, 80), type, 'בתכנון', txt_(d.contractor, 120),
    projectSupervisor_(ss, d.supervisor, user, user.name), d.startDate ? dateOf_(d.startDate) : '',
    d.targetDate ? dateOf_(d.targetDate) : '', txt_(d.note, 500), user.name, now];
  sh.appendRow(row);

  // מקווה שנמצא בבסיס הנתונים יוצא משירות כל עוד העבודה נמשכת
  const marked = known && d.markInactive !== false ? projectSetActivity_(ss, mikveh, 'בשיפוץ') : null;

  const rec = projectRecord_(row);
  rec.mikvehId = apiNorm_(mikveh);
  const msg = writeMessage_(ss, { mikveh: canonicalMikveh_(ss, mikveh) ? mikveh : '',
    text: '🏗️ ' + user.name + ' פתח/ה פרויקט ' + type + ': ' + mikveh +
      (marked && marked.changed ? '\nהמקווה סומן "בשיפוץ" ואינו פעיל עד אישור הסיום.' : ''), _system: true }, user);
  if (msg.record) msg.record.source = 'system';
  return { ok: true, record: rec, mikveh: marked, message: msg.record || null };
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
  if (d.supervisor !== undefined) row[7] = projectSupervisor_(ss, d.supervisor, user, apiClean_(row[7]));
  if (d.startDate !== undefined) row[8] = d.startDate ? dateOf_(d.startDate) : '';
  if (d.targetDate !== undefined) row[9] = d.targetDate ? dateOf_(d.targetDate) : '';
  if (d.note !== undefined) row[10] = txt_(d.note, 500);
  row[12] = new Date();
  sh.getRange(rowNum, 1, 1, row.length).setValues([row]);

  const rec = projectRecord_(row);
  rec.mikvehId = apiNorm_(rec.mikveh);
  return { ok: true, record: rec };
}

/**
 * על שם מי נרשם השלב. ברירת המחדל היא מי שמחובר; מנהל רשאי לרשום את השלב על
 * שם מפקח אחר, אך רק על שם משתמש פעיל שקיים במערכת – כדי שלא ייווצרו שמות
 * חופשיים בגיליון. שלב שחוזר ל"ממתין" נשאר בלי שם.
 *
 * prev הוא השם שכבר רשום בשורה. מנהל שנוגע רק בהערה או בתאריך אינו מעביר
 * בכך את השלב על שמו, וגם שם ישן שאינו ברשימת המשתמשים נשמר כמות שהוא.
 */
function projectStageBy_(ss, wanted, user, status, prev) {
  if (status === 'ממתין') return '';
  const name = txt_(wanted, 80);
  if (!name || name === user.name) return user.name;
  if (name === txt_(prev, 80)) return name;
  if (user.role !== 'מנהל') return user.name;
  return projectIsStaff_(ss, name) ? name : user.name;
}

/** עדכון שלב בצ'ק-ליסט. data: {id, stage, status, date, note, by} */
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
  const prevBy = rowNum > 0 ? apiClean_(sh.getRange(rowNum, 5).getValue()) : '';
  const now = new Date();
  // "אושר" ללא תאריך מקבל את היום, כדי שתמיד יהיה תיעוד מתי אושר השלב
  const when = d.date ? dateOf_(d.date) : (status === 'אושר' ? now : '');
  const row = [pid, key, status, when, projectStageBy_(ss, d.by, user, status, prevBy), txt_(d.note, 500), now];
  if (rowNum < 0) sh.appendRow(row); else sh.getRange(rowNum, 1, 1, row.length).setValues([row]);

  const rec = apiCompact_({ status: status, date: apiIsoDate_(when) || null, by: row[4], note: row[5], updated: apiIsoDate_(now) });
  return { ok: true, stage: key, record: rec };
}

/**
 * אישור סיום הפרויקט — הרגע שבו המקווה נכנס לשירות.
 * data: {id, force}
 *
 * מקווה שכבר בבסיס הנתונים חוזר ל"פעיל"; מקווה שאינו שם נוסף עכשיו, ולא
 * קודם — כך שמקווה בבנייה אינו מופיע ברשימה עד שהוא באמת ראוי לשימוש.
 * הסיום דורש שכל תשעת השלבים אושרו. מנהל רשאי לאשר גם בלעדיהם (force),
 * וההודעה בדיון מציינת זאת במפורש.
 */
function completeProject_(ss, d, user) {
  if (user.role && ['מנהל', 'מפקח'].indexOf(user.role) < 0) return { error: 'אישור סיום למנהל ולמפקח בלבד' };
  const pid = String(d.id || '');
  const sh = projectsSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return { error: 'הפרויקט לא נמצא' };
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let rowNum = -1;
  for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]) === pid) { rowNum = i + 2; break; } }
  if (rowNum < 0) return { error: 'הפרויקט לא נמצא' };

  const row = sh.getRange(rowNum, 1, 1, PROJECTS.HEADERS.length).getValues()[0];
  if (apiClean_(row[5]) === 'הושלם') return { error: 'הפרויקט כבר סומן כהושלם' };

  const stages = apiProjectStages_(ss)[pid] || {};
  const left = PROJECT_STAGES.filter(function (s) { return (stages[s.key] || {}).status !== 'אושר'; });
  const forced = !!(left.length && d.force && user.role === 'מנהל');
  if (left.length && !forced) {
    return { error: 'נותרו ' + left.length + ' שלבים שלא אושרו: ' +
      left.map(function (s) { return s.label; }).join(' · ') };
  }

  const name = apiClean_(row[2]);
  const type = apiClean_(row[4]) || 'בנייה';
  let mikveh = projectSetActivity_(ss, name, 'פעיל');
  let created = false;
  const messages = [];
  if (!mikveh) {
    const add = addMikveh_(ss, { name: name, fields: { place: apiClean_(row[3]), activity: 'פעיל' } }, user);
    if (add.error) return add;
    mikveh = { id: add.record.id, name: add.record.name, activity: 'פעיל', before: '', changed: true };
    mikveh.record = add.record;
    created = true;
    if (add.message) messages.push(add.message);
  }

  row[5] = 'הושלם';
  row[12] = new Date();
  sh.getRange(rowNum, 1, 1, row.length).setValues([row]);

  const msg = writeMessage_(ss, { mikveh: name,
    text: '✅ ' + user.name + ' אישר/ה את סיום ה' + (type === 'שיפוץ' ? 'שיפוץ' : 'בנייה') + ': ' + name +
      '\n' + (created ? 'המקווה נוסף לבסיס הנתונים ומסומן "פעיל".' : 'המקווה חזר לפעילות בבסיס הנתונים.') +
      (forced ? '\n⚠️ אושר למרות ' + left.length + ' שלבים שלא אושרו בצ\'ק-ליסט.' : ''), _system: true }, user);
  if (msg.record) { msg.record.source = 'system'; messages.push(msg.record); }

  const rec = projectRecord_(row);
  rec.mikvehId = apiNorm_(rec.mikveh);
  return { ok: true, record: rec, mikveh: mikveh, created: created, forced: forced, messages: messages };
}
