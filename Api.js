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
    if (action === 'public') return apiPublic_(e); // ציבורי – בלי טוקן
    const token = getProp_(API.TOKEN_PROP);
    const given = (e.parameter && e.parameter.token) || '';
    if (token && given !== token) {
      return jsonResponse_({ error: 'unauthorized' });
    }
    if (action === 'ping') return jsonResponse_(apiPing_());
    // ---- API ציבורי לאתר (בלי טוקן): רק מידע שמיועד לציבור ----
    if (action === 'public') return apiPublic_(e);
    if (action === 'whatsapp') return jsonResponse_({ whatsapp: apiWhatsapp_() });
    if (action === 'inspections') {
      // דוחות מלאים (עם המדורים) למקווה אחד – נטענים רק כשפותחים את הלשונית
      const ss = apiSpreadsheet_();
      const want = apiNorm_((e.parameter && e.parameter.mikveh) || '');
      const all = apiInspections_(ss, true);
      return jsonResponse_({ inspections: want ? all.filter(function (i) { return apiNorm_(i.mikveh) === want; }) : all });
    }
    if (action === 'messages') return jsonResponse_({ messages: apiMessages_(apiSpreadsheet_(), (e.parameter && e.parameter.since) || '') });
    if (action === 'sync') {
      const ss = apiSpreadsheet_();
      const ids = {};
      apiMikvaot_(ss).forEach(function (m) { ids[apiNorm_(m.name)] = m.id; });
      const work = apiWork_(ss);
      work.forEach(function (w) { const mid = ids[apiNorm_(w.mikveh)]; if (mid) w.mikvehId = mid; });
      const media = apiMedia_(ss);
      media.forEach(function (x) { const mid = ids[apiNorm_(x.mikveh)]; if (mid) x.mikvehId = mid; });
      return jsonResponse_({ messages: apiMessages_(ss, (e.parameter && e.parameter.since) || ''), work: work, media: media,
        groups: apiGroups_(ss), reactions: apiReactions_(ss) });
    }
    if (action === 'data') {
      // הגוף הכבד מגיע מהמטמון; השדות שתלויים במשתמש נתפרים אליו בלי לפענח
      // מחדש שני מגה-בייט של JSON.
      const body = apiCachedDataJson_();
      const tok = (e.parameter && e.parameter.session) || '';
      const extra = {
        // authSessionFast_ נמנע מפתיחת הגיליון כשהסשן כבר במטמון: openById
        // על גיליון בגודל הזה עולה שנייה ויותר, בדיוק במסלול שאמור להיות מיידי.
        me: tok ? authSessionFast_(tok) : null,
        authEnabled: authEnabled_(),
        // ה-Client ID אינו סוד – הוא גלוי בכל דף שמציג כניסה עם Google. מסירת
        // הערך כאן חוסכת הקלדה של 72 תווים בכל מכשיר, מקור ל-invalid_client.
        googleClientId: getProp_('GOOGLE_CLIENT_ID') || ''
      };
      const tail = JSON.stringify(extra);
      const merged = body.slice(0, body.lastIndexOf('}')) + ',' + tail.slice(1);
      return ContentService.createTextOutput(merged).setMimeType(ContentService.MimeType.JSON);
    }
    return jsonResponse_({ error: 'unknown action: ' + action });
  } catch (err) {
    return jsonResponse_({ error: String(err && err.message || err) });
  }
}

