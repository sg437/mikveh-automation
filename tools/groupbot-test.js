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
  'מתי בודקים בכפר סבא?': { is_report: false, mikveh_name: 'מקווה כפר סבא', summary: 'שאלה' },
  'מתי בודקים באשבול?': { is_report: false, mikveh_name: 'מקווה אשבול', summary: 'שאלה' },
  'זה לא אשבול': { is_report: true, mikveh_name: 'מקווה אשבול', summary: 'תיקון' },
  'מישהו היה היום בתושיה': { is_report: true, mikveh_name: 'מקווה תושיה', summary: 'שאלה' },
  // הרצף של יום שישי (20/11 15:52) — כפי שג'מיני החזיר בפועל
  '(לא צורף טקסט)': { is_report: true, defect_type: 'ליקוי', summary: 'מים שהוחלפו מצהיבים, הכלור לא משפיע', transcript: 'הנה אני פה במקווה, צילמתי...' },
  'זה דחוףףף': { is_report: false, settlement: 'null', defect_type: 'null', summary: 'הודעה כללית דחופה.', transcript: 'זה דחוףףף' },
  'אשבול': { is_report: false, mikveh_name: 'מקווה אשבול', summary: '' },
  'תסדר ה ai שלך לפני שישגע לכולם השכל': { is_report: false, summary: 'הודעה כללית', transcript: 'תסדר ה ai שלך' },
  'בדיקה בכפר סבא': { is_report: true, mikveh_name: 'מקווה כפר סבא', summary: 'בדיקה' },
  'בעיה בגג': { is_report: true, settlement: 'null', summary: 'בעיה בגג' },
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
    ['מקווה כפר סבא', 'כפר סבא'], ['מקווה אשבול', 'אשבול'],
    ['מקווה עין גב', 'עין גב'], ['מקווה עין-גב', 'עין גב'], ['עפולה - כורש', 'עפולה']]);
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
  box.safeBlobForGemini_ = () => ({ getContentType: () => 'audio/ogg', getBytes: () => [] });
  box.Utilities.base64Encode = () => '';
  return box;
}

const rows = (box, name) => (box.__ss.getSheetByName(name) || { _rows: [] })._rows;
const to = (box, chatId) => box.sent.filter((b) => b.chatId === chatId);

/** הודעה נכנסת. opt: { chat, image, quoted, id, old } */
function msg(box, sender, name, text, opt) {
  opt = opt || {};
  const md = {};
  if (opt.audio) {
    md.typeMessage = 'audioMessage';
    md.fileMessageData = { downloadUrl: 'https://green/x.oga', caption: '', mimeType: 'audio/ogg; codecs=opus', fileName: 'x.oga' };
  } else if (opt.image) {
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

// ===== תשובה מיידית =====
console.log('\n— תשובה בציטוט: מיד, בלי לחכות לתור —');
box = setup('1');
const fimg = msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
box.sent.length = 0;
let fast = msg(box, DAVID, 'דוד', 'מקווה תושיה', { quoted: 'BOT1' });
check('טופלה כבר ב-Webhook', fast.res.status === 'bot_answer', fast.res);
check('שויך בלי הרצת התור', logRow(box, fimg.id)[4] === 'מקווה תושיה' && to(box, GROUP).length === 1, box.sent);
check('השורה בתור סומנה כטופלה (מיידי)', /\(מיידי\)/.test(note(box, fast.id)), note(box, fast.id));

box = setup('1');
const r2 = msg(box, YOSSI, 'יוסי', 'רוקנתי מאגר באור עקיבא');
run(box);
box.sent.length = 0;
fast = msg(box, YOSSI, 'יוסי', '1', { quoted: 'BOT1' });
check('מספר מהרשימה — מיד', fast.res.status === 'bot_answer' && logRow(box, r2.id)[4] === 'מקווה אור עקיבא מרכז', fast.res);
check('והפעולה נרשמה בתיק', (rows(box, 'אוצר זריעה')[1] || [])[5] === 'ריקון מאגר');

box = setup('1');
const fimg2 = msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
box.sent.length = 0;
fast = msg(box, YOSSI, 'יוסי', 'תושיא', { quoted: 'BOT1' });
check('שגיאת כתיב — נשארת בתור (בלי ג\'מיני ב-Webhook)', fast.res.status === 'queued' && box.prompts.length === 0 && box.sent.length === 0, [fast.res, box.prompts]);
run(box);
check('ובהרצת התור — שויכה', logRow(box, fimg2.id)[4] === 'מקווה תושיה');

box = setup('1');
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 10);
box.LockService = { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => false, releaseLock: () => {} }) };
fast = msg(box, YOSSI, 'יוסי', 'מקווה תושיה', { quoted: 'BOT1' });
check('בלי נעילה — לא מטפלים במקביל לתור', fast.res.status === 'queued', fast.res);

