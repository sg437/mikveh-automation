/**
 * מסך החיבור: מחברים את האפליקציה לגיליון בלי לגעת בקוד.
 * מדביקים את כתובת ה-Web App (ואם הוגדרו – טוקן ומזהה Google), לוחצים "בדיקת חיבור",
 * וההגדרות נשמרות במכשיר (localStorage) וגוברות על מה שכתוב ב-config.js.
 */
(function () {
  'use strict';
  const KEY = 'mikveh.connection';
  const MK = () => window.MK;
  const esc = (s) => (window.MK ? MK().esc(s) : String(s == null ? '' : s));

  function saved() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function store(cfg) {
    try {
      if (cfg) localStorage.setItem(KEY, JSON.stringify(cfg)); else localStorage.removeItem(KEY);
      return true;
    } catch (e) { return false; }
  }
  function current() { return window.MIKVEH_CONFIG || {}; }
  function connected() { return !!current().apiUrl; }

  /** בדיקת חיבור מול ?action=ping – מחזירה את תשובת הסקריפט או שגיאה מוסברת */
  function ping(url, token) {
    const u = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'action=ping' + (token ? '&token=' + encodeURIComponent(token) : '');
    return fetch(u, { redirect: 'follow', cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('השרת החזיר שגיאה ' + r.status + '. בדוק שהכתובת היא כתובת ה-Web App המלאה (מסתיימת ב-/exec).'); return r.json(); })
      .then((d) => {
        if (d.error === 'unauthorized') throw new Error('הטוקן שגוי. זה הערך של API_TOKEN ב-Script Properties (אם לא הגדרת – השאר ריק).');
        if (d.error) throw new Error(d.error);
        if (!d.ok) throw new Error('התשובה מהסקריפט לא צפויה');
        return d;
      })
      .catch((err) => {
        if (err.message === 'Failed to fetch') throw new Error('אין מענה מהכתובת. ודא שההרשאה בפריסה היא "Anyone" ושהכתובת הועתקה במלואה.');
        if (err instanceof SyntaxError) throw new Error('הכתובת החזירה דף ולא נתונים – כנראה שזו כתובת העריכה ולא כתובת ה-Web App. העתק מ-Deploy ⇠ Manage deployments ⇠ Web app.');
        throw err;
      });
  }

  const OK = '<span class="badge ok">מוגדר</span>';
  const MISS = '<span class="badge bad">חסר</span>';
  /** "לא מוגדר" עם שם המאפיין שצריך להוסיף ב-Script Properties */
  const NO = (prop, why) => '<span class="badge">לא מוגדר</span> <code dir="ltr">' + prop + '</code>' + (why ? ' <small>' + why + '</small>' : '');

  function statusHtml(d) {
    const p = d.props || {};
    const sheets = (d.sheets || []);
    const missing = sheets.filter((s) => !s.found);
    const rows = [
      ['גיליון הנתונים', d.mikvaotSheet ? '<b>' + esc(d.mikvaotSheetName || '') + '</b>' : MISS + ' <code dir="ltr">MIKVAOT_SHEET_ID</code>'],
      ['לשוניות שנמצאו', sheets.length ? (sheets.length - missing.length) + ' מתוך ' + sheets.length +
        (missing.length ? ' <span class="badge warn">חסרות: ' + esc(missing.map((s) => s.name).join(', ')) + '</span>' : '') : '—'],
      ['טוקן API', d.tokenRequired ? OK : NO('API_TOKEN', '– הכתובת פתוחה לכל מי שיש לו אותה')],
      ['כניסה עם Google', p.googleClientId ? OK : NO('GOOGLE_CLIENT_ID', '– בלעדיו אין תפקידים והרשאות')],
      ['תיקיית מדיה בדרייב', p.archiveFolder ? OK : NO('MIKVEH_ARCHIVE_FOLDER_ID', '– בלעדיו אי אפשר להעלות תמונות')],
      ['קליטת פעולות מהוואטסאפ', p.waAutoActions ? OK : NO('WA_AUTO_ACTIONS=1')],
      ['התראות בוואטסאפ', p.notifyWhatsapp && p.greenApi ? OK : NO('NOTIFY_WHATSAPP=1', '+ חיבור Green API')],
      ['תזכורות תעודה', p.alertChat ? OK : NO('ALERT_CHAT_ID')],
      ['תפקיד ברירת מחדל', p.defaultRole ? '<b>' + esc(p.defaultRole) + '</b>' : 'צופה (ברירת מחדל)'],
    ];
    return '<div class="dl">' + rows.map((r) => '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('') + '</div>';
  }

  function render() {
    const root = document.getElementById('setupBox');
    if (!root) return;
    const cfg = current(), sv = saved();
    const src = window.MK && MK().S.data ? MK().S.data.source : '';
    const state = !cfg.apiUrl ? '<span class="badge bad">לא מחובר</span> – המערכת מציגה עותק לדוגמה בלבד'
      : src === 'live' ? '<span class="badge ok">מחובר לגיליון</span>'
      : src === 'cached' ? '<span class="badge warn">מחובר, אך כרגע ללא רשת</span>'
      : src === 'fallback' ? '<span class="badge bad">הכתובת מוגדרת אך אין מענה</span>'
      : '<span class="badge">בבדיקה</span>';
    root.innerHTML = '<div class="panel"><h3>חיבור לגיליון</h3>' +
      '<p style="font-size:.9rem;margin-bottom:10px">מצב: ' + state + (sv.apiUrl ? ' · ההגדרות נשמרו במכשיר הזה' : '') + '</p>' +
      '<form id="setupForm" class="rform" novalidate><div class="fgrid">' +
      '<div class="ff wide"><label for="s_url">כתובת ה-Web App <span class="req">*</span></label>' +
      '<input id="s_url" type="url" dir="ltr" placeholder="https://script.google.com/macros/s/.../exec" value="' + esc(cfg.apiUrl || '') + '">' +
      '<small class="hint">בעורך הסקריפט: Deploy ⇠ Manage deployments ⇠ Web app ⇠ Copy. ההרשאה צריכה להיות Anyone.</small></div>' +
      '<div class="ff"><label for="s_token">טוקן (API_TOKEN)</label><input id="s_token" type="text" dir="ltr" value="' + esc(cfg.apiToken || '') + '" placeholder="רק אם הגדרת"></div>' +
      '<div class="ff"><label for="s_cid">מזהה Google (Client ID)</label><input id="s_cid" type="text" dir="ltr" value="' + esc(cfg.googleClientId || '') + '" placeholder="....apps.googleusercontent.com"></div>' +
      '</div><div class="factions">' +
      '<button class="btn primary" type="submit" id="s_test">בדיקת חיבור ושמירה</button>' +
      (sv.apiUrl ? '<button class="btn" type="button" id="s_clear">ניתוק</button>' : '') +
      '<span class="fmsg" id="s_msg"></span></div></form>' +
      '<div id="s_status"></div></div>';

    const $ = (id) => root.querySelector(id);
    const msg = $('#s_msg'), status = $('#s_status');
    if (cfg.apiUrl) check(cfg.apiUrl, cfg.apiToken || '', false);

    function check(url, token, save) {
      msg.textContent = 'בודק...'; msg.className = 'fmsg'; status.innerHTML = '';
      return ping(url, token).then((d) => {
        status.innerHTML = statusHtml(d);
        if (save) {
          const cid = $('#s_cid').value.trim();
          if (!store({ apiUrl: url, apiToken: token, googleClientId: cid })) { msg.textContent = 'החיבור תקין, אך לא ניתן לשמור במכשיר הזה'; msg.className = 'fmsg bad'; return d; }
          msg.textContent = 'החיבור תקין ונשמר. טוען מחדש...'; msg.className = 'fmsg ok';
          setTimeout(() => location.reload(), 1200);
        } else { msg.textContent = ''; }
        return d;
      }).catch((err) => { msg.textContent = err.message; msg.className = 'fmsg bad'; status.innerHTML = ''; throw err; });
    }

    $('#setupForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = $('#s_url').value.trim().replace(/\/+$/, '');
      if (!url) { msg.textContent = 'חסרה כתובת'; msg.className = 'fmsg bad'; return; }
      if (!/^https:\/\//i.test(url) && !/^http:\/\/localhost/i.test(url)) { msg.textContent = 'הכתובת חייבת להתחיל ב-https://'; msg.className = 'fmsg bad'; return; }
      check(url, $('#s_token').value.trim(), true).catch(() => {});
    });
    const clr = $('#s_clear');
    if (clr) clr.addEventListener('click', () => { store(null); location.reload(); });
  }

  /** שורת אזהרה בראש המסך כשאין חיבור – עם קישור למסך החיבור */
  function banner(source) {
    const el = document.getElementById('connBanner');
    if (!el) return;
    const src = source || (window.MK && MK().S.data ? MK().S.data.source : '');
    if (src === 'live' || src === 'cached') { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = (src === 'fallback'
      ? '<b>אין מענה מהגיליון.</b> מוצג העותק המקומי האחרון. '
      : '<b>המערכת עדיין לא מחוברת לגיליון.</b> מה שמוצג הוא עותק לדוגמה, ודיווחים חדשים לא נשמרים. ') +
      '<a href="#/settings">פתח את מסך החיבור ⇠</a>';
  }

  window.MikvehSetup = { render, banner, ping, saved, connected };
})();
