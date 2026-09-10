/************************************************************************
 * מערכת כשרות המקוואות — גרסה 2 (Apps Script)
 * ========================================================
 * שלבים 1–3: הקולט, הארכיון הגולמי, והמוח (ג'מיני + תיוק חכם + יומן)
 *
 * תפקיד הקובץ: לקבל את ה-Webhook מ-Green API ברגע שנשלחת הודעה
 * בקבוצת הוואטסאפ, לבדוק כפילויות לפי idMessage, ולרשום שורה
 * גולמית בלשונית "תור נכנס" בסטטוס "ממתין".
 *
 * שום עיבוד לא קורה כאן — רק קליטה בטוחה. העיבוד (ג'מיני, דרייב,
 * יומן) יגיע בשלבים 2–3 בפונקציה נפרדת שרצה על טריגר.
 *
 * מנהל המערכת: שמוליק גולדמן
 ************************************************************************/

// ==================== הגדרות כלליות ====================

const CONFIG = {
  QUEUE_SHEET: 'תור נכנס',
  ERROR_SHEET: 'שגיאות',
  REPORT_SHEET: 'יומן דיווחים',
  LIST_SHEET: 'רשימת מיקומים',
  TIMEZONE: 'Asia/Jerusalem',

  // סוגי Webhook שאנחנו קולטים (הודעות נכנסות מחברי הקבוצה)
  ACCEPTED_WEBHOOKS: ['incomingMessageReceived'],

  // סוגי הודעות שאין טעם לרשום (אימוג'י-תגובה וכו')
  IGNORED_TYPES: ['reactionMessage'],
};

// תרגום סוג המדיה לעברית (כמו ה-switch הישן בבלון 23)
const TYPE_LABELS = {
  textMessage: 'טקסט',
  extendedTextMessage: 'טקסט',
  quotedMessage: 'טקסט (ציטוט)',
  imageMessage: 'תמונה',
  videoMessage: 'סרטון',
  audioMessage: 'הודעה קולית',
  documentMessage: 'מסמך',
  stickerMessage: 'סטיקר',
  locationMessage: 'מיקום',
  contactMessage: 'איש קשר',
};

// עמודות לשונית "תור נכנס" — סדר העמודות קבוע, לא לשנות!
const QUEUE_HEADERS = [
  'התקבל בשעה',        // A
  'idMessage',          // B — המפתח הייחודי ("פתרון הברזל")
  'טקסט מאוחד',        // C — ifempty(text, extendedText, caption)
  'שם שולח',           // D
  'טלפון שולח',        // E
  'סוג הודעה',         // F
  'downloadUrl',        // G
  'שם קובץ מקורי',     // H
  'mimeType',           // I
  'סטטוס',             // J — ממתין / טופל / שגיאה
  'הערות עיבוד',       // K — ימולא ע"י המעבד בשלב 3
  'chatId',             // L
  'JSON גולמי',        // M — לדיבוג
  'קישור ארכיון גולמי', // N — ימולא ע"י המעבד (שלב 2)
];

// ==================== נקודת הכניסה: קליטת ה-Webhook ====================