// ===== תמונה שהוצמדה להודעה בלי מקווה =====
console.log('\n— "בוקר טוב" ואז תמונה: הבוט שואל על התמונה —');
box = setup('1');
const hello = msg(box, YOSSI, 'יוסי', 'מישהו יודע מתי הכנס?');
run(box);
check('על ההודעה עצמה — שקט', box.sent.length === 0, box.sent);
const pic = msg(box, YOSSI, 'יוסי', '', { image: true });
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 1);
check('קודם ממתינה 5 דקות (אולי השם בדרך)', box.sent.length === 0, box.sent);
run(box, 5.5);
out = to(box, GROUP);
check('שאלה אחת על התמונות, בציטוט התמונה', out.length === 1 && out[0].quotedMessageId === pic.id && /בלי כיתוב/.test(out[0].message), out);
box.sent.length = 0;
msg(box, YOSSI, 'יוסי', 'מקווה כפר סבא', { quoted: 'BOT1' });
check('התשובה משייכת את שורת היומן של ההודעה', logRow(box, hello.id)[4] === 'מקווה כפר סבא', logRow(box, hello.id));
check('שתי התמונות הועברו לתיקיית המקווה', box.moves.length === 2 && box.moves.every((m) => /מקווה כפר סבא/.test(m.to)), box.moves);
check('האישור בציטוט התמונה', (to(box, GROUP)[0] || {}).quotedMessageId === pic.id, box.sent);

console.log('\n— "בוקר טוב", תמונה, ואחריה השם: שקט, הכל לשם —');
box = setup('1');
msg(box, YOSSI, 'יוסי', 'מישהו יודע מתי הכנס?');
run(box);
const pic2 = msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 1);
const named = msg(box, YOSSI, 'יוסי', 'בדיקה בתושיה');
run(box);
run(box, 5.5);
check('לא נשאלה שאלה', box.sent.length === 0, box.sent);
check('התמונה הוצמדה לדיווח עם השם', /שורה 3/.test(note(box, pic2.id)) && logRow(box, named.id)[4] === 'מקווה תושיה', note(box, pic2.id));

console.log('\n— דיווח עם שם ואז תמונות: שקט —');
box = setup('1');
msg(box, YOSSI, 'יוסי', 'בדיקה בתושיה');
run(box);
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 3);
check('לא נשאלה שאלה', box.sent.length === 0, box.sent);

console.log('\n— דיווח לא מזוהה ואז תמונות: רק השאלה הראשונה —');
box = setup('1');
msg(box, YOSSI, 'יוסי', 'בדיקת גג בגבעת זאב');
run(box);
msg(box, YOSSI, 'יוסי', '', { image: true });
run(box, 5.5);
check('שאלה אחת בלבד', to(box, GROUP).length === 1, box.sent);

