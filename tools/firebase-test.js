/* בדיקות Firebase.js על קוד השרת האמיתי, דרך gas-stub: כניסה דרך Firebase
   Authentication, רישום מכשירים ב-Firestore, והתראות דחיפה. Google מדומה
   (אימות טוקנים, Firestore, FCM) — שום דבר אינו יוצא לרשת. */
const crypto = require('crypto');
const { load } = require('./gas-stub');
const FILES = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'WorkPoll.js', 'Questions.js', 'Access.js', 'Firebase.js'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

const PROJECT = 'mikveh-automation';
const KEYS = crypto.generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const SA = { type: 'service_account', client_email: 'server@mikveh-automation.iam.gserviceaccount.com', private_key: KEYS.privateKey };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** טוקן Firebase מדומה: Google המדומה מחזירה את מה שמקודד בו (שדה u). */
function fbToken(u, claims) {
  const c = Object.assign({ aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: 'fb-' + u.email }, claims || {});
  return b64({ alg: 'RS256' }) + '.' + b64(Object.assign(c, { u: u })) + '.sig';
}
const googleUser = (email, name, more) => Object.assign({ email: email, name: name }, more || {});

function setup(props) {
  const box = load(FILES);
  const ss = box.__ss;
  ss._add('בסיס הנתונים', [new Array(37).fill('').map((_, i) => 'col' + i)]);
  ss._add('משתמשים', [
    ['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל', 'נוצר', 'כניסה אחרונה', 'מזהה גוגל', 'תמונה'],
    ['u1', 'שמואל גולדמן', 'admin@example.org', '0501111111', 'מנהל', 'כן', '', '', 'g-admin', ''],
    ['u2', 'יוסי כהן', 'yossi@gmail.com', '0509999999', 'מפקח', 'כן', '', '', '', ''],
    ['u3', 'דוד לוי', 'david@gmail.com', '', 'צופה', 'כן', '', '', '', ''],
  ]);
  Object.assign(box.__props, { MIKVAOT_SHEET_ID: 'SHEET', GOOGLE_CLIENT_ID: 'CID' }, props || {});
  box.docs = {};      // Firestore מדומה: נתיב מלא ➜ fields
  box.pushes = [];    // מה שנשלח ל-FCM
  box.dead = {};      // טוקנים ש-FCM מדווח עליהם שאינם רשומים
  box.calls = [];     // כל פנייה לרשת
  box.whatsapp = [];
  const ok = (obj) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(obj) });
  const err = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj || { error: { message: 'x' } }) });
  const docName = (url) => decodeURIComponent(String(url).split('/v1/')[1].split('?')[0]);

  function fetch(url, opt) {
    opt = opt || {};
    box.calls.push(url);
    const method = String(opt.method || 'get').toLowerCase();
    if (/identitytoolkit.*accounts:lookup/.test(url)) {
      if (!/key=AIza/.test(url)) return err(400);
      let c;
      try { c = JSON.parse(Buffer.from(JSON.parse(opt.payload).idToken.split('.')[1], 'base64url').toString()); } catch (e) { return err(400); }
      const u = c.u;
      if (!u || u.invalid) return err(400, { error: { message: 'INVALID_ID_TOKEN' } });
      return ok({ users: [{ localId: u.localId || c.sub, email: u.email, emailVerified: u.verified !== false, disabled: !!u.disabled,
        displayName: u.name, photoUrl: u.picture || '',
        providerUserInfo: [{ providerId: u.provider || 'google.com', rawId: u.sub || 'g-' + u.email, email: u.providerEmail || u.email, displayName: u.name, photoUrl: u.picture || '' }] }] });
    }
    if (/oauth2\.googleapis\.com\/token/.test(url)) {
      const parts = String(opt.payload.assertion).split('.');
      const valid = crypto.createVerify('RSA-SHA256').update(parts[0] + '.' + parts[1]).verify(KEYS.publicKey, Buffer.from(parts[2], 'base64url'));
      box.jwtClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return valid ? ok({ access_token: 'ACCESS', expires_in: 3600 }) : err(400);
    }
    if (/firestore\.googleapis\.com/.test(url)) {
      if (!opt.headers || opt.headers.Authorization !== 'Bearer ACCESS') return err(401);
      if (/:runQuery$/.test(url)) {
        const q = JSON.parse(opt.payload).structuredQuery;
        const f = q.where.fieldFilter;
        const want = f.value.arrayValue.values.map((v) => v.stringValue);
        const prefix = 'projects/' + PROJECT + '/databases/(default)/documents/' + q.from[0].collectionId + '/';
        const rows = Object.keys(box.docs).filter((n) => n.indexOf(prefix) === 0 && want.indexOf((box.docs[n][f.field.fieldPath] || {}).stringValue) >= 0)
          .map((n) => ({ document: { name: n, fields: box.docs[n] } }));
        return ok(rows.length ? rows : [{ readTime: 'now' }]);
      }
      const name = docName(url);
      if (method === 'patch') { box.docs[name] = JSON.parse(opt.payload).fields; return ok({ name: name, fields: box.docs[name] }); }
      if (method === 'delete') { delete box.docs[name]; return ok({}); }
      return box.docs[name] ? ok({ name: name, fields: box.docs[name] }) : err(404);
    }
    if (/fcm\.googleapis\.com/.test(url)) {
      const m = JSON.parse(opt.payload).message;
      if (box.dead[m.token]) return err(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } });
      box.pushes.push(m);
      return ok({ name: 'projects/' + PROJECT + '/messages/1' });
    }
    if (/green-api/.test(url)) { box.whatsapp.push(JSON.parse(opt.payload)); return ok({ idMessage: 'M' }); }
    return ok({});
  }
  box.UrlFetchApp = { fetch: fetch, fetchAll: (reqs) => reqs.map((r) => fetch(r.url, r)) };
  box.LockService = { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) };
  return box;
}

