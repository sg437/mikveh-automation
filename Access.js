/************************************************************************
 * בקשות גישה למערכת (Access.gs)
 * ========================================================
 * הרישום למערכת סגור: רק מי שמנהל הוסיף מראש יכול להיכנס. עד כה מי שנכנס
 * עם Google בלי הרשאה קיבל "אין לך הרשאה, פנה למנהל" — מבוי סתום, והמנהל
 * היה צריך לאסוף כתובות מייל ביד.
 *
 * במקומו: מי שנכנס עם Google ואינו רשום יכול **לבקש גישה**. הבקשה נרשמת
 * בלשונית "בקשות גישה", המנהל מקבל התראה בוואטסאפ, ומאשר בלחיצה אחת במסך
 * "משתמשים" — והמשתמש נוצר עם הכתובת שגוגל אימתה.
 *
 * למה זה כולל יותר מהשם של גוגל: שם החשבון בגוגל אינו תמיד אומר מיהו
 * האדם (חשבון על שם אחר, שם עסק, אותיות). לכן המבקש ממלא גם **שם מלא**
 * ו**טלפון**, והמערכת מצליבה את הטלפון מול כל מי שאי פעם כתב בקבוצת
 * הוואטסאפ ומוסיפה את **השם שלו כפי שהוא מופיע שם**. בכרטיס הבקשה המנהל
 * רואה זה לצד זה: השם שהוזן · השם בוואטסאפ · השם בחשבון Google · הכתובת.
 *
 * אין צורך בשום הגדרה. ההתראות בוואטסאפ עובדות אם מוגדר ALERT_CHAT_ID
 * ו/או NOTIFY_WHATSAPP=1 עם חיבור Green API.
 ************************************************************************/

const ACCESS = {
  SHEET: 'בקשות גישה',
  HEADERS: ['מזהה', 'זמן', 'שם שהוזן', 'שם בחשבון Google', 'אימייל', 'טלפון',
    'השם בוואטסאפ', 'הערה', 'סטטוס', 'הוכרע בשעה', 'הוכרע ע"י', 'תמונה', 'מקור'],
  PENDING: 'ממתינה',
  APPROVED: 'אושרה',
  REJECTED: 'נדחתה',
  FROM_GOOGLE: 'כניסה עם Google',
  FROM_FORM: 'טופס',
  MAX_NAME: 80,
  MAX_NOTE: 200,
  QUEUE_SCAN: 4000,  // כמה שורות אחרונות בתור הנכנס לסרוק בחיפוש השם בוואטסאפ
  FORM_PROP: 'JOIN_FORM_OPEN',
  URL_PROP: 'APP_URL',
  FORM_PATH: 'join/',
  FORM_MAX: 400,     // תקרת שורות שהטופס יכול להוסיף, כדי שקישור פתוח לא יציף
  BTN_MAX: 25,       // מגבלת וואטסאפ לשם כפתור
};

function accessSheet_(ss) {
  const sh = authSheet_(ss, ACCESS.SHEET, ACCESS.HEADERS);
  // לשונית שנוצרה לפני שהתווספה עמודת "מקור" — משלימים את הכותרת בלבד,
  // בלי לגעת בשורות שכבר נרשמו.
  try {
    const n = ACCESS.HEADERS.length;
    if (!String(sh.getRange(1, n).getValue() || '').trim()) sh.getRange(1, n).setValue(ACCESS.HEADERS[n - 1]);
  } catch (err) { /* לשונית חדשה — הכותרת כבר נכתבה */ }
  return sh;
}

/** ספרות בלבד, ובלי קידומת המדינה — כדי להשוות טלפונים שנכתבו בכמה צורות. */
function accessPhoneKey_(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length > 9 ? d.slice(-9) : d;
}

/**
 * השם שמופיע בוואטסאפ לבעל הטלפון הזה, לפי כל מי שאי פעם כתב בקבוצה
 * (לשונית "תור נכנס"). זה השם שהמנהל מזהה לפיו, ולכן הוא זה שמוצג בבקשה.
 * לעולם לא זורק שגיאה — זו העשרה, לא תנאי.
 */
