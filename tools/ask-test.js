/* בדיקות "שאלה לקבוצה" (Questions.js) על קוד השרת האמיתי, דרך gas-stub. */
const { load } = require('./gas-stub');
const FILES = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'WorkPoll.js', 'Questions.js'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

const GROUP = '972544896587-1544120628@g.us';
const ADMIN = { id: 'u1', name: 'שמואל גולדמן', phone: '0501111111', role: 'מנהל' };

function setup() {
  const box = load(FILES);
  const ss = box.__ss;
  ss._add('בסיס הנתונים', [new Array(37).fill('').map((_, i) => 'col' + i)]);
  ss._add('משתמשים', [
    ['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל', 'נוצר', 'כניסה אחרונה', 'מזהה גוגל', 'תמונה'],
    ['u1', 'שמואל גולדמן', 'sg@taharat.org', '0501111111', 'מנהל', 'כן', '', '', '', ''],
    ['u2', 'יוסי כהן', '', '0509999999', 'מפקח', 'כן', '', '', '', ''],
  ]);
  ss._add('תור נכנס', [['התקבל', 'idMessage', 'טקסט', 'שם', 'טלפון', 'סוג', '', '', '', 'סטטוס', '', 'chatId', 'json', '']]);
  Object.assign(box.__props, {
    MIKVAOT_SHEET_ID: 'SHEET', GROUP_CHAT_ID: GROUP,
    GREEN_ID_INSTANCE: '1101', GREEN_API_TOKEN: 'tok', ALERT_CHAT_ID: '972501111111@c.us',
  });
  box.sent = [];
  let n = 0;
  box.UrlFetchApp = {
    fetch: function (url, opt) {
      const body = JSON.parse((opt && opt.payload) || '{}');
      box.sent.push({ url: url, body: body });
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ idMessage: 'MSG' + (++n) }) };
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
const toGroup = (box) => box.sent.filter((s) => s.body.chatId === GROUP).map((s) => s.body);
const toChat = (box, chatId) => box.sent.filter((s) => s.body.chatId === chatId).map((s) => s.body);

/** הודעה נכנסת מהקבוצה. quoted = מזהה ההודעה שעליה השיבו. */
function msg(box, sender, senderName, text, quoted, id) {
  const md = { typeMessage: quoted ? 'extendedTextMessage' : 'textMessage' };
  if (quoted) {
    md.extendedTextMessageData = { text: text };
    md.quotedMessage = { stanzaId: quoted, participant: '972544896587@c.us' };
  } else {
    md.textMessageData = { textMessage: text };
  }
  return box.handleNotification_({
    typeWebhook: 'incomingMessageReceived', idMessage: id || 'WH' + Math.random().toString(16).slice(2),
    senderData: { chatId: GROUP, sender: sender, senderName: senderName },
    messageData: md,
  });
}

// ===== שליחת השאלה =====
console.log('\n— שליחת שאלה לקבוצה —');
let box = setup();
let res = box.askSend_(box.__ss, { text: 'מה כתובת המייל שלך?', type: 'email' }, ADMIN);
check('נשלחה', res.ok && res.question.id === 'MSG1', res);
let out = toGroup(box)[0] || {};
check('ההודעה מכילה את השאלה', /מה כתובת המייל שלך/.test(out.message || ''), out.message);
check('מסבירה איך לענות', /בתשובה להודעה הזו/.test(out.message || ''), out.message);
check('נרשמה בלשונית "שאלות לקבוצה"', rows(box, 'שאלות לקבוצה').length === 2 &&
  rows(box, 'שאלות לקבוצה')[1][0] === 'MSG1' && rows(box, 'שאלות לקבוצה')[1][7] === 'פתוחה');
check('שאלה ריקה נדחית', !!box.askSend_(box.__ss, { text: '  ' }, ADMIN).error);

// ===== תשובה מצוטטת =====
console.log('\n— תשובה בציטוט ההודעה —');
box.sent.length = 0;
res = msg(box, '972509999999@c.us', 'יוסי כהן', 'yossi@gmail.com', 'MSG1');
check('נקלטה כתשובה ולא כדיווח', res.status === 'answer', res);
let ans = rows(box, 'תשובות מהקבוצה')[1] || [];
check('נרשמו שם, טלפון ותשובה', ans[3] === 'יוסי כהן' && ans[4] === '0509999999' && ans[5] === 'yossi@gmail.com', ans);
check('לא נכנסה לתור הדיווחים', rows(box, 'תור נכנס').length === 1, rows(box, 'תור נכנס'));
check('האימייל הושלם בלשונית המשתמשים',
  rows(box, 'משתמשים')[2][2] === 'yossi@gmail.com', rows(box, 'משתמשים')[2]);
