/************************************************************************
 * שאלה לקבוצת הוואטסאפ ותשובות מזוהות (Questions.gs)
 * ========================================================
 * שולחים מהמערכת שאלה לקבוצה ("כתבו את כתובת המייל שלכם"), וכל מי שעונה —
 * התשובה נרשמת בגיליון **עם השם והטלפון של מי שכתב אותה**, ונשלחת התראה
 * לשואל. כך אין צורך לאסוף תשובות מהקבוצה ביד ולנחש מי כתב מה.
 *
 * איך תשובה מזוהה:
 *   1. **תשובה מצוטטת** (Reply על הודעת השאלה) — הדרך הבטוחה. הודעה כזו
 *      נרשמת כתשובה בלבד ואינה נכנסת לתור הדיווחים.
 *   2. שאלה מסוג "אימייל" או "טלפון": גם הודעה רגילה בקבוצה שיש בה כתובת
 *      מייל / מספר טלפון נקלטת כתשובה — כי כך אנשים עונים בפועל. הודעה כזו
 *      ממשיכה גם לתור הרגיל, שלא נאבד דיווח שבמקרה יש בו כתובת מייל.
 *
 * שאלה מסוג "אימייל" גם משלימה את כתובת המייל בלשונית "משתמשים", למי
 * שרשום שם לפי הטלפון שלו ואין לו עדיין כתובת.
 *
 * הפעלה: GROUP_CHAT_ID + GREEN_ID_INSTANCE + GREEN_API_TOKEN (כמו שאר הגשר).
 * שליחה וצפייה בתשובות: במערכת ⇠ "הגדרות והרשאות" ⇠ "שאלה לקבוצה".
 ************************************************************************/

const ASK = {
  SHEET: 'שאלות לקבוצה',
  HEADERS: ['מזהה ההודעה', 'נשלחה בשעה', 'נשלחה ע"י', 'טלפון השואל', 'סוג', 'השאלה', 'chatId', 'סטטוס', 'נסגרה בשעה'],
  ANSWERS_SHEET: 'תשובות מהקבוצה',
  ANSWERS_HEADERS: ['זמן', 'מזהה השאלה', 'השאלה', 'שם העונה', 'טלפון', 'התשובה', 'מה נעשה', 'idMessage'],
  OPEN: 'פתוחה',
  CLOSED: 'סגורה',
  MAX_AGE_DAYS: 60,     // שאלה ישנה מזה כבר לא קולטת תשובות
  MAX_TEXT: 900,        // אורך השאלה (מגבלת הודעה בוואטסאפ היא הרבה מעבר)
  MAX_ANSWER: 500,
  LIMIT: 300,           // כמה תשובות מוחזרות לאפליקציה
  TYPES: {
    email: { label: 'כתובת אימייל', hint: 'לדוגמה: name@gmail.com', re: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/ },
    phone: { label: 'מספר טלפון', hint: 'לדוגמה: 050-1234567', re: /0\d{1,2}[-\s]?\d{7}/ },
    text: { label: 'תשובה חופשית', hint: '', re: null },
  },
};

function askEnabled_() {
  return !!getProp_('GROUP_CHAT_ID') && !!getProp_('GREEN_ID_INSTANCE') && !!getProp_('GREEN_API_TOKEN');
}

function askType_(t) { return ASK.TYPES[String(t || 'text')] ? String(t) : 'text'; }

function askSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

/** הודעת וואטסאפ לצ'אט כלשהו (קבוצה או אדם). מחזיר idMessage או ''. לא זורק. */
function askSay_(chatId, text, quotedMessageId) {
  try {
    const idInstance = getProp_('GREEN_ID_INSTANCE'), apiToken = getProp_('GREEN_API_TOKEN');
    if (!chatId || !idInstance || !apiToken) return '';
    const url = 'https://api.green-api.com/waInstance' + idInstance + '/sendMessage/' + apiToken;
    const send = function (payload) {
      return UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(payload) });
    };
    let resp = send(quotedMessageId ? { chatId: chatId, message: text, quotedMessageId: quotedMessageId } : { chatId: chatId, message: text });
    // ציטוט של הודעה ישנה עלול להיכשל — אז שולחים בלי ציטוט
    if (resp.getResponseCode() !== 200 && quotedMessageId) resp = send({ chatId: chatId, message: text });
    if (resp.getResponseCode() !== 200) return '';
    const body = JSON.parse(resp.getContentText() || '{}');
    return String(body.idMessage || '');
  } catch (err) {
    Logger.log('askSay_ failed: ' + err);
    return '';
  }
}

