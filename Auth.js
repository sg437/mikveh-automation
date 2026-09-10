/************************************************************************
 * משתמשים, כניסה עם Google והרשאות (Auth.gs)
 * ========================================================
 * כניסה: "כניסה עם Google" באפליקציה ➜ ID token ➜ הסקריפט מאמת אותו מול Google
 * (tokeninfo) ובודק שהוא שייך ל-OAuth Client שלנו ➜ נפתח סשן (90 יום) שנשמר
 * במכשיר ונשלח עם כל כתיבה. השם והאימייל נרשמים אוטומטית בלשונית "משתמשים"
 * בכניסה הראשונה, וכל פעולה נרשמת על שם המשתמש.
 *
 * תפקידים: מנהל (הכל, כולל ניהול משתמשים) · מפקח (דיווחים, משימות, דיונים) ·
 *          בלנית (דיווחים ודיונים) · צופה (קריאה בלבד).
 * המשתמש הראשון שנכנס הופך למנהל. משתמש חדש מקבל את DEFAULT_ROLE (ברירת מחדל: מפקח).
 *
 * הגדרות (Script Properties):
 *   GOOGLE_CLIENT_ID — מזהה ה-OAuth Client (Web application) מ-Google Cloud Console.
 *                      אותו ערך גם ב-app/config.js (googleClientId).
 *   DEFAULT_ROLE     — (רשות) תפקיד למשתמש חדש: מפקח / בלנית / צופה.
 *   NOTIFY_WHATSAPP  — (רשות) 1 = התראות אישיות בוואטסאפ (אזכורים, משימות).
 *
 * עד שמוגדר GOOGLE_CLIENT_ID, הכתיבה עובדת במצב הישן (שם חופשי מהמכשיר).
 ************************************************************************/

const AUTH = {
  USERS_SHEET: 'משתמשים',
  USERS_HEADERS: ['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל', 'נוצר', 'כניסה אחרונה', 'מזהה גוגל', 'תמונה'],
  SESSIONS_SHEET: 'סשנים',
  SESSIONS_HEADERS: ['טוקן', 'מזהה משתמש', 'שם', 'תפקיד', 'נוצר', 'תוקף'],
  SESSION_DAYS: 90,
  ROLES: ['מנהל', 'מפקח', 'בלנית', 'צופה'],
  CACHE_SEC: 600,
  PERMS_SHEET: 'הרשאות',
  CLIENT_ID_PROP: 'GOOGLE_CLIENT_ID',
  DEFAULT_ROLE_PROP: 'DEFAULT_ROLE',
};

function authEnabled_() { return !!getProp_(AUTH.CLIENT_ID_PROP); }

function authSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

/** כל המשתמשים. */
function authUsers_(ss) {
  const sh = ss.getSheetByName(AUTH.USERS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, AUTH.USERS_HEADERS.length).getValues();
  const out = [];
  values.forEach(function (v, i) {
    if (!v[0]) return;
    out.push({ id: String(v[0]), name: apiClean_(v[1]) || '', email: (apiClean_(v[2]) || '').toLowerCase(), phone: apiClean_(v[3]) || '',
      role: apiClean_(v[4]) || 'מפקח', active: String(v[5]) !== 'לא', created: apiIso_(v[6]), lastLogin: apiIso_(v[7]),
      googleId: apiClean_(v[8]) || '', picture: apiClean_(v[9]) || '', rowNum: i + 2 });
  });
  return out;
}

/** רשימה ציבורית – לאזכורים ולהצגה (בלי טלפון). */
function authPublicUsers_(ss) {
  return authUsers_(ss).map(function (u) { return { id: u.id, name: u.name, role: u.role, active: u.active, picture: u.picture }; });
}
function authPublicUser_(u) { return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, active: u.active, picture: u.picture }; }

/** משתמש לפי טלפון (לרישום פעולות מהוואטסאפ על שם המשתמש). */
function authUserByPhone_(ss, phone) {
  const key = phoneToChatId_(phone);
  if (!key) return null;
  return authUsers_(ss).filter(function (u) { return u.active && phoneToChatId_(u.phone) === key; })[0] || null;
}

