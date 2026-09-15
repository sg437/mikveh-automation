/* Service worker של אפליקציית הדיונים (app/talk/).
   תיקייה נפרדת = scope נפרד, ולכן כרום מציע להתקין אותה כאפליקציה שנייה,
   לצד "מקוואות", במקום לראות בה את אותה אפליקציה. הקבצים המשותפים
   נטענים מהתיקייה שמעל (../), ולכן גם הם נשמרים כאן במטמון.
   להעלות גרסה בכל שינוי. data.js (~3.6MB) אינו ברשימה – הוא רק עותק גיבוי. */
const CACHE = 'mikveh-talk-v5';
const FILES = ['./', './index.html', './manifest.json',
  '../app.js', '../forms.js', '../talk.js', '../work.js', '../media.js', '../edit.js', '../setup.js',
  '../perms.js', '../projects.js', '../contractor.js', '../auth.js', '../config.js', '../hebdate.js',
  '../talk-icon-192.png', '../talk-icon-512.png', '../talk-icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.indexOf('mikveh-talk-') === 0).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// רשת קודם, ואם אין רשת – מהמטמון (זהה ל-sw.js של המערכת).
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
