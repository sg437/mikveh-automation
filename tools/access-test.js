/* בדיקות בקשות גישה (Access.js) על קוד השרת האמיתי, דרך gas-stub. */
const { load } = require('./gas-stub');
const FILES = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'WorkPoll.js', 'Questions.js', 'Access.js'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

const ADMIN = { id: 'u1', name: 'שמואל גולדמן', phone: '0501111111', role: 'מנהל' };
const INSPECTOR = { id: 'u2', name: 'יוסי כהן', phone: '0509999999', role: 'מפקח' };

function setup() {
  const box = load(FILES);
  const ss = box.__ss;
  ss._add('בסיס הנתונים', [new Array(37).fill('').map((_, i) => 'col' + i)]);
  ss._add('משתמשים', [
    ['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל', 'נוצר', 'כניסה אחרונה', 'מזהה גוגל', 'תמונה'],
    ['u1', 'שמואל גולדמן', 'sg@taharat.org', '0501111111', 'מנהל', 'כן', '', '', 'g1', ''],
    ['u2', 'יוסי כהן', 'yossi@gmail.com', '0509999999', 'מפקח', 'כן', '', '', 'g2', ''],
  ]);
  // תור נכנס: כך המערכת יודעת איך קוראים למספר הזה בקבוצת הוואטסאפ
  ss._add('תור נכנס', [
    ['התקבל', 'idMessage', 'טקסט', 'שם שולח', 'טלפון שולח', 'סוג', '', '', '', 'סטטוס', '', 'chatId', 'json', ''],
    ['', 'M1', 'רוקנתי את המאגר', 'מוישי בלוי - מקוואות', '972508888888', 'טקסט', '', '', '', 'טופל', '', '', '', ''],
  ]);
  Object.assign(box.__props, {
    MIKVAOT_SHEET_ID: 'SHEET', GOOGLE_CLIENT_ID: 'CID', NOTIFY_WHATSAPP: '1',
    GREEN_ID_INSTANCE: '1101', GREEN_API_TOKEN: 'tok', ALERT_CHAT_ID: '972501111111@c.us',
  });
  box.sent = [];
  // גוגל מדומה: tokeninfo מחזיר את מה שמקודד בטוקן עצמו
  box.UrlFetchApp = {
    fetch: function (url, opt) {
      if (/tokeninfo/.test(url)) {
        const raw = decodeURIComponent(String(url).split('id_token=')[1] || '{}');
        const g = JSON.parse(raw);
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(Object.assign({
          aud: 'CID', email_verified: 'true', exp: Math.floor(Date.now() / 1000) + 3600, sub: 'sub-' + g.email,
        }, g)) };
      }
      box.sent.push({ url: url, body: JSON.parse((opt && opt.payload) || '{}') });
      // Green API מחזיר idMessage על כל שליחה מוצלחת
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ idMessage: 'M' + box.sent.length }) };
    },
  };
  const store = {};
  box.CacheService = { getScriptCache: () => ({
    get: (k) => (store[k] === undefined ? null : store[k]), put: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; }, removeAll: (ks) => { (ks || []).forEach((k) => delete store[k]); },
  }) };
  box.LockService = { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) };
  return box;
}

const rows = (box, name) => (box.__ss.getSheetByName(name) || { _rows: [] })._rows;
const token = (o) => JSON.stringify(o);
const messages = (box) => box.sent.map((s) => s.body.message || '').join('\n');

// ===== כניסה של מי שאינו רשום =====
console.log('\n— מי שאינו רשום מקבל הצעה לבקש גישה —');
let box = setup();
let res = box.authLogin_(box.__ss, { idToken: token({ email: 'new@gmail.com', name: 'Levi B.', picture: 'p.jpg' }) });
check('הכניסה נדחתה', !!res.error, res);
check('עם קוד שמאפשר לבקש', res.code === 'norequest', res);
check('ועם הפרטים מגוגל למסך הבקשה', res.google && res.google.email === 'new@gmail.com' && res.google.name === 'Levi B.', res.google);

