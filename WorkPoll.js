/************************************************************************
 * חלוקת עבודה כסקר בקבוצת הוואטסאפ (WorkPoll.gs)
 * ========================================================
 * כששולחים מקוואות לחלוקת עבודה במערכת, נשלח לקבוצת הוואטסאפ **סקר**:
 *   כותרת:  תכנון עבודה חדש [חידוש תעודה]
 *   אפשרות לכל מקווה בנפרד, וכל אחד מסמן את מה שהוא לוקח.
 * סימון בסקר = "אני לוקח" במערכת: המשימה נרשמת על שמו בלשונית "שיבוצים",
 * נכתבת הודעת מערכת בדיון, והפותח מקבל התראה — בדיוק כמו לחיצה באפליקציה.
 * הסרת הסימון משחררת את המשימה בחזרה. אחרי שהשקט חוזר נשלחת לקבוצה
 * **הודעת סיכום**: מי לקח מה, ומה עדיין פנוי.
 *
 * שניים על אותה אפשרות: וואטסאפ אינו יודע לנעול אפשרות שנלקחה, ובסקר עצמו
 * זה נראה כאילו שניהם לקחו. נרשם רק הראשון, ומיד נשלחת לקבוצה הודעה —
 * "כבר נלקח על ידי X, הסימון שלך לא נרשם" עם רשימת הפנויים (workPollAnnounce_).
 * גם לקיחה מוכרזת מיד, כדי שכולם יראו מה תפוס לפני שהם מסמנים.
 *
 * הפעלה:
 *   1. Script Property בשם WA_WORK_POLL עם הערך 1.
 *   2. GROUP_CHAT_ID, GREEN_ID_INSTANCE, GREEN_API_TOKEN (כמו שאר הגשר).
 *   3. להריץ פעם אחת installWorkPollTrigger — הסיכום נשלח מטריגר כל 5 דקות.
 *
 * מגבלות וואטסאפ: עד 12 אפשרויות בסקר. יותר מזה — נשלחים כמה סקרים
 * ברצף (1/2, 2/2...). סקר עם אפשרות אחת אינו חוקי, ולכן מתווספת
 * האפשרות "לא לוקח".
 ************************************************************************/

const WORK_POLL = {
  ENABLED_PROP: 'WA_WORK_POLL',
  SHEET: 'סקרי עבודה',
  HEADERS: ['מזהה הסקר', 'נפתח בשעה', 'סוג', 'כותרת', 'chatId', 'אפשרויות (JSON)',
    'מצב ההצבעות (JSON)', 'עודכן בשעה', 'טביעת הסיכום האחרון', 'סטטוס'],
  MAX_OPTIONS: 12,   // מגבלת וואטסאפ
  NAME_MAX: 90,      // אורך מרבי לשם אפשרות
  QUIET_MIN: 3,      // דקות שקט אחרי ההצבעה האחרונה, לפני שנשלח סיכום
  REMIND_MIN: 360,   // אחרי שנשלח סיכום ועדיין נשארו פנויים — תזכורת רק בעוד 6 שעות
  MAX_AGE_DAYS: 45,  // סקרים ישנים מזה כבר לא נבדקים
  NONE_OPTION: 'לא לוקח',
  FIRST_WINS: 'מי שמסמן ראשון — המשימה נרשמת עליו. סימון שני על אותה שורה לא נרשם, ונשלחת על כך הודעה.',
  OPEN: 'פתוח',
  CLOSED: 'הסתיים',
  LOG_SHEET: 'יומן סקרים',
  LOG_HEADERS: ['זמן', 'סוג ה-webhook', 'מי הצביע', 'מזהה הסקר', 'הסקר', 'מה נרשם', 'הערה'],
  LOG_MAX: 500,
};

// ==================== עזרים ====================

function workPollEnabled_() {
  return getProp_(WORK_POLL.ENABLED_PROP) === '1' && !!getProp_('GROUP_CHAT_ID') &&
    !!getProp_('GREEN_ID_INSTANCE') && !!getProp_('GREEN_API_TOKEN');
}

