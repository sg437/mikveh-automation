/**
 * שני דברים שקורים לפני שרואים את המערכת:
 *
 * 1. **מסך נעילה** (MikvehGate) — מי שפותח את הקישור ואינו מחובר רואה מסך
 *    כניסה, ולא את הנתונים. עד כה הקישור פתח את המערכת ישר, עם עותק
 *    ההדגמה המלא (data.js) ועם מסך ההגדרות — לכל מי שהקישור הגיע אליו.
 *
 * 2. **כפתור התקנה** (MikvehInstall) — כרום מציע "התקנת אפליקציה" רק לפי
 *    שיקול דעתו, ובדפדפן הפנימי של וואטסאפ הוא לא מציע כלל. הכפתור כאן
 *    מוצג תמיד (כל עוד האפליקציה לא מותקנת), ומסביר מה לעשות בכל דפדפן.
 *
 * נטען אחרי app.js ולפני auth.js.
 */
(function () {
  'use strict';
  const DISMISS = 'mikveh.install.hidden';
  const esc = (s) => (window.MK ? MK.esc(s) : String(s == null ? '' : s));

  // ============================================================ התקנה
  let prompt_ = null;

  function standalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
    } catch (e) { return false; }
  }
  const ua = () => navigator.userAgent || '';
  const isIOS = () => /iPad|iPhone|iPod/.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
  /** דפדפן פנימי של אפליקציה (וואטסאפ, פייסבוק...) — שם אין התקנה כלל. */
  const inApp = () => /FBAN|FBAV|Instagram|Line\/|MicroMessenger|WhatsApp|GSA\//i.test(ua()) ||
    (/Android/.test(ua()) && /; wv\)/.test(ua()));

  function howTo() {
    if (inApp()) {
      return 'הקישור נפתח בדפדפן הפנימי של וואטסאפ, ושם אי אפשר להתקין. ' +
        'לחצו על ⋮ (או על ⋯) בפינה ➜ <b>פתיחה בדפדפן</b>, ומשם אפשר להתקין.';
    }
    if (isIOS()) {
      return 'בספארי: לחצו על כפתור השיתוף <b>⬆️</b> שבתחתית המסך ➜ <b>הוספה למסך הבית</b>.';
    }
    return 'בתפריט הדפדפן (⋮ בפינה) ➜ <b>התקנת אפליקציה</b> או <b>הוספה למסך הבית</b>.';
  }

  function dismissed() { try { return localStorage.getItem(DISMISS) === '1'; } catch (e) { return false; } }
  function dismiss() { try { localStorage.setItem(DISMISS, '1'); } catch (e) { /* ignore */ } }

  /** האם בכלל יש מה להציע (מותקן = אין). */
  function installable() { return !standalone(); }

  function barHtml() {
    return '<div class="ib-main"><span class="ic">📲</span>' +
      '<div class="ib-txt"><b>התקנת האפליקציה</b><small>אייקון בטלפון, פתיחה מהירה ועבודה גם בלי רשת</small></div>' +
      '<button class="btn small primary" id="ibGo" type="button">התקנה</button>' +
      '<button class="ib-x" id="ibX" type="button" aria-label="סגירה">✕</button></div>' +
      '<div class="ib-how" id="ibHow" hidden></div>';
  }

  function render() {
    const bar = document.getElementById('installBar');
    if (!bar) return;
    if (!installable() || dismissed()) { bar.hidden = true; bar.innerHTML = ''; return; }
    if (bar.dataset.on === '1') return; // כבר מצויר — לא לאפס פתיחה שהמשתמש עשה
    bar.dataset.on = '1';
    bar.hidden = false;
    bar.innerHTML = barHtml();
    bar.querySelector('#ibX').addEventListener('click', () => { dismiss(); bar.hidden = true; bar.dataset.on = ''; });
    bar.querySelector('#ibGo').addEventListener('click', () => install(bar.querySelector('#ibHow')));
  }

  /** התקנה בלחיצה: חלון ההתקנה של כרום אם יש, אחרת הסבר לדפדפן הנוכחי. */
  function install(howEl) {
    const how = howEl || document.getElementById('ibHow');
    if (prompt_) {
      const p = prompt_;
      prompt_ = null;
      p.prompt();
      p.userChoice.then((res) => {
        if (res && res.outcome === 'accepted') { const bar = document.getElementById('installBar'); if (bar) { bar.hidden = true; bar.dataset.on = ''; } }
        else if (how) { how.hidden = false; how.innerHTML = howTo(); }
      }).catch(() => { if (how) { how.hidden = false; how.innerHTML = howTo(); } });
      return;
    }
    if (how) { how.hidden = !how.hidden; how.innerHTML = howTo(); }
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt_ = e; render(); });
  window.addEventListener('appinstalled', () => {
    prompt_ = null;
    const bar = document.getElementById('installBar');
    if (bar) { bar.hidden = true; bar.dataset.on = ''; }
  });

  // ============================================================ מסך נעילה
  /**
   * מצבים:
   *   login   — יש חיבור לגיליון והשרת דורש כניסה (המצב הרגיל לכל מי שפותח
   *             את הקישור בפעם הראשונה).
   *   noconn  — האפליקציה כלל לא מחוברת לגיליון. כאן אין למי להיכנס, ולכן
   *             מוצגת הודעה + כניסת מנהל למסך החיבור.
   *   offline — מוגדר חיבור, אין רשת, ואין סשן שמורה במכשיר.
   */
  function show(mode, data) {
    // "לא מחובר" + #/settings = מנהל שבא לחבר את האפליקציה לגיליון
    if (mode === 'noconn' && /^#\/settings/.test(location.hash || '')) return showSettings();
    document.body.classList.add('locked');
    document.body.classList.remove('nav-open');
    const main = document.querySelector('main');
    if (!main) return;
    const err = (data && data.loadError) || '';
    const head = '<div class="gate-head"><div class="gate-logo">🕍</div>' +
      '<h2>מערכת כשרות המקוואות</h2><p class="gate-sub">טהרת המשפחה · כרטיס לכל מקווה</p></div>';

    let body;
    if (mode === 'noconn') {
      body = '<p>המערכת אינה מחוברת לגיליון במכשיר הזה, ולכן אין מה להציג.</p>' +
        '<p class="gate-note">אם קיבלת את הקישור וזה מה שאתה רואה — כנראה שהאפליקציה פורסמה בלי כתובת הגיליון. ' +
        'מנהל המערכת מגדיר אותה פעם אחת, והיא מגיעה מוכנה לכל מי שפותח את הקישור.</p>' +
        '<a class="btn" href="#/settings" id="gateSetup">⚙️ חיבור לגיליון (למנהל המערכת)</a>';
    } else if (mode === 'offline') {
      body = '<p>אין כרגע חיבור לגיליון, ואין במכשיר הזה כניסה שמורה.</p>' +
        (err ? '<p class="gate-note">' + esc(err) + '</p>' : '') +
        '<button class="btn primary" id="gateReload" type="button">נסה שוב</button>';
    } else {
      body = '<p>כדי להיכנס למערכת נדרשת כניסה עם חשבון Google.</p>' +
        '<button class="btn primary big" id="gateLogin" type="button">🔐 כניסה עם Google</button>' +
        '<p class="gate-note">רק משתמשים שמנהל המערכת הוסיף מראש יכולים להיכנס. ' +
        'אם אין לך הרשאה — פנה למנהל כדי שיוסיף את כתובת הג׳ימייל שלך.</p>';
    }

    main.innerHTML = '<section class="gate">' + head + '<div class="gate-body">' + body + '</div></section>';
    const login = document.getElementById('gateLogin');
    if (login) login.addEventListener('click', () => { if (window.MikvehAuth) MikvehAuth.openLogin(null); });
    const reload = document.getElementById('gateReload');
    if (reload) reload.addEventListener('click', () => location.reload());
    const setup = document.getElementById('gateSetup');
    if (setup) {
      // מסך ההגדרות חי בתוך main, שאותו בדיוק החלפנו — ולכן פותחים אותו
      // בטעינה מחדש עם ה-hash, ולא בניווט פנימי.
      setup.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#/settings'; location.reload(); });
    }
    render();
  }

  /** מסך ההגדרות במצב "לא מחובר" – אותו main, בלי שאר המסכים. */
  function showSettings() {
    document.body.classList.add('locked');
    const main = document.querySelector('main');
    if (!main) return;
    main.innerHTML = '<section class="gate-settings"><div class="note-box">האפליקציה אינה מחוברת לגיליון. ' +
      'הדביקו כאן את כתובת ה-Web App של הסקריפט, והמערכת תתחבר.</div>' +
      '<div id="setupBox"></div><p class="legal-links"><a href="#/" id="gateBack">חזרה</a></p></section>';
    if (window.MikvehSetup) MikvehSetup.render();
    const back = document.getElementById('gateBack');
    if (back) back.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#/'; location.reload(); });
    render();
  }

  window.MikvehInstall = { render, install, installable, standalone, howTo };
  window.MikvehGate = { show, showSettings, locked: () => document.body.classList.contains('locked') };
})();