function accessWaName_(phone) {
  try {
    const key = accessPhoneKey_(phone);
    if (!key) return '';
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.QUEUE_SHEET);
    if (!sh || sh.getLastRow() < 2) return '';
    const last = sh.getLastRow();
    const from = Math.max(2, last - ACCESS.QUEUE_SCAN + 1);
    const values = sh.getRange(from, COLS.SENDER_NAME, last - from + 1, 2).getValues(); // שם, טלפון
    for (let i = values.length - 1; i >= 0; i--) {
      const name = String(values[i][0] || '').trim();
      if (name && accessPhoneKey_(values[i][1]) === key) return name;
    }
    return '';
  } catch (err) {
    Logger.log('accessWaName_ failed: ' + err);
    return '';
  }
}

/** הבקשות, החדשה ראשונה. */
function accessRequests_(ss) {
  const sh = ss.getSheetByName(ACCESS.SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, ACCESS.HEADERS.length).getValues();
  const out = [];
  values.forEach(function (v, i) {
    if (!v[0]) return;
    out.push({ id: String(v[0]), ts: apiIso_(v[1]), name: apiClean_(v[2]) || '', googleName: apiClean_(v[3]) || '',
      email: (apiClean_(v[4]) || '').toLowerCase(), phone: apiClean_(v[5]) || '', waName: apiClean_(v[6]) || '',
      note: apiClean_(v[7]) || '', status: String(v[8] || ACCESS.PENDING), decidedAt: apiIso_(v[9]),
      decidedBy: apiClean_(v[10]) || '', picture: apiClean_(v[11]) || '',
      source: apiClean_(v[12]) || ACCESS.FROM_GOOGLE, rowNum: i + 2 });
  });
  return out.reverse();
}

/**
 * ?action=requestAccess — בקשת גישה. אין כאן סשן (המבקש עדיין אינו משתמש),
 * ולכן הזהות נלקחת מה-ID token של גוגל ומאומתת מולה בכל בקשה.
 * d = { idToken, name, phone, note }
 */
function accessRequest_(ss, d) {
  let g;
  try { g = authVerifyGoogle_(String((d && d.idToken) || '')); } catch (err) { return { error: String(err.message || err) }; }

  // כבר רשום ופעיל — אין מה לבקש, פשוט להיכנס
  const existing = authUsers_(ss).filter(function (u) { return u.googleId === g.sub || (u.email && u.email === g.email); })[0];
  if (existing && existing.active) return { ok: true, status: 'exists' };

  const name = String((d && d.name) || g.name || '').trim().slice(0, ACCESS.MAX_NAME);
  const phone = String((d && d.phone) || '').trim().slice(0, 30);
  const note = String((d && d.note) || '').trim().slice(0, ACCESS.MAX_NOTE);
  if (!name) return { error: 'חסר שם מלא' };
  if (accessPhoneKey_(phone).length < 9) return { error: 'מספר הטלפון אינו תקין' };

  const waName = accessWaName_(phone);
  const sh = accessSheet_(ss);
  const mine = accessRequests_(ss).filter(function (r) { return r.email === g.email; })[0];

  const id = accessSave_(ss, sh, mine, { name: name, googleName: g.name, email: g.email, phone: phone,
    waName: waName, note: note, picture: g.picture, source: ACCESS.FROM_GOOGLE });
  accessNotify_(ss, { id: id, name: name, googleName: g.name, email: g.email, phone: phone, waName: waName,
    note: note, source: ACCESS.FROM_GOOGLE });
  return { ok: true, status: 'pending' };
}

/** כתיבת שורת בקשה (חדשה או עדכון של קיימת). מחזיר את המזהה. */
function accessSave_(ss, sh, existing, r) {
  const now = new Date();
  const row = [existing ? existing.id : Utilities.getUuid(), now, r.name, r.googleName || '', r.email, r.phone,
    r.waName || '', r.note || '', ACCESS.PENDING, '', '', r.picture || '', r.source];
  // בקשה חוזרת (גם אחרי דחייה) מעדכנת את השורה הקיימת ואינה מוסיפה עוד אחת
  if (existing) sh.getRange(existing.rowNum, 1, 1, ACCESS.HEADERS.length).setValues([row]);
  else sh.appendRow(row);
  return row[0];
}