function apiPing_() {
  const id = getProp_(API.SHEET_ID_PROP);
  const out = { ok: true, mikvaotSheet: !!id, tokenRequired: !!getProp_(API.TOKEN_PROP), time: new Date().toISOString() };
  // מה מוגדר בסקריפט – רק "מוגדר / לא מוגדר", בלי לחשוף ערכים. משמש את מסך החיבור באפליקציה.
  out.props = {
    googleClientId: !!getProp_('GOOGLE_CLIENT_ID'),
    archiveFolder: !!getProp_('MIKVEH_ARCHIVE_FOLDER_ID'),
    waAutoActions: getProp_('WA_AUTO_ACTIONS') === '1',
    openSignup: getProp_('OPEN_SIGNUP') === '1',
    waBridge: getProp_('WA_BRIDGE') === '1' && !!getProp_('GROUP_CHAT_ID'),
    waWorkPoll: getProp_('WA_WORK_POLL') === '1' && !!getProp_('GROUP_CHAT_ID'),
    notifyWhatsapp: getProp_('NOTIFY_WHATSAPP') === '1',
    greenApi: !!(getProp_('GREEN_ID_INSTANCE') && getProp_('GREEN_API_TOKEN')),
    alertChat: !!getProp_('ALERT_CHAT_ID'),
    defaultRole: getProp_('DEFAULT_ROLE') || ''
  };
  out.dataCache = apiDataCacheStatus_();
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

/**
 * מדידת זמני הטעינה – להרצה מהעורך (Run ▶) ואז "יומן ביצוע".
 * מראה כמה זמן לוקחת כל לשונית וכמה גדולה התשובה, כדי לדעת מה באמת מאט
 * את פתיחת האפליקציה במקום לנחש.
 */
/**
 * בדיקה שהמטמון באמת עובד – להרצה מהעורך.
 *
 * CacheService מוגבל גם במספר הפריטים בכתיבה אחת, והתשובה נשמרת בכ-35 פיסות.
 * אם השמירה נכשלת, apiCachedDataJson_ בולע את השגיאה וממשיך להחזיר תשובה
 * נכונה – פשוט בונה אותה מחדש בכל פעם, בלי שום סימן חיצוני.
 *
 * לבדיקה שהטריגרים מותקנים: testDataTriggers.
 */
function testDataCache() {
  apiClearDataCache_();
  const t1 = Date.now();
  const first = apiCachedDataJson_();
  const ms1 = Date.now() - t1;

  const t2 = Date.now();
  const second = apiCachedDataJson_();
  const ms2 = Date.now() - t2;

  Logger.log('בנייה ראשונה (בלי מטמון): ' + ms1 + ' ms, ' + Math.round(first.length / 1024) + ' KB');
  Logger.log('קריאה שנייה (מהמטמון):    ' + ms2 + ' ms, ' + Math.round(second.length / 1024) + ' KB');

  const n = CacheService.getScriptCache().get(DATA_CACHE.PREFIX + 'n');
  Logger.log('פיסות שנשמרו במטמון: ' + (n || 'אף אחת'));

  if (second.length !== first.length) { Logger.log('❌ התשובות שונות באורכן – יש תקלה במטמון'); return; }
  if (!n) { Logger.log('❌ המטמון לא נשמר כלל. כל טעינה בונה מחדש.'); return; }
  if (ms2 > ms1 / 3) { Logger.log('⚠️ המטמון נשמר אך לא הביא שיפור משמעותי'); return; }
  Logger.log('✅ המטמון עובד – פי ' + Math.max(1, Math.round(ms1 / Math.max(ms2, 1))) + ' מהר יותר');
}

function pad_(v, n) { let t = String(v); while (t.length < n) t += ' '; return t; }

function testApiSpeed() {
  const t0 = Date.now();
  const ss = apiSpreadsheet_();
  Logger.log('פתיחת הגיליון: %s ms', Date.now() - t0);

  const parts = [
    ['מקוואות', function () { return apiMikvaot_(ss); }],
    ['פעולות', function () { return apiActions_(ss); }],
    ['דוחות פיקוח', function () { return apiInspections_(ss); }],
    ['משימות', function () { return apiTasks_(ss); }],
    ['פקקים', function () { return apiPlugs_(ss); }],
    ['דיווחי וואטסאפ', function () { return apiWhatsapp_(); }],
    ['הודעות דיונים', function () { return apiMessages_(ss, ''); }],
    ['שיבוצים', function () { return apiWork_(ss); }],
    ['מדיה', function () { return apiMedia_(ss); }],
    ['קבוצות דיון', function () { return apiGroups_(ss); }],
    ['תגובות', function () { return apiReactions_(ss); }],
    ['קבלנים', function () { return apiContractors_(ss); }],
    ['פניות לקבלן', function () { return apiContractorMsgs_(ss); }]
  ];

  let total = 0, bytes = 0;
  parts.forEach(function (p) {
    const t = Date.now();
    let n = 0, size = 0;
    try {
      const res = p[1]();
      const json = JSON.stringify(res || null);
      size = json.length;
      n = Array.isArray(res) ? res.length : Object.keys(res || {}).length;
    } catch (err) {
      Logger.log(pad_(p[0], 18) + 'שגיאה: ' + err.message);
      return;
    }
    const ms = Date.now() - t;
    total += ms; bytes += size;
    Logger.log(pad_(p[0], 18) + pad_(ms + ' ms', 10) + pad_(n + ' רשומות', 14) + Math.round(size / 1024) + ' KB');
  });

  Logger.log('—'.repeat(46));
  Logger.log('סך הכל: %s ms, גודל התשובה כ-%s KB', total, Math.round(bytes / 1024));
  Logger.log('כל רענון באפליקציה מבצע את כל זה מחדש.');
}

/**
 * מטמון לתשובת ?action=data.
 *
 * בניית התשובה קוראת 15 לשוניות ונמשכת כ-17 שניות. הכלל כאן: **אף בקשה של
 * משתמש לא משלמת את הבנייה.** מי שבונה הוא טריגר ברקע; הבקשה מחזירה תמיד את
 * העותק ששמור, גם אם התיישן בדקות ספורות.
 *
 * למה זה נדרש: קודם המטמון חי 10 דקות בלבד, וכל כתיבה מחקה אותו. אצל צוות
 * של כמה מפקחים – שנכנסים כמה פעמים ביום, ושכל דיווח מהוואטסאפ מוחק להם את
 * המטמון – המטמון היה ריק כמעט תמיד, ולכן כמעט כל פתיחה שילמה 17 שניות.
 * מכאן ה"לפעמים מהר ולפעמים לאט" שנראה מקרי.
 *
 *   TTL     6 שעות (המקסימום ב-CacheService) – העותק לא נעלם מתחת לידיים.
 *   MAX_AGE מעל זה הטריגר בונה מחדש, כדי לתפוס גם עריכה שנעשתה ידנית בגיליון.
 *   dirty   סימון שכתיבה נכנסה. במקום למחוק את העותק – מסמנים, ממשיכים להגיש
 *           את הקודם, ומזמינים בנייה ברקע בעוד כמה שניות.
 *
 * CacheService מוגבל ל-100KB לערך, ולכן התשובה נשמרת בפיסות. הגודל נמדד
 * בתווים ולא בבתים, ואות עברית תופסת שני בתים ב-UTF-8 – ומכאן פיסה של
 * 40,000 תווים, שנשארת בבטחה מתחת למגבלה.
 *
 * שדות שתלויים במשתמש (me, authEnabled) אינם נכנסים למטמון; הם מתווספים
 * לתשובה אחרי השליפה.
 */
const DATA_CACHE = {
  PREFIX: 'apiData:',
  CHUNK: 40000,
  TTL: 21600,          // 6 שעות – המקסימום של CacheService
  MAX_AGE: 780,        // 13 דקות בשעות פעילות: מעליהן הטריגר בונה מחדש
  IDLE_MAX_AGE: 3300,  // 55 דקות גם כשאף אחד לא נכנס – ראה למטה
  IDLE: 1800,          // "מישהו נכנס לאחרונה" = חצי השעה האחרונה
  DELAY_MS: 5000,      // כמה להמתין לפני בנייה ברקע אחרי כתיבה
};

/** התשובה השמורה, או null אם אין עותק שלם. */
function apiReadDataCache_(cache) {
  const count = cache.get(DATA_CACHE.PREFIX + 'n');
  if (!count) return null;
  const n = Number(count);
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(DATA_CACHE.PREFIX + i);
  const got = cache.getAll(keys);
  let out = '';
  for (let i = 0; i < n; i++) {
    const part = got[DATA_CACHE.PREFIX + i];
    if (part === null || part === undefined) return null; // פיסה פגה – בונים מחדש
    out += part;
  }
  return out || null;
}

/** שומר את התשובה בפיסות, עם חותמת זמן הבנייה. */
function apiStoreDataJson_(cache, json) {
  try {
    const map = {};
    let n = 0;
    for (let i = 0; i < json.length; i += DATA_CACHE.CHUNK) { map[DATA_CACHE.PREFIX + n] = json.slice(i, i + DATA_CACHE.CHUNK); n++; }
    map[DATA_CACHE.PREFIX + 'n'] = String(n);
    map[DATA_CACHE.PREFIX + 'built'] = String(Date.now());
    cache.putAll(map, DATA_CACHE.TTL);
    return true;
  } catch (err) {
    Logger.log('שמירת המטמון נכשלה: ' + err); // לא קריטי – התשובה עדיין נכונה
    return false;
  }
}

function apiCachedDataJson_() {
  const cache = CacheService.getScriptCache();
  try { cache.put(DATA_CACHE.PREFIX + 'used', String(Date.now()), DATA_CACHE.IDLE); } catch (e) { /* לא קריטי */ }
  const saved = apiReadDataCache_(cache);
  if (saved) {
    // העותק מוגש מיד; אם התיישן או שנכנסה כתיבה – הבנייה מחדש רצה ברקע.
    if (cache.get(DATA_CACHE.PREFIX + 'dirty') || apiDataAge_(cache) > DATA_CACHE.MAX_AGE) apiScheduleDataRefresh_(cache);
    return saved;
  }
  // אין עותק כלל (פעם ראשונה, או שהמטמון התרוקן) – רק כאן מישהו מחכה לבנייה.
  const json = JSON.stringify(apiBuildData_());
  apiStoreDataJson_(cache, json);
  return json;
}

/** גיל העותק השמור בשניות (ענק אם אין חותמת). */
function apiDataAge_(cache) {
  const built = Number(cache.get(DATA_CACHE.PREFIX + 'built') || 0);
  return built ? (Date.now() - built) / 1000 : 1e9;
}

/**
 * כתיבה נכנסה. לא מוחקים את העותק – מסמנים אותו, כדי שהמשתמש הבא יקבל תשובה
 * מיידית (ולא ימתין 17 שניות), ומזמינים בנייה ברקע שתחליף אותו תוך שניות.
 */
function apiInvalidateData_() {
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { return; }
  try { cache.put(DATA_CACHE.PREFIX + 'dirty', String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8), DATA_CACHE.TTL); } catch (e) { /* ממשיכים */ }
  // אם אי אפשר לקבוע בנייה ברקע (אין הרשאה לטריגרים וכו') – חוזרים להתנהגות
  // הישנה, מחיקה, כדי שלא יוגשו נתונים ישנים בלי שאף אחד יבנה מחדש.
  if (!apiScheduleDataRefresh_(cache)) apiClearDataCache_();
}