// ===== הגשת הבקשה =====
console.log('\n— הגשת בקשה —');
box.sent.length = 0;
res = box.accessRequest_(box.__ss, {
  idToken: token({ email: 'new@gmail.com', name: 'Levi B.', picture: 'p.jpg' }),
  name: 'משה לוי', phone: '050-8888888', note: 'מפקח איזור הצפון',
});
check('נשלחה', res.ok && res.status === 'pending', res);
let req = rows(box, 'בקשות גישה')[1] || [];
check('נרשמו השם שהוזן ושם החשבון בגוגל', req[2] === 'משה לוי' && req[3] === 'Levi B.', req);
check('נרשמו אימייל וטלפון', req[4] === 'new@gmail.com' && req[5] === '050-8888888', req);
check('★ נמצא השם מקבוצת הוואטסאפ לפי הטלפון', req[6] === 'מוישי בלוי - מקוואות', req);
check('הסטטוס ממתינה', req[8] === 'ממתינה', req);

let text = messages(box);
check('התראה למנהל עם השם, הטלפון והמייל',
  /משה לוי/.test(text) && /0508888888|050-8888888/.test(text) && /new@gmail.com/.test(text), text);
check('ההתראה מציינת את השם בוואטסאפ', /מוישי בלוי/.test(text), text);
check('וגם את שם החשבון בגוגל כשהוא שונה', /Levi B\./.test(text), text);
check('ההתראה הגיעה גם לצ\'אט ההתראות', box.sent.some((s) => s.body.chatId === '972501111111@c.us'), box.sent.map((s) => s.body.chatId));

console.log('\n— בקשה שנייה מעדכנת ולא מכפילה —');
box.accessRequest_(box.__ss, { idToken: token({ email: 'new@gmail.com', name: 'Levi B.' }), name: 'משה לוי', phone: '0508888888' });
check('עדיין שורה אחת', rows(box, 'בקשות גישה').length === 2, rows(box, 'בקשות גישה').length);

console.log('\n— בדיקות קלט —');
{
  // בקופסה נפרדת, כדי שבקשות הבדיקה לא ייכנסו לרשימה שנבדקת בהמשך
  const b2 = setup();
  check('בלי טלפון תקין נדחית',
    /טלפון/.test(b2.accessRequest_(b2.__ss, { idToken: token({ email: 'a@b.c', name: 'A' }), name: 'A', phone: '123' }).error || ''));
  check('ולא נרשמה שורה', !(b2.__ss.getSheetByName('בקשות גישה')));
  // גוגל תמיד מחזירה שם או כתובת, ולכן "בלי שם" נופל חזרה לזהות מגוגל
  b2.accessRequest_(b2.__ss, { idToken: token({ email: 'a@b.c', name: '' }), name: '', phone: '0501234567' });
  check('בלי שם — נרשם מה שגוגל מסרה', rows(b2, 'בקשות גישה')[1][2] === 'a@b.c', rows(b2, 'בקשות גישה')[1]);
  check('מי שכבר רשום מקבל "היכנס"',
    b2.accessRequest_(b2.__ss, { idToken: token({ email: 'yossi@gmail.com', name: 'יוסי' }), name: 'יוסי', phone: '0509999999' }).status === 'exists');
}

// ===== צפייה והכרעה =====
console.log('\n— הרשימה למסך המשתמשים —');
check('למנהלים בלבד', !!box.accessList_(box.__ss, INSPECTOR).error);
let list = box.accessList_(box.__ss, ADMIN);
check('המנהל רואה את הבקשה', list.ok && list.requests.length === 1 && list.requests[0].name === 'משה לוי', list);
const mine = list.requests.filter((r) => r.email === 'new@gmail.com')[0] || {};