// ==================== טופס הפרטים (בלי כניסה) ====================

/**
 * דף הטופס (app/join/) הוא עמוד עצמאי: הוא אינו טוען את המערכת ואינו קורא
 * ממנה דבר — הוא רק מוסיף שורה כאן. כך אפשר לאסוף פרטים מהקבוצה **לפני**
 * שהקישור למערכת נשלח לאיש.
 *
 * הקישור פתוח לכל מי שיש לו אותו, ולכן:
 *   · השורה נרשמת כ"ממתינה" ומקורה מסומן "טופס" — היא אינה משתמש עד שהמנהל מאשר;
 *   · הטופס מקבל רק כשהוא פתוח (JOIN_FORM_OPEN=1), ונסגר בלחיצה במסך ההגדרות;
 *   · יש תקרת שורות, כדי שקישור שהודלף לא יציף את הגיליון.
 */
function accessFormOpen_() { return getProp_(ACCESS.FORM_PROP) === '1'; }

function accessSubmit_(ss, d) {
  if (!accessFormOpen_()) return { error: 'הטופס סגור כרגע. פנו למנהל המערכת.' };
  const name = String((d && d.name) || '').trim().slice(0, ACCESS.MAX_NAME);
  const email = String((d && d.email) || '').trim().toLowerCase().slice(0, 120);
  const phone = String((d && d.phone) || '').trim().slice(0, 30);
  const note = String((d && d.note) || '').trim().slice(0, ACCESS.MAX_NOTE);
  if (!name) return { error: 'חסר שם מלא' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'כתובת האימייל אינה תקינה' };
  if (accessPhoneKey_(phone).length < 9) return { error: 'מספר הטלפון אינו תקין' };

  const sh = accessSheet_(ss);
  const all = accessRequests_(ss);
  if (all.length >= ACCESS.FORM_MAX) return { error: 'הטופס אינו מקבל כרגע פניות נוספות.' };

  const mine = all.filter(function (r) { return r.email === email; })[0];
  // מי שכבר רשום כמשתמש פעיל לא צריך למלא
  const user = authUsers_(ss).filter(function (u) { return u.email === email; })[0];
  if (user && user.active) return { ok: true, status: 'exists' };
  if (mine && mine.status === ACCESS.APPROVED) return { ok: true, status: 'exists' };

  const waName = accessWaName_(phone);
  const id = accessSave_(ss, sh, mine, { name: name, email: email, phone: phone, waName: waName,
    note: note, source: ACCESS.FROM_FORM });
  accessNotify_(ss, { id: id, name: name, email: email, phone: phone, waName: waName, note: note,
    source: ACCESS.FROM_FORM });
  return { ok: true, status: 'pending' };
}

/**
 * ?action=joinForm — שליחת הטופס לקבוצה, ופתיחה/סגירה שלו (מנהל בלבד).
 * d = { do: 'send' | 'open' | 'close', url, text }
 *
 * השליחה מנסה קודם **כפתור** (SendInteractiveButtons). וואטסאפ אינו תמיד
 * מציג כפתורים ממספר רגיל, ולכן כישלון אינו שגיאה: נשלחת הודעה עם הקישור,
 * שוואטסאפ ממילא מציג ככרטיס לחיץ. התשובה אומרת מה נשלח בפועל.
 */