/** מחיקה מלאה של המטמון (בדיקות, ומצב חירום שבו אין טריגרים). */
function apiClearDataCache_() {
  try {
    const cache = CacheService.getScriptCache();
    const count = cache.get(DATA_CACHE.PREFIX + 'n');
    const keys = [DATA_CACHE.PREFIX + 'n', DATA_CACHE.PREFIX + 'built', DATA_CACHE.PREFIX + 'dirty'];
    if (count) for (let i = 0; i < Number(count); i++) keys.push(DATA_CACHE.PREFIX + i);
    cache.removeAll(keys);
  } catch (err) { Logger.log('ניקוי המטמון נכשל: ' + err); }
}

/**
 * מזמין בנייה מחדש ברקע בעוד כמה שניות (טריגר חד-פעמי).
 * מסומן במטמון כדי שרצף כתיבות לא ייצור עשרות טריגרים.
 */
function apiScheduleDataRefresh_(cache) {
  if (typeof ScriptApp === 'undefined') return false;
  if (cache && cache.get(DATA_CACHE.PREFIX + 'pending')) return true; // כבר הוזמן
  try {
    ScriptApp.newTrigger('refreshDataCacheOnce').timeBased().after(DATA_CACHE.DELAY_MS).create();
  } catch (err) {
    // המכסה היא 20 טריגרים לסקריפט. אם נשארו טריגרים חד-פעמיים שלא רצו,
    // מנקים אותם ומנסים שוב פעם אחת – ורק אז מוותרים.
    Logger.log('הזמנת בנייה ברקע נכשלה: ' + err);
    try {
      ScriptApp.getProjectTriggers().forEach(function (t) {
        if (t.getHandlerFunction() === 'refreshDataCacheOnce') ScriptApp.deleteTrigger(t);
      });
      ScriptApp.newTrigger('refreshDataCacheOnce').timeBased().after(DATA_CACHE.DELAY_MS).create();
    } catch (err2) {
      Logger.log('גם אחרי ניקוי טריגרים לא הצלחנו: ' + err2);
      return false;
    }
  }
  if (cache) { try { cache.put(DATA_CACHE.PREFIX + 'pending', '1', 120); } catch (e) { /* לא קריטי */ } }
  return true;
}