// =====================================================================
// רגרסיה: הרצף של יום שישי 20/11 (מנדל ראנד, אשבול)
// 15:52:50 תמונה · 15:52:53 הקלטה · 15:52:57 "זה דחוףףף" · 15:53:01 "אשבול"
// 15:54:46 "תסדר ה ai..." — בפועל: שאלה אחרי דקה, ושאלה חוזרת ב-15:58.
// =====================================================================
/** קובע כמה דקות עברו מאז שההודעה התקבלה (לשורות שעדיין ממתינות בתור) */
function age(box, id, minutes) {
  const q = box.__ss.getSheetByName('תור נכנס');
  const d = new Date(Date.now() - minutes * 60000);
  for (let r = 2; r <= q.getLastRow(); r++) {
    if (q._rows[r - 1][1] === id) q._rows[r - 1][0] = box.Utilities.formatDate(d, 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm:ss');
  }
}
function tick(box) { box.PROPS_CACHE_ = null; box.processQueue(); }
const MENDEL = '972527651328@c.us';

console.log('\n— רגרסיה: הרצף של יום שישי (אשבול) —');
box = setup('1');
const fPic = msg(box, MENDEL, 'מנדל ראנד', '', { image: true });
const fAud = msg(box, MENDEL, 'מנדל ראנד', '', { audio: true });
const fUrg = msg(box, MENDEL, 'מנדל ראנד', 'זה דחוףףף');
const fName = msg(box, MENDEL, 'מנדל ראנד', 'אשבול');
age(box, fPic.id, 1.2); age(box, fAud.id, 1.15); age(box, fUrg.id, 1.1); age(box, fName.id, 1.0);
tick(box); // 15:53:59 — כאן בפועל הבוט שאל על ההקלטה
check('דקה אחרי: הבוט לא שואל על ההקלטה', box.sent.length === 0, box.sent);
check('ההקלטה ממתינה לטקסט משלים', /ממתין/.test(note(box, fAud.id)), note(box, fAud.id));
check('"אשבול" נרשם ביומן עם המקווה', logRow(box, fName.id)[4] === 'מקווה אשבול', logRow(box, fName.id));
age(box, fPic.id, 2.2); age(box, fAud.id, 2.15);
tick(box);
check('התמונה הוצמדה ל"אשבול" ולא ל"זה דחוףףף"',
  new RegExp('שורה ' + (rows(box, 'יומן דיווחים').findIndex((r) => r[8] === fName.id) + 1)).test(note(box, fPic.id)), note(box, fPic.id));
const fRude = msg(box, MENDEL, 'מנדל ראנד', 'תסדר ה ai שלך לפני שישגע לכולם השכל');
age(box, fAud.id, 3.9); age(box, fRude.id, 0.1);
tick(box);
age(box, fAud.id, 5.2);
tick(box); // 15:58 — כאן בפועל הבוט שאל שוב על התמונה
check('לאורך כל הרצף — אף הודעה של הבוט', box.sent.length === 0, box.sent);
check('אין שאלות בלשונית "שאלות הבוט"', rows(box, 'שאלות הבוט').length <= 1, rows(box, 'שאלות הבוט'));
check('ההקלטה שויכה לאשבול לפי ההודעה הסמוכה', logRow(box, fAud.id)[4] === 'מקווה אשבול' &&
  /לפי הודעה סמוכה/.test(logRow(box, fAud.id)[11]), logRow(box, fAud.id));
check('ההקלטה עברה לתיקיית אשבול', box.moves.some((m) => /מקווה אשבול/.test(m.to)), box.moves);
check('"זה דחוףףף": בלי "null" ביישוב', logRow(box, fUrg.id)[5] === '' && logRow(box, fUrg.id)[6] === '', logRow(box, fUrg.id));
check('הודעת טקסט נרשמת בלי "🎤 תמלול" מועתק', !/תמלול/.test(logRow(box, fUrg.id)[3]), logRow(box, fUrg.id)[3]);
check('הקלטה עדיין נרשמת עם התמלול', /🎤 תמלול/.test(logRow(box, fAud.id)[3]), logRow(box, fAud.id)[3]);

console.log('\n— הקלטה בלי שם, בלי שום הודעה סמוכה: שואלים, אבל רק אחרי 5 דקות —');
box = setup('1');
const lone = msg(box, MENDEL, 'מנדל ראנד', '', { audio: true });
age(box, lone.id, 1); tick(box);
check('אחרי דקה — שקט', box.sent.length === 0, box.sent);
age(box, lone.id, 5.2); tick(box);
check('אחרי 5 דקות — שאלה אחת', to(box, GROUP).length === 1 && /לא צוין באיזה מקווה/.test(to(box, GROUP)[0].message), box.sent);

console.log('\n— הבוט כבוי: הקלטה מעובדת מיד, כמו קודם —');
box = setup('');
const offAud = msg(box, MENDEL, 'מנדל ראנד', '', { audio: true });
age(box, offAud.id, 0.5); tick(box);
check('נרשמה ביומן בלי המתנה', logRow(box, offAud.id).length > 0 && box.sent.length === 0, note(box, offAud.id));

// ===== כמה מקוואות אפשריים: אסור לשייך בניחוש =====
console.log('\n— שני מקוואות שונים מאותו שולח בחלון: הבוט שואל, לא משייך —');
box = setup('1');
const kA = msg(box, YOSSI, 'יוסי', 'בדיקה בתושיה');
const kB = msg(box, YOSSI, 'יוסי', 'בדיקה בכפר סבא');
age(box, kA.id, 2); age(box, kB.id, 1.5); tick(box);
const kPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, kPic.id, 1); tick(box);
check('התמונה לא הוצמדה מיד לאף אחד', box.sent.length === 0 && /ממתין/.test(note(box, kPic.id)), note(box, kPic.id));
age(box, kPic.id, 5.2); tick(box);
out = to(box, GROUP);
check('אחרי ההמתנה — שאלה', out.length === 1 && /בלי כיתוב/.test(out[0].message), box.sent);
check('לא הוצמדה לתושיה ולא לכפר סבא', !/הוצמד/.test(note(box, kPic.id)) &&
  !logRow(box, kA.id)[9] && !logRow(box, kB.id)[9], [note(box, kPic.id), logRow(box, kA.id)[9], logRow(box, kB.id)[9]]);
