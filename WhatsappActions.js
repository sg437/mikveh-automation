/************************************************************************
 * עדכון חי מהוואטסאפ לתיק המקווה (WhatsappActions.gs)
 * ========================================================
 * כשג'מיני מזהה בדיווח בוואטסאפ פעולה שבוצעה (ריקון מאגר, החלפת/מילוי אוצר,
 * חידוש תעודה, תיקון, ביקור) במקווה מזוהה — נרשמת שורה בלשונית הפעולות
 * ("אוצר זריעה") של גיליון המקוואות, באותו מבנה עמודות של טפסי הדיווח.
 * כך הפעולה מופיעה מיד בכרטיס המקווה באפליקציה, ותעודה מקבלת תוקף לשנה.
 *
 * הפעלה: Script Property בשם WA_AUTO_ACTIONS עם הערך 1 (ברירת מחדל: כבוי).
 * נדרש גם MIKVAOT_SHEET_ID (ראה Api.js).
 *
 * לשונית מוגנת: אם בעלי הגיליון הגנו על לשונית הפעולות והחשבון שמריץ את
 * הסקריפט אינו מורשה לכתוב בה — השורה לא הולכת לאיבוד. היא נשמרת בלשונית
 * "פעולות ממתינות" ונרשמת בתיק אוטומטית ברגע שההרשאה מתווספת. במקום שגיאה
 * על כל דיווח נשלחת התראה אחת ביממה, עם הסבר מה לתקן.
 ************************************************************************/

const WA_ACTIONS = {
  ENABLED_PROP: 'WA_AUTO_ACTIONS',
  ACTIONS_SHEET: 'אוצר זריעה',
  // סוג הפעולה מג'מיני -> שם הפעולה כפי שנרשם בגיליון
  MAP: {
    'ריקון מאגר': 'ריקון מאגר',
    'החלפת אוצר': 'החלפת אוצר',
    'מילוי אוצר': 'החלפת אוצר',
    'חידוש תעודה': 'חידוש תעודה',
    'תיקון': 'תיקון כשרות',
    'ביקור': 'ביקור כשרות',
  },
  COLS: 22, // מספר העמודות בלשונית הפעולות
  PENDING_SHEET: 'פעולות ממתינות',            // בגיליון של הסקריפט (ליד "תור נכנס")
  PENDING_HEADERS: ['נשמר', 'מקווה', 'פעולה', 'שורה לתיק (JSON)'],
  BLOCKED_PROP: 'WA_ACTIONS_BLOCKED_AT',      // מתי נשלחה ההתראה האחרונה על חסימה
  BLOCKED_ALERT_HOURS: 24,                    // לכל היותר התראה אחת ביממה
  RETRY_MIN: 15,                              // כל כמה דקות מנסים שוב לרשום את הממתינות
};

/**
 * רושם את הפעולה בתיק המקווה. מחזיר טקסט קצר להערת העיבוד ('' אם לא נרשם).
 * לעולם לא זורק שגיאה — כדי לא לעצור את עיבוד ההודעה.
 */