/** בונה מחדש ושומר. מנקה את סימון ה-dirty רק אם לא נכנסה כתיבה תוך כדי הבנייה. */
function apiRefreshDataCache_() {
  const cache = CacheService.getScriptCache();
  const mark = cache.get(DATA_CACHE.PREFIX + 'dirty');
  const t0 = Date.now();
  const json = JSON.stringify(apiBuildData_());
  apiStoreDataJson_(cache, json);
  // הסימון מוסר רק אם לא השתנה תוך כדי הבנייה. השתנה = נכנסה כתיבה נוספת
  // אחרי שהתחלנו לקרוא מהגיליון, והרענון הבא צריך לתפוס אותה.
  const now = cache.get(DATA_CACHE.PREFIX + 'dirty');
  if (mark && now === mark) cache.remove(DATA_CACHE.PREFIX + 'dirty');
  Logger.log('מטמון הנתונים נבנה מחדש: ' + (Date.now() - t0) + ' ms, ' + Math.round(json.length / 1024) + ' KB');
  return json.length;
}

/** טריגר חד-פעמי אחרי כתיבה. מוחק את עצמו כדי לא לצבור טריגרים. */
function refreshDataCacheOnce() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'refreshDataCacheOnce') ScriptApp.deleteTrigger(t);
    });
  } catch (err) { Logger.log('ניקוי טריגר חד-פעמי נכשל: ' + err); }
  try { CacheService.getScriptCache().remove(DATA_CACHE.PREFIX + 'pending'); } catch (e) { /* ממשיכים */ }
  apiRefreshDataCache_();
}

