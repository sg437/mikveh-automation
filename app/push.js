/**
 * התראות דחיפה (Firebase Cloud Messaging) — "התראות במכשיר הזה".
 *
 * המשתמש מפעיל אותן בתפריט שלו. הדפדפן מבקש הרשאה, המכשיר מקבל טוקן מ-FCM,
 * והטוקן נרשם בשרת על שם המשתמש (Firebase.js ➜ Firestore). מאותו רגע כל
 * התראה אישית — אזכור בדיון, משימה, בקשת גישה — מגיעה גם למכשיר הזה.
 *
 * ההתראה עצמה מוצגת על ידי ה-Service Worker (sw.js), גם כשהאפליקציה סגורה.
 * כאן רק ההפעלה, הכיבוי והרענון היומי של הרישום. ה-SDK של Firebase נטען
 * רק כשמפעילים, ופעם ביום לרענון — לא בכל פתיחה.
 *
 * מוצג רק כשהשרת מדווח שהתראות מוגדרות אצלו (data.pushEnabled).
 */
(function () {
  'use strict';
  const KEY = 'mikveh.push';
  const DAY = 24 * 3600 * 1000;
  const MK = () => window.MK;

  function saved() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } }
  function save(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);

  /** האם הדפדפן הזה מסוגל לקבל התראות. */
  function supported() {
    return !!(window.MikvehFirebase && MikvehFirebase.enabled() &&
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  }
  /** האם השרת מוגדר לשלוח (אחרת אין טעם להציע). */
  function offered() { const K = MK(); return !!(K && K.S.data && K.S.data.pushEnabled); }
  function available() { return offered() && supported(); }
  function isOn() { return supported() && !!saved().token && Notification.permission === 'granted'; }

  /** למה אי אפשר להפעיל כאן, במילים של המשתמש. */
  function why() {
    if (supported()) return Notification.permission === 'denied' ? 'ההתראות חסומות בהגדרות הדפדפן לאתר הזה.' : '';
    if (isIOS()) return 'באייפון ההתראות פועלות רק באפליקציה המותקנת: שיתוף ⬆️ ➜ הוספה למסך הבית, ולפתוח משם.';
    return 'הדפדפן הזה אינו תומך בהתראות.';
  }

  function messaging() {
    return MikvehFirebase.use('messaging')
      .then(() => window.firebase.messaging.isSupported())
      .then((ok) => { if (!ok) throw new Error('הדפדפן הזה אינו תומך בהתראות'); return window.firebase.messaging(); });
  }
  /** הטוקן של המכשיר, על ה-Service Worker של האפליקציה עצמה (לא SW נפרד של Firebase). */
  function fetchToken() {
    return Promise.all([messaging(), navigator.serviceWorker.ready])
      .then(([m, reg]) => m.getToken({ serviceWorkerRegistration: reg }));
  }
  function uaLabel() {
    const ua = navigator.userAgent || '';
    const os = /Android/.test(ua) ? 'Android' : isIOS() ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return (br + ' ' + os).trim();
  }
  function register(token) {
    return MK().DataSource.post('pushRegister', { token: token, app: window.TALK_APP ? 'talk' : 'main', ua: uaLabel() });
  }

  /** הפעלה: הרשאה ➜ טוקן ➜ רישום בשרת. נקרא מלחיצה של המשתמש. */
  function enable() {
    if (!supported()) return Promise.reject(new Error(why()));
    return Promise.resolve(Notification.requestPermission())
      .then((p) => { if (p !== 'granted') throw new Error('לא ניתנה הרשאה להתראות. אפשר לאשר אותה בהגדרות הדפדפן לאתר הזה.'); return fetchToken(); })
      .then((token) => {
        if (!token) throw new Error('המכשיר לא קיבל טוקן להתראות');
        return register(token).then(() => { save({ token: token, at: Date.now() }); return token; });
      });
  }

  /** כיבוי: ביטול הרישום בשרת ומחיקת הטוקן מהמכשיר. */
  function disable() {
    const s = saved();
    save(null);
    const un = s.token ? MK().DataSource.post('pushUnregister', { token: s.token }).catch(() => {}) : Promise.resolve();
    return un.then(() => messaging().then((m) => m.deleteToken()).catch(() => {}));
  }

  /**
   * יציאה מהמערכת: המכשיר מפסיק לקבל התראות של מי שיצא. נקרא לפני שהסשן
   * נמחק, כי ביטול הרישום בשרת דורש אותו.
   */
  function onLogout(sessionToken) {
    const s = saved();
    if (!s.token) return;
    save(null);
    try { MK().DataSource.postRaw('pushUnregister', { token: s.token }, sessionToken).catch(() => {}); } catch (e) { /* ignore */ }
  }

  /**
   * רענון הרישום, פעם ביום לכל היותר: FCM מחליף טוקנים מדי פעם, והשרת
   * מוחק מכשירים ישנים לפי מועד השימוש האחרון. נקרא בפתיחת האפליקציה.
   */
  function refresh() {
    if (!available() || !isOn()) return;
    if (!(window.MikvehAuth && MikvehAuth.me && MikvehAuth.me())) return;
    const s = saved();
    if (Date.now() - (s.at || 0) < DAY) return;
    fetchToken()
      .then((token) => (token ? register(token).then(() => save({ token: token, at: Date.now() })) : null))
      .catch(() => {}); // אין רשת, או שהשרת עוד לא מוגדר — ננסה בפתיחה הבאה
  }

  window.MikvehPush = { supported, offered, available, isOn, why, enable, disable, onLogout, refresh };
})();
