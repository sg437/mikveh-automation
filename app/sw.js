/* Service worker: מטמון של קבצי האפליקציה לעבודה לא מקוונת. להעלות גרסה בכל שינוי. */
const CACHE = 'mikveh-app-v1';
const FILES = ['./', './index.html', './app.js', './hebdate.js', './data.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// רשת קודם, ואם אין רשת – מהמטמון (כך שעדכון נתונים תמיד מגיע כשיש חיבור)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