/**
 * Green API שולח POST לכתובת ה-Web App על כל אירוע.
 * חשוב: הפונקציה תמיד מחזירה 200 כדי ש-Green API לא יעשה Retry אינסופי.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ status: 'ignored', reason: 'no body' });
    }

    // ★ שכבת אבטחה: אימות טוקן סודי מהכתובת (?token=...).
    //   נאכפת רק כאשר מוגדר WEBHOOK_TOKEN ב-Script Properties —
    //   וכך אפשר לפרוס בלי שום הפסקת שירות.
    const expectedToken = getProp_('WEBHOOK_TOKEN');
    if (expectedToken) {
      const gotToken = (e.parameter && e.parameter.token) || '';
      if (gotToken !== expectedToken) {
        // דחייה שקטה — בלי מידע למי שמנסה לנחש
        return jsonResponse_({ status: 'forbidden' });
      }
    }

    // ★ תקופת מעבר: מעבירים עותק מדויק ל-Make לפני כל עיבוד,
    //   כדי שהמערכת הקיימת תמשיך לעבוד כרגיל בלי שום שינוי.
    forwardToMake_(e.postData.contents);

    const data = JSON.parse(e.postData.contents);
    const result = handleNotification_(data);
    return jsonResponse_(result);

  } catch (err) {
    // גם שגיאה נרשמת — ומחזירים 200 כדי לא לחסום את התור של Green API
    try {
      logError_('doPost', err, e && e.postData ? e.postData.contents : '');
    } catch (ignore) {}
    return jsonResponse_({ status: 'error', message: String(err) });
  }
}

/**
 * GET: בלי פרמטרים — בדיקת חיים (פתיחת כתובת ה-Web App בדפדפן).
 * עם ?action=... — ה-API של האפליקציה האחודה (ראה Api.js).
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action) return apiHandle_(e, action);
  return ContentService.createTextOutput(
    '✅ מערכת כשרות המקוואות — הקולט פעיל. ' +
    Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss')
  );
}

// ==================== הלוגיקה המרכזית ====================

function handleNotification_(data) {
  // 1. מסננים סוגי Webhook שלא רלוונטיים (סטטוסים, הודעות יוצאות וכו')
  if (CONFIG.ACCEPTED_WEBHOOKS.indexOf(data.typeWebhook) === -1) {
    return { status: 'ignored', reason: 'webhook type: ' + data.typeWebhook };
  }

  const md = data.messageData || {};
  const sd = data.senderData || {};
  const typeMessage = md.typeMessage || '';

  // 2. מתעלמים מתגובות-אימוג'י וכדומה
  if (CONFIG.IGNORED_TYPES.indexOf(typeMessage) !== -1) {
    return { status: 'ignored', reason: 'message type: ' + typeMessage };
  }

  // 3. סינון לפי קבוצה — אם הוגדר GROUP_CHAT_ID ב-Script Properties,
  //    קולטים רק הודעות מהקבוצה הזו. אם לא הוגדר — קולטים הכל
  //    (שימושי בהרצה הראשונה כדי לגלות את ה-chatId של הקבוצה).
  const targetGroup = getProp_('GROUP_CHAT_ID');
  if (targetGroup && sd.chatId !== targetGroup) {
    return { status: 'ignored', reason: 'other chat: ' + sd.chatId };
  }

  const idMessage = data.idMessage || '';
  if (!idMessage) {
    return { status: 'ignored', reason: 'no idMessage' };
  }

  // 4. נעילה — מונע התנגשות בין שני Webhooks שמגיעים באותה שנייה
  //    (ה-Race Condition המוכר מבאג מספר 1)
  const lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    // 5. בדיקת כפילויות לפי idMessage — קודם במטמון מהיר, ואז בגיליון
    if (isDuplicate_(idMessage)) {
      return { status: 'duplicate', idMessage: idMessage };
    }

    // 6. איחוד הטקסט — המקבילה של נוסחת ifempty הישנה
    const text = extractText_(md);
    const fileData = md.fileMessageData || {};

    const row = [
      Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'),
      idMessage,
      text,
      sd.senderName || sd.senderContactName || '',
      cleanPhone_(sd.sender),
      TYPE_LABELS[typeMessage] || typeMessage,
      fileData.downloadUrl || '',
      fileData.fileName || '',
      fileData.mimeType || '',
      'ממתין',
      '',
      sd.chatId || '',
      JSON.stringify(data).slice(0, 45000),
    ];

    getSheet_(CONFIG.QUEUE_SHEET).appendRow(row);

    // רושמים במטמון ל-6 שעות למניעת כפילות מהירה
    CacheService.getScriptCache().put('msg_' + idMessage, '1', 21600);

    return { status: 'queued', idMessage: idMessage };

  } finally {
    lock.releaseLock();
  }
}

// ==================== פונקציות עזר ====================

/** ifempty: טקסט רגיל → טקסט מורחב → כיתוב של קובץ */
function extractText_(md) {
  if (md.textMessageData && md.textMessageData.textMessage) {
    return md.textMessageData.textMessage;
  }
  if (md.extendedTextMessageData && md.extendedTextMessageData.text) {
    return md.extendedTextMessageData.text;
  }
  if (md.fileMessageData && md.fileMessageData.caption) {
    return md.fileMessageData.caption;
  }
  return '';
}

/** בדיקת כפילות: מטמון מהיר ואז חיפוש בעמודה B בגיליון */
function isDuplicate_(idMessage) {
  if (CacheService.getScriptCache().get('msg_' + idMessage)) {
    return true;
  }
  const sheet = getSheet_(CONFIG.QUEUE_SHEET);
  const found = sheet.getRange('B:B')
    .createTextFinder(idMessage)
    .matchEntireCell(true)
    .findNext();
  return found !== null;
}

/** 972501234567@c.us → 972501234567 */
function cleanPhone_(sender) {
  return (sender || '').replace('@c.us', '').replace('@g.us', '');
}

/** מחזיר לשונית לפי שם, ויוצר אותה אם חסרה */
function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * מעביר את גוף ה-Webhook המקורי כמו-שהוא אל ה-Webhook של Make.
 * פעיל רק אם הוגדר MAKE_FORWARD_URL ב-Script Properties.
 * בסיום תקופת המעבר — פשוט מוחקים את ה-Property וההעברה נפסקת.
 */
function forwardToMake_(rawBody) {
  const url = getProp_('MAKE_FORWARD_URL');
  if (!url) return;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: rawBody,
      muteHttpExceptions: true,
    });
  } catch (err) {
    // כשל בהעברה ל-Make לא עוצר את הקליטה שלנו — רק נרשם בשגיאות
    logError_('forwardToMake', err, rawBody);
  }
}

/** רישום שגיאה בלשונית "שגיאות" */
function logError_(where, err, raw) {
  getSheet_(CONFIG.ERROR_SHEET).appendRow([
    Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'),
    where,
    String(err && err.stack ? err.stack : err),
    String(raw || '').slice(0, 45000),
  ]);
}

