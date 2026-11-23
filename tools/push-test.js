/**
 * בדיקת הכניסה דרך Firebase וההתראות במכשיר, בדפדפן אמיתי (Playwright).
 *
 * מה נבדק:
 *   1. ברירת המחדל (loginWith: 'auto') מחוץ ל-Firebase Hosting — הכפתור של
 *      Google כמו תמיד, ושום קוד של Firebase Authentication אינו נטען.
 *   2. loginWith: 'firebase' — כפתור כניסה משלנו, והטוקן של Firebase נשלח
 *      לשרת כ-firebaseToken; אחרי הכניסה המערכת נפתחת.
 *   3. "התראות במכשיר הזה" בתפריט המשתמש — מוצג רק כשהשרת מדווח שהתראות
 *      מוגדרות; הפעלה רושמת את המכשיר בשרת, כיבוי מבטל.
 *   4. ה-Service Worker מציג התראה שהגיעה, עם הכותרת, הגוף והקישור.
 *
 * ה-SDK האמיתי נטען מ-gstatic. חלון הכניסה של Google והטוקן של FCM מוחלפים
 * כאן (אין להם משמעות בדפדפן בדיקה), וכל השאר הוא קוד האפליקציה עצמו.
 * הרצה:  node tools/push-test.js
 * דורש playwright + כרומיום ורשת ל-gstatic. אחרת הבדיקה מדלגת.
 */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  try { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
  catch (e2) { console.log('⏭️  playwright אינו מותקן – מדלגים על בדיקת ההתראות'); process.exit(0); }
}
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const PORT = 8934;
const BASE = 'http://localhost:' + PORT;
const USER = { id: 'u9', name: 'ישראל ישראלי', email: 'inspector@example.org', role: 'מפקח' };
const FCM_TOKEN = 'fcm-test-token-0123456789abcdefghij';

let pushEnabled = true;
const posts = [];

function payload() {
  return {
    meta: { exportedAt: '2026-09-15T10:00:00', spreadsheet: 'גיליון', fieldLabels: {} },
    mikvaot: [{ id: 'mk77', name: 'מקווה הדגמה', council: 'מועצה', region: 'איזור', activity: 'פעיל' }],
    actions: [], inspections: [], tasks: [], plugs: {}, whatsapp: [], messages: [], work: [], media: [],
    groups: [], reactions: [], contractors: [], contractorMsgs: [], projects: [], projectStages: {},
    users: [], perms: null, authEnabled: true, me: USER, firebaseAuth: true, pushEnabled: pushEnabled,
  };
}

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const b = JSON.parse(body || '{}');
        posts.push(b);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (b.action === 'login') {
          res.end(JSON.stringify(b.data && b.data.firebaseToken === 'FB-ID-TOKEN'
            ? { ok: true, token: 'sess-1', user: USER, expires: '2027-01-01' } : { error: 'טוקן לא מוכר' }));
        } else res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(u.searchParams.get('session') ? payload()
      : { error: 'נדרשת כניסה למערכת', code: 'login', authEnabled: true, googleClientId: 'x.apps.googleusercontent.com', firebaseAuth: true }));
    return;
  }
  let f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