function workPollSheet_(ss) {
  let sh = ss.getSheetByName(WORK_POLL.SHEET);
  if (!sh) {
    sh = ss.insertSheet(WORK_POLL.SHEET);
    sh.appendRow(WORK_POLL.HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

/** '972501234567@c.us' -> '0501234567' (כמו שהטלפונים נשמרים בלשונית המשתמשים) */
function chatIdToPhone_(chatId) {
  let p = String(chatId || '').replace(/@.*$/, '').replace(/\D/g, '');
  if (!p) return '';
  if (p.indexOf('972') === 0) p = '0' + p.slice(3);
  return p;
}

/** שם אפשרות ייחודי וקצר מספיק לסקר בוואטסאפ */
function workPollOptionName_(name, used) {
  let base = String(name || '').trim().slice(0, WORK_POLL.NAME_MAX) || 'מקווה';
  let out = base, n = 2;
  while (used[out]) { out = base.slice(0, WORK_POLL.NAME_MAX - 4) + ' (' + n + ')'; n++; }
  return out;
}

/**
 * העמודה "טביעת הסיכום האחרון" מחזיקה גם את שעת השליחה ואת מה שהיה פנוי אז,
 * כ-JSON: { s: טביעה, t: זמן, o: הפנויים }. ערך ישן (טביעה בלבד) ממשיך לעבוד.
 */
function workPollSummaryState_(v) {
  const raw = String(v == null ? '' : v);
  if (!raw) return { s: '', t: 0 };
  if (raw.charAt(0) === '{') {
    try {
      const o = JSON.parse(raw);
      return { s: String(o.s || ''), t: Number(o.t || 0), open: o.o === undefined ? null : String(o.o).split('|').filter(Boolean) };
    } catch (err) { /* ערך ישן */ }
  }
  return { s: raw, t: 0, open: null };
}

function workPollParse_(v) {
  try { const o = JSON.parse(v || '{}'); return o && typeof o === 'object' ? o : {}; } catch (err) { return {}; }
}

/**
 * יומן ההצבעות — כדי שיהיה אפשר לראות מה הגיע מהוואטסאפ ומה נרשם.
 * בלעדיו הצבעה שלא נקלטה (הגדרות Green API, סקר שאינו של המערכת) נעלמת בשקט.
 */
function workPollLog_(ss, data, pollId, pollTitle, applied, note) {
  try {
    if (!ss) return;
    let sh = ss.getSheetByName(WORK_POLL.LOG_SHEET);
    if (!sh) {
      sh = ss.insertSheet(WORK_POLL.LOG_SHEET);
      sh.appendRow(WORK_POLL.LOG_HEADERS);
      sh.setFrozenRows(1);
      sh.setRightToLeft(true);
    }
    const sd = (data && data.senderData) || {};
    sh.appendRow([new Date(), data ? String(data.typeWebhook || '') : 'המערכת',
      data ? String(sd.senderName || sd.senderContactName || '') + ' ' + chatIdToPhone_(sd.sender) : '',
      String(pollId || ''), pollTitle || '', applied || '', note || '']);
    // גיזום: היומן הוא כלי אבחון, לא ארכיון
    const extra = sh.getLastRow() - 1 - WORK_POLL.LOG_MAX;
    if (extra > 0) sh.deleteRows(2, extra);
  } catch (err) {
    Logger.log('workPollLog_ failed: ' + err);
  }
}

// ==================== שליחה לוואטסאפ ====================

/** שליחת סקר דרך Green API. מחזיר את idMessage (הוא ה-stanzaId שיחזור בהצבעות). */
function waSendPoll_(chatId, message, options, multipleAnswers) {
  const idInstance = requireProp_('GREEN_ID_INSTANCE');
  const apiToken = requireProp_('GREEN_API_TOKEN');
  const resp = UrlFetchApp.fetch('https://api.green-api.com/waInstance' + idInstance + '/sendPoll/' + apiToken, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chatId: chatId, message: message, options: options, multipleAnswers: multipleAnswers !== false }),
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('sendPoll ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  }
  const body = JSON.parse(resp.getContentText() || '{}');
  if (!body.idMessage) throw new Error('sendPoll: לא חזר idMessage');
  return String(body.idMessage);
}

/** הודעת טקסט לקבוצה, אפשר כתשובה על הסקר (quotedMessageId). לא זורק שגיאה. */
function workPollSay_(text, quotedMessageId) {
  try {
    const chatId = getProp_('GROUP_CHAT_ID');
    const idInstance = getProp_('GREEN_ID_INSTANCE'), apiToken = getProp_('GREEN_API_TOKEN');
    if (!chatId || !idInstance || !apiToken) return false;
    const url = 'https://api.green-api.com/waInstance' + idInstance + '/sendMessage/' + apiToken;
    const send = function (payload) {
      return UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(payload) });
    };
    let resp = send(quotedMessageId ? { chatId: chatId, message: text, quotedMessageId: quotedMessageId } : { chatId: chatId, message: text });
    // ציטוט של סקר ישן עלול להיכשל — אז שולחים בלי ציטוט
    if (resp.getResponseCode() !== 200 && quotedMessageId) resp = send({ chatId: chatId, message: text });
    return resp.getResponseCode() === 200;
  } catch (err) {
    Logger.log('workPollSay_ failed: ' + err);
    return false;
  }
}

/** טביעה קצרה של טקסט — כדי לא לשלוח את אותה הודעה פעמיים. */
function workPollHash_(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * הודעה מיידית לקבוצה על מה שהשתנה ברגע זה.
 *
 * וואטסאפ אינו יודע לנעול אפשרות בסקר אחרי שמישהו סימן אותה: שניים יכולים
 * לסמן את אותה משימה, ובסקר עצמו זה נראה כאילו שניהם לקחו אותה. המערכת
 * רושמת רק את הראשון — וההודעה הזו אומרת את זה בקבוצה מיד, במקום שזה יתברר
 * רק בסיכום שנשלח אחרי שלוש דקות שקט.
 *
 * הודעה על לקיחה נשלחת גם היא מיד, כדי שכולם יראו מה כבר תפוס לפני שהם
 * מסמנים. אפשר לכבות אותה ב-Script Property בשם WA_POLL_ANNOUNCE עם הערך 0
 * (הודעת "כבר נלקח" ממשיכה להישלח תמיד — היא הסיבה שהסימון לא נרשם).
 */
function workPollAnnounce_(pollId, map, items, took, blocked) {
  try {
    if (!blocked.length && (!took.length || getProp_('WA_POLL_ANNOUNCE') === '0')) return;
    const lines = [];
    took.forEach(function (t) { lines.push('✅ ' + t.mikveh + ' — ' + t.who); });
    blocked.forEach(function (b) {
      lines.push('⚠️ ' + b.mikveh + ' כבר ' + (b.done ? 'בוצע' : 'נלקח') + (b.by ? ' על ידי ' + b.by : '') + '. ' +
        (b.who ? b.who + ', הסימון' : 'הסימון') + ' שלך לא נרשם — אפשר להסיר אותו ולבחור משימה אחרת.');
    });
    if (!lines.length) return;

    let text = lines.join('\n');
    if (blocked.length) {
      const free = [];
      Object.keys(map).forEach(function (option) {
        const rec = items[map[option]];
        if (rec && rec.status !== 'done' && !rec.takenBy) free.push('• ' + rec.mikveh);
      });
      text += '\n\n' + (free.length
        ? '⬜ עדיין פנויים:\n' + free.slice(0, 12).join('\n') + (free.length > 12 ? '\n(ועוד ' + (free.length - 12) + ')' : '')
        : 'כל המשימות בסקר הזה כבר חולקו.');
    }

    // אותו webhook יכול להגיע פעמיים (Green API שולח גם את ההצבעה של בעל
    // המכשיר כהודעה יוצאת). אותה הודעה בדיוק לא נשלחת פעמיים ברצף.
    const key = 'pollSay_' + pollId + '_' + workPollHash_(text);
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) return;
    cache.put(key, '1', 300);
    workPollSay_(text, pollId);
  } catch (err) {
    Logger.log('workPollAnnounce_ failed: ' + err);
  }
}

/**
 * נקרא מ-addWorkItems_ (ApiWrite.js): שולח את המקוואות שנפתחו כסקר לקבוצה.
 * מחזיר true אם נשלח סקר (ואז אין צורך בהודעת הגשר הרגילה). לא זורק שגיאה.
 */
function workPollSend_(ss, records, typeLabel, user) {
  try {
    if (!workPollEnabled_() || !records || !records.length) return false;
    const chatId = getProp_('GROUP_CHAT_ID');
    const sh = workPollSheet_(ss);
    const now = new Date();
    const chunks = [];
    for (let i = 0; i < records.length; i += WORK_POLL.MAX_OPTIONS) chunks.push(records.slice(i, i + WORK_POLL.MAX_OPTIONS));
    let sent = 0;
    chunks.forEach(function (chunk, idx) {
      const title = 'תכנון עבודה חדש [' + typeLabel + ']' + (chunks.length > 1 ? ' — ' + (idx + 1) + '/' + chunks.length : '');
      const used = {}, map = {}, options = [];
      chunk.forEach(function (r) {
        const name = workPollOptionName_(r.mikveh, used);
        used[name] = true;
        map[name] = r.id;
        options.push({ optionName: name });
      });
      // סקר חייב לפחות שתי אפשרויות
      if (options.length < 2) options.push({ optionName: WORK_POLL.NONE_OPTION });
      try {
        // הכותרת שנשלחת מוסיפה את כלל "הראשון תופס". בלשונית נשמרת הכותרת
        // הנקייה, כי היא זו שמופיעה בהודעות הסיכום.
        const pollId = waSendPoll_(chatId, title + '\n' + WORK_POLL.FIRST_WINS, options, true);
        sh.appendRow([pollId, now, chunk[0].type, title, chatId, JSON.stringify(map),
          JSON.stringify({ byVoter: {}, names: {} }), now, '', WORK_POLL.OPEN]);
        sent++;
      } catch (err) {
        logError_('workPollSend_', err, title);
      }
    });
    if (!sent) return false;
    Logger.log('workPollSend_: נשלחו ' + sent + ' סקרים (' + records.length + ' מקוואות) ע"י ' + (user ? user.name : ''));
    return true;
  } catch (err) {
    try { logError_('workPollSend_', err, ''); } catch (ignore) {}
    return false;
  }
}

// ==================== קליטת הצבעות ====================

/**
 * webhook מסוג pollUpdateMessage — מישהו סימן או ביטל סימון בסקר.
 * נקרא מ-handleNotification_ (קוד.js). לעולם לא זורק שגיאה.
 */
function handlePollUpdate_(data) {
  try {
    const md = data.messageData || {}, sd = data.senderData || {};
    const pd = md.pollMessageData || {};
    const pollId = String(pd.stanzaId || '');
    if (!pollId) return { status: 'ignored', reason: 'poll: אין stanzaId' };

    const sheetId = getProp_(API.SHEET_ID_PROP);
    if (!sheetId) return { status: 'ignored', reason: 'poll: חסר MIKVAOT_SHEET_ID' };
    const ss = SpreadsheetApp.openById(sheetId);
    const sh = ss.getSheetByName(WORK_POLL.SHEET);
    if (!sh || sh.getLastRow() < 2) return { status: 'ignored', reason: 'poll: אין סקרי עבודה' };

    const last = sh.getLastRow();
    const values = sh.getRange(2, 1, last - 1, WORK_POLL.HEADERS.length).getValues();
    let rowNum = -1, row = null;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]).toUpperCase() === pollId.toUpperCase()) { rowNum = i + 2; row = values[i]; break; }
    }
    if (rowNum < 0) {
      workPollLog_(ss, data, pollId, '', '', 'סקר שאינו של המערכת (או שנמחק מהלשונית)');
      return { status: 'ignored', reason: 'poll: סקר שאינו של המערכת' };
    }

    const map = workPollParse_(row[5]);                       // שם אפשרות -> מזהה משימה
    const state = workPollParse_(row[6]);                     // { byVoter: {chatId: [אפשרויות]}, names: {chatId: שם} }
    const byVoter = state.byVoter || {}, names = state.names || {};

    // שם המצביע שהפעיל את ה-webhook — כך לומדים שמות של מי שאינו רשום במערכת
    const senderChat = String(sd.sender || '');
    if (senderChat && (sd.senderName || sd.senderContactName)) {
      names[senderChat] = String(sd.senderName || sd.senderContactName);
    }

    // ה-webhook עשוי לתאר רק את הסימונים של מי שהצביע כרגע ולא את הסקר כולו.
    // לכן משווים **לכל מצביע בנפרד**, ורק למי שמופיע בהודעה הזו: כך ביטול
    // סימון של אחד לא ישחרר בטעות את המשימות שאחרים כבר לקחו.
    const current = {};
    const seen = {};
    if (senderChat) seen[senderChat] = true;
    (pd.votes || []).forEach(function (v) {
      const option = String(v.optionName || '');
      (v.optionVoters || []).forEach(function (c) {
        const chatId = String(c);
        seen[chatId] = true;
        (current[chatId] = current[chatId] || []).push(option);
      });
    });

    const items = workPollItems_(ss, map);
    const changes = [];
    Object.keys(seen).forEach(function (chatId) {
      const after = current[chatId] || [], before = byVoter[chatId] || [];
      after.forEach(function (option) {
        if (before.indexOf(option) < 0) changes.push({ option: option, chatId: chatId, take: true });
      });
      before.forEach(function (option) {
        if (after.indexOf(option) < 0) changes.push({ option: option, chatId: chatId, take: false });
      });
      if (after.length) byVoter[chatId] = after; else delete byVoter[chatId];
    });

    let applied = 0, blocked = 0, missing = 0;
    const tookNow = [], blockedNow = [];
    changes.forEach(function (ch) {
      const rec = items[map[ch.option]];
      if (!rec) { missing++; return; } // המשימה נמחקה מ"שיבוצים" אחרי שהסקר נשלח
      const who = workPollVoter_(ss, ch.chatId, names);
      if (ch.take) {
        // וואטסאפ אינו יודע לנעול אפשרות שנלקחה, ולכן שניים יכולים לסמן אותה.
        // נרשם רק הראשון — והשני מקבל על כך הודעה מיד (workPollAnnounce_),
        // במקום לגלות את זה רק בסיכום.
        if (rec.status === 'done') { blocked++; blockedNow.push({ mikveh: rec.mikveh, by: rec.takenBy || '', who: who.name, done: true }); return; }
        if (rec.takenBy && rec.takenBy !== who.name) { blocked++; blockedNow.push({ mikveh: rec.mikveh, by: rec.takenBy, who: who.name }); return; }
        if (rec.takenBy === who.name && rec.status === 'taken') return;
        updateWorkItem_(ss, { id: rec.id, status: 'taken', via: 'מהסקר בוואטסאפ' }, who);
        tookNow.push({ mikveh: rec.mikveh, who: who.name });
      } else {
        // ביטול סימון משחרר רק משימה שהמצביע עצמו לקח ועדיין לא ביצע
        if (rec.status !== 'taken' || rec.takenBy !== who.name) return;
        updateWorkItem_(ss, { id: rec.id, status: 'open', via: 'ביטול סימון בסקר' }, who);
      }
      rec.takenBy = ch.take ? who.name : '';
      rec.status = ch.take ? 'taken' : 'open';
      applied++;
    });

    sh.getRange(rowNum, 7, 1, 2).setValues([[JSON.stringify({ byVoter: byVoter, names: names }), new Date()]]);
    if (applied) apiInvalidateData_();
    workPollAnnounce_(String(row[0]), map, items, tookNow, blockedNow);
    const note = [];
    if (blocked) note.push(blocked + ' סימונים על משימות שכבר נלקחו');
    if (missing) note.push(missing + ' סימונים על משימות שאינן בלשונית "' + WRITE.WORK_SHEET + '" (נמחקו?)');
    workPollLog_(ss, data, pollId, String(row[3] || ''),
      applied ? 'נרשמו ' + applied + ' שינויים' : 'אין שינוי', note.join(' · '));
    return { status: 'poll', idMessage: data.idMessage || '', applied: applied, blocked: blocked, missing: missing };
  } catch (err) {
    try { logError_('handlePollUpdate_', err, JSON.stringify(data || {}).slice(0, 500)); } catch (ignore) {}
    return { status: 'error', message: String(err) };
  }
}

