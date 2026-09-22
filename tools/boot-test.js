/**
 * בדיקת פתיחה אמיתית בדפדפן (Playwright), מול קוד האפליקציה עצמו.
 *
 * מה שנבדק הוא מה שהמשתמש מרגיש: כמה זמן עובר עד שיש משהו על המסך.
 * השרת המדומה כאן "איטי" בכוונה (1.5 שניות), ולכן אם המסך עלה לפניו –
 * הוא עלה מהעותק ששמר ה-Service Worker, כמתוכנן.
 *
 * הרצה:  node tools/boot-test.js
 * דורש playwright + כרומיום. אם אינם מותקנים, הבדיקה מדלגת בלי להיכשל.
 */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  try { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
  catch (e2) { console.log('⏭️  playwright אינו מותקן – מדלגים על בדיקת הדפדפן'); process.exit(0); }
}
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

// נתוני דמה קטנים, בשני גלים: "שמור" ו"חי"
function payload(tag, n) {
  return {
    meta: { exportedAt: '2026-09-15T10:00:00', spreadsheet: 'גיליון ' + tag, fieldLabels: {} },
    mikvaot: Array.from({ length: n }, (_, i) => ({ id: 'm' + i, name: 'מקווה ' + i, council: 'מועצה', region: 'איזור', activity: 'פעיל' })),
    actions: [], inspections: [], tasks: [], plugs: {}, whatsapp: [], messages: [], work: [], media: [],
    groups: [], reactions: [], contractors: [], contractorMsgs: [], projects: [], projectStages: {},
    users: [], perms: null, authEnabled: false, me: null,
  };
}

let hits = 0, demoHits = 0;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  // השרת דורש כניסה (Api.js עם GOOGLE_CLIENT_ID): מי שאין לו סשן לא מקבל נתונים
  if (u.pathname === '/api-login') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(u.searchParams.get('session')
      ? Object.assign(payload('חי', 3), { authEnabled: true, me: { id: 'u9', name: 'מפקח', role: 'מפקח' } })
      : { error: 'נדרשת כניסה למערכת', code: 'login', authEnabled: true, googleClientId: 'x.apps.googleusercontent.com' }));
    return;
  }
  if (u.pathname === '/api') {
    hits++;
    res.setHeader('Access-Control-Allow-Origin', '*');
    setTimeout(() => { // השרת "האיטי" – 1.5 שניות, כמו Apps Script
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload('חי', 7)));
    }, 1500);
    return;
  }
  if (u.pathname === '/data.js') demoHits++;
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