// ==================== שלב 2: המעבד — הארכיון הגולמי ====================
/*
 * processQueue רץ כל דקה על טריגר. בשלב הנוכחי הוא עושה דבר אחד:
 * לכל שורה בתור בסטטוס "ממתין" שיש לה downloadUrl וטרם אורכבה —
 * מוריד את הקובץ מ-Green API ומעלה אותו לתיקיית החודש (MM-YYYY)
 * שבתוך תיקיית "הארכיון הגולמי" (חפש-או-צור, בלי תיקיות כפולות).
 * בשלב 3 נרחיב את אותה פונקציה: ג'מיני, תיוק חכם ורישום ביומן.
 */

const COLS = {
  RECEIVED: 1,      // A
  ID_MESSAGE: 2,    // B
  TEXT: 3,          // C
  SENDER_NAME: 4,   // D
  SENDER_PHONE: 5,  // E
  TYPE: 6,          // F
  DOWNLOAD_URL: 7,  // G
  FILE_NAME: 8,     // H
  MIME: 9,          // I
  STATUS: 10,       // J
  NOTES: 11,        // K
  CHAT_ID: 12,      // L
  RAW_JSON: 13,     // M
  ARCHIVE_LINK: 14, // N
};

const MAX_PER_RUN = 8; // הגבלת עומס לריצה אחת (כולל קריאות ג'מיני)

