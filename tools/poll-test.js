/* בדיקות סקר חלוקת העבודה (WorkPoll.js) על קוד השרת האמיתי, דרך gas-stub. */
const { load } = require('./gas-stub');
const FILES = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'WorkPoll.js'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

const MIKVAOT = ['אבן יהודה', 'כפר סבא', 'רעננה', 'הוד השרון'];

function setup() {
  const box = load(FILES);
  const ss = box.__ss;
  const master = [new Array(37).fill('').map((_, i) => 'col' + i)];
  MIKVAOT.forEach(function (n) { const r = new Array(37).fill(''); r[0] = n; r[4] = 'פעיל'; master.push(r); });
  ss._add('בסיס הנתונים', master);
  ss._add('משתמשים', [
    ['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל', 'נוצר', 'כניסה אחרונה', 'מזהה גוגל', 'תמונה'],
    ['u1', 'שמואל גולדמן', 'a@b.c', '0501111111', 'מנהל', 'כן', '', '', '', ''],
  ]);
  Object.assign(box.__props, {
    WA_WORK_POLL: '1', GROUP_CHAT_ID: '972544896587-1544120628@g.us',
    GREEN_ID_INSTANCE: '1101', GREEN_API_TOKEN: 'tok', NOTIFY_WHATSAPP: '',
  });

  // Green API מדומה: sendPoll מחזיר מזהה, sendMessage נאסף
  box.sent = [];
  let polls = 0;
  box.UrlFetchApp = {
    fetch: function (url, opt) {
      const body = JSON.parse((opt && opt.payload) || '{}');
      const isPoll = /sendPoll/.test(url);
      if (isPoll) polls++;
      box.sent.push({ poll: isPoll, body: body });
      return { getResponseCode: () => 200, getContentText: () => (isPoll ? JSON.stringify({ idMessage: 'POLL' + polls }) : '{}') };
    },
  };
  // מטמון אמיתי – בלעדיו אין בדיקת כפילויות
  const store = {};
  box.CacheService = { getScriptCache: () => ({
    get: (k) => (store[k] === undefined ? null : store[k]), put: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; }, removeAll: (ks) => { (ks || []).forEach((k) => delete store[k]); },
  }) };
  box.LockService = { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) };
  return box;
}

const USER = { id: 'u1', name: 'שמואל גולדמן', phone: '0501111111', role: 'מנהל' };
const run = (box, fn, ...args) => box[fn].apply(null, args);
const rows = (box, name) => (box.__ss.getSheetByName(name) || { _rows: [] })._rows;
const workRow = (box, mikveh) => rows(box, 'שיבוצים').filter((r) => r[3] === mikveh)[0] || [];

function vote(box, typeWebhook, sender, senderName, pollId, options) {
  return box.handleNotification_({
    typeWebhook: typeWebhook, idMessage: 'WH' + Math.random().toString(16).slice(2),
    senderData: { chatId: box.__props.GROUP_CHAT_ID, sender: sender, senderName: senderName },
    messageData: {
      typeMessage: 'pollUpdateMessage',
      pollMessageData: { stanzaId: pollId, name: 'תכנון עבודה', votes: options.map((o) => ({ optionName: o, optionVoters: [sender] })) },
    },
  });
}

// ===== שליחת הסקר =====
console.log('\n— פתיחת תכנון עבודה שולחת סקר לקבוצה —');
let box = setup();
let res = run(box, 'addWorkItems_', box.__ss, { items: MIKVAOT.slice(0, 3).map((m) => ({ mikveh: m, type: 'cert' })) }, USER);
check('שלוש משימות נפתחו', res.ok && res.records.length === 3, res);
check('נשלח סקר אחד', box.sent.filter((s) => s.poll).length === 1);
let poll = box.sent.filter((s) => s.poll)[0].body;
check('הכותרת: ' + poll.message, poll.message === 'תכנון עבודה חדש [חידוש תעודה]');
check('אפשרות לכל מקווה', poll.options.length === 3 && poll.options[0].optionName === MIKVAOT[0]);
check('בחירה מרובה', poll.multipleAnswers === true);
check('אין גם הודעת טקסט כפולה לקבוצה', box.sent.filter((s) => !s.poll).length === 0);
check('הסקר נרשם בלשונית "סקרי עבודה"', rows(box, 'סקרי עבודה').length === 2);
check('המשימות נמצאות למול הסקר',
  Object.keys(JSON.parse(rows(box, 'סקרי עבודה')[1][5])).length === 3);

