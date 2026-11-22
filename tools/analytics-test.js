/**
 * בדיקת Firebase Analytics בדפדפן אמיתי (Playwright), מול קוד האפליקציה.
 *
 * מה נבדק:
 *   1. בלי פרטי Firebase ב-config — שום קוד של Firebase אינו נטען.
 *   2. במסך הנעילה (מי שרק פתח את הקישור) — שום קוד מדידה אינו נטען.
 *   3. משתמש מחובר — נשלחים צפיות מסך וכניסה, ובשום אירוע אין שם מקווה,
 *      מזהה מקווה, שם משתמש או אימייל.
 *
 * ה-SDK האמיתי נטען מ-gstatic; השליחה ל-Google עצמה נתפסת כאן ואינה יוצאת.
 * הרצה:  node tools/analytics-test.js
 * דורש playwright + כרומיום ורשת ל-gstatic. אחרת הבדיקה מדלגת.
 */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  try { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
  catch (e2) { console.log('⏭️  playwright אינו מותקן – מדלגים על בדיקת המדידה'); process.exit(0); }
}
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const PORT = 8932;
const USER = { id: 'u9', name: 'ישראל ישראלי', email: 'inspector@example.org', role: 'מפקח' };

function payload() {
  return {
    meta: { exportedAt: '2026-09-15T10:00:00', spreadsheet: 'גיליון', fieldLabels: {} },
    mikvaot: [{ id: 'mk77', name: 'מקווה הדגמה', council: 'מועצה', region: 'איזור', activity: 'פעיל' }],
    actions: [], inspections: [], tasks: [], plugs: {}, whatsapp: [], messages: [], work: [], media: [],
    groups: [], reactions: [], contractors: [], contractorMsgs: [], projects: [], projectStages: {},
    users: [], perms: null, authEnabled: true, me: USER,
  };
}

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(u.searchParams.get('session') ? payload()
      : { error: 'נדרשת כניסה למערכת', code: 'login', authEnabled: true, googleClientId: 'x.apps.googleusercontent.com' }));
    return;
  }
  const f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

const FB = { firebaseApiKey: 'AIzaTEST', firebaseProjectId: 'mikveh-test', firebaseAppId: '1:1:web:1', firebaseMeasurementId: 'G-TEST000001' };