function processQueue() {
  // נעילה — אם הריצה הקודמת עוד באוויר, מוותרים והטריגר הבא ישלים
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  const startedAt = new Date().getTime();

  try {
    const sheet = getSheet_(CONFIG.QUEUE_SHEET);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // בדיקת מוכנות שלב 3 — אם עוד לא הוגדרו המפתחות/הרשימה,
    // הארכוב הגולמי ממשיך לעבוד והניתוח ממתין (שום שורה לא נהרסת).
    const notReady = stage3Ready_();

    const rows = sheet.getRange(2, 1, lastRow - 1, COLS.ARCHIVE_LINK).getValues();
    let processed = 0;

    for (let i = 0; i < rows.length; i++) {
      if (processed >= MAX_PER_RUN) break;
      // מרווח ביטחון מתקרת 6 הדקות של Apps Script
      if (new Date().getTime() - startedAt > 4.5 * 60 * 1000) break;

      const row = rows[i];
      const rowNum = i + 2;
      if (row[COLS.STATUS - 1] !== 'ממתין') continue;

      try {
        if (processRow_(sheet, rowNum, row, notReady)) processed++;
      } catch (err) {
        sheet.getRange(rowNum, COLS.STATUS).setValue('שגיאה');
        sheet.getRange(rowNum, COLS.NOTES).setValue(String(err).slice(0, 400));
        logError_('processQueue שורה ' + rowNum, err, String(row[COLS.ID_MESSAGE - 1]));
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/** מוריד קובץ מ-Green API ומעלה לתיקיית החודש בארכיון הגולמי */
function archiveRawFile_(row) {
  const resp = UrlFetchApp.fetch(row[COLS.DOWNLOAD_URL - 1], {
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('הורדה נכשלה, קוד ' + resp.getResponseCode());
  }

  const blob = resp.getBlob();
  blob.setName(buildFileName_(row));

  const folder = getMonthlyArchiveFolder_();
  const file = folder.createFile(blob);
  return file.getUrl();
}

/** תיקיית "החודש הנוכחי" בתוך הארכיון הגולמי — חפש-או-צור */
function getMonthlyArchiveFolder_() {
  const rootId = getProp_('RAW_ARCHIVE_FOLDER_ID');
  if (!rootId) {
    throw new Error('חסר RAW_ARCHIVE_FOLDER_ID ב-Script Properties');
  }
  const root = DriveApp.getFolderById(rootId);
  const monthName = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM-yyyy');
  return findOrCreateFolder_(root, monthName);
}

/** הפתרון לתיקיות הכפולות: קודם מחפשים, יוצרים רק אם אין */
function findOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * שם קובץ בפורמט: תאריך_טקסט_שם-מקורי.סיומת
 * כולל הגנת ifempty — קובץ בלי טקסט ובלי שם לא מפיל את הדרייב.
 */
function buildFileName_(row) {
  const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MM-yyyy_HH-mm');
  const text = sanitizeName_(String(row[COLS.TEXT - 1] || '')).slice(0, 40);
  const original = sanitizeName_(String(row[COLS.FILE_NAME - 1] || ''));

  let name = stamp;
  if (text) name += '_' + text;
  if (original) name += '_' + original;
  if (!text && !original) name += '_קובץ ללא שם';

  // אם אין סיומת — משלימים לפי ה-mimeType
  if (name.indexOf('.') === -1) {
    name += '.' + extFromMime_(String(row[COLS.MIME - 1] || ''));
  }
  return name;
}

function sanitizeName_(s) {
  return s.replace(/[\\/:*?"<>|#\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extFromMime_(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'application/pdf': 'pdf',
  };
  return map[mime] || 'bin';
}

/** ★ מריצים פעם אחת ★ מתקין טריגר שמריץ את המעבד כל דקה */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processQueue') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(1).create();
  Logger.log('✅ הטריגר הותקן — המעבד ירוץ כל דקה.');
}

/** ★ מריצים פעם אחת אחרי שלב 1 ★ מוסיף את עמודה N לגיליון קיים */
function upgradeSheets() {
  const sheet = getSheet_(CONFIG.QUEUE_SHEET);
  const cell = sheet.getRange(1, COLS.ARCHIVE_LINK);
  if (!cell.getValue()) {
    cell.setValue('קישור ארכיון גולמי')
      .setFontWeight('bold')
      .setBackground('#d9e2f3');
  }
  Logger.log('✅ הגיליון שודרג.');
}

// ==================== שלב 3: המוח — ג'מיני, תיוק חכם ויומן ====================

const STAGE3 = {
  ATTACH_WINDOW_MIN: 6,  // חלון הצמדת מדיה לדיווח קודם של אותו שולח (5 + דקת ביטחון)
  ORPHAN_WAIT_MIN: 5,    // כמה דקות מדיה בלי טקסט מחכה לפני תיוק עצמאי
  MAX_INLINE_MB: 14,     // גודל מרבי של קובץ שנשלח לג'מיני (תמלול)
};

// עמודות לשונית "יומן דיווחים" — עמודה I היא idMessage ("פתרון הברזל")
const REPORT_HEADERS = [
  'תאריך ושעה',            // A
  'שם שולח',               // B
  'טלפון',                 // C
  'טקסט הדיווח / תמלול',   // D
  'שם מקווה',              // E
  'יישוב',                 // F
  'סוג ליקוי',             // G
  'תקציר',                 // H
  'idMessage',              // I
  'קישורי מדיה (תיוק חכם)', // J
  'קישור ארכיון גולמי',    // K
  'סטטוס זיהוי',           // L
];

const RCOLS = {
  STAMP: 1, SENDER: 2, PHONE: 3, TEXT: 4, MIKVEH: 5, SETTLEMENT: 6,
  DEFECT: 7, SUMMARY: 8, ID_MESSAGE: 9, MEDIA_LINKS: 10, RAW_LINK: 11, ID_STATUS: 12,
};

/**
 * עיבוד שורה אחת מהתור. מחזיר true אם בוצעה עבודה (נספר במכסה),
 * false אם השורה ממתינה בכוונה (למשל מדיה שמחכה לטקסט משלים).
 */
function processRow_(sheet, rowNum, row, notReady) {
  // --- 1) ארכוב גולמי (שלב 2) — תמיד קודם, זו רשת הביטחון ---
  let archiveLink = String(row[COLS.ARCHIVE_LINK - 1] || '');
  const hasMedia = !!row[COLS.DOWNLOAD_URL - 1];

  if (hasMedia && !archiveLink) {
    archiveLink = archiveRawFile_(row);
    sheet.getRange(rowNum, COLS.ARCHIVE_LINK).setValue(archiveLink);
  }

  // --- 2) שלב 3 עוד לא מוגדר? עוצרים כאן בעדינות ---
  if (notReady) {
    if (!row[COLS.NOTES - 1]) {
      sheet.getRange(rowNum, COLS.NOTES).setValue('ממתין להגדרת שלב 3: ' + notReady);
    }
    return hasMedia && archiveLink !== '';
  }

  const text = String(row[COLS.TEXT - 1] || '').trim();
  const type = String(row[COLS.TYPE - 1] || '');
  const isAudio = type === 'הודעה קולית';

  // --- 3) הודעה בלי שום תוכן לעיבוד (סטיקר, איש קשר וכו') ---
  if (!text && !isAudio && !hasMedia) {
    markDone_(sheet, rowNum, 'אין תוכן לעיבוד (סוג: ' + type + ')');
    return true;
  }

  // --- 4) יש טקסט, או אודיו לתמלול → ניתוח מלא בג'מיני ---
  if (text || isAudio) {
    let blob = null;
    if (isAudio && archiveLink) {
      blob = safeBlobForGemini_(archiveLink);
    }

    const result = analyzeWithGemini_(text, blob);
    const logRowNum = appendToReportLog_(row, result, archiveLink);
    // רישום אוטומטי של הפעולה בתיק המקווה (פעיל רק כש-WA_AUTO_ACTIONS=1)
    const actionNote = recordWhatsappAction_(row, result);

    if (hasMedia && archiveLink) {
      const smartLink = fileToSmartArchive_(archiveLink, result.mikveh_name, result.settlement);
      appendMediaLink_(logRowNum, smartLink);
    }

    markDone_(sheet, rowNum, buildDoneNote_(result) + (actionNote ? ' | ' + actionNote : ''));
    return true;
  }

  // --- 5) מדיה בלי טקסט: מנסים להצמיד לדיווח קודם של אותו שולח ---
  const phone = String(row[COLS.SENDER_PHONE - 1] || '');
  let receivedAt = parseStamp_(row[COLS.RECEIVED - 1]);
  if (!receivedAt) receivedAt = new Date();

  const parent = findRecentReportBySender_(phone, receivedAt);
  if (parent) {
    const smartLink = fileToSmartArchive_(archiveLink, parent.mikveh, parent.settlement);
    appendMediaLink_(parent.rowNum, smartLink);
    appendLinkToCell_(parent.rowNum, RCOLS.RAW_LINK, archiveLink);
    markDone_(sheet, rowNum, 'הוצמד לדיווח בשורה ' + parent.rowNum + ' ביומן');
    return true;
  }

  // --- 6) עדיין צעירה — ממתינים שהטקסט המשלים יגיע ("חדר ההמתנה") ---
  const ageMin = (new Date().getTime() - receivedAt.getTime()) / 60000;
  if (ageMin < STAGE3.ORPHAN_WAIT_MIN) {
    if (!row[COLS.NOTES - 1]) {
      sheet.getRange(rowNum, COLS.NOTES).setValue('ממתין לטקסט משלים...');
    }
    return false;
  }

  // --- 7) מדיה יתומה — נרשמת ביומן ומתויקת במיקומים כלליים ---
  const orphan = {
    is_report: true, mikveh_name: null, settlement: null,
    defect_type: '', summary: 'מדיה ללא טקסט מלווה', transcript: null,
  };
  const logRowNum = appendToReportLog_(row, orphan, archiveLink);
  const smartLink = fileToSmartArchive_(archiveLink, null, null);
  appendMediaLink_(logRowNum, smartLink);
  markDone_(sheet, rowNum, 'מדיה ללא טקסט — תויקה במיקומים כלליים');
  return true;
}

/** בדיקה שכל ההגדרות של שלב 3 קיימות. מחזיר '' אם הכל מוכן */
function stage3Ready_() {
  if (!getProp_('GEMINI_API_KEY')) return 'חסר GEMINI_API_KEY';
  if (!getProp_('MIKVEH_ARCHIVE_FOLDER_ID')) return 'חסר MIKVEH_ARCHIVE_FOLDER_ID';
  if (!getProp_('LOCATIONS_FOLDER_ID')) return 'חסר LOCATIONS_FOLDER_ID';
  try {
    getMikvehList_();
  } catch (err) {
    return String(err.message || err);
  }
  return '';
}

// -------------------- ג'מיני --------------------

/**
 * שולח את הדיווח (ועם אודיו — גם את הקובץ לתמלול) לג'מיני,
 * ומקבל JSON מובנה לפי סכמה קשיחה. כולל 3 ניסיונות (בלון 67 הישן).
 */
function analyzeWithGemini_(text, blob) {
  const key = getProp_('GEMINI_API_KEY');
  const model = getProp_('GEMINI_MODEL') || 'gemini-2.5-flash';
  const names = getMikvehList_();

  const parts = [];
  if (blob) {
    parts.push({
      inline_data: {
        mime_type: geminiMime_(blob),
        data: Utilities.base64Encode(blob.getBytes()),
      },
    });
  }
  parts.push({ text: buildPrompt_(text, names, !!blob) });

  const body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          is_report: { type: 'BOOLEAN' },
          mikveh_name: { type: 'STRING' },
          settlement: { type: 'STRING' },
          defect_type: { type: 'STRING' },
          summary: { type: 'STRING' },
          transcript: { type: 'STRING' },
          action_type: { type: 'STRING' },
          otzar: { type: 'STRING' },
          done_date: { type: 'STRING' },
        },
        required: ['is_report', 'summary'],
      },
    },
  };

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    model + ':generateContent?key=' + key;

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
      });
      const httpCode = resp.getResponseCode();

      if (httpCode === 200) {
        const data = JSON.parse(resp.getContentText());
        const answer = data.candidates[0].content.parts[0].text;
        return normalizeGeminiResult_(JSON.parse(answer), names);
      }

      // 429 / 5xx — שווה לנסות שוב; שגיאות אחרות — לעצור מיד
      if (httpCode === 429 || httpCode >= 500) {
        lastErr = new Error('ג\'מיני החזיר קוד ' + httpCode);
      } else {
        throw new Error('ג\'מיני קוד ' + httpCode + ': ' +
          resp.getContentText().slice(0, 300));
      }
    } catch (err) {
      lastErr = err;
    }
    Utilities.sleep(attempt * 15000); // 15, 30 שניות בין ניסיונות
  }
  throw lastErr;
}

