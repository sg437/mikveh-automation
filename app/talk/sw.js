/* Service worker של אפליקציית הדיונים (app/talk/).
   תיקייה נפרדת = scope נפרד, ולכן כרום מציע להתקין אותה כאפליקציה שנייה,
   לצד "מקוואות", במקום לראות בה את אותה אפליקציה. הקבצים המשותפים
   נטענים מהתיקייה שמעל (../), ולכן גם הם נשמרים כאן במטמון.
   להעלות גרסה בכל שינוי. data.js (~3.6MB) אינו ברשימה – הוא רק עותק גיבוי. */
const CACHE = 'mikveh-talk-v12';
const FILES = ['./', './index.html', './manifest.json',
  '../app.js', '../forms.js', '../talk.js', '../work.js', '../media.js', '../edit.js', '../setup.js',
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
