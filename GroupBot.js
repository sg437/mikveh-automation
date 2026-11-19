/************************************************************************
 * הבוט בקבוצת הכשרות (GroupBot.gs)
 * ========================================================
 * כשדיווח בקבוצה לא שויך למקווה, הבוט שואל בקבוצה (בציטוט ההודעה המקורית),
 * ומי שמשיב — הדיווח משויך, התמונות עוברות לתיקיית המקווה, הפעולה נרשמת
 * בתיק, והבוט מאשר. דיווח שזוהה כרגיל — הבוט שותק.
 *
 * מתי הבוט שואל:
 *   • תמונה / סרטון / הקלטה בלי כיתוב, שלא הוצמדו לדיווח של אותו שולח
 *   • שם מקווה שלא קיים ברשימה ("לא מצאתי מקווה בשם...")
 *   • עיר עם כמה מקוואות (הבוט מציג רשימה ממוספרת, ואפשר לענות במספר)
 *   • דיווח על פעולה (ריקון, החלפת אוצר...) בלי שום שם מקום
 *
 * איך מזוהה תשובה:
 *   1. תשובה בציטוט הודעת הבוט — מכל אחד בקבוצה (גם מפקח אחר).
 *   2. הודעה קצרה של אותו שולח, עד חצי שעה אחרי השאלה, בלי ציטוט —
 *      רק אם היא באמת מזוהה כמקווה. אחרת היא מטופלת כהודעה רגילה.
 *   תשובה שלא זוהתה (בציטוט) — הבוט מבקש שוב פעם אחת, ואחר כך מעביר
 *   לבירור ידני ושולח התראה ל-ALERT_CHAT_ID.
 *
 * הפעלה — Script Property בשם WA_GROUP_BOT:
 *   (ריק)  כבוי. ברירת המחדל.
 *   test   מצב בדיקה: הבוט פועל רק בצ'אט הפרטי של ALERT_CHAT_ID מול המספר
 *          שמחובר ל-Green API. שולחים לשם תמונה / דיווח ורואים מה הבוט עונה.
 *          הודעות מהצ'אט הזה נרשמות ביומן, אבל לא בתיק המקווה.
 *   1      פעיל בקבוצה (GROUP_CHAT_ID).
 * נדרשים גם GREEN_ID_INSTANCE + GREEN_API_TOKEN (כבר מוגדרים).
 *
 * תיוג אמיתי (@) של מי שנשאל — Script Property בשם WA_GROUP_BOT_MENTION עם 1.
 * במקום השם נכתב @מספר, ונשלח לצידו mentions כדי שוואטסאפ יציג אותו כתיוג
 * עם התראה. אם השליחה עם תיוג נכשלת — נשלחת אותה הודעה עם השם, בלי תיוג.
 * בלי המאפיין: השם כטקסט רגיל (בלי התראה מיוחדת).
 *
 * השאלות נשמרות בלשונית "שאלות הבוט" בגיליון של הסקריפט.
 ************************************************************************/

const BOT = {
  PROP: 'WA_GROUP_BOT',
  MENTION_PROP: 'WA_GROUP_BOT_MENTION',
  SHEET: 'שאלות הבוט',
  HEADERS: ['מזהה הודעת הבוט', 'נשאלה בשעה', 'סוג', 'שם השולח', 'טלפון השולח', 'idMessage מקורי',
    'שורה ביומן', 'סטטוס', 'אפשרויות', 'ניתוח מקורי', 'ניסיונות', 'נסגרה בשעה', 'מקווה שנקבע', 'נקבע ע"י'],
  C: { ID: 0, ASKED: 1, KIND: 2, NAME: 3, PHONE: 4, ORIG: 5, LOGROW: 6, STATUS: 7, OPTIONS: 8,
    ANALYSIS: 9, TRIES: 10, CLOSED: 11, MIKVEH: 12, BY: 13 },
  OPEN: 'פתוחה',
  DONE: 'שויך',
  MANUAL: 'לבירור ידני',
  OPEN_HOURS: 48,          // אחרי זה תשובה בציטוט כבר לא נקלטת
  UNQUOTED_MIN: 30,        // תשובה בלי ציטוט — רק מאותו שולח ובתוך חצי שעה
  UNQUOTED_MAX_CHARS: 60,  // ורק הודעה קצרה (שם מקווה, לא דיווח שלם)
  SENDER_GAP_MIN: 30,      // שאלה פתוחה לאותו שולח — לא שואלים אותו שוב בינתיים
  MAX_TRIES: 2,            // תשובות לא מזוהות לפני העברה לבירור ידני
  MAX_OPTIONS: 9,
};