(async () => {
  await new Promise((r) => srv.listen(8931, r));
  // כרומיום מהסביבה אם הוגדר, אחרת מה ש-playwright מצא לבד
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(() => {
    localStorage.setItem('mikveh.connection', JSON.stringify({ apiUrl: 'http://localhost:8931/api' }));
  });

  console.log('— פתיחה ראשונה: אין עותק שמור, ממתינים לשרת —');
  await page.goto('http://localhost:8931/index.html');
  await page.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
  check('הרשימה נבנתה', (await page.textContent('#navCountList')) === '7');
  check('אין שגיאות', errors.length === 0, errors);
  const head1 = await page.textContent('#headMeta');
  check('הכותרת מראה חיבור חי', /מחובר לגיליון/.test(head1), head1);

  // ה-Service Worker שמר את התשובה; נותנים לו רגע
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  console.log('\n— פתיחה שנייה: ה-Service Worker תופס שליטה ושומר את התשובה —');
  await page.goto('http://localhost:8931/index.html');
  await page.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
  await page.waitForTimeout(800);
  check('התשובה נשמרה במטמון הנתונים', await page.evaluate(() => caches.open('mikveh-data').then((c) => c.keys()).then((k) => k.length > 0)));

  console.log('\n— פתיחה שלישית: העותק השמור חייב לעלות לפני שהשרת עונה —');
  const t0 = Date.now();
  await page.goto('http://localhost:8931/index.html');
  await page.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
  const firstPaint = Date.now() - t0;
  const head2 = await page.textContent('#headMeta');
  check('המסך עלה לפני שהשרת ענה (1.5ש)', firstPaint < 1400, firstPaint + 'ms');
  check('הכותרת מסמנת "עותק שמור"', /עותק שמור/.test(head2), head2);
  check('אין באנר "לא מחובר"', await page.$eval('#connBanner', (el) => el.hidden));

  await page.waitForFunction(() => /מחובר לגיליון/.test(document.querySelector('#headMeta').textContent), { timeout: 20000 });
  check('הנתונים החיים החליפו את העותק', /מחובר לגיליון/.test(await page.textContent('#headMeta')));
  check('הרשימה עדיין תקינה', (await page.textContent('#navCountList')) === '7');
  check('אין שגיאות בכל הדרך', errors.length === 0, errors);

  const timing = await page.evaluate(() => window.MIKVEH_TIMING);
  check('נמדדו זמנים', !!timing && timing.totalMs !== undefined, timing);
  console.log('    ⏱️', JSON.stringify(timing));

  console.log('\n— ניווט אחרי הרענון עובד —');
  await page.click('a[href="#/tasks"]').catch(() => page.evaluate(() => { location.hash = '#/tasks'; }));
  await page.waitForTimeout(400);
  check('מסך המשימות נפתח', /#\/tasks/.test(page.url()));
  check('אין שגיאות בניווט', errors.length === 0, errors);

  console.log('\n— מי שפתח את הקישור בלי כניסה: מסך נעילה, לא נתונים —');
  {
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    const errs2 = [];
    p2.on('pageerror', (e) => errs2.push(String(e)));
    await p2.addInitScript(() => {
      localStorage.setItem('mikveh.connection', JSON.stringify({ apiUrl: 'http://localhost:8931/api-login' }));
    });
    demoHits = 0;
    await p2.goto('http://localhost:8931/index.html');
    await p2.waitForSelector('.gate', { timeout: 20000 });
    check('מסך הכניסה הוצג', !!(await p2.$('.gate')));
    check('יש כפתור כניסה עם Google', !!(await p2.$('#gateLogin')));
    check('אין נתונים על המסך', (await p2.textContent('#navCountList')) === '', await p2.textContent('#navCountList'));
    check('התפריט מוסתר', await p2.$eval('.sidenav', (el) => getComputedStyle(el).display === 'none'));
    // מסך הנעילה מחליף את תוכן ה-main כולו: אין בדף בכלל מסך הגדרות
    check('אין גישה למסך ההגדרות', await p2.evaluate(() => {
      location.hash = '#/settings';
      const v = document.querySelector('#view-settings');
      return !v || !v.classList.contains('on');
    }));
    check('עותק ההדגמה לא נטען', demoHits === 0, demoHits);
    check('כפתור ההתקנה מוצג', await p2.$eval('#installBar', (el) => !el.hidden));
    check('אין שגיאות במסך הנעילה', errs2.length === 0, errs2);
    await ctx2.close();
  }

  console.log('\n— מי שנכנס אך אינו מנהל: אין קישור להגדרות —');
  {
    const ctx3 = await browser.newContext();
    const p3 = await ctx3.newPage();
    await p3.addInitScript(() => {
      localStorage.setItem('mikveh.connection', JSON.stringify({ apiUrl: 'http://localhost:8931/api-login' }));
      localStorage.setItem('mikveh.session', JSON.stringify({ token: 'T', user: { id: 'u9', name: 'מפקח', role: 'מפקח' } }));
    });
    await p3.goto('http://localhost:8931/index.html');
    await p3.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
    check('הנתונים נטענו עם הסשן', (await p3.textContent('#navCountList')) === '3');
    check('אין מסך נעילה', !(await p3.$('.gate')));
    check('קישור ההגדרות מוסתר', await p3.$eval('nav a[data-view="settings"]', (el) => el.hidden));
    await ctx3.close();
  }

  await browser.close();
  srv.close();
  console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו, ' : '✅ ') + pass + ' עברו  (פניות לשרת: ' + hits + ')');
  process.exit(fail ? 1 : 0);
})();