/** הקשר דפדפן עם הגדרות, ותפיסת כל מה שהולך ל-Firebase/Google. */
async function open(browser, conn, session) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const seen = { sdk: [], hits: [] };
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => { seen.sdk.push(r.request().url()); return r.continue(); });
  await ctx.route(/firebase(installations)?\.googleapis\.com/, (r) => {
    const u = r.request().url();
    if (/webConfig/.test(u)) return r.fulfill({ json: { projectId: FB.firebaseProjectId, appId: FB.firebaseAppId, measurementId: FB.firebaseMeasurementId } });
    return r.fulfill({ json: { fid: 'f1', authToken: { token: 't', expiresIn: '604800s' }, refreshToken: 'r' } });
  });
  await ctx.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/, (r) => {
    const q = r.request();
    if (/\/g\/collect/.test(q.url())) { seen.hits.push(decodeURIComponent(q.url() + '\n' + (q.postData() || ''))); return r.fulfill({ status: 204, body: '' }); }
    return r.continue();
  });
  await ctx.addInitScript(([c, s]) => {
    try {
      localStorage.setItem('mikveh.connection', JSON.stringify(c));
      if (s) localStorage.setItem('mikveh.session', JSON.stringify(s));
    } catch (e) { /* about:blank */ }
  }, [conn, session]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, seen, errors };
}

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  let browser;
  try { browser = await chromium.launch(exe && fs.statSync(exe).isFile() ? { executablePath: exe } : {}); }
  catch (e) { browser = await chromium.launch(); }
  const api = 'http://localhost:' + PORT + '/api';
  const session = { token: 'sess-1', user: USER, expires: Date.now() + 86400000 };

  console.log('— בלי פרטי Firebase: המדידה כבויה —');
  {
    const t = await open(browser, { apiUrl: api }, session);
    await t.page.goto('http://localhost:' + PORT + '/index.html');
    await t.page.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
    await t.page.evaluate(() => { location.hash = '#/tasks'; });
    await t.page.waitForTimeout(2000);
    check('לא נטען SDK', t.seen.sdk.length === 0, t.seen.sdk);
    check('לא נשלח דבר', t.seen.hits.length === 0);
    check('אין שגיאות', t.errors.length === 0, t.errors);
    await t.ctx.close();
  }

  console.log('\n— מסך נעילה (בלי כניסה): שום קוד מדידה —');
  {
    const t = await open(browser, Object.assign({ apiUrl: api }, FB), null);
    await t.page.goto('http://localhost:' + PORT + '/index.html');
    await t.page.waitForSelector('#gateLogin', { timeout: 20000 });
    await t.page.waitForTimeout(2500);
    check('מסך הנעילה מוצג', !!(await t.page.$('#gateLogin')));
    check('לא נטען SDK', t.seen.sdk.length === 0, t.seen.sdk);
    check('לא נשלח דבר', t.seen.hits.length === 0);
    await t.ctx.close();
  }

  console.log('\n— משתמש מחובר: צפיות מסך וכניסה נשלחות, בלי פרטים מזהים —');
  {
    const t = await open(browser, Object.assign({ apiUrl: api }, FB), session);
    // כניסה שהסתיימה בטעינה מחדש (כמו ממסך הנעילה) — נרשמת אחרי הטעינה
    await t.ctx.addInitScript(() => { try { sessionStorage.setItem('mikveh.fa.login', '1'); } catch (e) { /* about:blank */ } });
    await t.page.goto('http://localhost:' + PORT + '/index.html');
    await t.page.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
    await t.page.waitForFunction(() => window.firebase && window.firebase.apps && window.firebase.apps.length > 0, { timeout: 20000 }).catch(() => {});
    for (const h of ['#/tasks', '#/m/mk77/history', '#/talk/mk77', '#/dashboard']) {
      await t.page.evaluate((x) => { location.hash = x; }, h);
      await t.page.waitForTimeout(400);
    }
    await t.page.evaluate(() => MikvehAnalytics.action('addAction'));
    // gtag שולח באצווה, כמה שניות אחרי האירוע
    for (let i = 0; i < 30 && !/en=add_action/.test(t.seen.hits.join('\n')); i++) await t.page.waitForTimeout(500);
    const all = t.seen.hits.join('\n');
    if (process.env.DEBUG) console.log(all);
    check('נטען SDK', t.seen.sdk.length >= 2, t.seen.sdk);
    check('נשלחו אירועים', t.seen.hits.length > 0);
    check('צפייה במסך המשימות', /tasks/.test(all));
    check('לשונית כרטיס, בלי מזהה המקווה', /card\/history/.test(all));
    check('דיון נרשם כ-talk/thread', /talk\/thread/.test(all));
    check('נרשמה כניסה', /en=login/.test(all));
    check('נרשמה פעולה add_action', /en=add_action/.test(all));
    check('נשלח תפקיד', /מפקח/.test(all));
    check('אין מזהה מקווה', !/mk77/.test(all));
    check('אין שם מקווה', !/מקווה הדגמה/.test(all));
    check('אין שם משתמש', !/ישראל ישראלי/.test(all));
    check('אין אימייל', !/inspector@example\.org/.test(all));
    check('אין מזהה משתמש', !/[=&]uid=|u9\b/.test(all));
    check('אין שגיאות', t.errors.length === 0, t.errors);
    await t.ctx.close();
  }

  await browser.close();
  srv.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו, ' : '✅ ') + pass + ' עברו');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