/**
 * טריגר תקופתי (כל 5 דקות). מחזיק את העותק חם — תמיד.
 *
 * הגרסה הראשונה כאן ויתרה על התחזוקה כשאיש לא נכנס לאפליקציה, כדי לחסוך
 * מכסת זמן ריצה. זו הייתה טעות: אצל צוות שנכנס כמה פעמים ביום, כמעט כל
 * אחד הוא "הראשון אחרי שקט" — והוא זה ששילם את 23 שניות הבנייה. נמדד
 * בשטח: 39 שניות עד שהנתונים הוחלפו במסך.
 *
 * לכן שתי מדרגות, ובשתיהן העותק לעולם אינו חסר:
 *   בשעות פעילות (מישהו נכנס בחצי השעה האחרונה) — רענון כל 13 דקות.
 *   בשקט — רענון כל 55 דקות, כדי שגם הפתיחה הראשונה בבוקר תמצא עותק מוכן.
 * בשקט זה כ-24 בניות ביממה; זול לעומת המתנה של 23 שניות למשתמש.
 */
function refreshDataCache() {
  const cache = CacheService.getScriptCache();
  const has = cache.get(DATA_CACHE.PREFIX + 'n');
  const dirty = cache.get(DATA_CACHE.PREFIX + 'dirty');
  const active = !!cache.get(DATA_CACHE.PREFIX + 'used');
  const age = apiDataAge_(cache);
  const stale = age > (active ? DATA_CACHE.MAX_AGE : DATA_CACHE.IDLE_MAX_AGE);
  if (!has || dirty || stale) apiRefreshDataCache_();
}

