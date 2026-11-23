/* Service worker של אפליקציית הדיונים (app/talk/).
   תיקייה נפרדת = scope נפרד, ולכן כרום מציע להתקין אותה כאפליקציה שנייה,
   לצד "מקוואות", במקום לראות בה את אותה אפליקציה. הקבצים המשותפים
   נטענים מהתיקייה שמעל (../), ולכן גם הם נשמרים כאן במטמון.
   להעלות גרסה בכל שינוי. data.js (~3.6MB) אינו ברשימה – הוא רק עותק גיבוי. */
const CACHE = 'mikveh-talk-v15';
const FILES = ['./', './index.html', './manifest.json',
  '../firebase.js', '../analytics.js', '../push.js', '../app.js', '../forms.js', '../talk.js', '../work.js', '../media.js', '../edit.js', '../setup.js',
  '../perms.js', '../projects.js', '../contractor.js', '../auth.js', '../config.js', '../hebdate.js',
  '../talk-icon-192.png', '../talk-icon-512.png', '../talk-icon-maskable-512.png'];

/* קבצי האפליקציה ככתובות מלאות (כולל ../ של התיקייה שמעל). */
const SHELL = FILES.concat(['../data.js']).map((f) => new URL(f, self.location).href);
/* התשובה מהגיליון במטמון נפרד, שאינו נמחק בהעלאת גרסה (כמו ב-sw.js). */
const DATA_CACHE = 'mikveh-data';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    // cache:'reload' מכריח משיכה מהרשת. בלעדיו addAll עובר דרך מטמון ה-HTTP
    // של הדפדפן, ו-GitHub Pages מגיש עם max-age=600 — כך שגרסה שנדחפה
    // בתוך עשר דקות מהקודמת יכולה להיכנס למטמון החדש עם קובץ ישן, ולהיתקע
    // שם עד העלאת הגרסה הבאה.
    .then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.indexOf('mikveh-talk-') === 0).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// מטמון קודם לקבצי האפליקציה, רשת קודם לכל השאר (זהה ל-sw.js של המערכת).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // מדידת השימוש (Firebase Analytics) עוברת ישר לרשת: אין מה לשמור ממנה,
  // ותשובות אטומות (opaque) שלה היו תופסות מקום במטמון הנתונים לחינם.
  if (/(^|\.)(google-analytics\.com|googletagmanager\.com|analytics\.google\.com|firebaseinstallations\.googleapis\.com|firebase\.googleapis\.com|fcmregistrations\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)$/.test(url.hostname)) return;
  // דפי הכניסה של Firebase Authentication (באתר שב-Firebase Hosting) אינם חלק מהאפליקציה
  if (url.origin === self.location.origin && url.pathname.indexOf('/__/') === 0) return;
  // סיווג מפורש ולא לפי request.destination: ל-fetch() רגיל (וכך נטענים
  // הנתונים מהגיליון) ה-destination הוא מחרוזת ריקה, ולא 'empty' כפי שנראה
  // מהשם – וסיווג לפי זה שלח את הנתונים למסלול של קבצי האפליקציה.
  const isShell = e.request.mode === 'navigate' || SHELL.indexOf(url.origin + url.pathname) >= 0;

  if (isShell) {
    e.respondWith(
      // { cacheName } הכרחי: caches.match בלי זה סורק את כל המטמונים של האתר
      // ומחזיר את ההתאמה הראשונה. הקבצים המשותפים (app.js, perms.js, auth.js...)
      // שמורים גם במטמון של אפליקציית הדיונים, וזה הגיש אותם משם — כולל
      // גרסאות ישנות, כי המטמון ההוא מתעדכן רק כשפותחים את הדיונים.
      caches.match(e.request, { cacheName: CACHE }).then((cached) => {
        const net = fetch(e.request).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())).catch(() => {});
          return res;
        });
        if (!cached) return net;
        net.catch(() => {});
        return cached;
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(DATA_CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request, { cacheName: DATA_CACHE }).then((cached) => {
      if (!cached) return Response.error();
      const headers = new Headers(cached.headers);
      headers.set('X-From-Cache', '1');
      return cached.blob().then((body) => new Response(body, { status: cached.status, statusText: cached.statusText, headers }));
    }))
  );
});

// ==================== התראות דחיפה ====================
// ההתראות נשלחות מהשרת דרך Firebase Cloud Messaging (Firebase.js) כ-data בלבד,
// ומוצגות כאן — גם כשהאפליקציה סגורה. אין כאן קוד של Firebase: אירוע push
// רגיל של הדפדפן, כך שה-Service Worker נשאר עצמאי ועובד גם בלי רשת.
const PUSH_ICON = new URL('../talk-icon-192.png', self.location).href;

self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = {}; }
  const d = Object.assign({}, p.notification || {}, p.data || {});
  e.waitUntil(self.registration.showNotification(d.title || 'דיוני המקוואות', {
    body: d.body || '', icon: PUSH_ICON, badge: PUSH_ICON, dir: 'rtl', lang: 'he',
    data: { url: d.url || '' },
  }));
});

// לחיצה על התראה פותחת את האפליקציה הזו במסך שההתראה מדברת עליו. מהקישור
// נלקח רק ה-hash (#/talk/...): האפליקציה נפתחת תמיד מהכתובת שבה היא מותקנת
// במכשיר, גם אם הקישור שבהודעה מצביע על כתובת אחרת של אותה מערכת.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  let hash = '';
  try { hash = new URL((e.notification.data || {}).url || '', scope).hash; } catch (err) { hash = ''; }
  const target = scope + hash;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const own = list.filter((c) => { const u = c.url.split('#')[0].split('?')[0]; return u === scope || u === scope + 'index.html'; })[0];
    if (!own) return self.clients.openWindow(target);
    return own.focus()
      .then((c) => (hash && c && c.navigate ? c.navigate(target) : c))
      .catch(() => self.clients.openWindow(target));
  }));
});
