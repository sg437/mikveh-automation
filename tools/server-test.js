const { load } = require('./gas-stub');
const FILES = ['קוד.js', 'Api.js', 'ApiWrite.js', 'Auth.js', 'Projects.js'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

function setup() {
  const box = load(FILES);
  const ss = box.__ss;
  // בסיס הנתונים: 37 עמודות, שני מקוואות
  const master = [];
  const head = new Array(37).fill('');
  master.push(head.map((_, i) => 'col' + i));
  const row1 = new Array(37).fill(''); row1[0] = 'אבן יהודה'; row1[2] = 'אבן יהודה'; row1[4] = 'פעיל';
  const row2 = new Array(37).fill(''); row2[0] = 'מקווה ותיק'; row2[4] = 'פעיל';
  master.push(row1); master.push(row2);
  ss._add('בסיס הנתונים', master);
  ss._add('משתמשים', [
    ['מזהה', 'שם', 'אימייל', 'טלפון', 'תפקיד', 'פעיל', 'נוצר', 'כניסה אחרונה', 'מזהה גוגל', 'תמונה'],
    ['u1', 'שמואל גולדמן', 'a@b.c', '', 'מנהל', 'כן', '', '', '', ''],
    ['u2', 'ישראל כהן', 'c@d.e', '', 'מפקח', 'כן', '', '', '', ''],
    ['u3', 'לוי לוי', 'f@g.h', '', 'בלנית', 'לא', '', '', '', ''],
  ]);
  return box;
}
const STAGE_KEYS = ['plans', 'roof', 'reservoir', 'zeria', 'hashaka', 'bor', 'walls', 'fill', 'cert'];
const ADMIN = { id: 'u1', name: 'שמואל גולדמן', role: 'מנהל' };
const INSP = { id: 'u2', name: 'ישראל כהן', role: 'מפקח' };
const run = (box, fn, ...args) => box[fn](box.__ss, ...args);
const activity = (box, name) => {
  const r = box.mikvehRow_(box.__ss, name);
  return r ? box.apiClean_(r.sh.getRange(r.rowNum, 5).getValue()) : null;
};

console.log('\n— תפקיד ישן "בלנית" מתורגם ל"קבלן" —');
{
  const box = setup();
  const u = box.authUsers_(box.__ss).filter((x) => x.id === 'u3')[0];
  check('בלנית ⟵ קבלן', u.role === 'קבלן', u.role);
  check('תפקיד תקין נשאר', box.authRole_('מפקח') === 'מפקח');
}

console.log('\n— פתיחת פרויקט על מקווה קיים —');
{
  const box = setup();
  const res = run(box, 'addProject_', { mikveh: 'אבן יהודה', mikvehMode: 'exists', markInactive: true, type: 'שיפוץ' }, ADMIN);
  check('נפתח', res.ok === true, res.error);
  check('המקווה סומן בשיפוץ', activity(box, 'אבן יהודה') === 'בשיפוץ', activity(box, 'אבן יהודה'));
  check('הוחזר מידע על המקווה', !!res.mikveh && res.mikveh.changed === true, res.mikveh);
  check('ההודעה מציינת את הסימון', /בשיפוץ/.test(res.message.text), res.message && res.message.text);
  check('המפקח ברירת מחדל = מי שפתח', res.record.supervisor === 'שמואל גולדמן', res.record.supervisor);
}

console.log('\n— "קיים בבסיס הנתונים" על שם שאינו שם —');
{
  const box = setup();
  const res = run(box, 'addProject_', { mikveh: 'מקווה שלא קיים', mikvehMode: 'exists' }, ADMIN);
  check('נדחה', !!res.error, res);
}

console.log('\n— "מקווה חדש לגמרי" על שם שכבר קיים —');
{
  const box = setup();
  const res = run(box, 'addProject_', { mikveh: 'אבן יהודה', mikvehMode: 'new' }, ADMIN);
  check('נדחה', !!res.error, res);
}

console.log('\n— בלי סימון: המקווה נשאר פעיל —');
{
  const box = setup();
  run(box, 'addProject_', { mikveh: 'אבן יהודה', mikvehMode: 'exists', markInactive: false, type: 'שיפוץ' }, ADMIN);
  check('נשאר פעיל', activity(box, 'אבן יהודה') === 'פעיל', activity(box, 'אבן יהודה'));
}

console.log('\n— מקווה חדש: אינו נכנס לבסיס הנתונים בפתיחה —');
{
  const box = setup();
  const res = run(box, 'addProject_', { mikveh: 'מקווה חדש בבנייה', mikvehMode: 'new', place: 'נתיבות', type: 'בנייה' }, ADMIN);
  check('נפתח', res.ok === true, res.error);
  check('אינו בבסיס הנתונים', box.mikvehRow_(box.__ss, 'מקווה חדש בבנייה') === null);
  check('לא הוחזר מקווה', res.mikveh === null, res.mikveh);
}

console.log('\n— מפקח אחראי: מנהל מול מפקח —');
{
  const box = setup();
  const a = run(box, 'addProject_', { mikveh: 'אבן יהודה', mikvehMode: 'exists', supervisor: 'ישראל כהן' }, ADMIN);
  check('מנהל מציב משתמש אחר', a.record.supervisor === 'ישראל כהן', a.record.supervisor);
  const b = run(box, 'updateProject_', { id: a.record.id, supervisor: 'שמואל גולדמן' }, INSP);
  check('מפקח אינו משנה מפקח', b.record.supervisor === 'ישראל כהן', b.record.supervisor);
  const c = run(box, 'updateProject_', { id: a.record.id, supervisor: 'שמואל גולדמן' }, ADMIN);
  check('מנהל משנה מפקח', c.record.supervisor === 'שמואל גולדמן', c.record.supervisor);
  const d = run(box, 'updateProject_', { id: a.record.id, supervisor: 'מישהו מהרחוב' }, ADMIN);
  check('שם שאינו במערכת נדחה', d.record.supervisor === 'שמואל גולדמן', d.record.supervisor);
  const e = run(box, 'updateProject_', { id: a.record.id, supervisor: 'לוי לוי' }, ADMIN);
  check('משתמש מושבת נדחה', e.record.supervisor === 'שמואל גולדמן', e.record.supervisor);
}

console.log('\n— אישור שלב על שם מפקח אחר —');
{
  const box = setup();
  const a = run(box, 'addProject_', { mikveh: 'אבן יהודה', mikvehMode: 'exists' }, ADMIN);
  const s1 = run(box, 'updateProjectStage_', { id: a.record.id, stage: 'bor', status: 'אושר', by: 'ישראל כהן' }, ADMIN);
  check('מנהל רושם על שם אחר', s1.record.by === 'ישראל כהן', s1.record.by);
  const s2 = run(box, 'updateProjectStage_', { id: a.record.id, stage: 'bor', status: 'אושר', by: 'ישראל כהן', note: 'הערה' }, ADMIN);
  check('עריכת הערה אינה גוזלת את הייחוס', s2.record.by === 'ישראל כהן', s2.record.by);
  const s3 = run(box, 'updateProjectStage_', { id: a.record.id, stage: 'roof', status: 'אושר', by: 'שמואל גולדמן' }, INSP);
  check('מפקח נרשם על שם עצמו', s3.record.by === 'ישראל כהן', s3.record.by);
  const s4 = run(box, 'updateProjectStage_', { id: a.record.id, stage: 'bor', status: 'ממתין', by: 'ישראל כהן' }, ADMIN);
  check('חזרה ל"ממתין" מנקה את השם', s4.record.by === undefined || s4.record.by === '', s4.record.by);
}

console.log('\n— אישור סיום: מקווה קיים —');
{
  const box = setup();
  const a = run(box, 'addProject_', { mikveh: 'אבן יהודה', mikvehMode: 'exists', markInactive: true, type: 'שיפוץ' }, ADMIN);
  const early = run(box, 'completeProject_', { id: a.record.id }, INSP);
  check('סיום נחסם כשיש שלבים פתוחים', !!early.error, early);
  STAGE_KEYS.forEach((k) => run(box, 'updateProjectStage_', { id: a.record.id, stage: k, status: 'אושר' }, INSP));
  const done = run(box, 'completeProject_', { id: a.record.id }, INSP);
  check('אושר', done.ok === true, done.error);
  check('הפרויקט הושלם', done.record.status === 'הושלם', done.record.status);
  check('המקווה חזר לפעיל', activity(box, 'אבן יהודה') === 'פעיל', activity(box, 'אבן יהודה'));
  check('לא נוצר מקווה חדש', done.created === false, done.created);
  const again = run(box, 'completeProject_', { id: a.record.id }, ADMIN);
  check('אי אפשר לאשר פעמיים', !!again.error, again);
}

console.log('\n— אישור סיום: מקווה חדש נכנס לבסיס הנתונים —');
{
  const box = setup();
  const a = run(box, 'addProject_', { mikveh: 'מקווה חדש בבנייה', mikvehMode: 'new', place: 'נתיבות', type: 'בנייה' }, ADMIN);
  STAGE_KEYS.forEach((k) => run(box, 'updateProjectStage_', { id: a.record.id, stage: k, status: 'אושר' }, ADMIN));
  const done = run(box, 'completeProject_', { id: a.record.id }, ADMIN);
  check('אושר', done.ok === true, done.error);
  check('נוצר', done.created === true);
  check('נמצא בבסיס הנתונים', box.mikvehRow_(box.__ss, 'מקווה חדש בבנייה') !== null);
  check('מסומן פעיל', activity(box, 'מקווה חדש בבנייה') === 'פעיל', activity(box, 'מקווה חדש בבנייה'));
  check('היישוב נשמר', box.mikvehRow_(box.__ss, 'מקווה חדש בבנייה').sh.getRange(4, 3).getValue() === 'נתיבות');
  check('שתי הודעות מערכת', (done.messages || []).length === 2, (done.messages || []).length);
}

console.log('\n— אישור בכפייה: מנהל בלבד —');
{
  const box = setup();
  const a = run(box, 'addProject_', { mikveh: 'מקווה ותיק', mikvehMode: 'exists', type: 'שיפוץ' }, ADMIN);
  const byInsp = run(box, 'completeProject_', { id: a.record.id, force: true }, INSP);
  check('מפקח אינו יכול לכפות', !!byInsp.error, byInsp);
  const byAdmin = run(box, 'completeProject_', { id: a.record.id, force: true }, ADMIN);
  check('מנהל כופה', byAdmin.ok === true, byAdmin.error);
  check('סומן שנכפה', byAdmin.forced === true);
  check('ההודעה מזהירה', /אושר למרות/.test(byAdmin.messages.slice(-1)[0].text));
  check('המקווה פעיל', activity(box, 'מקווה ותיק') === 'פעיל');
}

console.log('\n— לשונית ההרשאות: הפעולה החדשה מקבלת שורה —');
{
  const box = setup();
  box.__ss._add('הרשאות', [['פעולה', 'תיאור', 'מפקח', 'בלנית', 'צופה'], ['addAction', 'דיווח פעולה', 'כן', 'כן', 'לא']]);
  const sh = box.permsSheet_(box.__ss);
  check('הכותרת הישנה עודכנה', sh.getRange(1, 4).getValue() === 'קבלן', sh.getRange(1, 4).getValue());
  const keys = sh._rows.slice(1).map((r) => r[0]);
  check('completeProject נוסף', keys.indexOf('completeProject') >= 0, keys);
  check('שורה קיימת לא שוכפלה', keys.filter((k) => k === 'addAction').length === 1);
  const perms = box.authPerms_(box.__ss);
  check('ברירת מחדל למפקח', perms.completeProject['מפקח'] === true, perms.completeProject);
  const set = box.authSetPerms_(box.__ss, { perms: { completeProject: { 'מפקח': false } } }, ADMIN);
  check('אפשר לכבות את הפעולה החדשה', set.perms.completeProject['מפקח'] === false, set.perms.completeProject);
}

console.log('\n— מחיקת פרויקט —');
{
  const box = setup();
  // המזהה הוא 8 התווים הראשונים של ה-UUID, ובמעטפת כולם מתחילים ב-uuid-000
  let n = 0; box.Utilities.getUuid = () => (++n).toString(16).padStart(8, '0') + '-x';
  const p = run(box, 'addProject_', { mikveh: 'אבן יהודה', mikvehMode: 'exists', markInactive: true, type: 'שיפוץ' }, INSP).record;
  run(box, 'updateProjectStage_', { id: p.id, stage: 'plans', status: 'אושר' }, INSP);
  run(box, 'updateProjectStage_', { id: p.id, stage: 'roof', status: 'בביצוע' }, INSP);
  const other = run(box, 'addProject_', { mikveh: 'מקווה חדש', mikvehMode: 'new' }, ADMIN).record;
  run(box, 'updateProjectStage_', { id: other.id, stage: 'plans', status: 'אושר' }, ADMIN);
  const stranger = { id: 'u9', name: 'מישהו אחר', role: 'מפקח' };
  check('מפקח שלא פתח – נחסם', /רק מי שפתח/.test(run(box, 'deleteProject_', { id: p.id }, stranger).error || ''));
  const res = run(box, 'deleteProject_', { id: p.id, restore: true }, INSP);
  check('מי שפתח – מוחק', res.ok === true, res.error);
  check('שני השלבים נמחקו', res.stages === 2, res.stages);
  check('הפרויקט ירד מהרשימה', !box.apiProjects_(box.__ss).some((x) => x.id === p.id));
  check('השלבים של פרויקט אחר נשארו', !!(box.apiProjectStages_(box.__ss)[other.id] || {}).plans);
  check('הפרויקט האחר נשאר', box.apiProjects_(box.__ss).some((x) => x.id === other.id));
  check('המקווה חזר לפעיל', activity(box, 'אבן יהודה') === 'פעיל' && res.mikveh && res.mikveh.changed, activity(box, 'אבן יהודה'));
  check('מחיקה חוזרת – לא נמצא', /לא נמצא/.test(run(box, 'deleteProject_', { id: p.id }, ADMIN).error || ''));

  const q = run(box, 'addProject_', { mikveh: 'אבן יהודה', mikvehMode: 'exists', markInactive: true }, ADMIN).record;
  run(box, 'deleteProject_', { id: q.id, restore: false }, ADMIN);
  check('בלי restore – נשאר בשיפוץ', activity(box, 'אבן יהודה') === 'בשיפוץ');
  check('מנהל מוחק פרויקט שפתח מישהו אחר', run(box, 'deleteProject_', { id: other.id }, ADMIN).ok === true);
}

console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו, ' : '✅ ') + pass + ' עברו');
process.exit(fail ? 1 : 0);