/**
 * אכיפת הרשימה הסגורה: שם שלא קיים ברשימה יורד לרמת "יישוב".
 * בנוסף מסמן ערים מרובות מקוואות (ambiguous_city) לצורך סטטוס ביומן.
 */
function normalizeGeminiResult_(parsed, list) {
  parsed.mikveh_name = String(parsed.mikveh_name || '').trim() || null;
  parsed.settlement = String(parsed.settlement || '').trim() || null;
  parsed.defect_type = String(parsed.defect_type || '').trim();
  parsed.summary = String(parsed.summary || '').trim();
  parsed.transcript = String(parsed.transcript || '').trim() || null;
  parsed.ambiguous_city = false;
  // פעולה שבוצעה (לרישום אוטומטי בתיק המקווה – ראה WhatsappActions.js)
  parsed.action_type = String(parsed.action_type || '').trim();
  parsed.otzar = String(parsed.otzar || '').trim();
  parsed.done_date = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.done_date || '').trim()) ? String(parsed.done_date).trim() : '';

  if (parsed.mikveh_name) {
    let exact = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].name === parsed.mikveh_name) { exact = list[i].name; break; }
    }
    if (!exact) {
      if (!parsed.settlement) parsed.settlement = parsed.mikveh_name;
      parsed.mikveh_name = null;
    }
  }

  // עיר שמופיעה ברשימה עם יותר ממקווה אחד — דרוש בירור ידני
  if (!parsed.mikveh_name && parsed.settlement) {
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].city === parsed.settlement) count++;
    }
    if (count > 1) parsed.ambiguous_city = true;
  }
  return parsed;
}

