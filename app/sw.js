/* Service worker: מטמון של קבצי האפליקציה לעבודה לא מקוונת. להעלות גרסה בכל שינוי.
   data.js (~3.6MB) אינו ברשימה בכוונה: הוא רק עותק גיבוי, והכללתו גרמה להורדה
   מחדש של 3.6MB בכל העלאת גרסה. הוא נכנס למטמון לבד אם וכאשר הוא נטען. */
const CACHE = 'mikveh-app-v30';
const FILES = ['./', './index.html', './app.js', './forms.js', './talk.js', './work.js', './media.js', './edit.js', './setup.js', './perms.js', './projects.js', './contractor.js', './auth.js', './config.js', './hebdate.js', './manifest.json',
  './privacy.html', './terms.html', './legal.css',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './talk-icon-192.png', './talk-icon-512.png', './talk-icon-maskable-512.png'];

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

// רשת קודם, ואם אין רשת – מהמטמון (כך שעדכון נתונים תמיד מגיע כשיש חיבור).
// תשובה מהמטמון מסומנת בכותרת X-From-Cache כדי שהאפליקציה תציג "עותק שמור".
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then((cached) => {
      if (!cached) return Response.error();
      const headers = new Headers(cached.headers);
      headers.set('X-From-Cache', '1');
      return cached.blob().then((body) => new Response(body, { status: cached.status, statusText: cached.statusText, headers }));
    }))
  );
});