/** אימות ID token של Google מול tokeninfo. מחזיר {sub, email, name, picture} או זורק. */
function authVerifyGoogle_(idToken) {
  const clientId = getProp_(AUTH.CLIENT_ID_PROP);
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID לא מוגדר ב-Script Properties');
  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('הכניסה עם Google נכשלה (' + resp.getResponseCode() + ')');
  const info = JSON.parse(resp.getContentText());
  if (info.aud !== clientId) throw new Error('הטוקן אינו שייך לאפליקציה הזו');
  if (String(info.email_verified) !== 'true') throw new Error('כתובת האימייל לא מאומתת בגוגל');
  if (Number(info.exp) * 1000 < Date.now()) throw new Error('הטוקן פג תוקף');
  return { sub: String(info.sub), email: String(info.email || '').toLowerCase(), name: String(info.name || info.email || '').trim(), picture: String(info.picture || '') };
}

/** כניסה. data: {idToken} */
function authLogin_(ss, d) {
  let g;
  try { g = authVerifyGoogle_(String(d.idToken || '')); } catch (err) { return { error: String(err.message || err) }; }
  const users = authUsers_(ss);
  let u = users.filter(function (x) { return x.googleId === g.sub || (x.email && x.email === g.email); })[0];
  const sh = authSheet_(ss, AUTH.USERS_SHEET, AUTH.USERS_HEADERS);
  if (!u) {
    // משתמש חדש: הראשון = מנהל, השאר לפי DEFAULT_ROLE
    const role = users.length ? (AUTH.ROLES.indexOf(getProp_(AUTH.DEFAULT_ROLE_PROP)) >= 0 ? getProp_(AUTH.DEFAULT_ROLE_PROP) : 'מפקח') : 'מנהל';
    u = { id: Utilities.getUuid(), name: g.name, email: g.email, phone: '', role: role, active: true, googleId: g.sub, picture: g.picture };
    sh.appendRow([u.id, u.name, u.email, '', u.role, 'כן', new Date(), new Date(), u.googleId, u.picture]);
  } else {
    if (!u.active) return { error: 'המשתמש אינו פעיל. פנה למנהל.' };
    sh.getRange(u.rowNum, 8).setValue(new Date());
    if (!u.googleId) sh.getRange(u.rowNum, 9).setValue(g.sub);
    if (g.picture && g.picture !== u.picture) { sh.getRange(u.rowNum, 10).setValue(g.picture); u.picture = g.picture; }
  }
  return authIssueSession_(ss, u);
}

function authIssueSession_(ss, u) {
  const sh = authSheet_(ss, AUTH.SESSIONS_SHEET, AUTH.SESSIONS_HEADERS);
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  const now = new Date();
  const exp = new Date(now.getTime() + AUTH.SESSION_DAYS * 86400000);
  sh.appendRow([token, u.id, u.name, u.role, now, exp]);
  return { ok: true, token: token, user: authPublicUser_(u), expires: apiIsoDate_(exp) };
}

/** מחזיר את המשתמש של הסשן, או null. */
function authSession_(ss, token) {
  token = String(token || '').trim();
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const cached = cache.get('sess_' + token);
  if (cached) return JSON.parse(cached);
  const sh = ss.getSheetByName(AUTH.SESSIONS_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, AUTH.SESSIONS_HEADERS.length).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === token) {
      const exp = values[i][5] instanceof Date ? values[i][5] : new Date(values[i][5]);
      if (exp < new Date()) return null;
      const u = authUsers_(ss).filter(function (x) { return x.id === String(values[i][1]); })[0];
      if (!u || !u.active) return null;
      const pub = authPublicUser_(u);
      cache.put('sess_' + token, JSON.stringify(pub), AUTH.CACHE_SEC);
      return pub;
    }
  }
  return null;
}

function authLogout_(ss, token) {
  CacheService.getScriptCache().remove('sess_' + String(token || ''));
  const sh = ss.getSheetByName(AUTH.SESSIONS_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true };
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(token)) { sh.getRange(i + 2, 6).setValue(new Date(0)); break; }
  }
  return { ok: true };
}

