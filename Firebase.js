/************************************************************************
 * Firebase בצד השרת (Firebase.gs)
 * ========================================================
 * שלושה דברים, וכל אחד מהם כבוי עד שמגדירים אותו:
 *
 * 1. כניסה דרך Firebase Authentication — האפליקציה שולחת ID token של Firebase
 *    (firebaseToken) במקום ה-ID token של Google, והוא מאומת כאן מול Google.
 *    משמש בעיקר באתר שב-Firebase Hosting, שם ה-OAuth Client הישן אינו מורשה.
 *    הסשן, המשתמשים וההרשאות נשארים בדיוק כמו שהם (Auth.js).
 *
 * 2. Firestore — מסד הנתונים של Firebase, דרך REST עם חשבון שירות. הכללים
 *    (firestore.rules) חוסמים כל גישה מהדפדפן; רק הקוד כאן קורא וכותב.
 *    כרגע שמור בו דבר אחד: המכשירים שנרשמו להתראות דחיפה (pushDevices).
 *
 * 3. התראות דחיפה (Firebase Cloud Messaging) — כל התראה אישית שנשלחת בוואטסאפ
 *    (notifyUsers_ ב-Auth.js) נשלחת גם כהתראה למכשירים שהמשתמש הפעיל בהם
 *    "התראות במכשיר הזה".
 *
 * הגדרות (Script Properties):
 *   FIREBASE_SERVICE_ACCOUNT — מפתח חשבון השירות (קובץ ה-JSON כולו, או אותו
 *                              קובץ בקידוד base64). נדרש ל-Firestore ולהתראות.
 *                              בלעדיו שניהם כבויים והכניסה ממשיכה לעבוד.
 *   NOTIFY_PUSH              — (רשות) 0 = לא לשלוח התראות דחיפה.
 *   FIREBASE_AUTH            — (רשות) 0 = לא לקבל כניסה דרך Firebase.
 *   FIREBASE_PROJECT_ID      — (רשות) פרויקט אחר מברירת המחדל.
 *   FIREBASE_API_KEY         — (רשות) ה-apiKey של אפליקציית ה-Web בפרויקט ההוא.
 *
 * בדיקה מהעורך: testFirebase.
 ************************************************************************/

const FB = {
  PROJECT_PROP: 'FIREBASE_PROJECT_ID',
  API_KEY_PROP: 'FIREBASE_API_KEY',
  SA_PROP: 'FIREBASE_SERVICE_ACCOUNT',
  AUTH_PROP: 'FIREBASE_AUTH',
  PUSH_PROP: 'NOTIFY_PUSH',
  // מזהים ציבוריים (אותם ערכים שב-app/config.js), לא סודות.
  DEFAULT_PROJECT: 'mikveh-automation',
  DEFAULT_API_KEY: 'AIzaSyAxLMeWsBopaNQISh39KFTMVOtyo09dX7M',
  DEVICES: 'pushDevices',
  MAX_DEVICES: 8,          // מכשירים למשתמש; הישן ביותר נמחק
  TOKEN_CACHE: 'fb_access_token',
  TOKEN_SEC: 3000,         // הטוקן של גוגל תקף שעה
  SCOPES: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
  PUSH_TITLE: 'מערכת המקוואות',
  PUSH_BODY_MAX: 300,
};

function fbProject_() { return getProp_(FB.PROJECT_PROP) || FB.DEFAULT_PROJECT; }
function fbApiKey_() { return getProp_(FB.API_KEY_PROP) || FB.DEFAULT_API_KEY; }

/** האם השרת מקבל כניסה דרך Firebase Authentication. */
function fbAuthEnabled_() {
  return authEnabled_() && getProp_(FB.AUTH_PROP) !== '0' && !!fbApiKey_();
}

// ==================== כניסה: אימות ID token של Firebase ====================

/** החלק האמצעי של JWT, מפוענח. לזיהוי הפרויקט בלבד — האימות עצמו נעשה מול Google. */
function fbJwtPayload_(jwt) {
  const part = String(jwt || '').split('.')[1] || '';
  const text = Utilities.newBlob(Utilities.base64DecodeWebSafe(part)).getDataAsString('UTF-8');
  return JSON.parse(text);
}

