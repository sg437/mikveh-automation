/**
 * רישום פעולות מהוואטסאפ כשלשונית הפעולות מוגנת (WhatsappActions.js).
 * הרצה:  node tools/wa-actions-test.js
 */
const { load } = require('./gas-stub');
const FILES = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'HebDate.js', 'WhatsappActions.js'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

const box = load(FILES, 'global.__COLS = COLS;');
box.__props.WA_AUTO_ACTIONS = '1';
const ss = box.__ss;
const actions = ss._add('אוצר זריעה', [new Array(22).fill('כותרת')]);
ss._add('משתמשים', [['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל']]);
// מוגן: כל כתיבה נכשלת כמו ב-Apps Script
let locked = true;
const realAppend = actions.appendRow;
actions.appendRow = (r) => {
  if (locked) throw new Error('Exception: ניסית לערוך אובייקט או תא מוגן. כדי לערוך אותם, עליך לפנות לבעלים של הגיליון האלקטרוני שיסיר את ההגנה.');
  realAppend(r);
};
const errorsCount = () => (ss.getSheetByName('שגיאות') ? ss.getSheetByName('שגיאות').getLastRow() : 0);

function report(name) {
  const q = [];
  q[box.__COLS.RECEIVED - 1] = new Date();
  q[box.__COLS.SENDER_NAME - 1] = 'שולח';
  q[box.__COLS.SENDER_PHONE - 1] = '0501111111';
  return box.recordWhatsappAction_(q, { is_report: true, mikveh_name: name, action_type: 'ביקור', summary: 'בדיקה' });
}

console.log('— לשונית מוגנת: נשמר בצד, התראה אחת בלבד —');
const n1 = report('אבן יהודה');
const n2 = report('אלעד');
const n3 = report('אריאל');
check('הערה ברורה במקום שגיאה', /ממתין לרישום בתיק/.test(n1), n1);
check('שום שורה לא נכתבה בתיק', actions.getLastRow() === 1);
const pending = ss.getSheetByName('פעולות ממתינות');
check('שלוש שורות ממתינות', pending && pending.getLastRow() === 4, pending && pending.getLastRow());
check('שורת שגיאה אחת בלבד לשלושה דיווחים', errorsCount() === 1, errorsCount());
check('השגיאה מסבירה מה לתקן', /גיליונות וטווחים מוגנים/.test(ss.getSheetByName('שגיאות')._rows[0][2]));

console.log('— ניסיון חוזר בזמן שעדיין מוגן —');
box.waRetryPending_();
check('עדיין ממתינות', pending.getLastRow() === 4);
check('בלי שגיאה נוספת', errorsCount() === 1);

console.log('— ההרשאה נוספה: הכל נרשם לפי הסדר —');
locked = false;
box.__cache.remove('wa_pending_retry');
box.waRetryPending_();
check('שלוש שורות נרשמו בתיק', actions.getLastRow() === 4, actions.getLastRow());
check('לפי הסדר', actions._rows[1][2] === 'אבן יהודה' && actions._rows[3][2] === 'אריאל');
check('חותמת הזמן חזרה להיות תאריך', Object.prototype.toString.call(actions._rows[1][0]) === '[object Date]');
check('לשונית הממתינות התרוקנה', pending.getLastRow() === 1);
check('סימון החסימה נמחק', !box.__props.WA_ACTIONS_BLOCKED_AT);

console.log('— דיווח רגיל אחרי התיקון —');
const n4 = report('אלקנה');
check('נרשם ישירות', /^נרשם בתיק/.test(n4) && actions.getLastRow() === 5, n4);

console.log('— שגיאה אחרת (לא הגנה) עדיין מדווחת —');
actions.appendRow = () => { throw new Error('Service unavailable'); };
const n5 = report('אלון שבות');
check('נרשמה כשגיאה', /שגיאה ברישום/.test(n5) && errorsCount() === 2, n5);

