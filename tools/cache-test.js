/**
 * בדיקת מטמון הנתונים (?action=data) מול קוד השרת האמיתי, מחוץ לגוגל.
 *
 * מה שנבדק כאן הוא בדיוק מה שגרם לאיטיות: מי משלם על בניית הנתונים.
 * הכלל – אף בקשה של משתמש לא בונה מחדש, חוץ מהפעם הראשונה שאין בכלל עותק.
 *
 * הרצה:  node tools/cache-test.js
 */
// חותמות הזמן כאן נכתבות כטקסט: אובייקט Date שנוצר בבדיקה שייך לעולם אחר
// מזה של קוד השרת שרץ ב-vm, ו-instanceof Date שם היה נכשל. הגיליון ממילא
// מחזיר את שתי הצורות.
const { load } = require('./gas-stub');
const FILES = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'Projects.js', 'Media.js', 'HebDate.js'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

function setup() {
  const box = load(FILES);
  const ss = box.__ss;
  const master = [];
  master.push(new Array(37).fill('').map((_, i) => 'col' + i));
  const row = new Array(37).fill(''); row[0] = 'אבן יהודה'; row[2] = 'אבן יהודה'; row[4] = 'פעיל';
  master.push(row);
  ss._add('בסיס הנתונים', master);
  ss._add('אוצר זריעה', [new Array(22).fill('כותרת')]);
  ss._add('פיקוח הלכתי מערכת', [new Array(101).fill('').map((_, i) => 'ע' + i)]);
  ss._add('משימות לריקון והחלפת מי גשמים', [[], []]);
  ss._add('-פקקים מילוי חוזר', [[], []]);
  ss._add('יומן דיווחים', [[]]);
  ss._add('משתמשים', [['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל', 'נוצר', 'כניסה', 'גוגל', 'תמונה'],
    ['u1', 'הרב כהן', 'c@x.com', '0500000000', 'מנהל', 'כן', '', '', '', '']]);
  return box;
}

/** סופר כמה פעמים באמת נקרא מהגיליון, כדי לזהות בנייה מחדש. */
function countReads(box) {
  let reads = 0;
  const ss = box.__ss;
  const orig = ss.getSheetByName;
  ss.getSheetByName = function (name) {
    const sh = orig.call(ss, name);
    if (!sh || sh.__counted) return sh;
    sh.__counted = true;
    const g = sh.getRange;
    sh.getRange = function () { reads++; return g.apply(sh, arguments); };
    return sh;
  };
  return () => reads;
}

console.log('— הבנייה הראשונה נשמרת, והשנייה מגיעה מהמטמון —');
let box = setup();
let reads = countReads(box);
const first = box.apiCachedDataJson_();
const afterFirst = reads();
const second = box.apiCachedDataJson_();
check('התשובה זהה', first === second);
check('הבנייה הראשונה קראה מהגיליון', afterFirst > 0, afterFirst);
check('הקריאה השנייה לא נגעה בגיליון', reads() === afterFirst, reads());
check('נשמרו פיסות במטמון', Number(box.__cache.get('apiData:n')) > 0);

console.log('\n— אחרי כתיבה: המשתמש מקבל תשובה מיד, הבנייה עוברת לטריגר —');
box = setup();
box.apiCachedDataJson_();
reads = countReads(box);
box.apiInvalidateData_();
check('המטמון לא נמחק', !!box.__cache.get('apiData:n'));
check('סומן שנכנס שינוי', !!box.__cache.get('apiData:dirty'));
check('הוזמן טריגר חד-פעמי', box.__triggers.some((t) => t.getHandlerFunction() === 'refreshDataCacheOnce'));
const beforeServe = reads();
box.apiCachedDataJson_();
check('בקשה אחרי כתיבה אינה בונה מחדש', reads() === beforeServe, reads());

console.log('\n— רצף כתיבות אינו מציף בטריגרים —');
box = setup();
box.apiCachedDataJson_();
for (let i = 0; i < 5; i++) box.apiInvalidateData_();
check('טריגר אחד בלבד', box.__triggers.filter((t) => t.getHandlerFunction() === 'refreshDataCacheOnce').length === 1,
  box.__triggers.map((t) => t.getHandlerFunction()));