/** קריאת כתיבה מלאה, כמו שהאפליקציה שולחת (דרך apiWritePost_). */
function post(box, action, data, token) {
  const out = box.apiWritePost_({ parameter: {}, postData: { contents: JSON.stringify({ action: action, token: token || '', data: data || {} }) } }, action);
  return JSON.parse(out.getContent());
}
const devices = (box) => Object.keys(box.docs).filter((n) => /\/pushDevices\//.test(n)).map((n) => {
  const o = {}; Object.keys(box.docs[n]).forEach((k) => { o[k] = box.docs[n][k].stringValue; }); return o;
});
const TOKEN_A = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = 'fcm-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb';

// ===== כניסה דרך Firebase =====
console.log('\n— כניסה דרך Firebase Authentication —');
let box = setup();
// ContentService אינו חלק מהמעטפת; נדרש רק לקריאות דרך apiWritePost_
function withContent(b) { b.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: function () { return this; }, getContent: () => t }) }; return b; }
withContent(box);

let res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Yossi C', { picture: 'p.jpg' })) });
check('משתמש רשום נכנס', res.ok && res.user && res.user.id === 'u2' && res.user.role === 'מפקח', res);
check('ונפתח לו סשן', typeof res.token === 'string' && res.token.length > 20, res);
const yossi = res.token;
check('מזהה הגוגל נרשם בגיליון', box.__ss.getSheetByName('משתמשים')._rows[2][8] === 'g-yossi@gmail.com', box.__ss.getSheetByName('משתמשים')._rows[2]);

res = post(box, 'login', { firebaseToken: fbToken(googleUser('other@example.org', 'Admin', { sub: 'g-admin' })) });
check('משתמש מזוהה גם לפי מזהה Google (אותו אדם כמו בכניסה הישנה)', res.ok && res.user.id === 'u1', res);
const admin = res.token;

res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Y'), { aud: 'another-project' }) });
check('טוקן של פרויקט אחר נדחה', !!res.error && !res.token, res);
res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Y'), { iss: 'https://evil.example/' + PROJECT }) });
check('טוקן ממנפיק אחר נדחה', !!res.error && !res.token, res);
res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Y', { invalid: true })) });
check('טוקן ש-Google דוחה נדחה', !!res.error && !res.token, res);
res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Y', { provider: 'password' })) });
check('כניסה שלא עם חשבון Google נדחית', !!res.error && !res.token, res);
res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Y', { verified: false })) });
check('אימייל לא מאומת נדחה', !!res.error && !res.token, res);
res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Y', { providerEmail: 'someone@else.com' })) });
check('אימייל שאינו של חשבון ה-Google נדחה', !!res.error && !res.token, res);
res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Y', { localId: 'someone-else' })) });
check('טוקן שאינו של אותו חשבון נדחה', !!res.error && !res.token, res);
res = post(box, 'login', { firebaseToken: 'not-a-token' });
check('מחרוזת שאינה טוקן נדחית', !!res.error && !res.token, res);