/** פעולות מנהל: users / addUser (הרשאה מראש לפי אימייל) / updateUser */
function authAdmin_(ss, action, d, admin) {
  if (!admin || admin.role !== 'מנהל') return { error: 'פעולה למנהלים בלבד' };
  const users = authUsers_(ss);
  if (action === 'users') return { ok: true, users: users.map(function (u) { return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, active: u.active, created: u.created, lastLogin: u.lastLogin, picture: u.picture }; }) };
  const sh = authSheet_(ss, AUTH.USERS_SHEET, AUTH.USERS_HEADERS);
  if (action === 'addUser') {
    const email = String(d.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'כתובת אימייל לא תקינה' };
    if (users.some(function (u) { return u.email === email; })) return { error: 'המשתמש כבר קיים' };
    const role = AUTH.ROLES.indexOf(d.role) >= 0 ? d.role : 'מפקח';
    const id = Utilities.getUuid();
    sh.appendRow([id, String(d.name || email).trim(), email, String(d.phone || '').trim(), role, 'כן', new Date(), '', '', '']);
    return { ok: true, user: { id: id, name: String(d.name || email).trim(), email: email, phone: String(d.phone || ''), role: role, active: true } };
  }
  const u = users.filter(function (x) { return x.id === String(d.id); })[0];
  if (!u) return { error: 'משתמש לא נמצא' };
  if (action === 'updateUser') {
    if (d.name) sh.getRange(u.rowNum, 2).setValue(String(d.name).trim());
    if (d.phone !== undefined) sh.getRange(u.rowNum, 4).setValue(String(d.phone || '').trim());
    if (d.role && AUTH.ROLES.indexOf(d.role) >= 0) {
      if (u.id === admin.id && d.role !== 'מנהל') return { error: 'אי אפשר להוריד לעצמך את הרשאת המנהל' };
      sh.getRange(u.rowNum, 5).setValue(d.role);
    }
    if (d.active !== undefined) {
      if (u.id === admin.id && !d.active) return { error: 'אי אפשר להשבית את עצמך' };
      sh.getRange(u.rowNum, 6).setValue(d.active ? 'כן' : 'לא');
    }
    authInvalidateUser_(ss, u.id); // שינוי תפקיד/השבתה נכנס לתוקף מיד
    return { ok: true };
  }
  return { error: 'unknown admin action' };
}