console.log('\n— אישור יוצר משתמש —');
box.sent.length = 0;
const id = mine.id;
check('דחייה/אישור למנהלים בלבד', !!box.accessDecide_(box.__ss, { id, approve: true }, INSPECTOR).error);
res = box.accessDecide_(box.__ss, { id, approve: true, role: 'קבלן' }, ADMIN);
check('אושר', res.ok && res.status === 'אושרה', res);
const user = rows(box, 'משתמשים').filter((r) => r[2] === 'new@gmail.com')[0] || [];
check('המשתמש נוצר עם השם שהוזן (ולא עם שם החשבון בגוגל)', user[1] === 'משה לוי', user);
// הבקשה השנייה עדכנה את הטלפון לצורה בלי המקף — זו הצורה שנשמרה
check('עם הטלפון והתפקיד שנבחרו', user[3] === '0508888888' && user[4] === 'קבלן', user);
check('והוא פעיל', user[5] === 'כן', user);
check('הבקשה סומנה כמאושרת ומי אישר', rows(box, 'בקשות גישה')[1][8] === 'אושרה' && rows(box, 'בקשות גישה')[1][10] === 'שמואל גולדמן');
check('המבקש קיבל הודעה בוואטסאפ', box.sent.some((s) => /אושרה/.test(s.body.message || '') && /972508888888/.test(s.body.chatId || '')), box.sent);

console.log('\n— ועכשיו הוא נכנס —');
res = box.authLogin_(box.__ss, { idToken: token({ email: 'new@gmail.com', name: 'Levi B.' }) });
check('הכניסה עובדת', res.ok && res.user.name === 'משה לוי' && res.user.role === 'קבלן', res);

console.log('\n— דחייה —');
box = setup();
box.accessRequest_(box.__ss, { idToken: token({ email: 'x@gmail.com', name: 'X' }), name: 'איקס', phone: '0521234567' });
const id2 = box.accessList_(box.__ss, ADMIN).requests[0].id;
res = box.accessDecide_(box.__ss, { id: id2, approve: false }, ADMIN);
check('נדחתה', res.ok && rows(box, 'משתמשים').length === 3, res);
check('ולא נוצר משתמש', !rows(box, 'משתמשים').some((r) => r[2] === 'x@gmail.com'));
res = box.authLogin_(box.__ss, { idToken: token({ email: 'x@gmail.com', name: 'X' }) });
check('והוא עדיין לא יכול להיכנס', res.code === 'norequest', res);
box.accessRequest_(box.__ss, { idToken: token({ email: 'x@gmail.com', name: 'X' }), name: 'איקס', phone: '0521234567' });
check('בקשה חוזרת אחרי דחייה חוזרת לממתינה', rows(box, 'בקשות גישה')[1][8] === 'ממתינה');

// ===== טופס הפרטים =====
console.log('\n— טופס הפרטים: סגור כברירת מחדל —');
box = setup();
res = box.accessSubmit_(box.__ss, { name: 'דוד', email: 'd@gmail.com', phone: '0521111111' });
check('לא מקבל כשהוא סגור', /סגור/.test(res.error || ''), res);
check('ולא נרשמה שורה', !box.__ss.getSheetByName('בקשות גישה'));

console.log('\n— שליחה לקבוצה פותחת אותו —');
box.__props.GROUP_CHAT_ID = '972544896587-1544120628@g.us';
box.PROPS_CACHE_ = null;
check('למנהלים בלבד', !!box.accessJoinForm_(box.__ss, { do: 'send', url: 'https://x.github.io/app/join/' }, INSPECTOR).error);
box.sent.length = 0;
res = box.accessJoinForm_(box.__ss, { do: 'send', url: 'https://x.github.io/app/join/' }, ADMIN);
check('נשלח ככפתור', res.ok && res.how === 'button', res);
const btn = box.sent.filter((x) => /sendInteractiveButtons/.test(x.url))[0];
check('הכפתור מכיל את הקישור', btn && btn.body.buttons[0].url === 'https://x.github.io/app/join/', btn && btn.body);
check('ושם הכפתור קצר מ-25 תווים', btn && btn.body.buttons[0].buttonText.length <= 25, btn && btn.body.buttons[0]);
box.PROPS_CACHE_ = null;
check('הטופס נפתח', box.accessFormOpen_() === true);

