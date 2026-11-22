/**
 * Firebase Analytics — מדידת שימוש במערכת.
 *
 * מה נשלח: שם המסך, סוג הפעולה שבוצעה (למשל "נרשם דיווח"), כניסה ויציאה,
 * התקנת האפליקציה, ותפקיד המשתמש. מה **לא** נשלח לעולם: שמות, אימיילים,
 * טלפונים, שמות מקוואות או מזהים שלהם, ותוכן של דיווחים, דוחות והודעות.
 *
 * מתי זה פועל:
 *   - רק כשפרטי פרויקט ה-Firebase מוגדרים ב-config.js (firebaseApiKey,
 *     firebaseProjectId, firebaseAppId). ריק = המודול כולו כבוי ואינו טוען דבר.
 *   - רק אחרי שהמערכת נפתחה למשתמש מחובר. במסך הנעילה לא נטען שום קוד מדידה,
 *     כך שמי שרק פתח את הקישור אינו נמדד.
 *
 * ה-SDK נטען לפי דרישה מ-gstatic ולא חוסם את פתיחת האפליקציה. כל כישלון
 * (אין רשת, חוסם פרסומות) נבלע בשקט — המדידה לעולם אינה מפילה את המערכת.
 *
 * נטען מיד אחרי config.js, לפני app.js, כדי ש-MikvehAnalytics יהיה קיים
 * בכל מקום שקורא לו.
 */
(function () {
  'use strict';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.0/';
  const LOGIN_FLAG = 'mikveh.fa.login';
  const MAX_QUEUE = 50;

  let fa = null;        // מופע ה-Analytics, אחרי שנטען
  let started = false;  // start() כבר נקרא
  let queue = [];       // אירועים שנרשמו לפני שה-SDK נטען
  let lastScreen = '';

  function cfg() {
    const c = window.MIKVEH_CONFIG || {};
    if (!c.firebaseApiKey || !c.firebaseProjectId || !c.firebaseAppId) return null;
    const out = { apiKey: c.firebaseApiKey, projectId: c.firebaseProjectId, appId: c.firebaseAppId };
    if (c.firebaseMeasurementId) out.measurementId = c.firebaseMeasurementId;
    return out;
  }
  function enabled() { return !!cfg(); }

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = SDK + file;
      sc.async = true;
      sc.crossOrigin = 'anonymous';
      sc.onload = resolve;
      sc.onerror = () => reject(new Error('טעינת ' + file + ' נכשלה'));
      document.head.appendChild(sc);
    });
  }

  function send(name, params) { try { fa.logEvent(name, params || {}); } catch (e) { /* ignore */ } }

  /** רישום אירוע. לפני שה-SDK נטען — נשמר בתור (רק אחרי start; במסך הנעילה נזרק). */
  function track(name, params) {
    if (!enabled()) return;
    if (fa) return send(name, params);
    if (started && queue.length < MAX_QUEUE) queue.push([name, params]);
  }

  /** addAction ➜ add_action. שמות אירועים ב-Analytics: אותיות לטיניות, ספרות וקו תחתון. */
  function eventName(action) {
    return String(action || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
  }

  /**
   * פעולה שנכתבה לשרת (נקרא מ-DataSource.postRaw אחרי הצלחה).
   * כניסה ממסך הנעילה גוררת טעינה מחדש של הדף, ולכן היא נשמרת בדגל ונרשמת
   * אחרי הטעינה — אז גם ידוע שהמשתמש אכן מורשה.
   */
  function action(name) {
    if (!enabled() || !name) return;
    if (name === 'login') {
      if (!started) { try { sessionStorage.setItem(LOGIN_FLAG, '1'); } catch (e) { /* ignore */ } return; }
      userProps();
      return track('login', { method: 'google' });
    }
    track(eventName(name));
  }

  /** פעולה שנשמרה במכשיר בלי רשת וממתינה לשליחה. */
  function queued(name) { track('offline_queued', { action: eventName(name) }); }

  /**
   * מסך שנפתח. נשלח רק שם המסך והלשונית — לעולם לא מזהה המקווה או שם הקבוצה
   * שבכתובת (#/m/<מזהה>/<לשונית> ➜ "card/<לשונית>").
   */
  function screen(hash) {
    if (!enabled()) return;
    const parts = String(hash || '#/').replace(/^#\/?/, '').split('/');
    const view = parts[0] || 'home';
    let name = /^[a-z]+$/.test(view) ? view : 'list';
    if (view === 'm') name = 'card/' + (/^[a-z]+$/.test(parts[2] || '') ? parts[2] : 'details');
    else if (view === 'plan' && /^[a-z]+$/.test(parts[1] || '')) name = 'plan/' + parts[1];
    else if ((view === 'talk' || view === 'work') && parts[1]) name = view + '/thread';
    if (name === lastScreen) return; // ציור מחדש של אותו מסך אינו צפייה חדשה
    lastScreen = name;
    track('screen_view', { firebase_screen: name, screen_name: name });
  }

  function standalone() {
    try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; }
  }

  /** מאפייני משתמש: תפקיד, איזו אפליקציה, והאם מותקנת. בלי שום מזהה אישי. */
  function userProps() {
    if (!fa) return;
    try {
      const u = (window.MikvehAuth && MikvehAuth.me && MikvehAuth.me()) || {};
      fa.setUserProperties({
        role: String(u.role || '').slice(0, 36),
        app: window.TALK_APP ? 'talk' : 'main',
        installed: standalone() ? 'yes' : 'no',
      });
    } catch (e) { /* ignore */ }
  }

  /** נקרא מ-app.js כשהמערכת נפתחה למשתמש (לא במסך הנעילה). טוען את ה-SDK פעם אחת. */
  function start() {
    const c = cfg();
    if (!c || started) return;
    started = true;
    try { if (sessionStorage.getItem(LOGIN_FLAG)) { sessionStorage.removeItem(LOGIN_FLAG); queue.unshift(['login', { method: 'google' }]); } } catch (e) { /* ignore */ }
    loadScript('firebase-app-compat.js')
      .then(() => loadScript('firebase-analytics-compat.js'))
      .then(() => window.firebase.analytics.isSupported())
      .then((ok) => {
        if (!ok) { queue = []; return; }
        const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(c);
        fa = window.firebase.analytics(app);
        userProps();
        const q = queue; queue = [];
        q.forEach((ev) => send(ev[0], ev[1]));
      })
      .catch(() => { queue = []; }); // אין רשת או חוסם — ממשיכים בלי מדידה
  }

  window.addEventListener('appinstalled', () => track('pwa_install'));

  window.MikvehAnalytics = { start, track, action, queued, screen, enabled };
})();