function recordWhatsappAction_(queueRow, result) {
  try {
    if (getProp_(WA_ACTIONS.ENABLED_PROP) !== '1') return '';
    if (!result || result.is_report === false || !result.mikveh_name) return '';
    const action = WA_ACTIONS.MAP[result.action_type || ''];
    if (!action) return '';

    const sheetId = getProp_(API.SHEET_ID_PROP);
    if (!sheetId) return 'לא נרשם בתיק: חסר MIKVAOT_SHEET_ID';
    const sh = SpreadsheetApp.openById(sheetId).getSheetByName(WA_ACTIONS.ACTIONS_SHEET);
    if (!sh) return 'לא נרשם בתיק: הלשונית "' + WA_ACTIONS.ACTIONS_SHEET + '" לא נמצאה';

    // תאריך הביצוע: מהדיווח אם צוין, אחרת זמן קבלת ההודעה
    let when = null;
    if (result.done_date) {
      const p = result.done_date.split('-');
      when = new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
    }
    if (!when || isNaN(when)) when = parseStamp_(queueRow[COLS.RECEIVED - 1]) || new Date();

    const phone = String(queueRow[COLS.SENDER_PHONE - 1] || '').trim();
    // אם השולח רשום במערכת (לפי טלפון) – הפעולה נרשמת על שמו במערכת
    const known = authUserByPhone_(SpreadsheetApp.openById(sheetId), phone);
    const sender = known ? known.name : String(queueRow[COLS.SENDER_NAME - 1] || '').trim();
    const otzar = /חב/.test(result.otzar || '') ? "חב''ד" : /השקה/.test(result.otzar || '') ? 'השקה' : /זריעה/.test(result.otzar || '') ? 'זריעה' : '';
    const note = 'מוואטסאפ: ' + (result.summary || '');

    const row = [];
    for (let i = 0; i < WA_ACTIONS.COLS; i++) row.push('');
    row[0] = when;                 // חותמת זמן
    row[1] = sender;               // שם הרב / המדווח
    row[2] = result.mikveh_name;   // שם המקוה
    row[4] = phone;                // טלפון
    row[5] = action;               // פעולות
    row[10] = note;                // הערה

    if (action === 'החלפת אוצר') {
      row[6] = otzar;
      if (result.action_type === 'מילוי אוצר') row[9] = 'מילוי תקין';
    } else if (action === 'ריקון מאגר') {
      row[12] = 'ריקון המאגר';
    } else if (action === 'חידוש תעודה') {
      // תוקף לשנה: אותו חודש עברי בשנה הבאה
      const h = HebDate.addYears(HebDate.fromDate(when), 1);
      row[20] = HebDate.monthName(h.year, h.month);
      row[21] = HebDate.yearLabel(h.year).replace("''", '"'); // בעמודת השנה נהוג פ"ז (גרשיים) ולא פ''ז
    }

    waFlushPending_(sh); // קודם הממתינות, כדי לשמור על סדר הדיווחים
    try {
      sh.appendRow(row);
    } catch (err) {
      if (!waIsProtectionError_(err)) throw err;
      const waiting = waQueuePending_(row);
      waReportBlocked_(waiting);
      return 'ממתין לרישום בתיק: הלשונית "' + WA_ACTIONS.ACTIONS_SHEET + '" מוגנת. יירשם אוטומטית כשתתווסף הרשאה';
    }
    apiInvalidateData_(); // דיווח מהוואטסאפ נכנס לתיק – שהאפליקציה תראה אותו מיד
    const hebWhen = HebDate.format(when);
    if (action === 'חידוש תעודה') return 'נרשם בתיק: חידוש תעודה ' + hebWhen + ', תוקף עד ' + row[20] + ' ' + row[21];
    return 'נרשם בתיק: ' + action + (otzar ? ' ' + otzar : '') + ' ' + hebWhen;
  } catch (err) {
    try {
      getSheet_(CONFIG.ERROR_SHEET).appendRow([new Date(), 'WhatsappActions', String(err), JSON.stringify(result || {}).slice(0, 500)]);
    } catch (ignore) {}
    return 'שגיאה ברישום הפעולה בתיק: ' + String(err).slice(0, 120);
  }
}

// ==================== לשונית מוגנת: שמירה בצד ורישום חוזר ====================

/** האם זו שגיאת "ניסית לערוך אובייקט או תא מוגן" (בעברית או באנגלית) */
function waIsProtectionError_(err) {
  return /מוגן|protected/i.test(String(err && err.message ? err.message : err));
}