// ==================== נוסחי ההודעות ====================
// כל מה שהבוט כותב נמצא כאן, כדי שיהיה קל לתקן ניסוח.

const BOT_TEXT = {
  REPLY_HINT: '↩️ יש להשיב *בתשובה להודעה הזו* עם שם המקווה או היישוב.',
  media: function (name, what) {
    return '📷 ' + name + ', ' + what + ' בלי כיתוב.\nלאיזה מקווה זה שייך?\n\n' + BOT_TEXT.REPLY_HINT;
  },
  unknown: function (name, place) {
    return '❓ ' + name + ', לא מצאתי ברשימה מקווה בשם *' + place + '*.\nלאיזה מקווה הכוונה?\n\n' + BOT_TEXT.REPLY_HINT;
  },
  ambiguous: function (name, city, options) {
    return '❓ ' + (name ? name + ', ' : '') + 'ב' + city + ' יש ' + options.length + ' מקוואות:\n' +
      options.map(function (o, i) { return (i + 1) + '. ' + o; }).join('\n') +
      '\nלאיזה מהם הכוונה?\n\n↩️ יש להשיב *בתשובה להודעה הזו* עם המספר או השם.';
  },
  missing: function (name) {
    return '❓ ' + name + ', לא צוין באיזה מקווה מדובר.\nלאיזה מקווה הכוונה?\n\n' + BOT_TEXT.REPLY_HINT;
  },
  retry: function (answer) {
    return '🔎 לא מצאתי מקווה בשם *' + answer + '*.\nאפשר לכתוב את שם היישוב, או את שם המקווה כפי שהוא מופיע בתעודה.';
  },
  manual: '🙏 לא הצלחתי לזהות את המקווה. הדיווח הועבר לבירור ידני.',
  done: function (mikveh, actionNote) {
    return '✅ שויך למקווה *' + mikveh + '*' + (actionNote ? '\n📋 ' + actionNote : '');
  },
  alertManual: function (q, answer) {
    return '🔔 הבוט לא הצליח לשייך דיווח למקווה.\n👤 ' + (q.name || 'ללא שם') + (q.phone ? ' · ' + q.phone : '') +
      '\n💬 תשובה אחרונה: ' + answer + '\nבלשונית "יומן דיווחים", שורה ' + q.logRow + '.';
  },
};

const BOT_MEDIA_WHAT = {
  'תמונה': 'התקבלה תמונה',
  'סרטון': 'התקבל סרטון',
  'הודעה קולית': 'התקבלה הקלטה',
  'מסמך': 'התקבל מסמך',
};

// ==================== מצב והגדרות ====================

function botMode_() {
  const v = String(getProp_(BOT.PROP) || '').trim().toLowerCase();
  return v === '1' || v === 'test' ? v : '';
}

function botGreenReady_() {
  return !!getProp_('GREEN_ID_INSTANCE') && !!getProp_('GREEN_API_TOKEN');
}

/** האם זה צ'אט הבדיקה (ALERT_CHAT_ID) כשהבוט במצב test */
function botIsTestChatId_(chatId) {
  const alert = getProp_('ALERT_CHAT_ID');
  return botMode_() === 'test' && !!alert && String(chatId || '') === alert;
}

/** האם הבוט פעיל בצ'אט שממנו הגיעה ההודעה */
function botActiveFor_(chatId) {
  if (!botGreenReady_()) return false;
  const mode = botMode_();
  if (mode === '1') return !!getProp_('GROUP_CHAT_ID') && String(chatId || '') === getProp_('GROUP_CHAT_ID');
  if (mode === 'test') return botIsTestChatId_(chatId);
  return false;
}