check('ולא הועבר שום קובץ לאף מקווה', box.moves.length === 0, box.moves);

console.log('\n— הקלטה בלי שם, ושני מקוואות סמוכים: שואלים —');
box = setup('1');
const hA = msg(box, YOSSI, 'יוסי', 'בדיקה בתושיה');
const hB = msg(box, YOSSI, 'יוסי', 'בדיקה בכפר סבא');
const hAud = msg(box, YOSSI, 'יוסי', '', { audio: true });
age(box, hA.id, 5.5); age(box, hB.id, 5.4); age(box, hAud.id, 5.3); tick(box);
check('שאלה, ולא שיוך', to(box, GROUP).length === 1 && !logRow(box, hAud.id)[4], [box.sent, logRow(box, hAud.id)]);

console.log('\n— מקווה שציין שולח אחר אינו נחשב —');
box = setup('1');
const oName = msg(box, DAVID, 'דוד', 'אשבול');
age(box, oName.id, 2); tick(box);
const oPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, oPic.id, 5.2); tick(box);
check('הבוט שואל את יוסי', to(box, GROUP).length === 1, box.sent);
check('התמונה לא שויכה לאשבול', box.moves.length === 0 && !/אשבול/.test(note(box, oPic.id)), [box.moves, note(box, oPic.id)]);