/** קריאה אחת של לשונית השיבוצים -> מפה של מזהה משימה לרשומה */
function workPollItems_(ss, map) {
  const want = {};
  Object.keys(map).forEach(function (k) { want[String(map[k])] = true; });
  const out = {};
  const sh = ss.getSheetByName(WRITE.WORK_SHEET);
  if (!sh || sh.getLastRow() < 2) return out;
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, WRITE.WORK_HEADERS.length).getValues();
  values.forEach(function (v) {
    const id = String(v[0]);
    if (want[id]) out[id] = workRecord_(v);
  });
  return out;
}

/** מיהו המצביע: משתמש רשום לפי טלפון, ואם אינו רשום — השם מהוואטסאפ. */
function workPollVoter_(ss, chatId, names) {
  const phone = chatIdToPhone_(chatId);
  const known = authUserByPhone_(ss, phone);
  if (known) return { id: known.id, name: known.name, phone: known.phone || phone, role: known.role };
  return { id: '', name: names[chatId] || phone || 'משתתף בוואטסאפ', phone: phone, role: '' };
}

// ==================== הודעת הסיכום ====================

/**
 * טריגר כל 5 דקות: לכל סקר פתוח שהמצב שלו השתנה (מהסקר או מהאפליקציה)
 * ושקט כבר QUIET_MIN דקות — נשלחת לקבוצה הודעת סיכום: מי לקח מה ומה נשאר.
 *
 * ⚠️ הארגומנט: טריגר מבוסס-זמן ב-Apps Script מעביר לפונקציה **אובייקט
 * אירוע** ({ triggerUid, authMode, ... }). כשהפרמטר נקרא `force` ונבדק
 * כערך אמת, כל הרצה של הטריגר הייתה "שליחה כפויה": כל בדיקות "מה השתנה
 * מאז הסיכום הקודם" דולגו, ואותו סיכום בדיוק נשלח לקבוצה כל חמש דקות.
 * לכן שליחה כפויה היא אך ורק `workPollSummary(true)` מפורש.
 */