console.log('— שחזור דיווחים שנכשלו לפני התיקון —');
actions.appendRow = realAppend;
const queue = ss.getSheetByName('תור נכנס') || ss._add('תור נכנס', [new Array(14).fill('כותרת')]);
const qrow = (text, note) => { const r = new Array(14).fill(''); r[0] = '2026-11-02 10:00:00'; r[2] = text; r[3] = 'שולח'; r[4] = '0502222222'; r[5] = 'טקסט'; r[9] = 'טופל'; r[10] = note; queue.appendRow(r); };
const blocked = 'זוהה: אלעד | שגיאה ברישום הפעולה בתיק: Exception: ניסית לערוך אובייקט או תא מוגן.';
qrow('ביקרתי היום באלעד', blocked);
qrow('סתם שיחה', blocked.replace('אלעד', 'אריאל'));
qrow('דיווח רגיל', 'זוהה: אלקנה | נרשם בתיק: ביקור כשרות');
const seenRefs = [];
box.analyzeWithGemini_ = (text, blob, ref) => {
  seenRefs.push(ref);
  return text === 'סתם שיחה' ? { is_report: false } : { is_report: true, mikveh_name: 'אלעד', action_type: 'ביקור', summary: text };
};
const before = actions.getLastRow();
box.recoverBlockedWhatsappActions();
check('רק הדיווח החסום עם פעולה נרשם', actions.getLastRow() === before + 1, actions.getLastRow() - before);
check('התאריך היחסי לפי זמן קבלת ההודעה', seenRefs.length === 2 && seenRefs[0] && new Date(seenRefs[0]).getDate() === 2, seenRefs);
check('ההערה עודכנה לשחזור', /נרשם בתיק.*\(שחזור\)/.test(queue._rows[1][10]), queue._rows[1][10]);
check('שיחה בלי פעולה מסומנת', /שחזור: לא זוהתה/.test(queue._rows[2][10]), queue._rows[2][10]);
check('שורה תקינה לא נגעו בה', queue._rows[3][10] === 'זוהה: אלקנה | נרשם בתיק: ביקור כשרות');
box.recoverBlockedWhatsappActions();
check('הרצה חוזרת לא רושמת פעמיים', actions.getLastRow() === before + 1 && seenRefs.length === 2);

console.log('— checkProtectedTabs: מוצא רק את מה שבאמת חוסם —');
{
  const all = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'HebDate.js', 'WhatsappActions.js', 'Media.js', 'Projects.js', 'Questions.js', 'Access.js', 'WorkPoll.js'];
  const b2 = load(all);
  const T = { SHEET: 'SHEET', RANGE: 'RANGE' };
  b2.SpreadsheetApp.ProtectionType = T;
  const prot = (type, canEdit, warn, a1) => ({ getProtectionType: () => type, canEdit: () => canEdit, isWarningOnly: () => !!warn, getRange: () => ({ getA1Notation: () => a1 }) });
  const s2 = b2.__ss;
  const mk = (name, list) => { const sh = s2._add(name, [[]]); sh.getProtections = (t) => list.filter((p) => p.getProtectionType() === t); };
  mk('אוצר זריעה', [prot('SHEET', false)]);                 // חוסם – והמערכת כותבת לשם
  mk('בסיס הנתונים', [prot('RANGE', false, false, 'A1:B2')]); // חוסם טווח
  mk('פיקוח הלכתי', [prot('SHEET', true)]);                  // מורשה
  mk('תעודות', [prot('SHEET', false)]);                      // חוסם, אבל המערכת לא כותבת לשם
  mk('אוצר השקה', [prot('SHEET', false, true)]);             // אזהרה בלבד
  s2.getSheets = () => Object.values(s2._sheets);
  const r = b2.checkProtectedTabs();
  const names = (l) => l.map((x) => x.sheet + ':' + x.range).sort();
  check('חסימות בלשוניות שהמערכת כותבת אליהן', JSON.stringify(names(r.bad).filter((n, i, a) => a.indexOf(n) === i)) === JSON.stringify(['אוצר זריעה:כל הלשונית', 'בסיס הנתונים:A1:B2']), names(r.bad));
  check('לשונית שהמערכת לא כותבת אליה – בנפרד', names(r.other).every((n) => n === 'תעודות:כל הלשונית'), names(r.other));
  check('מורשה ואזהרה בלבד – לא מדווחים', !names(r.bad.concat(r.other)).some((n) => /פיקוח|השקה/.test(n)));
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