console.log('\n— מקווה שצוין מחוץ לחלון (20 דקות קודם) אינו נחשב —');
box = setup('1');
const wName = msg(box, YOSSI, 'יוסי', 'אשבול');
age(box, wName.id, 20); tick(box);
const wPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, wPic.id, 5.2); tick(box);
check('הבוט שואל', to(box, GROUP).length === 1, box.sent);
check('בלי שיוך לאשבול', box.moves.length === 0, box.moves);

console.log('\n— הבוט כבוי ושני מקוואות: התנהגות הצירוף הישנה, בלי הודעות —');
box = setup('');
const zA = msg(box, YOSSI, 'יוסי', 'בדיקה בתושיה');
const zB = msg(box, YOSSI, 'יוסי', 'בדיקה בכפר סבא');
age(box, zA.id, 2); age(box, zB.id, 1.5); tick(box);
const zPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, zPic.id, 1); tick(box);
check('הוצמדה לדיווח האחרון עם מקווה (כפר סבא)', /הוצמד/.test(note(box, zPic.id)) && /http/.test(logRow(box, zB.id)[9]) && box.sent.length === 0,
  [note(box, zPic.id), logRow(box, zB.id)[9]]);

console.log('\n— "null" מג\'מיני אינו שם מקום —');
box = setup('1');
const nul = msg(box, YOSSI, 'יוסי', 'בעיה בגג');
tick(box);
check('אין שאלה "לא מצאתי מקווה בשם null"', !box.sent.some((b) => /null/.test(b.message)), box.sent);
check('ביומן — יישוב ריק', logRow(box, nul.id)[5] === '' && logRow(box, nul.id)[11] !== 'יישוב בלבד', logRow(box, nul.id));

// =====================================================================
// חיזוק 1: שם מקווה מדויק שנכתב לבד — מזוהה מקומית, בלי ג'מיני
// =====================================================================
console.log('\n— זיהוי מקומי של שם מקווה לבד —');
box = setup('1');
const L = box.getMikvehList_();
const lm = (t) => box.localMikvehMatch_(t, L);
check('"אשבול" ⟵ מקווה אשבול', lm('אשבול') === 'מקווה אשבול', lm('אשבול'));
check('"מקווה אשבול"', lm('מקווה אשבול') === 'מקווה אשבול');
check('"באשבול"', lm('באשבול') === 'מקווה אשבול');
check('"אשבול." / רווחים', lm('  אשבול. ') === 'מקווה אשבול');
check('יישוב עם מקווה אחד: "תושיה"', lm('תושיה') === 'מקווה תושיה');
check('חלק משם מורכב אינו נחשב: "כורש"', lm('כורש') === '', lm('כורש'));
check('שם מורכב מלא: "עפולה - כורש"', lm('עפולה - כורש') === 'עפולה - כורש');
check('שמות כפולים ("עין גב" / "עין-גב") — אין ניחוש', lm('עין גב') === '' && lm('מקווה עין גב') === '', [lm('עין גב'), lm('מקווה עין גב')]);
check('עיר עם כמה מקוואות — אין ניחוש', lm('אור עקיבא') === '');
check('שאלה "אשבול?" — לא', lm('אשבול?') === '');
check('משפט שלם עם השם — לא (זה לג\'מיני)', lm('הכל תקין באשבול') === '');
check('שם לא קיים — לא', lm('גבעת זאב') === '');