function workPollSummary(arg) {
  const force = arg === true;
  if (!workPollEnabled_()) { Logger.log('workPollSummary: הסקר כבוי (WA_WORK_POLL / GROUP_CHAT_ID / Green API)'); return; }
  const sheetId = getProp_(API.SHEET_ID_PROP);
  if (!sheetId) return;
  // שתי הרצות שרצות יחד (טריגר שהאיץ את הקודמת, או שליחה ידנית תוך כדי)
  // היו קוראות את אותה טביעה ושולחות שתיהן את אותו סיכום.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('workPollSummary: הרצה אחרת כבר שולחת סיכומים'); return; }
  try {
    workPollSummaryRun_(force, sheetId);
  } finally {
    lock.releaseLock();
  }
}

function workPollSummaryRun_(force, sheetId) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(WORK_POLL.SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  const last = sh.getLastRow();
  const values = sh.getRange(2, 1, last - 1, WORK_POLL.HEADERS.length).getValues();
  const now = new Date();

  values.forEach(function (row, i) {
    // גם סקר שנסגר נבדק: אם מישהו שחרר משימה, הוא חוזר לחיים ונשלח סיכום מעודכן.
    const wasClosed = String(row[9] || WORK_POLL.OPEN) !== WORK_POLL.OPEN;
    const opened = parseStamp_(row[1]) || now;
    if ((now - opened) / 86400000 > WORK_POLL.MAX_AGE_DAYS) {
      if (!wasClosed) sh.getRange(i + 2, 10).setValue(WORK_POLL.CLOSED);
      return;
    }
    const updated = parseStamp_(row[7]) || opened;
    if (!force && (now - updated) / 60000 < WORK_POLL.QUIET_MIN) return; // עוד מצביעים — מחכים לשקט

    const map = workPollParse_(row[5]);
    const items = workPollItems_(ss, map);
    const taken = [], open = [];
    Object.keys(map).forEach(function (option) {
      const rec = items[map[option]];
      if (!rec) return;
      if (rec.status === 'done') taken.push('✔ ' + rec.mikveh + ' — ' + (rec.takenBy || '') + ' (בוצע)');
      else if (rec.takenBy) taken.push('• ' + rec.mikveh + ' — ' + rec.takenBy);
      else open.push('• ' + rec.mikveh);
    });
    if (!taken.length && !open.length) {
      // המשימות של הסקר נמחקו מלשונית "שיבוצים" אחרי שהוא נשלח. הסקר נסגר —
      // ונרשם ביומן הסקרים ולא בלשונית "שגיאות", שמזעיקה התראה לטלפון על כל שורה.
      if (!wasClosed) {
        workPollLog_(ss, null, String(row[0]), String(row[3] || ''), 'הסקר נסגר',
          'המשימות של הסקר אינן בלשונית "' + WRITE.WORK_SHEET + '" — נמחקו אחרי שהסקר נשלח');
        sh.getRange(i + 2, 10).setValue(WORK_POLL.CLOSED);
      }
      return;
    }
    // סקר סגור שהכל בו עדיין מחולק — אין מה לעדכן
    if (!force && wasClosed && !open.length) return;

    const stamp = taken.join('|') + '#' + open.join('|');
    const prev = workPollSummaryState_(row[8]);
    if (!force) {
      if (stamp === prev.s) return; // אין מה לעדכן מאז הסיכום הקודם
      // סיכום כבר נשלח, ועדיין נשארו פנויים: כל לקיחה נוספת הייתה גוררת
      // סיכום נוסף כמעט זהה. הלקיחות עצמן מוכרזות מיד (workPollAnnounce_),
      // ולכן הסיכום הבא הוא רק כשהכל חולק, או כתזכורת אחרי REMIND_MIN.
      // משימה ש**השתחררה** היא בשורה אחרת: היא צריכה מישהו חדש, ועליה
      // נשלח סיכום מיד.
      const freed = prev.open ? open.filter(function (x) { return prev.open.indexOf(x) < 0; }) : open;
      if (open.length && prev.t && !freed.length && (now - prev.t) / 60000 < WORK_POLL.REMIND_MIN) return;
    }

    let text = '📊 סיכום — ' + String(row[3] || 'תכנון עבודה') + '\n';
    text += '\n✅ נלקחו (' + taken.length + '):\n' + (taken.length ? taken.join('\n') : '—');
    text += '\n\n' + (wasClosed && open.length ? '⬜ שוחררו וממתינים (' : '⬜ עדיין פנויים (') +
      open.length + '):\n' + (open.length ? open.join('\n') : '—');
    text += open.length ? '\n\nאפשר לסמן בסקר למעלה, או במערכת ➜ חלוקת עבודה.' : '\n\nהכל חולק. תודה!';

    // הטביעה נרשמת **לפני** השליחה, ולא אחריה: אם ההרצה נופלת או נגמר לה
    // הזמן בין השליחה לכתיבה (קורה ב-Apps Script), ההרצה הבאה הייתה שולחת
    // שוב בדיוק את אותו סיכום. כישלון שליחה מחזיר את הטביעה הקודמת, כדי
    // שההרצה הבאה תנסה שוב.
    // נסגר כשהכל חולק, ונפתח מחדש ברגע שמשהו שוחרר
    sh.getRange(i + 2, 9, 1, 2).setValues([[JSON.stringify({ s: stamp, t: now.getTime(), o: open.join('|') }),
      open.length ? WORK_POLL.OPEN : WORK_POLL.CLOSED]]);
    if (workPollSay_(text, String(row[0]))) {
      Logger.log('נשלח סיכום לסקר: ' + String(row[3] || ''));
    } else {
      sh.getRange(i + 2, 9, 1, 2).setValues([[row[8], row[9]]]);
      Logger.log('שליחת הסיכום נכשלה לסקר: ' + String(row[3] || ''));
    }
  });
}

