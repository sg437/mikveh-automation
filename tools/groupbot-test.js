/**
 * הבוט בקבוצת הכשרות (GroupBot.js) — על קוד השרת האמיתי, דרך gas-stub.
 * הרצה:  node tools/groupbot-test.js
 */
const { load } = require('./gas-stub');
const FILES = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'HebDate.js', 'WhatsappActions.js',
  'WorkPoll.js', 'Questions.js', 'GroupBot.js'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

const GROUP = '972500000000-1544120628@g.us';
const ALERT = '972501111111@c.us';
const YOSSI = '972509999999@c.us';
const DAVID = '972508888888@c.us';

// מה ג'מיני "מחזיר" לכל טקסט (לפי מה שבין <<< >>> בפרומפט)
const GEMINI = {
  'רוקנתי מאגר באור עקיבא': { is_report: true, settlement: 'אור עקיבא', action_type: 'ריקון מאגר', summary: 'ריקון מאגר' },
  'בדיקת גג בגבעת זאב': { is_report: true, mikveh_name: 'גבעת זאב', summary: 'בדיקת גג' },
  'בדיקה בתושיה': { is_report: true, mikveh_name: 'מקווה תושיה', summary: 'בדיקה' },
  'החלפתי אוצר זריעה': { is_report: true, action_type: 'החלפת אוצר', otzar: 'זריעה', summary: 'החלפת אוצר' },
  'מישהו יודע מתי הכנס?': { is_report: false, summary: 'שאלה' },
  'שם המקווה: תושיא': { is_report: false, mikveh_name: 'מקווה תושיה', summary: '' },
  'שם המקווה: אור עקיבא': { is_report: false, settlement: 'אור עקיבא', summary: '' },
  'שם המקווה: ריקון מאגר בכפר סבא': { is_report: true, mikveh_name: 'מקווה כפר סבא', action_type: 'ריקון מאגר', summary: 'ריקון' },
};

function setup(mode) {
  const box = load(FILES, 'global.__COLS = COLS;');
  const ss = box.__ss;
  ss._add('רשימת מיקומים', [['שם', 'עיר'],
    ['מקווה תושיה', 'תושיה'], ['מקווה אור עקיבא מרכז', 'אור עקיבא'], ['מקווה אור עקיבא צפון', 'אור עקיבא'],
    ['מקווה כפר סבא', 'כפר סבא']]);
  ss._add('משתמשים', [['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל'],
    ['u2', 'יוסי כהן', '', '0509999999', 'מפקח', 'כן']]);
  ss._add('אוצר זריעה', [new Array(22).fill('כותרת')]);
  ss._add('תור נכנס', [['התקבל', 'idMessage', 'טקסט', 'שם', 'טלפון', 'סוג', 'url', 'קובץ', 'mime', 'סטטוס', 'הערות', 'chatId', 'json', 'ארכיון']]);
  ss._add('יומן דיווחים', [['תאריך', 'שולח', 'טלפון', 'טקסט', 'מקווה', 'יישוב', 'סוג', 'תקציר', 'id', 'מדיה', 'גולמי', 'סטטוס']]);
  Object.assign(box.__props, {
    GEMINI_API_KEY: 'k', MIKVEH_ARCHIVE_FOLDER_ID: 'ARCH', LOCATIONS_FOLDER_ID: 'LOC',
    GROUP_CHAT_ID: GROUP, GREEN_ID_INSTANCE: '1101', GREEN_API_TOKEN: 'tok', ALERT_CHAT_ID: ALERT,
    WA_AUTO_ACTIONS: '1', WA_GROUP_BOT: mode || '',
  });
  box.sent = [];
  box.prompts = [];
  let n = 0;
  box.UrlFetchApp = {
    fetch: function (url, opt) {
      if (/generativelanguage/.test(url)) {
        const prompt = JSON.parse(opt.payload).contents[0].parts.slice(-1)[0].text;
        const said = (prompt.match(/<<<([\s\S]*?)>>>/) || [])[1];
        box.prompts.push(said);
        const ans = GEMINI[said] || { is_report: false, summary: '' };
        return { getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(ans) }] } }] }) };
      }
      const body = JSON.parse((opt && opt.payload) || '{}');
      box.sent.push(body);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ idMessage: 'BOT' + (++n) }) };
    },
  };
  box.LockService = { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) };
  // דרייב
  box.moves = [];
  const folder = (path) => ({ path, getFoldersByName: () => ({ hasNext: () => false }), createFolder: (nm) => folder(path + '/' + nm) });
  box.DriveApp = {
    getFolderById: (id) => folder(id),
    getFileById: (id) => ({ moveTo: (f) => box.moves.push({ id, to: f.path }) }),
  };
  let f = 0;
  box.archiveRawFile_ = () => 'https://drive.google.com/file/d/RAW' + String(++f).padStart(30, '0') + '/view';
  box.fileToSmartArchive_ = (raw, mikveh, settlement) => raw.replace('RAW', 'CPY');
  box.appendLinkToCell_ = (rowNum, col, link) => {
    const r = ss.getSheetByName('יומן דיווחים').getRange(rowNum, col);
    const old = String(r.getValue() || '');
    r.setValue(old ? old + '\n' + link : link);
  };
  box.apiInvalidateData_ = () => {};
  return box;
}