function buildPrompt_(text, names, hasBlob) {
  const listLines = names.map(function (m) {
    return m.city ? m.name + ' | עיר: ' + m.city : m.name;
  });

  const lines = [
    'אתה מערכת ניתוח דיווחים של מפקחי כשרות מקוואות בקבוצת וואטסאפ.',
    '',
    'רשימת המקוואות הרשמית (רשימה סגורה — מותר להחזיר רק שם מלא מתוכה, אות באות). הפורמט: שם מלא | עיר:',
    listLines.join('\n'),
    '',
    'דיווח המפקח: <<<' + (text || '(לא צורף טקסט)') + '>>>',
  ];
  if (hasBlob) {
    lines.push('מצורף קובץ מדיה: אם זה אודיו — תמלל אותו במלואו לעברית לשדה transcript ונתח לפי התמלול. אם זו תמונה — נתח את הנראה בה.');
  }
  lines.push(
    '',
    'הנחיות:',
    '- is_report: true אם זה דיווח פיקוח/תחזוקה/בדיקה אמיתי. false אם זו שיחה כללית, ברכה, תודה או הודעה מנהלתית.',
    '- mikveh_name: השם המלא המדויק מהרשימה הסגורה בלבד. תקן שגיאות כתיב, קיצורים ושמות חלקיים (למשל "תושיא" שייך למקווה בתושיה).',
    '- חשוב — ערים עם כמה מקוואות: אם המפקח ציין רק שם עיר (למשל "אור עקיבא") ובעיר הזו יש יותר ממקווה אחד ברשימה, ואין בדיווח רמז חד-משמעי לאיזה מהם הכוונה — אל תנחש! השאר את mikveh_name ריק ורשום את שם העיר בשדה settlement. אם בעיר יש מקווה אחד בלבד — החזר את שמו המלא מהרשימה.',
    '- settlement: רק אם אין mikveh_name — שם העיר/היישוב בכתיב תקני. אחרת ריק.',
    '- defect_type: אחד מאלה: תחזוקה / ליקוי / בדיקה שוטפת / אישור מעבדה / אחר.',
    '- summary: תקציר של משפט אחד בעברית.',
    '- transcript: תמלול מלא, רק אם צורף אודיו.',
    '- action_type: הפעולה שהדיווח אומר שבוצעה בפועל, אחת מאלה בלבד: ריקון מאגר / החלפת אוצר / מילוי אוצר / חידוש תעודה / תיקון / ביקור / אחר. אם זה רק תכנון, בקשה או שאלה — "אחר".',
    '- otzar: רק אם action_type הוא החלפת אוצר או מילוי אוצר: זריעה / השקה / חב"ד. אחרת ריק.',
    '- done_date: תאריך הביצוע בפורמט YYYY-MM-DD רק אם צוין במפורש בדיווח (למשל "אתמול" ביחס להיום ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd') + '). אחרת ריק.'
  );
  return lines.join('\n');
}

/**
 * רשימת המקוואות הקנונית מלשונית "רשימת מיקומים" (מטמון 10 דק').
 * עמודה A = שם מקווה מלא (קנוני, שם התיקייה), עמודה B = עיר.
 * מחזיר מערך של { name, city }.
 */
function getMikvehList_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('mikveh_list_v2');
  if (cached) return JSON.parse(cached);

  const sheet = getSheet_(CONFIG.LIST_SHEET);
  const last = sheet.getLastRow();
  if (last < 2) {
    throw new Error('לשונית "רשימת מיקומים" ריקה — יש להדביק שם מלא בעמודה A ועיר בעמודה B');
  }

  const values = sheet.getRange(2, 1, last - 1, 2).getValues();
  const list = [];
  values.forEach(function (v) {
    const name = String(v[0] || '').trim();
    const city = String(v[1] || '').trim();
    if (name) list.push({ name: name, city: city });
  });
  if (!list.length) {
    throw new Error('לא נמצאו שמות בעמודה A של "רשימת מיקומים"');
  }
  cache.put('mikveh_list_v2', JSON.stringify(list), 600);
  return list;
}

function geminiMime_(blob) {
  const ct = String(blob.getContentType() || '');
  if (ct.indexOf('audio/ogg') === 0) return 'audio/ogg';
  return ct || 'application/octet-stream';
}

/** מביא את קובץ הארכיון לשליחה לג'מיני, עם מגבלת גודל */
function safeBlobForGemini_(archiveLink) {
  try {
    const file = DriveApp.getFileById(fileIdFromUrl_(archiveLink));
    if (file.getSize() > STAGE3.MAX_INLINE_MB * 1024 * 1024) return null;
    return file.getBlob();
  } catch (err) {
    return null;
  }
}

// -------------------- יומן הדיווחים --------------------