console.log('\n— רגרסיה: יום שישי, כשג\'מיני לא מזהה "אשבול" לבד —');
const savedA = GEMINI['אשבול'];
GEMINI['אשבול'] = { is_report: false, summary: 'הודעה קצרה' }; // ג'מיני "לא מבין"
box = setup('1');
const gPic = msg(box, MENDEL, 'מנדל ראנד', '', { image: true });
const gAud = msg(box, MENDEL, 'מנדל ראנד', '', { audio: true });
const gUrg = msg(box, MENDEL, 'מנדל ראנד', 'זה דחוףףף');
const gName = msg(box, MENDEL, 'מנדל ראנד', 'אשבול');
age(box, gPic.id, 1.2); age(box, gAud.id, 1.15); age(box, gUrg.id, 1.1); age(box, gName.id, 1.0);
tick(box);
age(box, gPic.id, 2.2); age(box, gAud.id, 2.15); tick(box);
const gRude = msg(box, MENDEL, 'מנדל ראנד', 'תסדר ה ai שלך לפני שישגע לכולם השכל');
age(box, gAud.id, 3.9); age(box, gRude.id, 0.1); tick(box);
age(box, gAud.id, 5.2); tick(box);
GEMINI['אשבול'] = savedA;
check('ג\'מיני לא נשאל על "אשבול"', !box.prompts.includes('אשבול'), box.prompts);
check('"אשבול" נרשם כהצהרה', logRow(box, gName.id)[4] === 'מקווה אשבול' && logRow(box, gName.id)[12] === 'כן', logRow(box, gName.id));
check('אף הודעה של הבוט', box.sent.length === 0, box.sent);
check('ההקלטה והתמונה — לאשבול', logRow(box, gAud.id)[4] === 'מקווה אשבול' &&
  /שורה/.test(note(box, gPic.id)) && box.moves.some((m) => /מקווה אשבול/.test(m.to)), [logRow(box, gAud.id)[4], note(box, gPic.id)]);

// =====================================================================
// חיזוק 2: שאלה / שלילה / אזכור מקרי אינם קובעים מקווה
// =====================================================================
console.log('\n— זיהוי שאלה ושלילה —');
box = setup('1');
const nc = (t, m) => box.mentionIsNotClaim_(t, m);
check('"מתי בודקים באשבול?" — שאלה', nc('מתי בודקים באשבול?', 'מקווה אשבול'));
check('"מישהו היה היום בתושיה" — שאלה (בלי סימן שאלה)', nc('מישהו היה היום בתושיה', 'מקווה תושיה'));
check('"זה לא אשבול" — שלילה', nc('זה לא אשבול', 'מקווה אשבול'));
check('"לא בתושיה, בכפר סבא" — שלילה של תושיה', nc('לא בתושיה, בכפר סבא', 'מקווה תושיה'));
check('"לא של עפולה - כורש" — שלילה של שם מורכב', nc('זה לא של עפולה - כורש', 'עפולה - כורש'));
check('"בדיקה בתושיה, המים לא נקיים" — הצהרה', !nc('בדיקה בתושיה, המים לא נקיים', 'מקווה תושיה'));
check('"הכל תקין באשבול" — הצהרה', !nc('הכל תקין באשבול', 'מקווה אשבול'));

console.log('\n— דיווח + שאלה על מקווה אחר באותו זמן: שואלים, לא משייכים —');
box = setup('1');
const qA = msg(box, YOSSI, 'יוסי', 'בדיקה בתושיה');
const qB = msg(box, YOSSI, 'יוסי', 'מתי בודקים בכפר סבא?');
age(box, qA.id, 2); age(box, qB.id, 1.5); tick(box);
check('השאלה נרשמה כאזכור ולא כהצהרה', logRow(box, qB.id)[12] === 'לא' && logRow(box, qA.id)[12] === 'כן', [logRow(box, qA.id)[12], logRow(box, qB.id)[12]]);
const qPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, qPic.id, 1); tick(box);
check('התמונה לא הוצמדה מיד', !/הוצמד/.test(note(box, qPic.id)), note(box, qPic.id));
age(box, qPic.id, 5.2); tick(box);
check('הבוט שואל', to(box, GROUP).length === 1 && /בלי כיתוב/.test(to(box, GROUP)[0].message), box.sent);
check('לא שויכה לתושיה ולא לכפר סבא', box.moves.length === 0 && !logRow(box, qA.id)[9] && !logRow(box, qB.id)[9],
  [box.moves, logRow(box, qA.id)[9], logRow(box, qB.id)[9]]);

