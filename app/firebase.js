/**
 * טעינה משותפת של Firebase — לכל מי שצריך אותו באפליקציה:
 * מדידת השימוש (analytics.js), כניסה דרך Firebase Authentication (auth.js)
 * והתראות דחיפה (push.js).
 *
 * שום דבר אינו נטען עד שמישהו מבקש: ה-SDK נמשך מ-gstatic רק בקריאה ל-use(),
 * וכל קובץ נטען פעם אחת גם אם שניים ביקשו אותו יחד. בלי פרטי הפרויקט
 * ב-config.js (firebaseApiKey, firebaseProjectId, firebaseAppId) הכל כבוי.
 *
 * נטען מיד אחרי config.js.
 */
(function () {
  'use strict';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.0/';
  const loading = {};

  function cfg() {
    const c = window.MIKVEH_CONFIG || {};
    if (!c.firebaseApiKey || !c.firebaseProjectId || !c.firebaseAppId) return null;
    const out = { apiKey: c.firebaseApiKey, projectId: c.firebaseProjectId, appId: c.firebaseAppId,
      authDomain: c.firebaseProjectId + '.firebaseapp.com' };
    // מספר הפרויקט (נדרש להתראות) הוא החלק השני של ה-appId: "1:<מספר>:web:<מזהה>"
    const sender = String(c.firebaseAppId).split(':')[1] || '';
    if (/^\d+$/.test(sender)) out.messagingSenderId = sender;
    if (c.firebaseMeasurementId) out.measurementId = c.firebaseMeasurementId;
    return out;
  }
  function enabled() { return !!cfg(); }

  function load(file) {
    if (loading[file]) return loading[file];
    loading[file] = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = SDK + file;
      sc.async = true;
      sc.crossOrigin = 'anonymous';
      sc.onload = resolve;
      sc.onerror = () => { delete loading[file]; reject(new Error('טעינת ' + file + ' נכשלה (אין רשת?)')); };
      document.head.appendChild(sc);
    });
    return loading[file];
  }

  /** האפליקציה של Firebase, מאותחלת פעם אחת. */
  function app() {
    const c = cfg();
    if (!c) return Promise.reject(new Error('Firebase אינו מוגדר'));
    return load('firebase-app-compat.js')
      .then(() => (window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(c)));
  }

  /** טעינת מודול ('analytics' / 'auth' / 'messaging'), אחרי האפליקציה. */
  function use(module) {
    return app().then((a) => load('firebase-' + module + '-compat.js').then(() => a));
  }

  window.MikvehFirebase = { cfg, enabled, load, app, use };
})();