// ===== קליטת סימון =====
console.log('\n— סימון בסקר נרשם כמשימה —');
res = vote(box, 'incomingMessageReceived', '972501111111@c.us', 'שמוליק', 'POLL1', [MIKVAOT[0], MIKVAOT[1]]);
check('שני סימונים נקלטו', res.status === 'poll' && res.applied === 2, res);
check('המשימה על שם המשתמש הרשום', workRow(box, MIKVAOT[0])[5] === 'שמואל גולדמן');
check('הסטטוס "נלקח"', workRow(box, MIKVAOT[0])[4] === 'taken');
check('הודעת מערכת בדיון', rows(box, 'דיונים').some((r) => /לוקח\/ת/.test(String(r)) && /מהסקר בוואטסאפ/.test(String(r))));
check('נרשם ביומן הסקרים', rows(box, 'יומן סקרים').length === 2);

console.log('\n— ההצבעה שלך עצמך מגיעה כהודעה יוצאת —');
res = vote(box, 'outgoingMessageReceived', '972501111111@c.us', 'שמוליק', 'POLL1', [MIKVAOT[0], MIKVAOT[1], MIKVAOT[2]]);
check('נקלטה (זה הבאג שתוקן)', res.status === 'poll' && res.applied === 1, res);
check('המקווה השלישי נלקח', workRow(box, MIKVAOT[2])[4] === 'taken');

console.log('\n— ביטול סימון —');
res = vote(box, 'incomingMessageReceived', '972501111111@c.us', 'שמוליק', 'POLL1', [MIKVAOT[0]]);
check('שתי משימות שוחררו', res.applied === 2, res);
check('המשימה חזרה להיות פנויה', workRow(box, MIKVAOT[1])[4] === 'open' && workRow(box, MIKVAOT[1])[5] === '');
check('מה שנשאר מסומן לא זז', workRow(box, MIKVAOT[0])[4] === 'taken');

console.log('\n— משימה תפוסה אינה נגזלת —');
res = vote(box, 'incomingMessageReceived', '972509999999@c.us', 'יוסי', 'POLL1', [MIKVAOT[0]]);
check('הסימון נחסם', res.blocked === 1 && res.applied === 0, res);
check('הבעלים לא השתנה', workRow(box, MIKVAOT[0])[5] === 'שמואל גולדמן');

console.log('\n— מצביע שאינו רשום במערכת —');
res = vote(box, 'incomingMessageReceived', '972509999999@c.us', 'יוסי', 'POLL1', [MIKVAOT[0], MIKVAOT[1]]);
check('נרשם בשמו מהוואטסאפ', workRow(box, MIKVAOT[1])[5] === 'יוסי', workRow(box, MIKVAOT[1]));

console.log('\n— כפילויות וסקרים זרים —');
const dup = { typeWebhook: 'incomingMessageReceived', idMessage: 'SAME',
  senderData: { chatId: box.__props.GROUP_CHAT_ID, sender: '972501111111@c.us', senderName: 'שמוליק' },
  messageData: { typeMessage: 'pollUpdateMessage', pollMessageData: { stanzaId: 'POLL1', votes: [] } } };
box.handleNotification_(dup);
check('אותו webhook פעמיים — פעם אחת', box.handleNotification_(dup).status === 'duplicate');
res = vote(box, 'incomingMessageReceived', '972509999999@c.us', 'יוסי', 'NOT-OURS', [MIKVAOT[0]]);
check('סקר שאינו של המערכת נדחה', res.status === 'ignored');
check('ונרשם ביומן', rows(box, 'יומן סקרים').some((r) => /סקר שאינו של המערכת/.test(String(r[6]))));

console.log('\n— הודעות רגילות לא נפגעו —');
box = setup();
res = box.handleNotification_({ typeWebhook: 'incomingMessageReceived', idMessage: 'T1',
  senderData: { chatId: box.__props.GROUP_CHAT_ID, sender: '972509999999@c.us', senderName: 'יוסי' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'רוקנתי את המאגר' } } });
check('דיווח טקסט נכנס לתור', res.status === 'queued', res);
res = box.handleNotification_({ typeWebhook: 'outgoingAPIMessageReceived', idMessage: 'T2',
  senderData: { chatId: box.__props.GROUP_CHAT_ID, sender: '972501111111@c.us' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'הודעה מהמערכת' } } });
check('הודעה יוצאת של המערכת אינה חוזרת כדיווח', res.status === 'ignored', res);