res = post(box, 'login', { firebaseToken: fbToken(googleUser('new@gmail.com', 'Levi B.')) });
check('מי שאינו רשום מקבל הצעה לבקש גישה', res.code === 'norequest' && res.google && res.google.email === 'new@gmail.com', res);
res = post(box, 'requestAccess', { firebaseToken: fbToken(googleUser('new@gmail.com', 'Levi B.')), name: 'משה לוי', phone: '050-8888888' });
check('ובקשת הגישה מתקבלת עם אותה זהות', res.ok && res.status === 'pending', res);

box = withContent(setup({ FIREBASE_AUTH: '0' }));
res = post(box, 'login', { firebaseToken: fbToken(googleUser('yossi@gmail.com', 'Y')) });
check('FIREBASE_AUTH=0 מכבה את הכניסה דרך Firebase', !!res.error && !res.token, res);
check('ובלי לפנות ל-Google', box.calls.length === 0, box.calls);

// ===== בלי חשבון שירות: הכל כבוי =====
console.log('\n— בלי FIREBASE_SERVICE_ACCOUNT —');
box = withContent(setup({ NOTIFY_WHATSAPP: '1', GREEN_ID_INSTANCE: '1101', GREEN_API_TOKEN: 'tok' }));
const sess = (b, email, name, more) => post(b, 'login', { firebaseToken: fbToken(googleUser(email, name, more)) }).token;
let t2 = sess(box, 'yossi@gmail.com', 'Y');
box.calls.length = 0;
res = post(box, 'pushRegister', { token: TOKEN_A }, t2);
check('רישום מכשיר מוחזר כ"לא מוגדר"', res.code === 'nopush', res);
check('השרת מדווח שאין התראות דחיפה', box.pushEnabled_() === false && box.apiPing_().props.firebasePush === false);
box.notifyUsers_(box.authUsers_(box.__ss), 'בדיקה');
check('התראה אישית נשלחת בוואטסאפ כרגיל', box.whatsapp.length === 2, box.whatsapp);
check('ושום פנייה ל-Firestore או ל-FCM', !box.calls.some((u) => /firestore|fcm|oauth2/.test(u)), box.calls);

// ===== רישום מכשירים =====
console.log('\n— רישום מכשירים ב-Firestore —');
box = withContent(setup({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(SA) }));
t2 = sess(box, 'yossi@gmail.com', 'Y');
const t3 = sess(box, 'david@gmail.com', 'D');
const t1 = sess(box, 'x@example.org', 'A', { sub: 'g-admin' });
check('השרת מדווח שהתראות דחיפה זמינות', box.pushEnabled_() === true && box.apiPing_().props.firebasePush === true);

res = post(box, 'pushRegister', { token: TOKEN_A, app: 'main', ua: 'Chrome Android' }, t2);
check('המכשיר נרשם', res.ok === true, res);
check('חשבון השירות חתם על הבקשה (RS256) וביקש רק Firestore והתראות',
  box.jwtClaims && box.jwtClaims.iss === SA.client_email && /datastore/.test(box.jwtClaims.scope) && /firebase\.messaging/.test(box.jwtClaims.scope), box.jwtClaims);
let d = devices(box);
check('מסמך אחד, על שם המשתמש', d.length === 1 && d[0].userId === 'u2' && d[0].token === TOKEN_A && d[0].app === 'main', d);
check('הטוקן אינו שם המסמך (רק גיבוב שלו)', !Object.keys(box.docs).some((n) => n.indexOf(TOKEN_A) >= 0));

const tokenCalls = box.calls.filter((u) => /oauth2/.test(u)).length;
post(box, 'pushRegister', { token: TOKEN_A }, t2);
check('רישום חוזר אינו יוצר כפילות', devices(box).length === 1, devices(box));
check('וטוקן הגישה נלקח מהמטמון', box.calls.filter((u) => /oauth2/.test(u)).length === tokenCalls);

res = post(box, 'pushRegister', { token: TOKEN_A }, t3);
d = devices(box);
check('צופה רשאי להירשם להתראות', res.ok === true, res);
check('ומכשיר שנכנס בו משתמש אחר עובר אליו', d.length === 1 && d[0].userId === 'u3', d);

res = post(box, 'pushRegister', { token: 'short' }, t2);
check('טוקן קצר מדי נדחה', !!res.error, res);
res = post(box, 'pushRegister', { token: TOKEN_B }, '');
check('בלי סשן אין רישום', res.code === 'auth', res);

