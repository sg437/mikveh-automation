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

    sh.appendRow(row);
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