let alert = toChat(box, '972501111111@c.us').map((b) => b.message).join('\n');
check('התראה לשואל עם שם וטלפון', /יוסי כהן/.test(alert) && /0509999999/.test(alert) && /yossi@gmail.com/.test(alert), alert);
check('אישור אישי לעונה', toChat(box, '972509999999@c.us').some((b) => /נרשמה/.test(b.message)), box.sent);
check('אין הצפה של הקבוצה', toGroup(box).length === 0, toGroup(box));

console.log('\n— אותה תשובה לא נרשמת פעמיים —');
box.sent.length = 0;
msg(box, '972509999999@c.us', 'יוסי כהן', 'yossi@gmail.com', 'MSG1', 'SAME');
msg(box, '972509999999@c.us', 'יוסי כהן', 'yossi@gmail.com', 'MSG1', 'SAME');
check('נרשמה שורה אחת', rows(box, 'תשובות מהקבוצה').length === 3, rows(box, 'תשובות מהקבוצה').length);

// ===== תשובה בלי ציטוט =====
console.log('\n— שאלת אימייל: גם הודעה רגילה עם כתובת נקלטת —');
box = setup();
box.askSend_(box.__ss, { text: 'מה כתובת המייל שלך?', type: 'email' }, ADMIN);
box.sent.length = 0;
res = msg(box, '972508888888@c.us', 'דוד לוי', 'המייל שלי david.levi@walla.co.il תודה');
ans = rows(box, 'תשובות מהקבוצה')[1] || [];
check('רק הכתובת נשמרה', ans[5] === 'david.levi@walla.co.il', ans);
check('מי שאינו רשום מסומן ככזה', /לא רשום/.test(String(ans[6])), ans);
check('וההודעה בכל זאת נכנסה לתור הדיווחים', res.status === 'queued' && rows(box, 'תור נכנס').length === 2, res);

console.log('\n— הודעה רגילה אינה תשובה —');
box.sent.length = 0;
res = msg(box, '972508888888@c.us', 'דוד לוי', 'רוקנתי את המאגר בכפר סבא');
check('נכנסה לתור כרגיל', res.status === 'queued', res);
check('ולא נרשמה כתשובה', rows(box, 'תשובות מהקבוצה').length === 2, rows(box, 'תשובות מהקבוצה'));

console.log('\n— שאלה סגורה אינה קולטת —');
box = setup();
const q = box.askSend_(box.__ss, { text: 'מי מגיע מחר?', type: 'text' }, ADMIN);
check('סגירה', box.askClose_(box.__ss, { id: q.question.id }, ADMIN).ok);
res = msg(box, '972509999999@c.us', 'יוסי כהן', 'אני מגיע', q.question.id);
check('התשובה לא נרשמה', res.status === 'queued' && rows(box, 'תשובות מהקבוצה').length === 0, res);
check('פתיחה מחדש', box.askClose_(box.__ss, { id: q.question.id, reopen: true }, ADMIN).status === 'פתוחה');
res = msg(box, '972509999999@c.us', 'יוסי כהן', 'אני מגיע', q.question.id);
check('עכשיו כן', res.status === 'answer' && rows(box, 'תשובות מהקבוצה').length === 2, res);

console.log('\n— הרשימה לאפליקציה —');
const list = box.askList_(box.__ss);
check('שאלה אחת', list.questions.length === 1 && list.questions[0].text === 'מי מגיע מחר?', list.questions);
check('תשובה אחת עם שם', list.answers.length === 1 && list.answers[0].name === 'יוסי כהן', list.answers);

console.log('\n— הגשר כבוי: לא נשלח כלום —');
box = setup();
delete box.__props.GROUP_CHAT_ID;
box.PROPS_CACHE_ = null;
check('שליחה נחסמת בהסבר', /אינו מוגדר/.test(box.askSend_(box.__ss, { text: 'שאלה' }, ADMIN).error || ''));

console.log(fail ? '\n❌ ' + fail + ' נכשלו, ' + pass + ' עברו' : '\n✅ ' + pass + ' עברו');
process.exit(fail ? 1 : 0);