/** מצב מטמון הנתונים – למסך "חיבור לגיליון" ולבדיקה מהעורך. */
function apiDataCacheStatus_() {
  const out = { warm: false, ageSec: null, dirty: false, trigger: false };
  try {
    const cache = CacheService.getScriptCache();
    out.warm = !!cache.get(DATA_CACHE.PREFIX + 'n');
    const age = apiDataAge_(cache);
    out.ageSec = age > 1e8 ? null : Math.round(age);
    out.dirty = !!cache.get(DATA_CACHE.PREFIX + 'dirty');
  } catch (err) { /* ממשיכים בלי */ }
  try {
    out.trigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'refreshDataCache'; });
  } catch (err) { /* אין הרשאה לקרוא טריגרים */ }
  return out;
}

/**
 * בדיקה: מי מחזיק את מטמון הנתונים חם — להרצה מהעורך.
 * זו הבדיקה שמסבירה "למה האפליקציה נפתחת לאט": בלי הטריגר, המשתמש הבא
 * אחרי כל כתיבה משלם את הבנייה המלאה.
 */
function testDataTriggers() {
  const st = apiDataCacheStatus_();
  Logger.log('עותק שמור: ' + (st.warm ? 'יש' : '❌ אין'));
  Logger.log('גיל העותק: ' + (st.ageSec === null ? 'לא ידוע' : st.ageSec + ' שניות'));
  Logger.log('ממתין לבנייה מחדש: ' + (st.dirty ? 'כן' : 'לא'));
  if (!st.trigger) { Logger.log('❌ טריגר הרענון אינו מותקן — הרץ installDataCacheTrigger פעם אחת.'); return; }
  Logger.log('✅ טריגר הרענון מותקן (כל 5 דקות). אף בקשה של משתמש לא בונה מחדש.');
}

/** ★ מריצים פעם אחת ★ מתקין את הטריגר ששומר על מטמון הנתונים חם. */
function installDataCacheTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshDataCache') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshDataCache').timeBased().everyMinutes(5).create();
  apiRefreshDataCache_();
  Logger.log('✅ הטריגר הותקן — מטמון הנתונים ייבנה מחדש ברקע, והאפליקציה לא תמתין לו.');
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
  const media = apiMedia_(ss);
  const groups = apiGroups_(ss);
  const reactions = apiReactions_(ss);
  const contractors = apiContractors_(ss);
  const contractorMsgs = apiContractorMsgs_(ss);
  const projects = apiProjects_(ss);
  const projectStages = apiProjectStages_(ss);

  // קישור לפי שם מקווה מנורמל
  const ids = {};
  mikvaot.forEach(function (m) { ids[apiNorm_(m.name)] = m.id; });
  [actions, inspections, tasks, whatsapp, messages, work, media].forEach(function (coll) {
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
    mikvaot: mikvaot, actions: actions, inspections: inspections, tasks: tasks, plugs: plugs, whatsapp: whatsapp, messages: messages, work: work, media: media,
    groups: groups, reactions: reactions, contractors: contractors, contractorMsgs: contractorMsgs,
    projects: projects, projectStages: projectStages,
    users: authPublicUsers_(ss), perms: authPerms_(ss),
  };
}