function botSheet_() {
  const sh = getSheet_(BOT.SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(BOT.HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

/** שם לפנייה: השם הרשום במערכת לפי הטלפון, אחרת השם בוואטסאפ */
function botDisplayName_(queueRow) {
  const phone = String(queueRow[COLS.SENDER_PHONE - 1] || '');
  try {
    const sheetId = getProp_(API.SHEET_ID_PROP);
    if (sheetId && phone && typeof authUserByPhone_ === 'function') {
      const u = authUserByPhone_(SpreadsheetApp.openById(sheetId), phone);
      if (u && u.name) return u.name;
    }
  } catch (ignore) {}
  return String(queueRow[COLS.SENDER_NAME - 1] || '').trim();
}

// ==================== שאלה ====================

/**
 * נקרא מ-processRow_ אחרי שהדיווח נרשם ביומן. אם המקווה לא זוהה — שואל
 * בקבוצה ומחזיר הערה קצרה להערות העיבוד. לעולם לא זורק שגיאה.
 */
function botAsk_(queueRow, logRowNum, result, hasMedia) {
  try {
    const chatId = String(queueRow[COLS.CHAT_ID - 1] || '');
    if (!botActiveFor_(chatId)) return '';
    if (!result || result.is_report === false || result.mikveh_name) return '';

    const list = getMikvehList_();
    let kind = '', options = [];
    if (result.settlement && result.ambiguous_city) {
      kind = 'ambiguous';
      options = botCityOptions_(list, result.settlement);
    } else if (result.settlement) {
      kind = 'unknown';
    } else if (hasMedia && !String(queueRow[COLS.TEXT - 1] || '').trim() && queueRow[COLS.TYPE - 1] !== 'הודעה קולית') {
      kind = 'media';
    } else if (hasMedia || botIsAction_(result.action_type)) {
      kind = 'missing'; // מדיה עם כיתוב / דיווח על פעולה, בלי שום מקום. שיחה סתמית — לא שואלים.
    }
    if (!kind) return '';

    const origId = String(queueRow[COLS.ID_MESSAGE - 1] || '');
    const phone = String(queueRow[COLS.SENDER_PHONE - 1] || '');
    const cache = CacheService.getScriptCache();
    if (origId && cache.get('bot_asked_' + origId)) return '';

    const sh = botSheet_();
    const recent = botOpenQuestions_(sh).filter(function (q) {
      return q.phone === phone && (new Date() - q.asked) / 60000 <= BOT.SENDER_GAP_MIN;
    })[0];
    if (recent) return 'הבוט לא שאל: יש כבר שאלה פתוחה לאותו שולח';

    // תיוג אמיתי: @מספר במקום השם (רק כש-WA_GROUP_BOT_MENTION=1)
    const mention = botMentionFor_(queueRow);
    const realName = botDisplayName_(queueRow);
    const name = mention ? mention.tag : realName;
    let text;
    if (kind === 'ambiguous') text = BOT_TEXT.ambiguous(name, result.settlement, options);
    else if (kind === 'unknown') text = BOT_TEXT.unknown(name, result.settlement);
    else if (kind === 'media') text = BOT_TEXT.media(name, BOT_MEDIA_WHAT[String(queueRow[COLS.TYPE - 1] || '')] || 'התקבל קובץ');
    else text = BOT_TEXT.missing(name);

    let botId = mention ? botSayMention_(chatId, text, origId, mention.chatId) : askSay_(chatId, text, origId);
    // התיוג נדחה — אותה הודעה עם השם
    if (!botId && mention) botId = askSay_(chatId, text.split(mention.tag).join(realName), origId);
    if (!botId) return 'שאלת הבוט לא נשלחה (Green API)';
    if (origId) cache.put('bot_asked_' + origId, '1', 21600);

    const analysis = {
      action_type: result.action_type || '', otzar: result.otzar || '', done_date: result.done_date || '',
      summary: result.summary || '', defect_type: result.defect_type || '',
    };
    sh.appendRow([botId, new Date(), kind, realName, phone, origId, logRowNum, BOT.OPEN,
      options.length ? JSON.stringify(options) : '', JSON.stringify(analysis), 0, '', '', '']);
    return 'הבוט שאל בקבוצה לאיזה מקווה';
  } catch (err) {
    try { logError_('botAsk_', err, String(queueRow && queueRow[COLS.ID_MESSAGE - 1])); } catch (ignore) {}
    return '';
  }
}

function botIsAction_(actionType) {
  return typeof WA_ACTIONS !== 'undefined' && !!WA_ACTIONS.MAP[actionType || ''];
}

/** { tag: '@972501234567', chatId: '972501234567@c.us' } למי ששלח, או null כשהתיוג כבוי */
function botMentionFor_(queueRow) {
  if (getProp_(BOT.MENTION_PROP) !== '1') return null;
  const raw = String(queueRow[COLS.SENDER_PHONE - 1] || '').trim();
  if (!raw) return null;
  const chatId = raw.indexOf('@') >= 0 ? raw : raw.replace(/\D/g, '') + '@c.us';
  const digits = chatId.replace(/@.*$/, '').replace(/\D/g, '');
  return digits ? { tag: '@' + digits, chatId: chatId } : null;
}

/** הודעה עם תיוג. מחזיר idMessage או '' (ואז נשלחת הודעה רגילה). לא זורק. */
function botSayMention_(chatId, text, quotedMessageId, mentionChatId) {
  try {
    const url = 'https://api.green-api.com/waInstance' + getProp_('GREEN_ID_INSTANCE') + '/sendMessage/' + getProp_('GREEN_API_TOKEN');
    const payload = { chatId: chatId, message: text, mentions: [mentionChatId] };
    if (quotedMessageId) payload.quotedMessageId = quotedMessageId;
    const resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(payload) });
    if (resp.getResponseCode() !== 200) return '';
    return String(JSON.parse(resp.getContentText() || '{}').idMessage || '');
  } catch (err) {
    Logger.log('botSayMention_ failed: ' + err);
    return '';
  }
}

function botCityOptions_(list, city) {
  return list.filter(function (m) { return m.city === city; })
    .map(function (m) { return m.name; }).slice(0, BOT.MAX_OPTIONS);
}

/** השאלות הפתוחות (עד OPEN_HOURS), החדשה ראשונה, עם מספר השורה */
function botOpenQuestions_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  const C = BOT.C;
  const now = new Date();
  const out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, BOT.HEADERS.length).getValues().forEach(function (v, i) {
    if (!v[C.ID] || String(v[C.STATUS]) !== BOT.OPEN) return;
    const asked = parseStamp_(v[C.ASKED]) || now;
    if ((now - asked) / 3600000 > BOT.OPEN_HOURS) return;
    let options = [], analysis = {};
    try { options = v[C.OPTIONS] ? JSON.parse(v[C.OPTIONS]) : []; } catch (ignore) {}
    try { analysis = v[C.ANALYSIS] ? JSON.parse(v[C.ANALYSIS]) : {}; } catch (ignore) {}
    out.push({ rowNum: i + 2, id: String(v[C.ID]), asked: asked, kind: String(v[C.KIND] || ''),
      name: String(v[C.NAME] || ''), phone: String(v[C.PHONE] || ''), origId: String(v[C.ORIG] || ''),
      logRow: +v[C.LOGROW] || 0, options: options, analysis: analysis, tries: +v[C.TRIES] || 0 });
  });
  return out.sort(function (a, b) { return b.asked - a.asked; });
}