// ==================== שליחת השאלה ====================

/**
 * ?action=askGroup — שולח שאלה לקבוצה. d = { text, type }
 * הרשומה נשמרת בלשונית "שאלות לקבוצה", ומזהה ההודעה הוא המפתח שדרכו
 * מזוהות התשובות.
 */
function askSend_(ss, d, user) {
  if (!askEnabled_()) return { error: 'הגשר לוואטסאפ אינו מוגדר (GROUP_CHAT_ID + Green API)' };
  const text = String((d && d.text) || '').trim().slice(0, ASK.MAX_TEXT);
  if (!text) return { error: 'חסרה השאלה' };
  const type = askType_(d && d.type);
  const t = ASK.TYPES[type];
  const chatId = getProp_('GROUP_CHAT_ID');

  let msg = '❓ *' + text + '*\n\n';
  msg += 'להשיב *בתשובה להודעה הזו* (Reply / החלקה על ההודעה)' +
    (t.re ? ', או פשוט לכתוב בקבוצה את ה' + (type === 'email' ? 'כתובת' : 'מספר') + '.' : '.') + '\n';
  if (t.hint) msg += t.hint + '\n';
  msg += 'התשובה נרשמת אוטומטית על שמך ונשלחת ל' + (user && user.name ? user.name : 'מנהל המערכת') + '.';

  const id = askSay_(chatId, msg, '');
  if (!id) return { error: 'שליחת ההודעה לקבוצה נכשלה. בדוק את חיבור Green API.' };

  const now = new Date();
  askSheet_(ss, ASK.SHEET, ASK.HEADERS).appendRow([id, now, (user && user.name) || '', (user && user.phone) || '',
    type, text, chatId, ASK.OPEN, '']);
  return { ok: true, question: { id: id, ts: apiIsoDate_(now), by: (user && user.name) || '', type: type, text: text, status: ASK.OPEN, answers: 0 } };
}

/** ?action=closeQuestion — סוגר שאלה: תשובות חדשות לא ייקלטו אליה. */
function askClose_(ss, d, user) {
  const id = String((d && d.id) || '');
  const sh = ss.getSheetByName(ASK.SHEET);
  if (!id || !sh || sh.getLastRow() < 2) return { error: 'שאלה לא נמצאה' };
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, ASK.HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).toUpperCase() !== id.toUpperCase()) continue;
    const by = String(values[i][2] || '');
    if (user && user.role !== 'מנהל' && by && by !== user.name) return { error: 'רק מי ששלח את השאלה (או מנהל) יכול לסגור אותה' };
    const closing = String(d.reopen ? ASK.OPEN : ASK.CLOSED);
    sh.getRange(i + 2, 8, 1, 2).setValues([[closing, d.reopen ? '' : new Date()]]);
    return { ok: true, id: id, status: closing };
  }
  return { error: 'שאלה לא נמצאה' };
}

// ==================== קליטת התשובות ====================

/** מזהה ההודעה שצוטטה, בכל אחד מהמבנים ש-Green API שולח. */
function askQuotedId_(md) {
  const cands = [md && md.quotedMessage, md && md.extendedTextMessageData, md && md.contextInfo, md];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (c && c.stanzaId) return String(c.stanzaId);
    if (c && c.quotedMessageId) return String(c.quotedMessageId);
  }
  return '';
}

/** שאלות פתוחות (החדשה ראשונה), עם מספר השורה בגיליון. */
function askOpenQuestions_(ss) {
  const sh = ss.getSheetByName(ASK.SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, ASK.HEADERS.length).getValues();
  const now = new Date();
  const out = [];
  values.forEach(function (v, i) {
    if (!v[0]) return;
    if (String(v[7] || ASK.OPEN) !== ASK.OPEN) return;
    const opened = parseStamp_(v[1]) || now;
    if ((now - opened) / 86400000 > ASK.MAX_AGE_DAYS) return;
    out.push({ rowNum: i + 2, id: String(v[0]), ts: opened, by: String(v[2] || ''), byPhone: String(v[3] || ''),
      type: askType_(v[4]), text: String(v[5] || ''), chatId: String(v[6] || '') });
  });
  return out.sort(function (a, b) { return b.ts - a.ts; });
}