// ==================== קריאת הגיליונות ====================

/**
 * קריאת לשונית.
 *
 * maxCols מגביל את רוחב הקריאה למספר העמודות שהקוד באמת משתמש בהן.
 * getLastColumn מחזיר את העמודה האחרונה שיש בה תוכן כלשהו בכל הלשונית –
 * גם תא בודד או עיצוב רחוק מימין מנפח כל שורה בעשרות תאים ריקים. בלשונית
 * הפעולות, 4,080 שורות כאלה עלו בשש שניות לכל טעינה.
 */
/**
 * קריאת חלקים מלשונית, כשהעמודות שבאמצע אינן בשימוש.
 * parts = [[מאיפה, עד-לא-כולל], ...] באינדקסים 0-based. השורה שמוחזרת שומרת על
 * המיקומים המקוריים (החורים מתמלאים ב-null), כדי ש-r[85] יישאר r[85].
 */
function apiRowsParts_(ss, name, parts) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('הלשונית "' + name + '" לא נמצאה בגיליון המקוואות');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  const chunks = [];
  parts.forEach(function (p) {
    const from = p[0], to = Math.min(p[1], lastCol);
    if (to <= from) { chunks.push({ from: from, values: null }); return; }
    chunks.push({ from: from, values: sh.getRange(1, from + 1, lastRow, to - from).getValues() });
  });
  const width = parts[parts.length - 1][1];
  const out = [];
  for (let i = 0; i < lastRow; i++) {
    const row = new Array(width).fill(null);
    chunks.forEach(function (c) {
      if (!c.values) return;
      const src = c.values[i];
      for (let j = 0; j < src.length; j++) row[c.from + j] = src[j];
    });
    out.push(row);
  }
  return out;
}

function apiRows_(ss, name, maxCols) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('הלשונית "' + name + '" לא נמצאה בגיליון המקוואות');
  const lastRow = sh.getLastRow();
  if (lastRow < 1) return [];
  let cols = sh.getLastColumn();
  if (maxCols && maxCols < cols) cols = maxCols;
  if (cols < 1) return [];
  return sh.getRange(1, 1, lastRow, cols).getValues();
}

function apiMikvaot_(ss) {
  const rows = apiRows_(ss, API.SHEETS.master, 51); // API_MASTER_FIELDS מגיע עד עמודה 49
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
  const rows = apiRows_(ss, API.SHEETS.actions, 22); // כמו WRITE.ACTION_COLS
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

/**
 * דוחות הפיקוח.
 *
 * full=false (ברירת המחדל, וכך ב-?action=data): בלי המדורים. המדורים הם 79
 * עמודות לכל דוח – כשלושה ק"ב לרשומה, וכ-1.6MB בסך הכל – והם מוצגים רק
 * בלשונית "דוחות פיקוח" של כרטיס מקווה מסוים. לוח הבקרה, הספירות והנתונים
 * החיים משתמשים רק ב-ts, rabbi ו-mikvehId.
 *
 * full=true (ב-?action=inspections&mikveh=...): עם המדורים, למקווה אחד.
 */
function apiInspections_(ss, full) {
  // ברשימה הקצרה נקראות רק שתי קצוות הלשונית (עמודות 1-15 ו-86-101). המדורים
  // יושבים באמצע, 70 עמודות על 576 שורות – כארבעים אלף תאים שנקראו בכל בנייה
  // בלי שאיש הסתכל בהם. apiRowsParts_ מחזיר שורה באותם אינדקסים בדיוק, כך
  // ששאר הקוד אינו מבחין בהבדל.
  const rows = full ? apiRows_(ss, API.SHEETS.inspections, 101) : apiRowsParts_(ss, API.SHEETS.inspections, [[0, 15], [85, 101]]);
  if (!rows.length) return [];
  const hdr = rows[0].map(function (h) { return (apiClean_(h) || '').trim(); });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const ts = apiIso_(r[1]), name = apiClean_(r[0]);
    if (!ts || !name) continue;
    const sections = !full ? null : API_INSPECTION_SECTIONS.map(function (s) {
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
      sections: full ? sections : undefined, guidance: full ? apiClean_(r[84]) : null, address: apiClean_(r[89]),
      lastReplaced: { zeria: apiClean_(r[85]), hashaka: apiClean_(r[86]), reservoir: apiClean_(r[87]), chabad: apiClean_(r[88]) },
      repairs: { reservoir: apiNum_(r[92]) || 0, zeria: apiNum_(r[93]) || 0, hashaka: apiNum_(r[95]) || 0, chabad: apiNum_(r[97]) || 0, bor: apiNum_(r[99]) || 0, roof: apiNum_(r[100]) || 0 },
    });
  }
  out.sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
  return out;
}

