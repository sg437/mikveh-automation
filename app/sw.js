/* Service worker: מטמון של קבצי האפליקציה לעבודה לא מקוונת. להעלות גרסה בכל שינוי.
   data.js (~3.6MB) אינו ברשימה בכוונה: הוא רק עותק גיבוי, והכללתו גרמה להורדה
   מחדש של 3.6MB בכל העלאת גרסה. הוא נכנס למטמון לבד אם וכאשר הוא נטען. */
const CACHE = 'mikveh-app-v52';
/* התשובה מהגיליון נשמרת במטמון נפרד, שאינו נמחק בהעלאת גרסה: האפליקציה
   מציגה אותו מיד בפתיחה, לפני שהרשת עונה, ולא היה טעם שהעלאת גרסה תחזיר
   כל אחד להמתנה מלאה בפתיחה שאחריה. */
const DATA_CACHE = 'mikveh-data';
const FILES = ['./', './index.html', './firebase.js', './analytics.js', './push.js', './app.js', './forms.js', './talk.js', './work.js', './media.js', './edit.js', './gate.js', './setup.js', './ask.js', './joinform.js', './perms.js', './projects.js', './contractor.js', './auth.js', './config.js', './hebdate.js', './manifest.json',
  './privacy.html', './terms.html', './legal.css',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './talk-icon-192.png', './talk-icon-512.png', './talk-icon-maskable-512.png'];
/* קבצי האפליקציה, ככתובות מלאות. data.js נוסף כאן אך לא ל-FILES: הוא נטען
   רק לפי דרישה, ואין סיבה להוריד 3.6MB מראש – אבל אם כבר הורד, שיגיע מהמטמון. */
const SHELL = FILES.concat(['./data.js']).map((f) => new URL(f, self.location).href);

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
    // רק המטמונים של המערכת. המטמון של אפליקציית הדיונים (mikveh-talk-*) שייך
    // ל-service worker אחר באותו מקור, ומחיקתו כאן הייתה מרוקנת לו את המטמון.
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.indexOf('mikveh-app-') === 0).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** תשובה מהמטמון, מסומנת ב-X-From-Cache כדי שהאפליקציה תציג "עותק שמור". */
function fromCache(cached) {
  const headers = new Headers(cached.headers);
  headers.set('X-From-Cache', '1');
  return cached.blob().then((body) => new Response(body, { status: cached.status, statusText: cached.statusText, headers }));
}

// שתי התנהגויות שונות, כי מדובר בשני דברים שונים:
//
// 1. קבצי האפליקציה עצמם (index.html, app.js וכו' – כ-318KB ב-15 קבצים):
//    **מטמון קודם**. הם משתנים רק כשמעלים גרסה, ולכן אין סיבה להמתין לרשת
//    בכל פתיחה. במקביל נשלחת בקשה ברקע שמעדכנת את המטמון לפעם הבאה.
//    (שינוי אמיתי ממילא מגיע דרך CACHE חדש ב-install, ולכן זה לא "תוקע" גרסה.)
// 2. כל השאר, ובראשו ?action=data מהגיליון: **רשת קודם**, כדי שנתונים
//    יהיו עדכניים, ומהמטמון רק כשאין רשת.
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
        // גם כאן: בלי no-cache הרענון יכול לכתוב בחזרה את אותו קובץ ישן
        const fresh = e.request.mode === 'navigate' ? e.request
          : new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' });
        const net = fetch(fresh).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())).catch(() => {});
          return res;
        });
        if (!cached) return net;
        net.catch(() => {}); // רענון ברקע; כישלון רשת אינו מעניין כשיש עותק
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
      return fromCache(cached);
    }))
  );
});

// ==================== התראות דחיפה ====================
// ההתראות נשלחות מהשרת דרך Firebase Cloud Messaging (Firebase.js) כ-data בלבד,
// ומוצגות כאן — גם כשהאפליקציה סגורה. אין כאן קוד של Firebase: אירוע push
// רגיל של הדפדפן, כך שה-Service Worker נשאר עצמאי ועובד גם בלי רשת.
const PUSH_ICON = new URL('./icon-192.png', self.location).href;

self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = {}; }
  const d = Object.assign({}, p.notification || {}, p.data || {});
  e.waitUntil(self.registration.showNotification(d.title || 'מערכת המקוואות', {
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