const rows = (box, name) => (box.__ss.getSheetByName(name) || { _rows: [] })._rows;
const to = (box, chatId) => box.sent.filter((b) => b.chatId === chatId);

/** הודעה נכנסת. opt: { chat, image, quoted, id, old } */
function msg(box, sender, name, text, opt) {
  opt = opt || {};
  const md = {};
  if (opt.image) {
    md.typeMessage = 'imageMessage';
    md.fileMessageData = { downloadUrl: 'https://green/x.jpg', caption: text || '', mimeType: 'image/jpeg', fileName: 'x.jpg' };
  } else if (opt.quoted) {
    md.typeMessage = 'extendedTextMessage';
    md.extendedTextMessageData = { text: text };
    md.quotedMessage = { stanzaId: opt.quoted };
  } else {
    md.typeMessage = 'textMessage';
    md.textMessageData = { textMessage: text };
  }
  const id = opt.id || 'WA' + Math.random().toString(16).slice(2, 10).toUpperCase();
  const res = box.handleNotification_({
    typeWebhook: 'incomingMessageReceived', idMessage: id,
    senderData: { chatId: opt.chat || GROUP, sender: sender, senderName: name },
    messageData: md,
  });
  return { id, res };
}

/** מריץ את המעבד, אחרי שמקדימים את זמן הקבלה (תמונה בלי כיתוב ממתינה 5 דקות) */
function run(box, minutesAgo) {
  const q = box.__ss.getSheetByName('תור נכנס');
  if (minutesAgo) {
    const d = new Date(Date.now() - minutesAgo * 60000);
    for (let r = 2; r <= q.getLastRow(); r++) {
      if (q._rows[r - 1][9] === 'ממתין') q._rows[r - 1][0] = box.Utilities.formatDate(d, 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm:ss');
    }
  }
  box.PROPS_CACHE_ = null;
  box.processQueue();
}
const note = (box, id) => (rows(box, 'תור נכנס').filter((r) => r[1] === id)[0] || [])[10];
const logRow = (box, id) => rows(box, 'יומן דיווחים').filter((r) => r[8] === id)[0] || [];

// ===== כבוי =====
console.log('\n— הבוט כבוי: שום הודעה לקבוצה —');
let box = setup('');
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
check('לא נשלחה הודעה', box.sent.length === 0, box.sent);
check('התמונה תויקה כרגיל', rows(box, 'יומן דיווחים').length === 2);

// ===== תמונה בלי כיתוב =====
console.log('\n— תמונה בלי כיתוב: הבוט שואל, תשובה בציטוט משייכת —');
box = setup('1');
const img = msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
let out = to(box, GROUP);
check('נשלחה שאלה אחת לקבוצה', out.length === 1, box.sent);
check('בציטוט התמונה', out[0] && out[0].quotedMessageId === img.id, out[0]);
check('פונה בשם הרשום ושואל לאיזה מקווה', /יוסי כהן/.test(out[0].message) && /התקבלה תמונה בלי כיתוב/.test(out[0].message), out[0].message);
check('נרשמה שאלה פתוחה', rows(box, 'שאלות הבוט').length === 2 && rows(box, 'שאלות הבוט')[1][7] === 'פתוחה');
check('הערת העיבוד מספרת שהבוט שאל', /הבוט שאל/.test(note(box, img.id)), note(box, img.id));

box.sent.length = 0;
const ans = msg(box, DAVID, 'דוד', 'מקווה תושיה', { quoted: 'BOT1' });
run(box);
check('תשובה מפקח אחר נקלטה', /שויך למקווה תושיה/.test(note(box, ans.id)), note(box, ans.id));
check('ביומן: המקווה נקבע', logRow(box, img.id)[4] === 'מקווה תושיה', logRow(box, img.id));
check('ביומן: סטטוס אושר בקבוצה', /אושר בקבוצה/.test(logRow(box, img.id)[11]));
check('התמונה הועברה לתיקיית המקווה', box.moves.length === 1 && /ARCH\/מקווה תושיה/.test(box.moves[0].to), box.moves);
out = to(box, GROUP);
check('אישור אחד בקבוצה, בציטוט התמונה', out.length === 1 && /✅ שויך למקווה \*מקווה תושיה\*/.test(out[0].message) && out[0].quotedMessageId === img.id, out);
check('השאלה נסגרה עם מי שענה', rows(box, 'שאלות הבוט')[1][7] === 'שויך' && rows(box, 'שאלות הבוט')[1][13] === 'דוד');
check('התשובה לא נרשמה כדיווח נוסף', rows(box, 'יומן דיווחים').length === 2);
check('לא נקרא ג\'מיני לשם מדויק', box.prompts.length === 0, box.prompts);

console.log('\n— שתי תמונות ברצף: שאלה אחת בלבד —');
box = setup('1');
msg(box, YOSSI, 'יוסי', '', { image: true });
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
check('שאלה אחת', to(box, GROUP).length === 1, box.sent);
check('התמונה השנייה הוצמדה לראשונה', rows(box, 'יומן דיווחים').length === 2 && /קובץ|http/.test(rows(box, 'יומן דיווחים')[1][9]));

// ===== עיר מרובת מקוואות + פעולה =====
console.log('\n— עיר עם כמה מקוואות: רשימה ממוספרת, תשובה במספר, הפעולה נרשמת בתיק —');
box = setup('1');
const rep = msg(box, YOSSI, 'יוסי', 'רוקנתי מאגר באור עקיבא');
run(box);
out = to(box, GROUP);
check('נשלחה רשימה ממוספרת', out.length === 1 && /1\. מקווה אור עקיבא מרכז/.test(out[0].message) && /2\. מקווה אור עקיבא צפון/.test(out[0].message), out);
check('עוד לא נרשם בתיק', rows(box, 'אוצר זריעה').length === 1);
box.sent.length = 0;
msg(box, YOSSI, 'יוסי', '2', { quoted: 'BOT1' });
run(box);
check('נבחר מקווה מספר 2', logRow(box, rep.id)[4] === 'מקווה אור עקיבא צפון', logRow(box, rep.id));
const act = rows(box, 'אוצר זריעה')[1] || [];
check('ריקון המאגר נרשם בתיק המקווה', act[2] === 'מקווה אור עקיבא צפון' && act[5] === 'ריקון מאגר', act);
out = to(box, GROUP);
check('האישור כולל את הרישום בתיק', out.length === 1 && /📋 נרשם בתיק: ריקון מאגר/.test(out[0].message), out);

// ===== שם לא מוכר =====
console.log('\n— שם לא מוכר: שאלה, תשובה לא מזוהה פעמיים ⟵ בירור ידני —');
box = setup('1');
const unk = msg(box, YOSSI, 'יוסי', 'בדיקת גג בגבעת זאב');
run(box);
out = to(box, GROUP);
check('"לא מצאתי מקווה בשם גבעת זאב"', out.length === 1 && /לא מצאתי ברשימה מקווה בשם \*גבעת זאב\*/.test(out[0].message), out);
box.sent.length = 0;
const bad1 = msg(box, YOSSI, 'יוסי', 'בגבעה', { quoted: 'BOT1' });
run(box);
check('בקשה חוזרת', to(box, GROUP).length === 1 && /לא מצאתי מקווה בשם \*בגבעה\*/.test(to(box, GROUP)[0].message), box.sent);
check('בציטוט התשובה', to(box, GROUP)[0].quotedMessageId === bad1.id);
box.sent.length = 0;
msg(box, YOSSI, 'יוסי', 'ליד הכיכר', { quoted: 'BOT1' });
run(box);
check('הודעה על בירור ידני בקבוצה', to(box, GROUP).length === 1 && /בירור ידני/.test(to(box, GROUP)[0].message), box.sent);
check('התראה פרטית למנהל', to(box, ALERT).length === 1 && /שורה \d+/.test(to(box, ALERT)[0].message), box.sent);
check('השאלה סומנה לבירור ידני', rows(box, 'שאלות הבוט')[1][7] === 'לבירור ידני');
box.sent.length = 0;
msg(box, YOSSI, 'יוסי', 'עוד משהו', { quoted: 'BOT1' });
run(box);
check('אחרי זה הבוט כבר לא מגיב לשאלה הזו', to(box, GROUP).length === 0, box.sent);

console.log('\n— תשובה בשם עיר עם כמה מקוואות: הבוט שולח רשימה —');
box = setup('1');
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
box.sent.length = 0;
msg(box, YOSSI, 'יוסי', 'אור עקיבא', { quoted: 'BOT1' });
run(box);
check('נשלחה רשימה ממוספרת', to(box, GROUP).length === 1 && /2\. מקווה אור עקיבא צפון/.test(to(box, GROUP)[0].message), box.sent);
box.sent.length = 0;
msg(box, YOSSI, 'יוסי', 'מרכז', { quoted: 'BOT1' });
run(box);
check('תשובה לפי חלק מהשם', /✅ שויך למקווה \*מקווה אור עקיבא מרכז\*/.test((to(box, GROUP)[0] || {}).message), box.sent);

// ===== תשובה בלי ציטוט =====
console.log('\n— תשובה בלי ציטוט מאותו שולח —');
box = setup('1');
const img2 = msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
box.sent.length = 0;
msg(box, YOSSI, 'יוסי', 'תושיא');
run(box);
check('זוהה בעזרת ג\'מיני ושויך', logRow(box, img2.id)[4] === 'מקווה תושיה', logRow(box, img2.id));
check('אישור בקבוצה', to(box, GROUP).length === 1 && /✅/.test(to(box, GROUP)[0].message));

box = setup('1');
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
box.sent.length = 0;
const other = msg(box, DAVID, 'דוד', 'תושיא');
run(box);
check('שולח אחר בלי ציטוט — לא נחשב תשובה', rows(box, 'שאלות הבוט')[1][7] === 'פתוחה' && !/שאלת הבוט/.test(note(box, other.id)), note(box, other.id));

box = setup('1');
const img3 = msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
box.sent.length = 0;
const chat = msg(box, YOSSI, 'יוסי', 'מישהו יודע מתי הכנס?');
run(box);
check('הודעה סתמית בלי ציטוט — עוברת כהודעה רגילה, בלי תגובה', to(box, GROUP).length === 0 && /לא דיווח/.test(note(box, chat.id)), [note(box, chat.id), box.sent]);
check('והשאלה נשארת פתוחה', rows(box, 'שאלות הבוט')[1][7] === 'פתוחה');
box.sent.length = 0;
msg(box, YOSSI, 'יוסי', 'ריקון מאגר בכפר סבא');
run(box);
check('תשובה עם פעולה: שויך', logRow(box, img3.id)[4] === 'מקווה כפר סבא', logRow(box, img3.id));
check('והפעולה מהתשובה נרשמה בתיק', (rows(box, 'אוצר זריעה')[1] || [])[5] === 'ריקון מאגר', rows(box, 'אוצר זריעה'));

// ===== שתיקה כשהכל תקין =====
console.log('\n— דיווח מזוהה / שיחה / פעולה בלי מקום —');
box = setup('1');
msg(box, YOSSI, 'יוסי', 'בדיקה בתושיה');
msg(box, DAVID, 'דוד', 'מישהו יודע מתי הכנס?');
run(box);
check('דיווח מזוהה ושיחה כללית — הבוט שותק', box.sent.length === 0, box.sent);
msg(box, DAVID, 'דוד', 'החלפתי אוצר זריעה');
run(box);
check('פעולה בלי שום מקום — הבוט שואל', to(box, GROUP).length === 1 && /לא צוין באיזה מקווה/.test(to(box, GROUP)[0].message), box.sent);

// ===== מצב בדיקה =====
console.log('\n— מצב בדיקה: רק בצ\'אט הפרטי, ולא בתיק —');
box = setup('test');
msg(box, YOSSI, 'יוסי', '', { image: true });
const t1 = msg(box, '972501111111@c.us', 'שמוליק', 'רוקנתי מאגר באור עקיבא', { chat: ALERT });
run(box, 10);
check('בקבוצה — שקט', to(box, GROUP).length === 0, box.sent);
check('בצ\'אט הבדיקה — שאלה', to(box, ALERT).length === 1 && /אור עקיבא/.test(to(box, ALERT)[0].message), box.sent);
box.sent.length = 0;
msg(box, '972501111111@c.us', 'שמוליק', '1', { chat: ALERT, quoted: 'BOT1' });
run(box);
check('תשובה בצ\'אט הבדיקה משייכת', logRow(box, t1.id)[4] === 'מקווה אור עקיבא מרכז', logRow(box, t1.id));
check('אבל לא נרשם בתיק המקווה', rows(box, 'אוצר זריעה').length === 1, rows(box, 'אוצר זריעה'));
check('האישור בצ\'אט הבדיקה', to(box, ALERT).length === 1 && /✅/.test(to(box, ALERT)[0].message), box.sent);

box = setup('');
const ignored = msg(box, '972501111111@c.us', 'שמוליק', 'בדיקה', { chat: ALERT });
check('כשהבוט כבוי — הצ\'אט הפרטי לא נקלט כלל', ignored.res.status === 'ignored', ignored.res);

// ===== תיוג אמיתי =====
console.log('\n— תיוג אמיתי (WA_GROUP_BOT_MENTION=1) —');
box = setup('1');
box.__props.WA_GROUP_BOT_MENTION = '1';
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
out = to(box, GROUP);
check('@מספר במקום השם, עם mentions', out.length === 1 && /^📷 @972509999999, /.test(out[0].message) &&
  JSON.stringify(out[0].mentions) === JSON.stringify(['972509999999@c.us']), out);
check('בשאלות הבוט נשמר השם', rows(box, 'שאלות הבוט')[1][3] === 'יוסי כהן');

box = setup('1');
box.__props.WA_GROUP_BOT_MENTION = '1';
const realFetch = box.UrlFetchApp.fetch;
box.UrlFetchApp = { fetch: (url, opt) => {
  if (/sendMessage/.test(url) && JSON.parse(opt.payload).mentions) { box.sent.push({ rejected: true }); return { getResponseCode: () => 400, getContentText: () => '{}' }; }
  return realFetch(url, opt);
} };
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
out = to(box, GROUP);
check('תיוג נדחה ⟵ נשלח עם השם', out.length === 1 && /^📷 יוסי כהן, /.test(out[0].message) && !out[0].mentions, box.sent);
check('והשאלה נרשמה', rows(box, 'שאלות הבוט').length === 2);

console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