function accessJoinForm_(ss, d, admin) {
  if (!admin || admin.role !== 'מנהל') return { error: 'פעולה למנהלים בלבד' };
  const what = String((d && d.do) || 'status');
  const props = PropertiesService.getScriptProperties();

  if (what === 'close') { props.setProperty(ACCESS.FORM_PROP, '0'); return { ok: true, open: false }; }
  if (what === 'open') { props.setProperty(ACCESS.FORM_PROP, '1'); return { ok: true, open: true }; }
  if (what !== 'send') return { ok: true, open: accessFormOpen_() };

  const base = String((d && d.url) || '').trim().replace(/[?#].*$/, '');
  if (!/^https:\/\//i.test(base)) return { error: 'כתובת הטופס אינה תקינה' };
  const url = base + (base.slice(-1) === '/' ? '' : '/');
  const chatId = getProp_('GROUP_CHAT_ID');
  if (!chatId || !getProp_('GREEN_ID_INSTANCE') || !getProp_('GREEN_API_TOKEN')) {
    return { error: 'הגשר לוואטסאפ אינו מוגדר (GROUP_CHAT_ID + Green API)' };
  }

  const body = String((d && d.text) || '').trim().slice(0, 600) ||
    'רישום למערכת כשרות המקוואות — נא למלא שם מלא, כתובת מייל וטלפון. זה לוקח חצי דקה, ופעם אחת בלבד.';
  props.setProperty(ACCESS.FORM_PROP, '1');
  props.setProperty(ACCESS.URL_PROP, base.replace(new RegExp(ACCESS.FORM_PATH + '$'), ''));

  const sent = accessSendButton_(chatId, body, 'מילוי הפרטים', url);
  return { ok: true, open: true, how: sent.how, url: url, detail: sent.detail };
}

/** כפתור קישור לקבוצה, ואם וואטסאפ לא מקבל — הודעה עם הקישור. */
function accessSendButton_(chatId, body, buttonText, url) {
  const idInstance = getProp_('GREEN_ID_INSTANCE'), apiToken = getProp_('GREEN_API_TOKEN');
  let detail = '';
  try {
    const resp = UrlFetchApp.fetch('https://api.green-api.com/waInstance' + idInstance + '/sendInteractiveButtons/' + apiToken, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        chatId: chatId,
        header: 'רישום למערכת',
        body: body,
        footer: 'מערכת כשרות המקוואות',
        buttons: [{ type: 'url', buttonId: '1', buttonText: String(buttonText).slice(0, ACCESS.BTN_MAX), url: url }],
      }),
    });
    const code = resp.getResponseCode();
    if (code === 200 && JSON.parse(resp.getContentText() || '{}').idMessage) {
      return { how: 'button', detail: '' };
    }
    Logger.log('sendInteractiveButtons ' + code + ': ' + resp.getContentText().slice(0, 300));
    detail = 'וואטסאפ לא קיבל כפתור (' + code + ')';
  } catch (err) {
    Logger.log('sendInteractiveButtons failed: ' + err);
    detail = String(err).slice(0, 120);
  }
  // נפילה חזרה: הודעה עם הקישור. בוואטסאפ היא מוצגת ככרטיס לחיץ.
  const ok = typeof askSay_ === 'function' ? !!askSay_(chatId, body + '\n\n' + url, '') : false;
  return { how: ok ? 'link' : 'failed', detail: detail };
}

/** התראה למנהלים: בוואטסאפ (טלפון אישי) ולצ'אט ההתראות. לא זורק שגיאה. */
function accessNotify_(ss, req) {
  try {
    const lines = ['🔔 בקשת גישה חדשה למערכת', '',
      '👤 ' + req.name,
      '📱 ' + req.phone + (req.waName && req.waName !== req.name ? ' — בוואטסאפ: ' + req.waName : ''),
      '✉️ ' + req.email];
    if (req.googleName && req.googleName !== req.name) lines.push('(שם החשבון בגוגל: ' + req.googleName + ')');
    if (req.note) lines.push('📝 ' + req.note);
    if (req.source === ACCESS.FROM_FORM) lines.push('(מילא את טופס הפרטים — הכתובת הוקלדה ולא אומתה מול גוגל)');
    lines.push('', 'לאישור: המערכת ➜ משתמשים ➜ בקשות גישה.');
    const text = lines.join('\n');

    const admins = authUsers_(ss).filter(function (u) { return u.active && u.role === 'מנהל' && u.phone; });
    if (admins.length) notifyUsers_(admins, text);
    const alert = getProp_('ALERT_CHAT_ID');
    // askSay_ (Questions.js) הוא השליחה הבטוחה היחידה לצ'אט כלשהו; אם הקובץ
    // עדיין לא הועלה, ההתראה האישית למנהלים כבר יצאה ואין מה להפיל.
    if (alert && typeof askSay_ === 'function') askSay_(alert, text, '');
  } catch (err) {
    Logger.log('accessNotify_ failed: ' + err);
  }
}