// ==================== הגדרות Green API ====================

/**
 * Green API אינו שולח התראות על סקרים כברירת מחדל. צריך שלושה מתגים:
 *   incomingWebhook          — הצבעה של חבר בקבוצה
 *   outgoingMessageWebhook   — הצבעה שלך עצמך מהטלפון (נחשבת הודעה יוצאת!)
 *   pollMessageWebhook       — ההתראות על סקרים בכלל
 * בלעדיהם הסקר נשלח ונראה מצוין בקבוצה, אבל שום סימון לא חוזר למערכת.
 */
const WORK_POLL_SETTINGS = {
  incomingWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  pollMessageWebhook: 'yes',
};

function greenSettings_() {
  const idInstance = requireProp_('GREEN_ID_INSTANCE'), apiToken = requireProp_('GREEN_API_TOKEN');
  const resp = UrlFetchApp.fetch('https://api.green-api.com/waInstance' + idInstance + '/getSettings/' + apiToken,
    { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('getSettings ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  return JSON.parse(resp.getContentText() || '{}');
}

/** ★ מריצים פעם אחת ★ מדליק ב-Green API את ההתראות על סקרים. */
function setupWorkPollWebhooks() {
  const cur = greenSettings_();
  const change = {};
  Object.keys(WORK_POLL_SETTINGS).forEach(function (k) {
    if (String(cur[k] || '') !== WORK_POLL_SETTINGS[k]) change[k] = WORK_POLL_SETTINGS[k];
  });
  if (!Object.keys(change).length) {
    Logger.log('✅ ההתראות על סקרים כבר מוגדרות כראוי ב-Green API. אין מה לשנות.');
    return;
  }
  const idInstance = requireProp_('GREEN_ID_INSTANCE'), apiToken = requireProp_('GREEN_API_TOKEN');
  const resp = UrlFetchApp.fetch('https://api.green-api.com/waInstance' + idInstance + '/setSettings/' + apiToken, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(change),
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('setSettings ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300));
  }
  Logger.log('✅ עודכן ב-Green API: ' + JSON.stringify(change));
  Logger.log('⏳ שינוי הגדרות מפעיל מחדש את האינסטנס — כדקה עד חמש דקות. ' +
    'בזמן הזה הודעות עלולות לא להיקלט. אחר כך להריץ testGreenSettings כדי לוודא.');
}

/** בדיקה: מה מוגדר עכשיו ב-Green API, ומה חסר להצבעות בסקר. */
function testGreenSettings() {
  const cur = greenSettings_();
  Logger.log('webhookUrl: ' + (cur.webhookUrl || '(ריק)'));
  let missing = [];
  Object.keys(WORK_POLL_SETTINGS).forEach(function (k) {
    const ok = String(cur[k] || '') === WORK_POLL_SETTINGS[k];
    if (!ok) missing.push(k);
    Logger.log((ok ? '✅ ' : '❌ ') + k + ': ' + (cur[k] || '(לא מוגדר)'));
  });
  Logger.log(missing.length
    ? '⚠️ חסר: ' + missing.join(', ') + ' — להריץ setupWorkPollWebhooks'
    : '✅ הכל מוכן לקליטת הצבעות בסקר.');
}

/** ★ שליחת הסיכום עכשיו ★ בלי להמתין לשקט ובלי בדיקת "מה השתנה" — לבדיקה. */
function sendWorkPollSummaryNow() {
  workPollSummary(true);
  Logger.log('אם לא נשלח כלום — להריץ testWorkPoll ולראות למה.');
}

/** ★ מריצים פעם אחת ★ מתקין את טריגר הסיכום (כל 5 דקות). */
function installWorkPollTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'workPollSummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('workPollSummary').timeBased().everyMinutes(5).create();
  Logger.log('✅ טריגר סיכום הסקרים הותקן — בדיקה כל 5 דקות.');
}

/** בדיקה מעורך הסקריפט: מה מוגדר, האם הטריגר מותקן, ואילו סקרים פתוחים. */
function testWorkPoll() {
  Logger.log('— הגדרות —');
  Logger.log('WA_WORK_POLL=1: ' + (getProp_(WORK_POLL.ENABLED_PROP) === '1'));
  Logger.log('GROUP_CHAT_ID: ' + (getProp_('GROUP_CHAT_ID') || '(חסר)'));
  Logger.log('Green API: ' + (getProp_('GREEN_ID_INSTANCE') && getProp_('GREEN_API_TOKEN') ? 'מוגדר' : '(חסר)'));
  const hasTrigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'workPollSummary'; });
  Logger.log('טריגר הסיכום מותקן: ' + (hasTrigger ? 'כן' : 'לא — להריץ installWorkPollTrigger'));
  try { testGreenSettings(); } catch (err) { Logger.log('בדיקת הגדרות Green API נכשלה: ' + err); }

  const sheetId = getProp_(API.SHEET_ID_PROP);
  if (!sheetId) { Logger.log('חסר MIKVAOT_SHEET_ID'); return; }
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(WORK_POLL.SHEET);
  if (!sh || sh.getLastRow() < 2) { Logger.log('אין עדיין סקרי עבודה.'); return; }
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, WORK_POLL.HEADERS.length).getValues();
  const now = new Date();
  Logger.log('— סקרים (5 אחרונים) —');
  values.slice(-5).forEach(function (v) {
    const byVoter = workPollParse_(v[6]).byVoter || {};
    const marked = Object.keys(byVoter).reduce(function (n, k) { return n + (byVoter[k] || []).length; }, 0);
    const map = workPollParse_(v[5]);
    const items = workPollItems_(ss, map);
    const found = Object.keys(map).filter(function (k) { return items[map[k]]; }).length;
    const quiet = Math.round((now - (parseStamp_(v[7]) || now)) / 60000);
    Logger.log([v[0], v[3], v[9] || WORK_POLL.OPEN,
      'סימונים שנקלטו: ' + marked, 'משימות: ' + found + '/' + Object.keys(map).length,
      'שקט ' + quiet + ' דק׳', v[8] ? 'סיכום נשלח' : 'טרם נשלח סיכום'].join(' | '));
  });

  // המשימות עצמן — כדי לראות מיד אם "משימות: 0/3" נובע מכך שהשורות נמחקו
  // מלשונית "שיבוצים", או שהמזהים אינם תואמים
  const wsh = ss.getSheetByName(WRITE.WORK_SHEET);
  Logger.log('— לשונית "' + WRITE.WORK_SHEET + '" —');
  if (!wsh) {
    Logger.log('❌ הלשונית לא קיימת בגיליון! בלעדיה אין משימות ואין מה לסמן.');
  } else {
    const wlast = wsh.getLastRow();
    Logger.log('שורות: ' + Math.max(0, wlast - 1));
    if (wlast > 1) {
      const ids = wsh.getRange(Math.max(2, wlast - 4), 1, Math.min(5, wlast - 1), 4).getValues();
      ids.forEach(function (r) { Logger.log('בגיליון: ' + r[0] + ' | ' + r[3] + ' | ' + r[2]); });
    }
    const lastPoll = values[values.length - 1];
    const lastMap = workPollParse_(lastPoll[5]);
    Object.keys(lastMap).slice(0, 5).forEach(function (k) {
      Logger.log('הסקר מחפש: ' + lastMap[k] + ' | ' + k);
    });
    Logger.log('אם המזהים שהסקר מחפש אינם ברשימה שבגיליון — המשימות נמחקו מאז ' +
      'שהסקר נשלח, ולכן אין למה לקשר את הסימון. הפתרון: לשלוח תכנון עבודה חדש.');
  }

  const log = ss.getSheetByName(WORK_POLL.LOG_SHEET);
  Logger.log('— יומן ההצבעות —');
  if (!log || log.getLastRow() < 2) {
    Logger.log('ריק: לא הגיעה שום הצבעה. סימן מובהק שההתראות על סקרים כבויות ב-Green API ' +
      '(להריץ setupWorkPollWebhooks), או שהסקר נשלח לפני שהן הודלקו.');
  } else {
    const last = log.getLastRow();
    log.getRange(Math.max(2, last - 4), 1, Math.min(5, last - 1), WORK_POLL.LOG_HEADERS.length)
      .getValues().forEach(function (r) { Logger.log(r.join(' | ')); });
  }
}