async function open(browser, conn, session, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ serviceWorkers: opts.sw ? 'allow' : 'block', permissions: opts.sw ? ['notifications'] : [] });
  const seen = { sdk: [], gis: 0 };
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => { seen.sdk.push(r.request().url().split('/').pop()); return r.continue(); });
  await ctx.route(/accounts\.google\.com\/gsi\/client/, (r) => { seen.gis++; return r.fulfill({ contentType: 'text/javascript', body: '' }); });
  // המדידה אינה חלק מהבדיקה הזו
  await ctx.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com|firebase(installations)?\.googleapis\.com/, (r) => r.abort());
  await ctx.addInitScript(([c, s]) => {
    try {
      if (!localStorage.getItem('mikveh.connection')) localStorage.setItem('mikveh.connection', JSON.stringify(c));
      if (s && !localStorage.getItem('mikveh.test.seeded')) { localStorage.setItem('mikveh.session', JSON.stringify(s)); localStorage.setItem('mikveh.test.seeded', '1'); }
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
  const api = BASE + '/api';
  const session = { token: 'sess-1', user: USER, expires: Date.now() + 86400000 };

  console.log('— ברירת המחדל מחוץ ל-Firebase Hosting: הכפתור של Google —');
  {
    const t = await open(browser, { apiUrl: api }, null);
    await t.page.goto(BASE + '/index.html');
    await t.page.waitForSelector('#gateLogin', { timeout: 20000 });
    await t.page.click('#gateLogin');
    await t.page.waitForTimeout(1500);
    check('נטען הכפתור של Google', t.seen.gis === 1, t.seen);
    check('אין כפתור כניסה של Firebase', !(await t.page.$('#fbLogin')));
    check('שום קוד של Firebase לא נטען', t.seen.sdk.length === 0, t.seen.sdk);
    check('אין שגיאות', t.errors.length === 0, t.errors);
    await t.ctx.close();
  }

  console.log('\n— loginWith: firebase — כניסה דרך Firebase Authentication —');
  {
    posts.length = 0;
    const t = await open(browser, { apiUrl: api, loginWith: 'firebase' }, null);
    await t.page.goto(BASE + '/index.html');
    await t.page.waitForSelector('#gateLogin', { timeout: 20000 });
    check('במסך הנעילה עוד לא נטען דבר מ-Firebase', t.seen.sdk.length === 0, t.seen.sdk);
    await t.page.click('#gateLogin');
    await t.page.waitForSelector('#fbLogin:not([disabled])', { timeout: 30000 });
    check('כפתור הכניסה מוכן', true);
    check('נטען רק מה שנדרש לכניסה', t.seen.sdk.join() === 'firebase-app-compat.js,firebase-auth-compat.js', t.seen.sdk);
    check('הכפתור של Google לא נטען', t.seen.gis === 0);
    // חלון הכניסה של Google מוחלף: מחזיר משתמש עם ID token, כמו ה-SDK האמיתי
    await t.page.evaluate(() => {
      const a = window.firebase.auth();
      window.__signedOut = 0;
      a.signInWithPopup = () => Promise.resolve({ user: { getIdToken: () => Promise.resolve('FB-ID-TOKEN') } });
      a.signOut = () => { window.__signedOut++; return Promise.resolve(); };
    });
    await t.page.click('#fbLogin');
    await t.page.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
    const login = posts.filter((p) => p.action === 'login')[0] || { data: {} };
    check('הטוקן של Firebase נשלח לשרת', login.data.firebaseToken === 'FB-ID-TOKEN' && login.data.idToken === undefined, login.data);
    check('והמערכת נפתחה עם הסשן', (await t.page.evaluate(() => JSON.parse(localStorage.getItem('mikveh.session')).token)) === 'sess-1');
    check('אין שגיאות', t.errors.length === 0, t.errors);
    await t.ctx.close();
  }

  console.log('\n— השרת בלי התראות דחיפה: אין מה להציע —');
  {
    pushEnabled = false;
    const t = await open(browser, { apiUrl: api }, session);
    await t.page.goto(BASE + '/index.html');
    await t.page.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
    await t.page.click('#btnUser');
    await t.page.waitForSelector('#umLogout');
    check('אין שורת התראות בתפריט', !(await t.page.$('#umPush')) && !/התראות במכשיר/.test(await t.page.textContent('#userMenu')));
    check('שום קוד של Firebase Messaging לא נטען', !t.seen.sdk.some((f) => /messaging/.test(f)), t.seen.sdk);
    await t.ctx.close();
    pushEnabled = true;
  }

  console.log('\n— התראות במכשיר הזה: הפעלה וכיבוי —');
  {
    posts.length = 0;
    const t = await open(browser, { apiUrl: api }, session, { sw: true });
    await t.page.goto(BASE + '/index.html');
    await t.page.waitForSelector('#navCountList:not(:empty)', { timeout: 20000 });
    await t.page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    check('בפתיחה לא נטען קוד של Firebase Messaging', !t.seen.sdk.some((f) => /messaging/.test(f)), t.seen.sdk);
    await t.page.click('#btnUser');
    await t.page.waitForSelector('#umPush');
    check('השורה מוצגת, כבויה', /כבויות/.test(await t.page.textContent('#umPushState')) && /הפעלה/.test(await t.page.textContent('#umPush')));
    // הטוקן של FCM מוחלף (שירות הדחיפה של הדפדפן אינו זמין בדפדפן בדיקה)
    await t.page.evaluate((tok) => MikvehFirebase.use('messaging').then(() => {
      const fake = { getToken: (o) => { window.__swPassed = !!(o && o.serviceWorkerRegistration); return Promise.resolve(tok); },
        deleteToken: () => { window.__deleted = true; return Promise.resolve(true); } };
      const f = () => fake; f.isSupported = () => Promise.resolve(true);
      window.firebase.messaging = f;
    }), FCM_TOKEN);
    await t.page.click('#umPush');
    await t.page.waitForFunction(() => !!localStorage.getItem('mikveh.push'), null, { timeout: 15000 });
    const reg = posts.filter((p) => p.action === 'pushRegister')[0] || { data: {} };
    check('המכשיר נרשם בשרת עם הטוקן', reg.data.token === FCM_TOKEN && reg.data.app === 'main' && reg.token === 'sess-1', reg);
    check('הטוקן הונפק על ה-Service Worker של האפליקציה', await t.page.evaluate(() => window.__swPassed === true));
    await t.page.waitForFunction(() => document.getElementById('userMenu').hidden);
    await t.page.click('#btnUser');
    await t.page.waitForSelector('#umPush');
    check('עכשיו מוצג כפעיל', /פעילות/.test(await t.page.textContent('#umPushState')) && /כיבוי/.test(await t.page.textContent('#umPush')));

    // ---- התראה שמגיעה: ה-Service Worker מציג אותה ----
    const cdp = await t.ctx.newCDPSession(t.page);
    let regId = '';
    cdp.on('ServiceWorker.workerRegistrationUpdated', (ev) => { (ev.registrations || []).forEach((r) => { if (!r.isDeleted) regId = r.registrationId; }); });
    await cdp.send('ServiceWorker.enable');
    await t.page.waitForTimeout(500);
    let shown = null;
    if (regId) {
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regId,
        data: JSON.stringify({ data: { title: 'מערכת המקוואות', body: 'שמואל הזכיר/ה אותך בדיון', url: 'https://example.org/app/#/talk/abc' }, from: '1', fcmMessageId: 'm1' }) });
      shown = await t.page.evaluate(() => new Promise((resolve) => {
        let n = 0;
        const poll = () => navigator.serviceWorker.ready.then((r) => r.getNotifications()).then((list) => {
          if (list.length || ++n > 40) resolve(list.map((x) => ({ title: x.title, body: x.body, url: (x.data || {}).url, dir: x.dir }))[0] || null);
          else setTimeout(poll, 250);
        });
        poll();
      }));
    }
    check('התראה שהגיעה מוצגת על ידי ה-Service Worker', !!shown, { regId: regId });
    check('עם הכותרת, הגוף והקישור', !!shown && shown.title === 'מערכת המקוואות' && shown.body === 'שמואל הזכיר/ה אותך בדיון' &&
      shown.url === 'https://example.org/app/#/talk/abc' && shown.dir === 'rtl', shown);

    await t.page.click('#umPush');
    await t.page.waitForFunction(() => !localStorage.getItem('mikveh.push') && window.__deleted === true, null, { timeout: 15000 });
    const un = posts.filter((p) => p.action === 'pushUnregister')[0] || { data: {} };
    check('כיבוי מבטל את הרישום בשרת ומוחק את הטוקן מהמכשיר', un.data.token === FCM_TOKEN, un);

    // ---- יציאה מהמערכת מבטלת את הרישום ----
    posts.length = 0;
    await t.page.waitForFunction(() => document.getElementById('userMenu').hidden);
    await t.page.click('#btnUser');
    await t.page.click('#umPush');
    await t.page.waitForFunction(() => !!localStorage.getItem('mikveh.push'), null, { timeout: 15000 });
    await t.page.waitForFunction(() => document.getElementById('userMenu').hidden);
    await t.page.click('#btnUser');
    await t.page.click('#umLogout');
    await t.page.waitForTimeout(800);
    const order = posts.map((p) => p.action);
    check('יציאה מבטלת את רישום המכשיר, לפני מחיקת הסשן',
      order.indexOf('pushUnregister') >= 0 && order.indexOf('pushUnregister') < order.indexOf('logout') &&
      posts.filter((p) => p.action === 'pushUnregister')[0].token === 'sess-1', order);
    check('אין שגיאות', t.errors.length === 0, t.errors);
    await t.ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(fail ? '\n❌ ' + fail + ' נכשלו, ' + pass + ' עברו' : '\n✅ ' + pass + ' עברו');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