for (let i = 0; i < 10; i++) post(box, 'pushRegister', { token: 'fcm-token-many-' + String(i).padStart(20, '0') }, t2);
check('לא יותר מ-8 מכשירים למשתמש', devices(box).filter((x) => x.userId === 'u2').length === 8, devices(box).length);

res = post(box, 'pushUnregister', { token: TOKEN_A }, t2);
check('משתמש אינו יכול לבטל מכשיר של אחר', devices(box).some((x) => x.token === TOKEN_A));
res = post(box, 'pushUnregister', { token: TOKEN_A }, t3);
check('ביטול הרישום מוחק את המכשיר', res.ok && !devices(box).some((x) => x.token === TOKEN_A), res);

// ===== שליחת התראות =====
console.log('\n— שליחת התראות —');
box = withContent(setup({ FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(SA)).toString('base64'),
  NOTIFY_WHATSAPP: '1', GREEN_ID_INSTANCE: '1101', GREEN_API_TOKEN: 'tok' }));
t2 = sess(box, 'yossi@gmail.com', 'Y');
const tAdmin = sess(box, 'x@example.org', 'A', { sub: 'g-admin' });
check('המפתח מתקבל גם בקידוד base64', post(box, 'pushRegister', { token: TOKEN_A }, t2).ok === true);
post(box, 'pushRegister', { token: TOKEN_B }, t2);
post(box, 'pushRegister', { token: 'fcm-token-admin-cccccccccccccccccccc' }, tAdmin);

const users = box.authUsers_(box.__ss);
box.notifyUsers_(users.filter((u) => u.id === 'u2'),
  '💬 שמואל הזכיר/ה אותך בדיון על מקווה הדוגמה:\nצריך לבדוק את המאגר\n\nלתגובה: https://sg437.github.io/mikveh-automation/#/talk/abc');
check('ההתראה נשלחה לשני המכשירים של המשתמש, ורק להם', box.pushes.length === 2 &&
  box.pushes.map((m) => m.token).sort().join() === [TOKEN_A, TOKEN_B].sort().join(), box.pushes.map((m) => m.token));
const m = box.pushes[0] || { data: {} };
check('עם כותרת, גוף וקישור', m.data.title === 'מערכת המקוואות' && /הזכיר\/ה אותך/.test(m.data.body) &&
  m.data.url === 'https://sg437.github.io/mikveh-automation/#/talk/abc', m.data);
check('שורת הקישור אינה חוזרת בגוף ההתראה', !/https?:\/\//.test(m.data.body) && !/לתגובה/.test(m.data.body), m.data.body);
check('ההודעה בוואטסאפ נשלחה גם היא, כרגיל', box.whatsapp.length === 1 && /לתגובה: https/.test(box.whatsapp[0].message), box.whatsapp);

box.pushes.length = 0;
box.notifyUsers_(users.filter((u) => u.id === 'u3'), 'אין לו מכשירים');
check('משתמש בלי מכשירים — שום התראה', box.pushes.length === 0, box.pushes);

box.pushes.length = 0;
box.dead[TOKEN_B] = true;
const sent = box.pushNotifyUsers_(users, 'הודעה לכולם ' + 'א'.repeat(500));
check('מכשיר שאינו רשום עוד אינו נספר', sent === 2 && box.pushes.length === 2, sent);
check('והוא נמחק מ-Firestore', !devices(box).some((x) => x.token === TOKEN_B) && devices(box).length === 2, devices(box).map((x) => x.token));
check('גוף ארוך מקוצר', box.pushes[0].data.body.length <= 300 && /…$/.test(box.pushes[0].data.body), box.pushes[0].data.body.length);

box = withContent(setup({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(SA), NOTIFY_PUSH: '0' }));
check('NOTIFY_PUSH=0 מכבה את ההתראות', box.pushEnabled_() === false && box.pushNotifyUsers_(box.authUsers_(box.__ss), 'x') === 0 && box.calls.length === 0);

box = withContent(setup({ FIREBASE_SERVICE_ACCOUNT: '{not json' }));
let threw = false;
try { box.notifyUsers_(box.authUsers_(box.__ss), 'x'); } catch (e) { threw = true; }
check('מפתח פגום אינו מפיל את הפעולה שגרמה להתראה', threw === false);

console.log(fail ? '\n❌ ' + fail + ' נכשלו, ' + pass + ' עברו' : '\n✅ ' + pass + ' עברו');
process.exit(fail ? 1 : 0);