// ==================== תשובה ====================

/**
 * נקרא מ-processRow_ על הודעת טקסט בלי מדיה, לפני הניתוח הרגיל.
 * מחזיר הערת עיבוד אם ההודעה טופלה כתשובה, או '' אם זו הודעה רגילה.
 */
/** fast=true: נקרא מה-Webhook עצמו — רק תשובה בציטוט שמזוהה בלי ג'מיני (מספר / שם מדויק).
 *  כל השאר נשאר בתור ומטופל בהרצה הבאה (עד דקה). */
function botTryAnswer_(queueRow, fast) {
  try {
    const chatId = String(queueRow[COLS.CHAT_ID - 1] || '');
    if (!botActiveFor_(chatId)) return '';
    const text = String(queueRow[COLS.TEXT - 1] || '').trim();
    if (!text) return '';

    const sh = botSheet_();
    const open = botOpenQuestions_(sh);
    if (!open.length) return '';

    let md = {};
    try { md = (JSON.parse(String(queueRow[COLS.RAW_JSON - 1] || '{}')).messageData) || {}; } catch (ignore) {}
    const quoted = typeof askQuotedId_ === 'function' ? askQuotedId_(md).toUpperCase() : '';
    const phone = String(queueRow[COLS.SENDER_PHONE - 1] || '');

    let q = quoted ? open.filter(function (x) { return x.id.toUpperCase() === quoted; })[0] : null;
    const isQuoted = !!q;
    if (fast && !isQuoted) return '';
    if (!q && text.length <= BOT.UNQUOTED_MAX_CHARS) {
      q = open.filter(function (x) {
        return x.phone === phone && (new Date() - x.asked) / 60000 <= BOT.UNQUOTED_MIN;
      })[0] || null;
    }
    if (!q) return '';

    const answerId = String(queueRow[COLS.ID_MESSAGE - 1] || '');
    const who = botDisplayName_(queueRow);
    const r = botResolve_(text, q, fast);
    if (fast && !r.mikveh) return ''; // צריך ג'מיני / בקשה חוזרת — בתור

    if (r.mikveh) {
      const note = botApply_(sh, q, r.mikveh, who, chatId, r.analysis);
      return 'תשובה לשאלת הבוט: שויך ל' + r.mikveh + (note ? ' | ' + note : '');
    }

    // בלי ציטוט ולא זוהה — כנראה סתם הודעה. ממשיכה לעיבוד הרגיל.
    if (!isQuoted) return '';

    if (r.city && r.options.length) {
      // ענו בשם עיר עם כמה מקוואות — מציגים את הרשימה, ותשובה במספר תתקבל
      sh.getRange(q.rowNum, BOT.C.OPTIONS + 1).setValue(JSON.stringify(r.options));
      askSay_(chatId, BOT_TEXT.ambiguous('', r.city, r.options), q.id);
      return 'תשובה לשאלת הבוט: ' + r.city + ' — נשלחה רשימת מקוואות';
    }

    const tries = q.tries + 1;
    sh.getRange(q.rowNum, BOT.C.TRIES + 1).setValue(tries);
    if (tries < BOT.MAX_TRIES) {
      askSay_(chatId, BOT_TEXT.retry(text.slice(0, 40)), answerId || q.id);
      return 'תשובה לשאלת הבוט לא זוהתה (' + text.slice(0, 40) + ') — הבוט ביקש שוב';
    }
    sh.getRange(q.rowNum, BOT.C.STATUS + 1).setValue(BOT.MANUAL);
    sh.getRange(q.rowNum, BOT.C.CLOSED + 1).setValue(new Date());
    askSay_(chatId, BOT_TEXT.manual, answerId || q.id);
    const alert = getProp_('ALERT_CHAT_ID');
    if (alert && alert !== chatId) askSay_(alert, BOT_TEXT.alertManual(q, text.slice(0, 80)), '');
    return 'תשובה לשאלת הבוט לא זוהתה — הועבר לבירור ידני';
  } catch (err) {
    try { logError_('botTryAnswer_', err, String(queueRow && queueRow[COLS.ID_MESSAGE - 1])); } catch (ignore) {}
    return '';
  }
}

