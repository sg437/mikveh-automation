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
    'השם בוואטסאפ', 'הערה', 'סטטוס', 'הוכרע בשעה', 'הוכרע ע"י', 'תמונה'],
  PENDING: 'ממתינה',
  APPROVED: 'אושרה',
  REJECTED: 'נדחתה',
  MAX_NAME: 80,
  MAX_NOTE: 200,
  QUEUE_SCAN: 4000, // כמה שורות אחרונות בתור הנכנס לסרוק בחיפוש השם בוואטסאפ
};

function accessSheet_(ss) {
  return authSheet_(ss, ACCESS.SHEET, ACCESS.HEADERS);
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
      decidedBy: apiClean_(v[10]) || '', picture: apiClean_(v[11]) || '', rowNum: i + 2 });
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
  const now = new Date();
  const mine = accessRequests_(ss).filter(function (r) { return r.email === g.email; })[0];

  let id;
  if (mine) {
    // בקשה חוזרת (גם אחרי דחייה) מעדכנת את השורה הקיימת ואינה מוסיפה עוד אחת
    id = mine.id;
    sh.getRange(mine.rowNum, 1, 1, ACCESS.HEADERS.length).setValues([[id, now, name, g.name, g.email, phone,
      waName, note, ACCESS.PENDING, '', '', g.picture]]);
  } else {
    id = Utilities.getUuid();
    sh.appendRow([id, now, name, g.name, g.email, phone, waName, note, ACCESS.PENDING, '', '', g.picture]);
  }

  accessNotify_(ss, { id: id, name: name, googleName: g.name, email: g.email, phone: phone, waName: waName, note: note });
  return { ok: true, status: 'pending' };
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