console.log('\n— רק שאלה על מקווה, ואז תמונה: שואלים, והתמונה לא נכנסת לשורת השאלה —');
box = setup('1');
const oq = msg(box, YOSSI, 'יוסי', 'מתי בודקים באשבול?');
age(box, oq.id, 2); tick(box);
const oqPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, oqPic.id, 5.2); tick(box);
check('הבוט שואל', to(box, GROUP).length === 1, box.sent);
check('שורת השאלה בלי מדיה, ושום קובץ לא הועבר לאשבול', !logRow(box, oq.id)[9] && box.moves.length === 0, [logRow(box, oq.id)[9], box.moves]);

console.log('\n— "מישהו היה היום בתושיה" (ג\'מיני: דיווח) ואז הקלטה: שואלים —');
box = setup('1');
const sq = msg(box, YOSSI, 'יוסי', 'מישהו היה היום בתושיה');
const sqAud = msg(box, YOSSI, 'יוסי', '', { audio: true });
age(box, sq.id, 5.5); age(box, sqAud.id, 5.3); tick(box);
check('שאלה, ובלי שיוך לתושיה', to(box, GROUP).length === 1 && !logRow(box, sqAud.id)[4], [box.sent, logRow(box, sqAud.id)]);

console.log('\n— שלילה: "זה לא אשבול" ואז הקלטה: שואלים —');
box = setup('1');
const neg = msg(box, YOSSI, 'יוסי', 'זה לא אשבול');
const negAud = msg(box, YOSSI, 'יוסי', '', { audio: true });
age(box, neg.id, 5.5); age(box, negAud.id, 5.3); tick(box);
check('נרשם כאזכור', logRow(box, neg.id)[12] === 'לא', logRow(box, neg.id));
check('שאלה, ובלי שיוך לאשבול', to(box, GROUP).length === 1 && !logRow(box, negAud.id)[4] && box.moves.length === 0, [box.sent, logRow(box, negAud.id)]);

console.log('\n— שמות כפולים: "עין גב" לבד ואז תמונה: שואלים —');
box = setup('1');
const dup = msg(box, YOSSI, 'יוסי', 'עין גב');
age(box, dup.id, 2); tick(box);
const dupPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, dupPic.id, 5.2); tick(box);
check('אין הצהרה ל"עין גב"', !logRow(box, dup.id)[4], logRow(box, dup.id));
check('הבוט שואל, בלי שיוך', to(box, GROUP).length === 1 && box.moves.length === 0, [box.sent, box.moves]);

console.log('\n— שורות ישנות ביומן (בלי עמודת הצהרה) —');
box = setup('1');
const stamp = box.Utilities.formatDate(new Date(Date.now() - 2 * 60000), 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm:ss');
box.__ss.getSheetByName('יומן דיווחים').appendRow([stamp, 'יוסי', '972509999999', 'מתי בודקים באשבול?', 'מקווה אשבול', '', 'אחר', 'שאלה', 'OLDQ', '', '', 'מזוהה']);
const olPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, olPic.id, 5.2); tick(box);
check('שאלה ישנה אינה הצהרה — הבוט שואל', to(box, GROUP).length === 1 && box.moves.length === 0, [box.sent, box.moves]);
box = setup('1');
box.__ss.getSheetByName('יומן דיווחים').appendRow([stamp, 'יוסי', '972509999999', 'בדיקה באשבול, הכל תקין', 'מקווה אשבול', '', 'בדיקה', 'בדיקה', 'OLDR', '', '', 'מזוהה']);
const orPic = msg(box, YOSSI, 'יוסי', '', { image: true });
age(box, orPic.id, 1); tick(box);
check('דיווח ישן — התמונה מוצמדת אליו בשקט', /הוצמד/.test(note(box, orPic.id)) && box.sent.length === 0, [note(box, orPic.id), box.sent]);

console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