/**
 * נקרא מ-handleNotification_ על כל הודעת טקסט מהקבוצה.
 * מחזיר null כשההודעה אינה תשובה, או { skipQueue } כשהיא נקלטה כתשובה.
 * לעולם לא זורק שגיאה — הודעה רגילה חייבת להמשיך לתור גם אם משהו כאן נשבר.
 */
function askCapture_(data, text) {
  try {
    const md = (data && data.messageData) || {}, sd = (data && data.senderData) || {};
    const body = String(text || '').trim();
    if (!body) return null;
    const sheetId = getProp_(API.SHEET_ID_PROP);
    if (!sheetId) return null;
    const ss = SpreadsheetApp.openById(sheetId);
    const open = askOpenQuestions_(ss);
    if (!open.length) return null;

    // 1. תשובה מצוטטת — הזיהוי הוודאי
    const quoted = askQuotedId_(md).toUpperCase();
    let q = quoted ? open.filter(function (x) { return x.id.toUpperCase() === quoted; })[0] : null;
    let skipQueue = !!q;

    // 2. שאלה שמחפשת מייל/טלפון — גם הודעה רגילה שיש בה כזה נחשבת תשובה,
    //    אבל היא ממשיכה גם לתור הרגיל, כדי שדיווח לא ייבלע.
    let value = body.slice(0, ASK.MAX_ANSWER);
    if (!q) {
      for (let i = 0; i < open.length; i++) {
        const re = ASK.TYPES[open[i].type].re;
        if (re && re.test(body)) { q = open[i]; value = body.match(re)[0]; break; }
      }
    } else {
      const re = ASK.TYPES[q.type].re;
      const m = re ? body.match(re) : null;
      if (m) value = m[0];
    }
    if (!q) return null;

    const name = String(sd.senderName || sd.senderContactName || '').trim();
    const phone = chatIdToPhone_(sd.sender);
    const idMessage = String((data && data.idMessage) || '');

    // אותה הודעה לא נרשמת פעמיים (Green API שולח גם עותק יוצא)
    const cache = CacheService.getScriptCache();
    const key = 'ask_' + q.id + '_' + (idMessage || phone + '_' + value);
    if (cache.get(key)) return { skipQueue: skipQueue };
    cache.put(key, '1', 21600);

    const done = askApplyAnswer_(ss, q, { name: name, phone: phone, value: value });
    askSheet_(ss, ASK.ANSWERS_SHEET, ASK.ANSWERS_HEADERS)
      .appendRow([new Date(), q.id, q.text, name, phone, value, done, idMessage]);

    askNotifyAsker_(q, { name: name, phone: phone, value: value, done: done });
    // אישור אישי לעונה — בקבוצה זה היה מציף, בפרטי זה בדיוק מה שצריך
    if (sd.sender) askSay_(String(sd.sender), '✅ התשובה שלך נרשמה: ' + value + '\n(' + q.text + ')', '');
    return { skipQueue: skipQueue, question: q.id };
  } catch (err) {
    try { logError_('askCapture_', err, JSON.stringify(data || {}).slice(0, 500)); } catch (ignore) {}
    return null;
  }
}

/**
 * מה עושים עם התשובה עצמה. כרגע: שאלת "אימייל" משלימה את הכתובת בלשונית
 * "משתמשים" למי שרשום שם לפי הטלפון ואין לו כתובת. מחזיר טקסט קצר ליומן.
 */
function askApplyAnswer_(ss, q, ans) {
  try {
    if (q.type !== 'email') return '';
    const u = authUserByPhone_(ss, ans.phone);
    if (!u) return 'לא רשום במערכת';
    if (u.email) return u.email === ans.value.toLowerCase() ? 'כבר רשום' : 'שונה מהכתובת הרשומה (' + u.email + ')';
    const sh = ss.getSheetByName(AUTH.USERS_SHEET);
    if (!sh) return '';
    sh.getRange(u.rowNum, 3).setValue(ans.value.toLowerCase());
    return 'נרשם כאימייל של ' + u.name;
  } catch (err) {
    Logger.log('askApplyAnswer_ failed: ' + err);
    return '';
  }
}

