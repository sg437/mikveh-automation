/* Service worker: מטמון של קבצי האפליקציה לעבודה לא מקוונת. להעלות גרסה בכל שינוי.
   data.js (~3.6MB) אינו ברשימה בכוונה: הוא רק עותק גיבוי, והכללתו גרמה להורדה
   מחדש של 3.6MB בכל העלאת גרסה. הוא נכנס למטמון לבד אם וכאשר הוא נטען. */
const CACHE = 'mikveh-app-v40';
/* התשובה מהגיליון נשמרת במטמון נפרד, שאינו נמחק בהעלאת גרסה: האפליקציה
   מציגה אותו מיד בפתיחה, לפני שהרשת עונה, ולא היה טעם שהעלאת גרסה תחזיר
   כל אחד להמתנה מלאה בפתיחה שאחריה. */
const DATA_CACHE = 'mikveh-data';
const FILES = ['./', './index.html', './app.js', './forms.js', './talk.js', './work.js', './media.js', './edit.js', './setup.js', './perms.js', './projects.js', './contractor.js', './auth.js', './config.js', './hebdate.js', './manifest.json',
  './privacy.html', './terms.html', './legal.css',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './talk-icon-192.png', './talk-icon-512.png', './talk-icon-maskable-512.png'];
/* קבצי האפליקציה, ככתובות מלאות. data.js נוסף כאן אך לא ל-FILES: הוא נטען
   רק לפי דרישה, ואין סיבה להוריד 3.6MB מראש – אבל אם כבר הורד, שיגיע מהמטמון. */
const SHELL = FILES.concat(['./data.js']).map((f) => new URL(f, self.location).href);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
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
  // סיווג מפורש ולא לפי request.destination: ל-fetch() רגיל (וכך נטענים
  // הנתונים מהגיליון) ה-destination הוא מחרוזת ריקה, ולא 'empty' כפי שנראה
  // מהשם – וסיווג לפי זה שלח את הנתונים למסלול של קבצי האפליקציה.
  const isShell = e.request.mode === 'navigate' || SHELL.indexOf(url.origin + url.pathname) >= 0;

  if (isShell) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const net = fetch(e.request).then((res) => {
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
    }).catch(() => caches.match(e.request).then((cached) => {
      if (!cached) return Response.error();
      return fromCache(cached);
    }))
  );
});