console.log('\n— וואטסאפ שלא מקבל כפתורים: נשלח קישור —');
{
  const b3 = setup();
  b3.__props.GROUP_CHAT_ID = '972544896587-1544120628@g.us';
  b3.PROPS_CACHE_ = null;
  const real = b3.UrlFetchApp.fetch;
  b3.UrlFetchApp = { fetch: function (url, opt) {
    if (/sendInteractiveButtons/.test(url)) return { getResponseCode: () => 400, getContentText: () => 'not allowed' };
    return real(url, opt);
  } };
  const r3 = b3.accessJoinForm_(b3.__ss, { do: 'send', url: 'https://x.github.io/app/join/' }, ADMIN);
  check('התשובה אומרת שנשלח קישור', r3.ok && r3.how === 'link', r3);
  check('וההודעה מכילה את הקישור', b3.sent.some((x) => /join\//.test(x.body.message || '')), b3.sent.map((x) => x.body.message));
}

console.log('\n— מילוי הטופס —');
box.sent.length = 0;
res = box.accessSubmit_(box.__ss, { name: 'משה לוי', email: 'Moshe@Gmail.com ', phone: '050-8888888', note: 'צפון' });
check('נקלט', res.ok && res.status === 'pending', res);
req = rows(box, 'בקשות גישה')[1] || [];
check('האימייל נשמר באותיות קטנות', req[4] === 'moshe@gmail.com', req);
check('★ הוצלב השם מקבוצת הוואטסאפ', req[6] === 'מוישי בלוי - מקוואות', req);
check('המקור מסומן "טופס"', req[12] === 'טופס', req);
check('אין שם חשבון גוגל', req[3] === '', req);
text = messages(box);
check('ההתראה מציינת שזה מהטופס ושהכתובת לא אומתה', /לא אומתה/.test(text), text);

console.log('\n— בדיקות קלט בטופס —');
check('מייל לא תקין נדחה', /אימייל/.test(box.accessSubmit_(box.__ss, { name: 'א', email: 'nope', phone: '0501111111' }).error || ''));
check('טלפון לא תקין נדחה', /טלפון/.test(box.accessSubmit_(box.__ss, { name: 'א', email: 'a@b.co', phone: '12' }).error || ''));
check('בלי שם נדחה', /שם/.test(box.accessSubmit_(box.__ss, { name: '', email: 'a@b.co', phone: '0501111111' }).error || ''));
check('מילוי חוזר מעדכן ולא מכפיל',
  box.accessSubmit_(box.__ss, { name: 'משה לוי', email: 'moshe@gmail.com', phone: '0508888888' }).ok &&
  rows(box, 'בקשות גישה').length === 2, rows(box, 'בקשות גישה').length);
check('מי שכבר משתמש מקבל "כבר רשום"',
  box.accessSubmit_(box.__ss, { name: 'יוסי', email: 'yossi@gmail.com', phone: '0509999999' }).status === 'exists');

console.log('\n— אישור מילוי מהטופס יוצר משתמש —');
const fid = box.accessList_(box.__ss, ADMIN).requests.filter((r) => r.email === 'moshe@gmail.com')[0].id;
box.accessDecide_(box.__ss, { id: fid, approve: true, role: 'מפקח' }, ADMIN);
const fu = rows(box, 'משתמשים').filter((r) => r[2] === 'moshe@gmail.com')[0] || [];
check('המשתמש נוצר', fu[1] === 'משה לוי' && fu[4] === 'מפקח' && fu[5] === 'כן', fu);

console.log('\n— סגירת הטופס —');
res = box.accessJoinForm_(box.__ss, { do: 'close' }, ADMIN);
box.PROPS_CACHE_ = null;
check('נסגר', res.ok && res.open === false && box.accessFormOpen_() === false, res);
check('ולא מקבל יותר', !!box.accessSubmit_(box.__ss, { name: 'ב', email: 'b@b.co', phone: '0505555555' }).error);

console.log('\n— טלפון שאינו מוכר מהקבוצה —');
box = setup();
box.accessRequest_(box.__ss, { idToken: token({ email: 'y@gmail.com', name: 'Y' }), name: 'יענקי', phone: '0533333333' });
check('השדה נשאר ריק ולא נופל', rows(box, 'בקשות גישה')[1][6] === '', rows(box, 'בקשות גישה')[1]);

console.log(fail ? '\n❌ ' + fail + ' נכשלו, ' + pass + ' עברו' : '\n✅ ' + pass + ' עברו');
process.exit(fail ? 1 : 0);