/**
 * אימות ID token של Firebase. מחזיר {sub, email, name, picture} — אותו מבנה
 * כמו authVerifyGoogle_, עם אותו מזהה Google (sub), כך שמשתמש קיים מזוהה
 * בשתי דרכי הכניסה כאותו אדם.
 *
 * האימות נעשה מול Google (accounts:lookup), שבודקת חתימה ותוקף. בנוסף נדרש
 * שהטוקן הונפק לפרויקט שלנו, ושהכניסה נעשתה עם חשבון Google מאומת — לא עם
 * ספק אחר שמישהו יפעיל בפרויקט בעתיד.
 */
function fbVerifyIdToken_(idToken) {
  if (!fbAuthEnabled_()) throw new Error('כניסה דרך Firebase אינה מופעלת בשרת');
  idToken = String(idToken || '');
  const project = fbProject_();
  let claims;
  try { claims = fbJwtPayload_(idToken); } catch (err) { throw new Error('טוקן הכניסה אינו תקין'); }
  if (claims.aud !== project || claims.iss !== 'https://securetoken.google.com/' + project) {
    throw new Error('הטוקן אינו שייך לאפליקציה הזו');
  }
  const resp = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(fbApiKey_()), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ idToken: idToken }),
  });
  if (resp.getResponseCode() !== 200) throw new Error('הכניסה עם Google נכשלה (' + resp.getResponseCode() + ')');
  const u = (JSON.parse(resp.getContentText()).users || [])[0];
  if (!u || u.disabled) throw new Error('הכניסה עם Google נכשלה');
  if (String(u.localId) !== String(claims.sub)) throw new Error('הטוקן אינו שייך לאפליקציה הזו');
  const g = (u.providerUserInfo || []).filter(function (p) { return p.providerId === 'google.com'; })[0];
  if (!g || !g.rawId) throw new Error('הכניסה חייבת להיות עם חשבון Google');
  const email = String(g.email || '').toLowerCase();
  if (!email || u.emailVerified !== true || String(u.email || '').toLowerCase() !== email) {
    throw new Error('כתובת האימייל לא מאומתת בגוגל');
  }
  return { sub: String(g.rawId), email: email, name: String(g.displayName || u.displayName || email).trim(),
    picture: String(g.photoUrl || u.photoUrl || '') };
}

// ==================== חשבון שירות ====================

/** מפתח חשבון השירות מהמאפיינים (JSON, או JSON בקידוד base64), או null. */
function fbServiceAccount_() {
  let raw = String(getProp_(FB.SA_PROP) || '').trim();
  if (!raw) return null;
  try {
    if (raw.charAt(0) !== '{') raw = Utilities.newBlob(Utilities.base64Decode(raw)).getDataAsString('UTF-8');
    const sa = JSON.parse(raw);
    return sa && sa.client_email && sa.private_key ? sa : null;
  } catch (err) {
    Logger.log('FIREBASE_SERVICE_ACCOUNT אינו JSON תקין: ' + err);
    return null;
  }
}

function fbB64Url_(bytesOrText) {
  return Utilities.base64EncodeWebSafe(bytesOrText).replace(/=+$/, '');
}

/** טוקן גישה של חשבון השירות (נשמר במטמון כ-50 דקות). זורק כשאין מפתח. */
function fbAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(FB.TOKEN_CACHE);
  if (cached) return cached;
  const sa = fbServiceAccount_();
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT לא מוגדר ב-Script Properties');
  const now = Math.floor(Date.now() / 1000);
  const head = fbB64Url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = fbB64Url_(JSON.stringify({ iss: sa.client_email, scope: FB.SCOPES,
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = fbB64Url_(Utilities.computeRsaSha256Signature(head + '.' + claims, sa.private_key));
  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claims + '.' + sig },
  });
  if (resp.getResponseCode() !== 200) throw new Error('חשבון השירות של Firebase נדחה (' + resp.getResponseCode() + ')');
  const token = JSON.parse(resp.getContentText()).access_token;
  if (!token) throw new Error('חשבון השירות של Firebase לא קיבל טוקן');
  cache.put(FB.TOKEN_CACHE, token, FB.TOKEN_SEC);
  return token;
}