/** שומר שורה שלא נרשמה בתיק. מחזיר כמה שורות ממתינות עכשיו. */
function waQueuePending_(row) {
  const sh = getSheet_(WA_ACTIONS.PENDING_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(WA_ACTIONS.PENDING_HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  const copy = row.slice();
  copy[0] = copy[0] instanceof Date ? copy[0].toISOString() : copy[0];
  sh.appendRow([new Date(), row[2], row[5], JSON.stringify(copy)]);
  return sh.getLastRow() - 1;
}

/**
 * מנסה לרשום בתיק את השורות הממתינות, לפי הסדר. נעצר בשקט אם הלשונית עדיין
 * מוגנת. מחזיר כמה נרשמו. actionsSheet – לשונית הפעולות, אם כבר פתוחה.
 */
function waFlushPending_(actionsSheet) {
  const pending = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WA_ACTIONS.PENDING_SHEET);
  if (!pending || pending.getLastRow() < 2) return 0;
  let target = actionsSheet;
  if (!target) {
    const sheetId = getProp_(API.SHEET_ID_PROP);
    if (!sheetId) return 0;
    target = SpreadsheetApp.openById(sheetId).getSheetByName(WA_ACTIONS.ACTIONS_SHEET);
    if (!target) return 0;
  }
  const values = pending.getRange(2, 4, pending.getLastRow() - 1, 1).getValues();
  let done = 0;
  for (let i = 0; i < values.length; i++) {
    let row;
    try { row = JSON.parse(String(values[i][0])); } catch (bad) { done++; continue; } // שורה פגומה – מדלגים
    if (row[0]) row[0] = new Date(row[0]);
    try {
      target.appendRow(row);
    } catch (err) {
      if (!waIsProtectionError_(err)) throw err;
      break; // עדיין מוגן – ננסה בפעם הבאה
    }
    done++;
  }
  if (done) {
    pending.deleteRows(2, done);
    apiInvalidateData_();
  }
  // הכל נרשם – החסימה נפתרה, ואם תחזור תישלח עליה התראה מחדש
  if (pending.getLastRow() < 2) PropertiesService.getScriptProperties().deleteProperty(WA_ACTIONS.BLOCKED_PROP);
  return done;
}

/** נקרא מ-processQueue: ניסיון חוזר לרישום הממתינות, לכל היותר פעם ב-RETRY_MIN דקות */
function waRetryPending_() {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('wa_pending_retry')) return;
    cache.put('wa_pending_retry', '1', WA_ACTIONS.RETRY_MIN * 60);
    waFlushPending_(null);
  } catch (err) {
    logError_('WhatsappActions (רישום חוזר)', err, '');
  }
}

/** התראה אחת ביממה (דרך לשונית "שגיאות") על כך שהלשונית מוגנת */
function waReportBlocked_(waiting) {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty(WA_ACTIONS.BLOCKED_PROP) || 0);
  if (last && Date.now() - last < WA_ACTIONS.BLOCKED_ALERT_HOURS * 3600 * 1000) return;
  props.setProperty(WA_ACTIONS.BLOCKED_PROP, String(Date.now()));
  let who = '';
  try { who = Session.getEffectiveUser().getEmail(); } catch (ignore) {}
  getSheet_(CONFIG.ERROR_SHEET).appendRow([new Date(), 'WhatsappActions',
    'הלשונית "' + WA_ACTIONS.ACTIONS_SHEET + '" בגיליון המקוואות מוגנת, והחשבון ' + (who || 'שמריץ את הסקריפט') +
    ' אינו רשאי לכתוב בה. ' + waiting + ' דיווחים שמורים בלשונית "' + WA_ACTIONS.PENDING_SHEET +
    '" ויירשמו בתיק אוטומטית כשתתווסף הרשאה (נתונים ← גיליונות וטווחים מוגנים). התראה הבאה בעוד יממה לכל המוקדם.',
    '']);
}

/** בדיקה ידנית מעורך הסקריפט: רושם פעולת דוגמה (רק אם WA_AUTO_ACTIONS=1). */
function testWhatsappAction() {
  const queueRow = [];
  queueRow[COLS.RECEIVED - 1] = new Date();
  queueRow[COLS.SENDER_NAME - 1] = 'בדיקה';
  queueRow[COLS.SENDER_PHONE - 1] = '';
  const list = getMikvehList_();
  const note = recordWhatsappAction_(queueRow, {
    is_report: true, mikveh_name: list[0].name, action_type: 'ביקור', otzar: '', done_date: '', summary: 'בדיקת מערכת — ניתן למחוק שורה זו',
  });
  Logger.log(note || 'לא נרשם (WA_AUTO_ACTIONS כבוי?)');
}
