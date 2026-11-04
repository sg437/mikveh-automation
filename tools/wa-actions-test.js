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

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