// ==================== Firestore (REST) ====================

function fbDocsUrl_(path) {
  return 'https://firestore.googleapis.com/v1/projects/' + fbProject_() + '/databases/(default)/documents' + (path ? '/' + path : '');
}

function fbHeaders_() { return { Authorization: 'Bearer ' + fbAccessToken_() }; }

/** { a: 'x' } ➜ { a: { stringValue: 'x' } }. נשמרות מחרוזות בלבד — זה כל מה שנדרש כאן. */
function fbFields_(obj) {
  const out = {};
  Object.keys(obj).forEach(function (k) { out[k] = { stringValue: String(obj[k] == null ? '' : obj[k]) }; });
  return out;
}

/** מסמך של Firestore ➜ אובייקט רגיל, עם _name (הנתיב המלא) ו-_id. */
function fbPlain_(doc) {
  const out = { _name: doc.name, _id: String(doc.name || '').split('/').pop() };
  Object.keys(doc.fields || {}).forEach(function (k) {
    const v = doc.fields[k];
    out[k] = v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) :
      v.booleanValue !== undefined ? v.booleanValue : v.timestampValue !== undefined ? v.timestampValue : '';
  });
  return out;
}

/** כתיבת מסמך (יצירה או החלפה). זורק בכישלון. */
function fbDocSet_(path, obj) {
  const resp = UrlFetchApp.fetch(fbDocsUrl_(path), {
    method: 'patch', contentType: 'application/json', muteHttpExceptions: true, headers: fbHeaders_(),
    payload: JSON.stringify({ fields: fbFields_(obj) }),
  });
  if (resp.getResponseCode() !== 200) throw new Error('כתיבה ל-Firestore נכשלה (' + resp.getResponseCode() + '): ' + fbErrText_(resp));
  return true;
}

/** קריאת מסמך; null כשאינו קיים. */
function fbDocGet_(path) {
  const resp = UrlFetchApp.fetch(fbDocsUrl_(path), { muteHttpExceptions: true, headers: fbHeaders_() });
  if (resp.getResponseCode() === 404) return null;
  if (resp.getResponseCode() !== 200) throw new Error('קריאה מ-Firestore נכשלה (' + resp.getResponseCode() + '): ' + fbErrText_(resp));
  return fbPlain_(JSON.parse(resp.getContentText()));
}

/** מחיקת מסמכים לפי הנתיב המלא שלהם (_name). לא זורק. */
function fbDocsDelete_(names) {
  if (!names || !names.length) return;
  try {
    const headers = fbHeaders_();
    UrlFetchApp.fetchAll(names.map(function (n) {
      return { url: 'https://firestore.googleapis.com/v1/' + n, method: 'delete', headers: headers, muteHttpExceptions: true };
    }));
  } catch (err) { Logger.log('fbDocsDelete_ failed: ' + err); }
}

/** מסמכי אוסף שהשדה שלהם שווה לאחד הערכים (עד 30 ערכים בשאילתה). */
function fbQueryIn_(collection, field, values) {
  const out = [];
  const headers = fbHeaders_();
  for (let i = 0; i < values.length; i += 30) {
    const chunk = values.slice(i, i + 30);
    const resp = UrlFetchApp.fetch(fbDocsUrl_('') + ':runQuery', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: headers,
      payload: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'IN',
          value: { arrayValue: { values: chunk.map(function (v) { return { stringValue: String(v) }; }) } } } },
        limit: 300,
      } }),
    });
    if (resp.getResponseCode() !== 200) throw new Error('שאילתה ל-Firestore נכשלה (' + resp.getResponseCode() + '): ' + fbErrText_(resp));
    JSON.parse(resp.getContentText()).forEach(function (row) { if (row.document) out.push(fbPlain_(row.document)); });
  }
  return out;
}

function fbErrText_(resp) {
  try { return String(JSON.parse(resp.getContentText()).error.message || '').slice(0, 200); }
  catch (err) { return String(resp.getContentText() || '').slice(0, 200); }
}

// ==================== התראות דחיפה ====================

/** האם התראות דחיפה זמינות: יש חשבון שירות, יש משתמשים, ולא כובו. */
function pushEnabled_() {
  return authEnabled_() && getProp_(FB.PUSH_PROP) !== '0' && !!getProp_(FB.SA_PROP);
}