console.log('\n— הטריגר בונה מחדש, מוחק את עצמו, ומגיש נתונים חדשים —');
box = setup();
const before = JSON.parse(box.apiCachedDataJson_());
box.__ss._add('אוצר זריעה', [new Array(22).fill('כותרת'),
  (() => { const r = new Array(22).fill(''); r[0] = '2026-09-01T10:00:00'; r[2] = 'אבן יהודה'; r[5] = 'ריקון מאגר'; return r; })()]);
box.apiInvalidateData_();
const stale = JSON.parse(box.apiCachedDataJson_());
check('עד הבנייה מוגש העותק הקודם', stale.actions.length === before.actions.length);
box.refreshDataCacheOnce();
const fresh = JSON.parse(box.apiCachedDataJson_());
check('אחרי הטריגר הנתונים מעודכנים', fresh.actions.length === before.actions.length + 1, fresh.actions.length);
check('הטריגר החד-פעמי נמחק', !box.__triggers.some((t) => t.getHandlerFunction() === 'refreshDataCacheOnce'));
check('הסימון הוסר', !box.__cache.get('apiData:dirty'));

console.log('\n— הטריגר התקופתי: העותק לעולם אינו חסר —');
const age = (box, min) => box.__cache.put('apiData:built', String(Date.now() - min * 60000));

box = setup();
box.apiCachedDataJson_();
reads = countReads(box);
box.refreshDataCache();
check('עותק טרי – אין בנייה מיותרת', reads() === 0, reads());

// 20 דקות בשקט: מתחת לסף השקט (55 דק') – עוד לא בונים
box = setup(); box.apiCachedDataJson_(); reads = countReads(box);
age(box, 20); box.__cache.remove('apiData:used');
box.refreshDataCache();
check('20 דקות בשקט – עוד לא בונים', reads() === 0, reads());

// אותן 20 דקות, אבל מישהו נכנס לאחרונה – מעל סף הפעילות (13 דק')
box = setup(); box.apiCachedDataJson_(); reads = countReads(box);
age(box, 20); box.__cache.put('apiData:used', String(Date.now()));
box.refreshDataCache();
check('20 דקות ומישהו נכנס – בונים', reads() > 0, reads());

// שעה בשקט – בונים בכל מקרה, כדי שהפתיחה הבאה תמצא עותק מוכן.
// זו הטעות שנמדדה בשטח: 39 שניות למי שנכנס ראשון אחרי שקט.
box = setup(); box.apiCachedDataJson_(); reads = countReads(box);
age(box, 60); box.__cache.remove('apiData:used');
box.refreshDataCache();
check('שעה בשקט – בונים בכל זאת', reads() > 0, reads());

// אין עותק כלל – תמיד בונים
box = setup(); reads = countReads(box);
box.refreshDataCache();
check('אין עותק – בונים', reads() > 0, reads());

console.log('\n— בלי טריגרים בכלל חוזרים להתנהגות הישנה (מחיקה) —');
box = setup();
box.apiCachedDataJson_();
box.ScriptApp.newTrigger = () => { throw new Error('אין הרשאה'); };
box.apiInvalidateData_();
check('המטמון נמחק כשאי אפשר לבנות ברקע', !box.__cache.get('apiData:n'));

console.log('\n— רשימת דוחות הפיקוח נקראת בלי עמודות המדורים —');
box = setup();
const insp = [];
insp.push(new Array(101).fill('').map((_, i) => 'ע' + i));
const r = new Array(101).fill('');
r[0] = 'אבן יהודה'; r[1] = '2026-08-01T09:00:00'; r[12] = 'הרב כהן'; r[30] = 'טקסט במדור זריעה'; r[89] = 'הכתובת';
insp.push(r);
box.__ss._add('פיקוח הלכתי מערכת', insp);
const light = box.apiInspections_(box.__ss)[0];
const full = box.apiInspections_(box.__ss, true)[0];
check('הרשימה הקצרה שומרת על השדות', light.mikveh === 'אבן יהודה' && light.rabbi === 'הרב כהן' && light.address === 'הכתובת');
check('הרשימה הקצרה בלי מדורים', light.sections === undefined);
check('הדוח המלא כולל את המדורים', !!full.sections && full.sections.some((s) => s.fields.some((f) => f[1] === 'טקסט במדור זריעה')));

console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו, ' : '✅ ') + pass + ' עברו');
process.exit(fail ? 1 : 0);