/**
 * מתרגם תשובה למקווה: מספר מתוך הרשימה שהוצגה, שם מדויק מהרשימה,
 * ואם לא — ג'מיני מול הרשימה הסגורה (כמו בדיווח רגיל).
 * מחזיר { mikveh } או { city, options } או {}.
 */
function botResolve_(answer, q, noGemini) {
  const t = String(answer || '').trim();
  const n = t.match(/^\D{0,6}(\d{1,2})\D{0,3}$/);
  if (n && q.options && q.options.length) {
    const idx = +n[1] - 1;
    if (idx >= 0 && idx < q.options.length) return { mikveh: q.options[idx] };
  }

  const list = getMikvehList_();
  const norm = function (s) { return String(s || '').replace(/["'״׳\-–(),.]/g, ' ').replace(/\s+/g, ' ').trim(); };
  const nt = norm(t).replace(/^(מקווה|מקוה|במקווה|במקוה)\s+/, '');
  for (let i = 0; i < list.length; i++) {
    if (norm(list[i].name) === nt || norm(list[i].name) === norm(t)) return { mikveh: list[i].name };
  }
  // בחירה מתוך הרשימה שהוצגה לפי חלק מהשם ("הספרדי")
  if (q.options && q.options.length && nt.length >= 2) {
    const hits = q.options.filter(function (o) { return norm(o).indexOf(nt) >= 0; });
    if (hits.length === 1) return { mikveh: hits[0] };
  }

  if (noGemini) return {};
  const res = analyzeWithGemini_('שם המקווה: ' + t, null);
  // analysis: אם בתשובה עצמה נאמרה פעולה ("ריקון מאגר בתושיה") — לרישום בתיק
  if (res.mikveh_name) return { mikveh: res.mikveh_name, analysis: res };
  if (res.settlement && res.ambiguous_city) return { city: res.settlement, options: botCityOptions_(list, res.settlement) };
  return {};
}

/**
 * מבצע את השיוך: יומן הדיווחים, העברת המדיה לתיקיית המקווה, רישום הפעולה
 * בתיק, אישור בקבוצה וסגירת השאלה. מחזיר הערה קצרה.
 */
function botApply_(sh, q, mikveh, who, chatId, answerAnalysis) {
  const notes = [];
  const log = getSheet_(CONFIG.REPORT_SHEET);
  const rowNum = botFindLogRow_(log, q);
  let actionNote = '';

  if (rowNum) {
    log.getRange(rowNum, RCOLS.MIKVEH).setValue(mikveh);
    log.getRange(rowNum, RCOLS.ID_STATUS).setValue('מזוהה (אושר בקבוצה)');

    const moved = botMoveMedia_(log, rowNum, mikveh);
    if (moved) notes.push(moved + ' קבצים הועברו לתיקיית המקווה');

    // הפעולה שזוהתה בדיווח המקורי (ריקון, החלפת אוצר...) נרשמת עכשיו בתיק
    // ואם בדיווח המקורי לא הייתה פעולה אבל בתשובה כן — לוקחים את זו שבתשובה
    let a = q.analysis || {};
    if (!botIsAction_(a.action_type) && answerAnalysis && botIsAction_(answerAnalysis.action_type)) a = answerAnalysis;
    if (a.action_type && !botIsTestChatId_(chatId) && typeof recordWhatsappAction_ === 'function') {
      const v = log.getRange(rowNum, 1, 1, RCOLS.PHONE).getValues()[0];
      const fake = [];
      fake[COLS.RECEIVED - 1] = v[RCOLS.STAMP - 1];
      fake[COLS.SENDER_NAME - 1] = v[RCOLS.SENDER - 1];
      fake[COLS.SENDER_PHONE - 1] = String(v[RCOLS.PHONE - 1] || '');
      actionNote = recordWhatsappAction_(fake, {
        is_report: true, mikveh_name: mikveh, action_type: a.action_type, otzar: a.otzar,
        done_date: a.done_date, summary: a.summary,
      });
      if (actionNote) notes.push(actionNote);
    }
    if (typeof apiInvalidateData_ === 'function') { try { apiInvalidateData_(); } catch (ignore) {} }
  } else {
    notes.push('שורת היומן לא נמצאה');
  }

  const C = BOT.C;
  sh.getRange(q.rowNum, C.STATUS + 1).setValue(BOT.DONE);
  sh.getRange(q.rowNum, C.CLOSED + 1).setValue(new Date());
  sh.getRange(q.rowNum, C.MIKVEH + 1).setValue(mikveh);
  sh.getRange(q.rowNum, C.BY + 1).setValue(who || '');

  askSay_(chatId, BOT_TEXT.done(mikveh, /^נרשם בתיק/.test(actionNote) ? actionNote : ''), q.origId || q.id);
  return notes.join(' | ');
}

/** שורת היומן של הדיווח: לפי המספר שנשמר, ובדיקה לפי idMessage (ואם זז — חיפוש) */
function botFindLogRow_(log, q) {
  if (q.logRow && q.logRow <= log.getLastRow()) {
    const id = String(log.getRange(q.logRow, RCOLS.ID_MESSAGE).getValue() || '');
    if (!q.origId || id === q.origId) return q.logRow;
  }
  if (!q.origId || log.getLastRow() < 2) return 0;
  const hit = log.getRange(2, RCOLS.ID_MESSAGE, log.getLastRow() - 1, 1)
    .createTextFinder(q.origId).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

/** מעביר את קבצי המדיה של שורת היומן מ"מיקומים כלליים" לתיקיית המקווה. מחזיר כמה הועברו. */
function botMoveMedia_(log, rowNum, mikveh) {
  let moved = 0;
  try {
    const cell = log.getRange(rowNum, RCOLS.MEDIA_LINKS);
    const urls = [];
    const rich = cell.getRichTextValue ? cell.getRichTextValue() : null;
    if (rich) rich.getRuns().forEach(function (run) { if (run.getLinkUrl()) urls.push(run.getLinkUrl()); });
    String(cell.getValue() || '').split('\n').forEach(function (l) { if (l.indexOf('http') === 0) urls.push(l.trim()); });
    if (!urls.length) return 0;
    const target = smartArchiveFolder_(mikveh, null);
    const seen = {};
    urls.forEach(function (u) {
      try {
        const id = fileIdFromUrl_(u);
        if (seen[id]) return;
        seen[id] = true;
        DriveApp.getFileById(id).moveTo(target);
        moved++;
      } catch (err) {
        logError_('botMoveMedia_', err, u);
      }
    });
  } catch (err) {
    logError_('botMoveMedia_', err, 'שורה ' + rowNum);
  }
  return moved;
}

// ==================== בדיקה מהעורך ====================

/** מה מוגדר, ואילו שאלות פתוחות כרגע */
function testGroupBot() {
  const mode = botMode_();
  Logger.log('WA_GROUP_BOT: ' + (mode === '1' ? 'פעיל בקבוצה' : mode === 'test' ? 'מצב בדיקה (צ\'אט ALERT_CHAT_ID)' : 'כבוי'));
  Logger.log('GROUP_CHAT_ID: ' + (getProp_('GROUP_CHAT_ID') || '(חסר)'));
  Logger.log('ALERT_CHAT_ID: ' + (getProp_('ALERT_CHAT_ID') || '(חסר — נדרש למצב בדיקה ולהתראות)'));
  Logger.log('Green API: ' + (botGreenReady_() ? 'מוגדר' : '(חסר)'));
  Logger.log('WA_GROUP_BOT_MENTION: ' + (getProp_(BOT.MENTION_PROP) === '1' ? 'תיוג אמיתי (@)' : 'שם בלבד'));
  Logger.log('WA_AUTO_ACTIONS: ' + (getProp_('WA_AUTO_ACTIONS') === '1' ? 'דלוק — פעולה תירשם בתיק אחרי שיוך' : 'כבוי'));
  const open = botOpenQuestions_(botSheet_());
  Logger.log('— שאלות פתוחות: ' + open.length + ' —');
  open.forEach(function (q) { Logger.log(q.id + ' | ' + q.kind + ' | ' + q.name + ' | שורה ביומן ' + q.logRow); });
}