function apiTasks_(ss) {
  const rows = apiRows_(ss, API.SHEETS.tasks, 21); // הקוד קורא עד r[20]
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


// ==================== API ציבורי לאתר ====================
/**
 * <WebApp URL>?action=public                — כל המקוואות הפעילים שבפיקוח
 * &council=... &region=... &q=...           — סינון
 * &callback=fn                              — JSONP (לאתר שלא יכול לקרוא JSON חוצה-דומיין)
 * &since=<ISO>                              — רק מה שהשתנה מאז (לפי updatedAt)
 *
 * מוחזר רק מידע שמיועד לציבור: שם, יישוב, כתובת, מצב (פעיל / בשיפוץ / סגור),
 * טלפונים, שעות פתיחה, הנגשה, תאום מראש, ותוקף תעודת הכשרות.
 */
function apiPublic_(e) {
  const p = (e && e.parameter) || {};
  const ss = apiSpreadsheet_();
  const mikvaot = apiMikvaot_(ss);
  const contractors = {};
  apiContractors_(ss).forEach(function (c) { contractors[apiNorm_(c.mikveh)] = c; });

  const q = String(p.q || '').trim();
  const out = [];
  mikvaot.forEach(function (m) {
    if (String(m.supervised || '').trim() !== 'כן') return;
    if (p.council && apiNorm_(m.council) !== apiNorm_(p.council)) return;
    if (p.region && apiNorm_(m.region) !== apiNorm_(p.region)) return;
    if (q && [m.name, m.place, m.council, m.address].join(' ').indexOf(q) < 0) return;
    const act = String(m.activity || '').trim();
    const c = contractors[m.id];
    const status = act === 'בשיפוץ' ? 'בשיפוץ' : act === 'מושבת' ? 'סגור' : 'פעיל';
    const updatedAt = m.certificateDate || m.lastInspectionDate || null;
    if (p.since && updatedAt && updatedAt <= p.since) return;
    out.push(apiCompact_({
      id: m.id, name: m.name, council: m.council, place: m.place, address: m.address, region: m.region,
      status: status, statusNote: status !== 'פעיל' && c && c.work ? c.work : null,
      phone: m.mikvehPhone, attendantPhone: m.phone,
      hours: apiCompact_({ summer: m.hoursSummer, winter: m.hoursWinter, erev: m.hoursErev, motzash: m.hoursMotzash }),
      accessibility: m.accessibility, coordination: m.coordination,
      certificate: m.certificate, certificateValid: !!(m.certificate && String(m.certificate).indexOf('אינו') < 0),
      lastInspection: m.lastInspection, updatedAt: updatedAt,
    }));
  });
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });

  const payload = { ok: true, generatedAt: new Date().toISOString(), count: out.length, mikvaot: out };
  const cb = String(p.callback || '').replace(/[^\w.$]/g, '');
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonResponse_(payload);
}