function pushDeviceId_(token) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 40);
}

/**
 * רישום המכשיר להתראות. d: { token, app, ua }.
 * המסמך נקרא לפי הטוקן, ולכן מכשיר שייך תמיד למשתמש האחרון שנרשם בו —
 * מי שנכנס במכשיר של אחר אינו מקבל את ההתראות של הקודם.
 */
function pushRegister_(d, user) {
  if (!user || !user.id) return { error: 'התראות דורשות כניסה עם Google' };
  if (!pushEnabled_()) return { error: 'התראות דחיפה אינן מוגדרות בשרת', code: 'nopush' };
  const token = String((d && d.token) || '').trim();
  if (token.length < 20 || token.length > 4096) return { error: 'טוקן המכשיר אינו תקין' };
  try {
    const now = new Date().toISOString();
    const id = pushDeviceId_(token);
    const old = fbDocGet_(FB.DEVICES + '/' + id);
    fbDocSet_(FB.DEVICES + '/' + id, {
      token: token, userId: user.id, name: user.name || '', app: String((d && d.app) || 'main').slice(0, 20),
      ua: String((d && d.ua) || '').slice(0, 200), created: (old && old.userId === user.id && old.created) || now, seen: now,
    });
    // יותר מדי מכשירים למשתמש: הישנים ביותר (לפי השימוש האחרון) נמחקים
    const mine = fbQueryIn_(FB.DEVICES, 'userId', [user.id]);
    if (mine.length > FB.MAX_DEVICES) {
      mine.sort(function (a, b) { return String(a.seen) < String(b.seen) ? -1 : 1; });
      fbDocsDelete_(mine.slice(0, mine.length - FB.MAX_DEVICES).map(function (x) { return x._name; }));
    }
    return { ok: true, devices: Math.min(mine.length, FB.MAX_DEVICES) };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

/** ביטול הרישום של המכשיר (כיבוי ההתראות, או יציאה מהמערכת). d: { token } */
function pushUnregister_(d, user) {
  if (!pushEnabled_()) return { ok: true };
  const token = String((d && d.token) || '').trim();
  if (!token) return { ok: true };
  try {
    const doc = fbDocGet_(FB.DEVICES + '/' + pushDeviceId_(token));
    // רק המכשיר של המשתמש עצמו: טוקן של מישהו אחר אינו נמחק בבקשה שלו
    if (doc && (!user || !user.id || doc.userId === user.id)) fbDocsDelete_([doc._name]);
    return { ok: true };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

/** ההודעה כפי שנשלחת בוואטסאפ ➜ כותרת, גוף וקישור להתראה. */
function pushPayload_(text) {
  text = String(text || '');
  const link = (text.match(/https?:\/\/\S+/) || [''])[0];
  const body = text.split('\n')
    .filter(function (line) { return !/https?:\/\//.test(line); }) // שורת "לתגובה: <קישור>" מיותרת: ההתראה עצמה היא הקישור
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title: FB.PUSH_TITLE, body: body.length > FB.PUSH_BODY_MAX ? body.slice(0, FB.PUSH_BODY_MAX - 1) + '…' : body, url: link };
}

/**
 * התראת דחיפה לכל המכשירים של המשתמשים. מחזיר כמה נשלחו. לא זורק —
 * התראה שנכשלה לעולם אינה מפילה את הפעולה שגרמה לה.
 * מכשיר ש-FCM מדווח עליו שאינו רשום עוד (האפליקציה הוסרה, ההרשאה בוטלה) נמחק.
 */
function pushNotifyUsers_(users, text) {
  try {
    if (!pushEnabled_()) return 0;
    const ids = [];
    (users || []).forEach(function (u) { if (u && u.id && ids.indexOf(String(u.id)) < 0) ids.push(String(u.id)); });
    if (!ids.length) return 0;
    const devices = fbQueryIn_(FB.DEVICES, 'userId', ids).filter(function (x) { return x.token; });
    if (!devices.length) return 0;
    const p = pushPayload_(text);
    const headers = fbHeaders_();
    const url = 'https://fcm.googleapis.com/v1/projects/' + fbProject_() + '/messages:send';
    const resps = UrlFetchApp.fetchAll(devices.map(function (dev) {
      return { url: url, method: 'post', contentType: 'application/json', headers: headers, muteHttpExceptions: true,
        // data בלבד: ה-Service Worker של האפליקציה מציג את ההתראה בעצמו (app/sw.js)
        payload: JSON.stringify({ message: { token: dev.token, data: { title: p.title, body: p.body, url: p.url },
          webpush: { headers: { Urgency: 'high', TTL: '86400' } } } }) };
    }));
    let sent = 0;
    const dead = [];
    resps.forEach(function (resp, i) {
      const code = resp.getResponseCode();
      if (code === 200) { sent++; return; }
      const body = String(resp.getContentText() || '');
      if (code === 404 || /UNREGISTERED/.test(body) || (code === 400 && /registration token/i.test(body))) dead.push(devices[i]._name);
      else Logger.log('push failed (' + code + '): ' + body.slice(0, 200));
    });
    fbDocsDelete_(dead);
    return sent;
  } catch (err) {
    Logger.log('pushNotifyUsers_ failed: ' + err);
    return 0;
  }
}

// ==================== בדיקה מהעורך ====================

/**
 * בדיקת החיבור ל-Firebase – להרצה מעורך ה-Apps Script (Run ▶).
 * בודקת את חשבון השירות, כותבת וקוראת מסמך בדיקה ב-Firestore ומוחקת אותו,
 * ושולחת התראת בדיקה לכל המכשירים הרשומים. מדפיסה ליומן מה חסר.
 */
function testFirebase() {
  Logger.log('פרויקט: %s', fbProject_());
  Logger.log('כניסה דרך Firebase: %s', fbAuthEnabled_() ? 'מופעלת' : 'כבויה');
  if (!getProp_(FB.SA_PROP)) { Logger.log('❌ FIREBASE_SERVICE_ACCOUNT לא מוגדר. בלעדיו אין Firestore ואין התראות דחיפה.'); return; }
  const sa = fbServiceAccount_();
  if (!sa) { Logger.log('❌ FIREBASE_SERVICE_ACCOUNT אינו מפתח תקין (קובץ ה-JSON כולו, או base64 שלו).'); return; }
  Logger.log('חשבון שירות: %s', sa.client_email);
  try { CacheService.getScriptCache().remove(FB.TOKEN_CACHE); fbAccessToken_(); Logger.log('✅ חשבון השירות התקבל אצל Google'); }
  catch (err) { Logger.log('❌ ' + err.message); return; }
  try {
    const path = '_test/' + Utilities.getUuid();
    fbDocSet_(path, { at: new Date().toISOString() });
    const back = fbDocGet_(path);
    if (back) fbDocsDelete_([back._name]);
    Logger.log(back ? '✅ Firestore: כתיבה, קריאה ומחיקה עברו' : '❌ Firestore: המסמך נכתב אך לא נקרא');
  } catch (err) {
    Logger.log('❌ ' + err.message);
    Logger.log('   אם המסד עדיין לא נוצר: Firebase Console ⟵ Firestore Database ⟵ Create database.');
    return;
  }
  if (!pushEnabled_()) { Logger.log('התראות דחיפה כבויות (NOTIFY_PUSH=0, או שאין משתמשים מוגדרים).'); return; }
  const users = authUsers_(apiSpreadsheet_()).filter(function (u) { return u.active; });
  const devices = fbQueryIn_(FB.DEVICES, 'userId', users.map(function (u) { return u.id; }));
  Logger.log('מכשירים רשומים להתראות: %s', devices.length);
  devices.forEach(function (x) { Logger.log('   %s | %s | %s', x.name, x.app, String(x.seen).slice(0, 16)); });
  if (!devices.length) { Logger.log('אין מכשירים. באפליקציה: תפריט המשתמש ⟵ "התראות במכשיר הזה" ⟵ הפעלה.'); return; }
  const sent = pushNotifyUsers_(users, '🔔 הודעת בדיקה ממערכת כשרות המקוואות.\nאם קיבלת אותה – התראות הדחיפה עובדות.');
  Logger.log('✅ נשלחו %s התראות. בדוק במכשירים.', sent);
}