/** מוסיף שורת דיווח ליומן ומחזיר את מספר השורה */
function appendToReportLog_(queueRow, result, archiveLink) {
  const sheet = getSheet_(CONFIG.REPORT_SHEET);

  const originalText = String(queueRow[COLS.TEXT - 1] || '');
  const textOut = result.transcript
    ? (originalText ? originalText + '\n' : '') + '🎤 תמלול: ' + result.transcript
    : originalText;

  let idStatus;
  if (result.mikveh_name) idStatus = 'מזוהה';
  else if (result.settlement && result.ambiguous_city) idStatus = 'עיר מרובת מקוואות — דרוש בירור';
  else if (result.settlement) idStatus = 'יישוב בלבד';
  else if (result.is_report === false) idStatus = 'לא דיווח';
  else idStatus = 'לא זוהה';

  sheet.appendRow([
    queueRow[COLS.RECEIVED - 1] || '',
    String(queueRow[COLS.SENDER_NAME - 1] || ''),
    String(queueRow[COLS.SENDER_PHONE - 1] || ''),
    textOut,
    result.mikveh_name || '',
    result.settlement || '',
    result.defect_type || '',
    result.summary || '',
    String(queueRow[COLS.ID_MESSAGE - 1] || ''),
    '',
    archiveLink || '',
    idStatus,
  ]);
  return sheet.getLastRow();
}

/** מוסיף קישור מדיה לתא הקישורים של שורת יומן (קובץ 1, קובץ 2...) */
function appendMediaLink_(logRowNum, link) {
  appendLinkToCell_(logRowNum, RCOLS.MEDIA_LINKS, link);
}

/**
 * מוסיף קישור לתא כרשימת "קובץ N" — כל שורה לחיצה בפני עצמה.
 * יודע לקלוט גם תאים ישנים שמכילים כתובת רגילה ולהמיר אותם.
 */
function appendLinkToCell_(rowNum, col, link) {
  if (!link) return;
  const cell = getSheet_(CONFIG.REPORT_SHEET).getRange(rowNum, col);

  const old = cell.getRichTextValue();
  const oldText = old ? old.getText() : String(cell.getValue() || '');

  // אוספים את הקישורים שכבר קיימים בתא, בכל פורמט
  const urls = [];
  if (oldText) {
    const lines = oldText.split('\n');
    lines.forEach(function (line) {
      urls.push(line.indexOf('http') === 0 ? line.trim() : '');
    });
    if (old) {
      old.getRuns().forEach(function (run) {
        const u = run.getLinkUrl();
        if (!u) return;
        const before = oldText.slice(0, run.getStartIndex());
        const lineIdx = before.split('\n').length - 1;
        if (lineIdx < urls.length && !urls[lineIdx]) urls[lineIdx] = u;
      });
    }
  }
  urls.push(link);

  // בונים מחדש: קובץ 1, קובץ 2, ... — כל תווית עם הקישור שלה
  const labels = urls.map(function (_, i) { return 'קובץ ' + (i + 1); });
  const text = labels.join('\n');
  const builder = SpreadsheetApp.newRichTextValue().setText(text);
  let pos = 0;
  labels.forEach(function (label, i) {
    if (urls[i]) builder.setLinkUrl(pos, pos + label.length, urls[i]);
    pos += label.length + 1;
  });
  cell.setRichTextValue(builder.build());
}

/**
 * "פתרון הברזל" בגרסת קוד: מחפש ביומן, מלמטה למעלה, דיווח אחרון
 * של אותו שולח בתוך חלון הזמן — כדי להצמיד אליו מדיה שהגיעה בנפרד.
 */
function findRecentReportBySender_(phone, receivedAt) {
  if (!phone) return null;
  const sheet = getSheet_(CONFIG.REPORT_SHEET);
  const last = sheet.getLastRow();
  if (last < 2) return null;

  const count = Math.min(50, last - 1);
  const values = sheet.getRange(last - count + 1, 1, count, RCOLS.SETTLEMENT).getValues();

  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (String(v[RCOLS.PHONE - 1]) !== phone) continue;

    const stamp = parseStamp_(v[RCOLS.STAMP - 1]);
    if (!stamp) continue;

    const diffMin = Math.abs(receivedAt.getTime() - stamp.getTime()) / 60000;
    if (diffMin <= STAGE3.ATTACH_WINDOW_MIN) {
      return {
        rowNum: last - count + 1 + i,
        mikveh: String(v[RCOLS.MIKVEH - 1] || '') || null,
        settlement: String(v[RCOLS.SETTLEMENT - 1] || '') || null,
      };
    }
  }
  return null;
}

// -------------------- תיוק חכם בדרייב --------------------

/**
 * מעתיק את הקובץ מהארכיון הגולמי אל היעד החכם:
 * מקווה מזוהה  → ארכיון לפי מקווה / שם המקווה / שנה
 * אחרת         → מיקומים כלליים / [יישוב או "לא זוהה"] - MM-YYYY
 */