/** התראה לשואל (ולמי שמוגדר ב-ALERT_CHAT_ID), עם שם וטלפון של מי שענה. */
function askNotifyAsker_(q, ans) {
  const text = '📥 תשובה לשאלה: ' + q.text + '\n\n' +
    '👤 ' + (ans.name || 'ללא שם') + (ans.phone ? ' · ' + ans.phone : '') + '\n' +
    '✉️ ' + ans.value + (ans.done ? '\n(' + ans.done + ')' : '');
  const targets = {};
  const asker = phoneToChatId_(q.byPhone);
  if (asker) targets[asker] = true;
  const alert = getProp_('ALERT_CHAT_ID');
  if (alert) targets[alert] = true;
  Object.keys(targets).forEach(function (chatId) { askSay_(chatId, text, ''); });
}

// ==================== קריאה מהאפליקציה ====================

/** ?action=questions — השאלות והתשובות, למסך "שאלה לקבוצה". */
function askList_(ss) {
  const sh = ss.getSheetByName(ASK.SHEET);
  const questions = [];
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, ASK.HEADERS.length).getValues().forEach(function (v) {
      if (!v[0]) return;
      questions.push({ id: String(v[0]), ts: apiIso_(v[1]), by: apiClean_(v[2]) || '', byPhone: apiClean_(v[3]) || '',
        type: askType_(v[4]), text: apiClean_(v[5]) || '', status: String(v[7] || ASK.OPEN), closedAt: apiIso_(v[8]) });
    });
  }
  const ash = ss.getSheetByName(ASK.ANSWERS_SHEET);
  const answers = [];
  if (ash && ash.getLastRow() > 1) {
    const last = ash.getLastRow();
    const from = Math.max(2, last - ASK.LIMIT + 1);
    ash.getRange(from, 1, last - from + 1, ASK.ANSWERS_HEADERS.length).getValues().forEach(function (v) {
      if (!v[1]) return;
      answers.push({ ts: apiIso_(v[0]), question: String(v[1]), name: apiClean_(v[3]) || '', phone: apiClean_(v[4]) || '',
        value: apiClean_(v[5]) || '', note: apiClean_(v[6]) || '' });
    });
  }
  return { ok: true, questions: questions.reverse(), answers: answers.reverse(), enabled: askEnabled_(), types: ASK.TYPES ? Object.keys(ASK.TYPES).map(function (k) { return { key: k, label: ASK.TYPES[k].label }; }) : [] };
}

// ==================== בדיקות מעורך הסקריפט ====================

/** בדיקה: מה מוגדר, אילו שאלות פתוחות, וכמה תשובות הגיעו. */
function testAskGroup() {
  Logger.log('— הגדרות —');
  Logger.log('GROUP_CHAT_ID: ' + (getProp_('GROUP_CHAT_ID') || '(חסר)'));
  Logger.log('Green API: ' + (getProp_('GREEN_ID_INSTANCE') && getProp_('GREEN_API_TOKEN') ? 'מוגדר' : '(חסר)'));
  Logger.log('ALERT_CHAT_ID: ' + (getProp_('ALERT_CHAT_ID') || '(חסר — ההתראה תגיע רק לטלפון של השואל)'));
  const sheetId = getProp_(API.SHEET_ID_PROP);
  if (!sheetId) { Logger.log('❌ חסר MIKVAOT_SHEET_ID'); return; }
  const ss = SpreadsheetApp.openById(sheetId);
  const open = askOpenQuestions_(ss);
  Logger.log('— שאלות פתוחות: ' + open.length + ' —');
  open.forEach(function (q) { Logger.log(q.id + ' | ' + ASK.TYPES[q.type].label + ' | ' + q.text); });
  const ash = ss.getSheetByName(ASK.ANSWERS_SHEET);
  Logger.log('— תשובות: ' + (ash ? Math.max(0, ash.getLastRow() - 1) : 0) + ' —');
  if (ash && ash.getLastRow() > 1) {
    const last = ash.getLastRow();
    ash.getRange(Math.max(2, last - 4), 1, Math.min(5, last - 1), ASK.ANSWERS_HEADERS.length)
      .getValues().forEach(function (r) { Logger.log(r.join(' | ')); });
  }
  Logger.log('תשובה שאינה מגיעה: לוודא ש-incomingWebhook דלוק ב-Green API (setupWorkPollWebhooks מדליק אותו).');
}