// ===== הסיכום =====
console.log('\n— הודעת הסיכום —');
box = setup();
run(box, 'addWorkItems_', box.__ss, { items: MIKVAOT.slice(0, 3).map((m) => ({ mikveh: m, type: 'cert' })) }, USER);
vote(box, 'incomingMessageReceived', '972501111111@c.us', 'שמוליק', 'POLL1', [MIKVAOT[0]]);
box.sent.length = 0;
box.workPollSummary();
check('בזמן ההצבעות לא נשלח סיכום', box.sent.length === 0);
rows(box, 'סקרי עבודה')[1][7] = new Date(Date.now() - 10 * 60000); // עברו 10 דקות שקט
box.workPollSummary();
check('אחרי שקט נשלח סיכום', box.sent.length === 1);
const txt = box.sent[0] ? box.sent[0].body.message : '';
check('הסיכום מציין מי לקח', /נלקחו \(1\)/.test(txt) && new RegExp(MIKVAOT[0] + ' — שמואל גולדמן').test(txt), txt);
check('והסיכום מציין מה פנוי', /פנויים \(2\)/.test(txt), txt);
check('הסיכום מצטט את הסקר', box.sent[0].body.quotedMessageId === 'POLL1');
box.sent.length = 0;
box.workPollSummary();
check('סיכום זהה לא נשלח פעמיים', box.sent.length === 0);
box.sendWorkPollSummaryNow();
check('sendWorkPollSummaryNow שולח בכל מקרה', box.sent.length === 1);

console.log('\n— הכל חולק: סיכום אחרון והסקר נסגר —');
rows(box, 'שיבוצים').forEach((r) => { if (r[0] && r[4] === 'open') { r[4] = 'taken'; r[5] = 'ישראל כהן'; } });
rows(box, 'סקרי עבודה')[1][7] = new Date(Date.now() - 10 * 60000);
box.sent.length = 0;
box.workPollSummary();
check('נשלח סיכום מסכם', box.sent.length === 1 && /הכל חולק/.test(box.sent[0].body.message));
check('הסקר נסגר', rows(box, 'סקרי עבודה')[1][9] === 'הסתיים');

console.log('\n— סקר שהמשימות שלו נמחקו מהגיליון —');
box = setup();
run(box, 'addWorkItems_', box.__ss, { items: MIKVAOT.slice(0, 2).map((m) => ({ mikveh: m, type: 'cert' })) }, USER);
rows(box, 'שיבוצים').length = 1; // נשארת רק שורת הכותרת
rows(box, 'סקרי עבודה')[1][7] = new Date(Date.now() - 10 * 60000);
box.sent.length = 0;
box.workPollSummary();
check('לא נשלח סיכום ריק לקבוצה', box.sent.length === 0);
check('הסקר נסגר', rows(box, 'סקרי עבודה')[1][9] === 'הסתיים');
check('נרשם ביומן הסקרים', rows(box, 'יומן סקרים').some((r) => /נמחקו אחרי שהסקר נשלח/.test(String(r[6]))));
check('ולא בלשונית "שגיאות" (שמזעיקה התראה לטלפון)', !box.__ss.getSheetByName('שגיאות'));

console.log('\n— מגבלת 12 האפשרויות של וואטסאפ —');
box = setup();
const many = [];
for (let i = 1; i <= 15; i++) { const n = 'מקווה ' + i; MIKVAOT.push(n); many.push({ mikveh: n, type: 'fill' }); }
const master = box.__ss.getSheetByName('בסיס הנתונים');
many.forEach((it) => { const r = new Array(37).fill(''); r[0] = it.mikveh; r[4] = 'פעיל'; master.appendRow(r); });
run(box, 'addWorkItems_', box.__ss, { items: many }, USER);
const polls = box.sent.filter((s) => s.poll);
check('שני סקרים', polls.length === 2 && polls[0].body.options.length === 12 && polls[1].body.options.length === 3);
check('כותרות ממוספרות', /1\/2$/.test(polls[0].body.message) && /2\/2$/.test(polls[1].body.message));

console.log('\n— מקווה אחד: סקר חייב שתי אפשרויות —');
box = setup();
run(box, 'addWorkItems_', box.__ss, { items: [{ mikveh: MIKVAOT[0], type: 'cert' }] }, USER);
const solo = box.sent.filter((s) => s.poll)[0].body;
check('נוספה אפשרות "לא לוקח"', solo.options.length === 2 && solo.options[1].optionName === 'לא לוקח');

console.log('\n— הסקר כבוי: חוזרים להודעת הטקסט —');
box = setup();
box.__props.WA_WORK_POLL = '';
box.__props.WA_BRIDGE = '1';
run(box, 'addWorkItems_', box.__ss, { items: [{ mikveh: MIKVAOT[0], type: 'cert' }, { mikveh: MIKVAOT[1], type: 'cert' }] }, USER);
check('לא נשלח סקר', box.sent.filter((s) => s.poll).length === 0);
check('נשלחה הודעת הגשר', box.sent.some((s) => /תכנון עבודה חדש/.test(s.body.message || '')));

console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו, ' : '✅ ') + pass + ' עברו');
process.exit(fail ? 1 : 0);