function fileToSmartArchive_(archiveLink, mikveh, settlement) {
  if (!archiveLink) return '';
  const file = DriveApp.getFileById(fileIdFromUrl_(archiveLink));

  let target;
  if (mikveh) {
    const root = DriveApp.getFolderById(requireProp_('MIKVEH_ARCHIVE_FOLDER_ID'));
    const mikvehFolder = findOrCreateFolder_(root, sanitizeName_(mikveh));
    const year = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy');
    target = findOrCreateFolder_(mikvehFolder, year);
  } else {
    const root = DriveApp.getFolderById(requireProp_('LOCATIONS_FOLDER_ID'));
    const label = settlement ? sanitizeName_(settlement) : 'לא זוהה';
    const month = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM-yyyy');
    target = findOrCreateFolder_(root, label + ' - ' + month);
  }

  const copy = file.makeCopy(file.getName(), target);
  return copy.getUrl();
}

// -------------------- עזרים לשלב 3 --------------------

function markDone_(sheet, rowNum, note) {
  sheet.getRange(rowNum, COLS.STATUS).setValue('טופל');
  sheet.getRange(rowNum, COLS.NOTES).setValue(String(note || '').slice(0, 400));
}

function buildDoneNote_(result) {
  if (result.is_report === false) return 'לא דיווח (שיחה כללית)';
  if (result.mikveh_name) return 'זוהה: ' + result.mikveh_name;
  if (result.settlement && result.ambiguous_city) return 'עיר מרובת מקוואות: ' + result.settlement + ' — דרוש בירור';
  if (result.settlement) return 'יישוב: ' + result.settlement;
  return 'לא זוהה — תויק במיקומים כלליים';
}

/** מחלץ מזהה קובץ דרייב מתוך קישור */
function fileIdFromUrl_(url) {
  const m = String(url).match(/[-\w]{25,}/);
  if (!m) throw new Error('לא ניתן לחלץ מזהה קובץ מהקישור: ' + url);
  return m[0];
}

function requireProp_(key) {
  const v = getProp_(key);
  if (!v) throw new Error('חסר ' + key + ' ב-Script Properties');
  return v;
}

/** ממיר חותמת זמן (Date, מחרוזת עברית או פורמט אחר) לאובייקט Date */
function parseStamp_(v) {
  if (v instanceof Date) return v;

  // פורמט המערכת: dd/MM/yyyy HH:mm:ss
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
  }

  // רשת ביטחון: כל פורמט אחר שג'אווהסקריפט יודע לפענח
  // (כולל שורות ישנות שנכתבו בפורמט האנגלי הארוך)
  const d = new Date(String(v || ''));
  return isNaN(d.getTime()) ? null : d;
}

/** ★ מריצים פעם אחת בשלב 3 ★ יוצר את יומן הדיווחים ורשימת המיקומים */
function setupStage3() {
  const report = getSheet_(CONFIG.REPORT_SHEET);
  if (report.getLastRow() === 0) {
    report.appendRow(REPORT_HEADERS);
    report.getRange(1, 1, 1, REPORT_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#d9ead3');
    report.setFrozenRows(1);
  }

  const list = getSheet_(CONFIG.LIST_SHEET);
  if (list.getLastRow() === 0) {
    list.getRange(1, 1, 1, 2).setValues([['שם מקווה מלא (קנוני)', 'עיר']])
      .setFontWeight('bold')
      .setBackground('#d9ead3');
    list.setFrozenRows(1);
  }

  Logger.log('✅ לשוניות שלב 3 מוכנות. הדבק את רשימת המקוואות בעמודה A של "רשימת מיקומים".');
}

/** בדיקת ג'מיני ידנית — בלי לגעת בתור וביומן */
function testGemini() {
  const result = analyzeWithGemini_('בדיקה במקווה תושיא, הכל תקין, הוחלף פילטר', null);
  Logger.log(JSON.stringify(result, null, 2));
}

// ==================== התקנה ובדיקות (מריצים ידנית) ====================

/**
 * ★ מריצים פעם אחת אחרי הדבקת הקוד ★
 * יוצר את הלשוניות עם הכותרות ומבקש את ההרשאות הנדרשות.
 */
function setupSheets() {
  const queue = getSheet_(CONFIG.QUEUE_SHEET);
  if (queue.getLastRow() === 0) {
    queue.appendRow(QUEUE_HEADERS);
    queue.getRange(1, 1, 1, QUEUE_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#d9e2f3');
    queue.setFrozenRows(1);
  }

  const errors = getSheet_(CONFIG.ERROR_SHEET);
  if (errors.getLastRow() === 0) {
    errors.appendRow(['זמן', 'מקור', 'שגיאה', 'מידע גולמי']);
    errors.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f4cccc');
    errors.setFrozenRows(1);
  }

  Logger.log('✅ הלשוניות מוכנות. אפשר להמשיך לפריסת ה-Web App.');
}

/**
 * בדיקה פנימית — מדמה הודעת וואטסאפ נכנסת בלי Green API.
 * אחרי ההרצה אמורה להופיע שורה חדשה ב"תור נכנס".
 */
function testFakeMessage() {
  const fake = {
    typeWebhook: 'incomingMessageReceived',
    idMessage: 'TEST_' + new Date().getTime(),
    senderData: {
      chatId: '00000000000000000@g.us',
      sender: '972500000000@c.us',
      senderName: 'בדיקה פנימית',
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: 'בדיקת מערכת — מקווה תושיה, הכל תקין' },
    },
  };
  const result = handleNotification_(fake);
  Logger.log(JSON.stringify(result));
}