/** ?action=accessRequests — הרשימה למסך המשתמשים (מנהל בלבד). */
function accessList_(ss, admin) {
  if (!admin || admin.role !== 'מנהל') return { error: 'פעולה למנהלים בלבד' };
  return { ok: true, requests: accessRequests_(ss).map(function (r) { delete r.rowNum; return r; }) };
}

/**
 * ?action=decideRequest — אישור או דחייה. d = { id, approve, role, name, phone }
 * אישור יוצר את המשתמש עם השם והטלפון שבבקשה (או כפי שהמנהל תיקן אותם).
 */
function accessDecide_(ss, d, admin) {
  if (!admin || admin.role !== 'מנהל') return { error: 'פעולה למנהלים בלבד' };
  const id = String((d && d.id) || '');
  const req = accessRequests_(ss).filter(function (r) { return r.id === id; })[0];
  if (!req) return { error: 'הבקשה לא נמצאה' };
  const sh = ss.getSheetByName(ACCESS.SHEET);
  const now = new Date();

  if (!d.approve) {
    sh.getRange(req.rowNum, 9, 1, 3).setValues([[ACCESS.REJECTED, now, admin.name]]);
    return { ok: true, status: ACCESS.REJECTED };
  }

  const name = String(d.name || req.name).trim().slice(0, ACCESS.MAX_NAME) || req.email;
  const phone = String(d.phone === undefined ? req.phone : d.phone).trim().slice(0, 30);
  const role = AUTH.ROLES.indexOf(authRole_(d.role)) >= 0 ? authRole_(d.role) : 'מפקח';

  const users = authUsers_(ss);
  const existing = users.filter(function (u) { return u.email === req.email; })[0];
  const ush = authSheet_(ss, AUTH.USERS_SHEET, AUTH.USERS_HEADERS);
  if (existing) {
    // כבר יש שורה (למשל משתמש שהושבת) — מפעילים אותה מחדש במקום לשכפל
    ush.getRange(existing.rowNum, 2, 1, 5).setValues([[name, req.email, phone, role, 'כן']]);
    authInvalidateUser_(ss, existing.id);
  } else {
    ush.appendRow([Utilities.getUuid(), name, req.email, phone, role, 'כן', now, '', '', req.picture]);
  }
  sh.getRange(req.rowNum, 9, 1, 3).setValues([[ACCESS.APPROVED, now, admin.name]]);

  // הודעה אישית למבקש — הוא אינו יודע מתי אושר, וההודעה חוסכת לו לנסות שוב ושוב
  try {
    const chatId = phoneToChatId_(phone);
    if (chatId && typeof askSay_ === 'function') {
      askSay_(chatId, '✅ הגישה שלך למערכת כשרות המקוואות אושרה (' + role + ').\n' +
        'להיכנס עם אותו חשבון Google: ' + (getProp_('APP_URL') || 'הקישור למערכת'), '');
    }
  } catch (err) { Logger.log('accessDecide_ notify failed: ' + err); }

  return { ok: true, status: ACCESS.APPROVED, role: role };
}

/** בדיקה מעורך הסקריפט: מה מצב הבקשות. */
function testAccessRequests() {
  const ss = apiSpreadsheet_();
  const list = accessRequests_(ss);
  Logger.log('— בקשות גישה: ' + list.length + ' —');
  list.slice(0, 10).forEach(function (r) {
    Logger.log([r.status, r.name, r.phone, r.waName, r.email, r.googleName].join(' | '));
  });
  const admins = authUsers_(ss).filter(function (u) { return u.active && u.role === 'מנהל'; });
  Logger.log('— מנהלים שיקבלו התראה —');
  admins.forEach(function (u) { Logger.log(u.name + ' | ' + (u.phone || '(בלי טלפון — לא תגיע התראה אישית)')); });
  Logger.log('NOTIFY_WHATSAPP=1: ' + (getProp_('NOTIFY_WHATSAPP') === '1') + ' · ALERT_CHAT_ID: ' + (getProp_('ALERT_CHAT_ID') || '(חסר)'));
}