/** מוחק מהמטמון את כל הסשנים של משתמש (אחרי שינוי תפקיד או השבתה). */
function authInvalidateUser_(ss, userId) {
  const sh = ss.getSheetByName(AUTH.SESSIONS_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  const cache = CacheService.getScriptCache();
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  values.forEach(function (v) { if (String(v[1]) === String(userId)) cache.remove('sess_' + String(v[0])); });
}

/** עדכון פרטים של המשתמש עצמו (טלפון להתראות). */
function authUpdateMe_(ss, d, user) {
  const u = authUsers_(ss).filter(function (x) { return x.id === user.id; })[0];
  if (!u) return { error: 'משתמש לא נמצא' };
  const sh = ss.getSheetByName(AUTH.USERS_SHEET);
  if (d.phone !== undefined) sh.getRange(u.rowNum, 4).setValue(String(d.phone || '').trim());
  CacheService.getScriptCache().remove('sess_' + String(d._token || ''));
  return { ok: true };
}

// ---- טבלת הרשאות: מה כל תפקיד רשאי לעשות (ניתן לעריכה במסך ההגדרות) ----
const PERM_ACTIONS = [
  { key: 'addAction', label: 'דיווח פעולה (החלפה, ריקון, תעודה...)', def: { 'מפקח': 1, 'בלנית': 1 } },
  { key: 'addInspection', label: 'דו"ח פיקוח כשרות', def: { 'מפקח': 1 } },
  { key: 'addMessage', label: 'כתיבה בדיונים', def: { 'מפקח': 1, 'בלנית': 1 } },
  { key: 'addMedia', label: 'העלאת תמונות, סרטונים והקלטות', def: { 'מפקח': 1, 'בלנית': 1 } },
  { key: 'react', label: 'תגובות אימוג\'י', def: { 'מפקח': 1, 'בלנית': 1, 'צופה': 1 } },
  { key: 'addGroup', label: 'פתיחת קבוצות דיון', def: { 'מפקח': 1 } },
  { key: 'updateGroup', label: 'עריכת קבוצות דיון', def: { 'מפקח': 1 } },
  { key: 'addWorkItems', label: 'פתיחת משימות לחלוקה', def: { 'מפקח': 1 } },
  { key: 'updateWorkItem', label: 'לקיחת משימה וסימון ביצוע', def: { 'מפקח': 1, 'בלנית': 1 } },
  { key: 'updateMikveh', label: 'עריכת פרטי מקווה', def: { 'מפקח': 1 } },
  { key: 'addMikveh', label: 'הוספת מקווה חדש', def: { 'מפקח': 1 } },
];
const PERM_ROLES = ['מפקח', 'בלנית', 'צופה']; // מנהל תמיד הכל

function permsSheet_(ss) {
  let sh = ss.getSheetByName(AUTH.PERMS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(AUTH.PERMS_SHEET);
    sh.appendRow(['פעולה', 'תיאור'].concat(PERM_ROLES));
    PERM_ACTIONS.forEach(function (a) {
      sh.appendRow([a.key, a.label].concat(PERM_ROLES.map(function (r) { return a.def[r] ? 'כן' : 'לא'; })));
    });
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

/** { action: { role: true/false } } */
function authPerms_(ss) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('perms_v1');
  if (cached) return JSON.parse(cached);
  const sh = permsSheet_(ss);
  const out = {};
  const values = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2 + PERM_ROLES.length).getValues() : [];
  values.forEach(function (v) {
    if (!v[0]) return;
    const row = {};
    PERM_ROLES.forEach(function (r, i) { row[r] = String(v[2 + i]) === 'כן'; });
    out[String(v[0])] = row;
  });
  PERM_ACTIONS.forEach(function (a) { if (!out[a.key]) { const row = {}; PERM_ROLES.forEach(function (r) { row[r] = !!a.def[r]; }); out[a.key] = row; } });
  out._labels = {};
  PERM_ACTIONS.forEach(function (a) { out._labels[a.key] = a.label; });
  cache.put('perms_v1', JSON.stringify(out), 120);
  return out;
}

function authSetPerms_(ss, d, admin) {
  if (!admin || admin.role !== 'מנהל') return { error: 'פעולה למנהלים בלבד' };
  const sh = permsSheet_(ss);
  const last = sh.getLastRow();
  const keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  const changes = d.perms || {};
  for (let i = 0; i < keys.length; i++) {
    const k = String(keys[i][0]);
    if (!changes[k]) continue;
    PERM_ROLES.forEach(function (r, j) {
      if (changes[k][r] !== undefined) sh.getRange(i + 2, 3 + j).setValue(changes[k][r] ? 'כן' : 'לא');
    });
  }
  CacheService.getScriptCache().remove('perms_v1');
  return { ok: true, perms: authPerms_(ss) };
}

/** האם התפקיד רשאי לבצע פעולת כתיבה מסוימת. */
function authCan_(user, action) {
  const role = user && user.role;
  if (!role) return true; // מצב ישן (ללא משתמשים)
  if (role === 'מנהל') return true;
  if (['users', 'addUser', 'updateUser', 'setPerms'].indexOf(action) >= 0) return false;
  if (['logout', 'updateMe'].indexOf(action) >= 0) return true;
  const perms = authPerms_(apiSpreadsheet_());
  if (perms[action] && perms[action][role] !== undefined) return !!perms[action][role];
  return role !== 'צופה';
}

/** מנרמל טלפון ישראלי ל-chatId של Green API (9725XXXXXXXX@c.us). */
function phoneToChatId_(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (!p) return '';
  if (p.indexOf('0') === 0) p = '972' + p.slice(1);
  if (p.indexOf('972') !== 0) p = '972' + p;
  return p + '@c.us';
}

/**
 * התראה אישית בוואטסאפ (גשר עד שיהיו התראות דחיפה). פעיל רק כש-NOTIFY_WHATSAPP=1.
 * לא זורק שגיאה.
 */
function notifyUsers_(users, text) {
  try {
    if (getProp_('NOTIFY_WHATSAPP') !== '1') return;
    const idInstance = getProp_('GREEN_ID_INSTANCE'), apiToken = getProp_('GREEN_API_TOKEN');
    if (!idInstance || !apiToken) return;
    const sent = {};
    users.forEach(function (u) {
      const chatId = phoneToChatId_(u.phone);
      if (!chatId || sent[chatId]) return;
      sent[chatId] = true;
      UrlFetchApp.fetch('https://api.green-api.com/waInstance' + idInstance + '/sendMessage/' + apiToken, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ chatId: chatId, message: text }),
      });
    });
  } catch (err) {
    Logger.log('notifyUsers_ failed: ' + err);
  }
}
