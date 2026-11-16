/**
 * הורדת מדיה בתור הנכנס (processRow_ ב-קוד.js): ניסיון חוזר בתקלת רשת,
 * ועיבוד ההודעה בלי המדיה כשההורדה לא מצליחה.
 * הרצה:  node tools/queue-test.js
 */
const { load } = require('./gas-stub');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

function setup(failWith) {
  const box = load(['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'HebDate.js', 'WhatsappActions.js'], 'global.__COLS = COLS;');
  const C = box.__COLS;
  const q = box.__ss._add('תור נכנס', [new Array(14).fill('כותרת')]);
  box.calls = { download: 0, gemini: 0 };
  box.archiveRawFile_ = () => {
    box.calls.download++;
    const f = typeof failWith === 'function' ? failWith(box.calls.download) : failWith;
    if (f) throw new Error(f);
    return 'https://drive.google.com/file/d/' + 'x'.repeat(30) + '/view';
  };
  box.analyzeWithGemini_ = () => { box.calls.gemini++; return { is_report: true, mikveh_name: 'אבן יהודה', summary: 'ס' }; };
  box.appendToReportLog_ = () => 2;
  box.recordWhatsappAction_ = () => '';
  box.fileToSmartArchive_ = () => 'smart';
  box.appendMediaLink_ = () => {};
  const add = (text) => {
    const r = new Array(14).fill('');
    r[C.RECEIVED - 1] = new Date(); r[C.TEXT - 1] = text; r[C.TYPE - 1] = 'תמונה';
    r[C.DOWNLOAD_URL - 1] = 'https://do-media.example/x.jpg'; r[C.STATUS - 1] = 'ממתין';
    q.appendRow(r);
    return q.getLastRow();
  };
  const step = (rowNum) => box.processRow_(q, rowNum, q.getRange(rowNum, 1, 1, 14).getValues()[0], '');
  const cell = (rowNum, col) => q._rows[rowNum - 1][col - 1];
  return { box, C, add, step, cell };
}

console.log('— תקלת רשת רגעית: ממתינים ומנסים שוב —');
{
  const t = setup((n) => (n < 3 ? 'Exception: Address unavailable: https://do-media.example/x.jpg' : ''));
  const r = t.add('החלפתי אוצר באבן יהודה');
  check('ניסיון 1 – לא נספר כעבודה', t.step(r) === false);
  check('נשאר "ממתין"', t.cell(r, t.C.STATUS) === 'ממתין');
  check('ההערה סופרת ניסיונות', /^ניסיון הורדה 1\/6/.test(t.cell(r, t.C.NOTES)), t.cell(r, t.C.NOTES));
  t.step(r);
  check('ניסיון 2', /^ניסיון הורדה 2\/6/.test(t.cell(r, t.C.NOTES)), t.cell(r, t.C.NOTES));
  check('ג\'מיני עוד לא נקרא', t.box.calls.gemini === 0);
  check('ניסיון 3 מצליח – עובד', t.step(r) === true && t.cell(r, t.C.STATUS) === 'טופל', t.cell(r, t.C.STATUS));
  check('קישור הארכיון נשמר', /drive.google.com/.test(t.cell(r, t.C.ARCHIVE_LINK)));
  check('בלי שורת שגיאה', !t.box.__ss.getSheetByName('שגיאות'));
}

console.log('\n— נכשל שוב ושוב: מוותרים על המדיה, הטקסט מעובד —');
{
  const t = setup('Exception: Address unavailable: https://do-media.example/x.jpg');
  const r = t.add('החלפתי אוצר באבן יהודה');
  for (let i = 0; i < 5; i++) t.step(r);
  check('5 ניסיונות – עדיין ממתין', t.cell(r, t.C.STATUS) === 'ממתין', t.cell(r, t.C.NOTES));
  check('ניסיון 6 – עובד בלי המדיה', t.step(r) === true && t.cell(r, t.C.STATUS) === 'טופל');
  check('ג\'מיני נקרא פעם אחת', t.box.calls.gemini === 1);
  check('ההערה מציינת שהמדיה לא ירדה', /המדיה לא ירדה/.test(t.cell(r, t.C.NOTES)), t.cell(r, t.C.NOTES));
  check('שגיאה אחת נרשמה (התראה אחת)', t.box.__ss.getSheetByName('שגיאות').getLastRow() === 1);
}

console.log('\n— הקישור פג (404): בלי ניסיונות חוזרים —');
{
  const t = setup('הורדה נכשלה, קוד 404');
  const r = t.add('ביקרתי באבן יהודה');
  check('עובד מיד בלי המדיה', t.step(r) === true && t.cell(r, t.C.STATUS) === 'טופל' && t.box.calls.download === 1);
}

console.log('\n— תמונה בלי טקסט שלא ירדה —');
{
  const t = setup('הורדה נכשלה, קוד 403');
  const r = t.add('');
  check('מסומן "טופל" עם הסבר', t.step(r) === true && /המדיה לא ירדה.*אין טקסט/.test(t.cell(r, t.C.NOTES)), t.cell(r, t.C.NOTES));
  check('ג\'מיני לא נקרא', t.box.calls.gemini === 0);
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
