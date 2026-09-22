/**
 * כניסה עם Google, סשן במכשיר, תפריט משתמש וניהול משתמשים (למנהל).
 * נטען אחרי app.js. כשהשרת לא הגדיר GOOGLE_CLIENT_ID – נשאר מצב "מי אני" הישן.
 */
(function () {
  'use strict';
  const KEY = 'mikveh.session';
  const ROLES = ['מנהל', 'מפקח', 'קבלן', 'צופה'];
  const ROLE_ALIASES = { 'בלנית': 'קבלן' }; // שם תפקיד ישן שנשמר בגיליון
  const roleOf = (r) => ROLE_ALIASES[String(r || '').trim()] || String(r || '').trim();
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  function session() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      // הסשן נשמר במכשיר ל-90 יום, ולכן יכול להחזיק שם תפקיד מלפני ההסבה
      // ("בלנית" ⟵ "קבלן"). מנרמלים כאן, בנקודה שדרכה עוברות כל הקריאות:
      // כפתור הכותרת, תפריט המשתמש, מסך המשתמשים ובדיקות ההרשאה.
      if (s && s.user) s.user.role = roleOf(s.user.role);
      return s;
    } catch (e) { return null; }
  }
  function saveSession(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function enabled() { const K = MK(); return !!(K && K.S.data && K.S.data.authEnabled); }
  function me() { const s = session(); return s && s.user ? s.user : null; }

  // ---- כפתור המשתמש בכותרת ----
  function renderUserButton() {
    const K = MK(), b = K.$('#btnUser');
    if (!enabled()) return;
    const u = me();
    b.innerHTML = u ? (u.picture ? '<img class="avatar" src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : '👤') + ' ' + esc(u.name) + ' <small>(' + esc(u.role) + ')</small>' : '🔐 כניסה עם Google';
  }

  // ---- חלון כניסה ----
  let gisReady = null;
  function loadGis() {
    if (window.google && google.accounts) return Promise.resolve();
    if (gisReady) return gisReady;
    gisReady = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true;
      sc.onload = resolve; sc.onerror = () => { gisReady = null; reject(new Error('לא ניתן לטעון את הכניסה של Google (אין רשת?)')); };
      document.head.appendChild(sc);
    });
    return gisReady;
  }
  let loginCb = null;
  function openLogin(cb) {
    loginCb = cb || null;
    const K = MK();
    K.$('#loginModal').hidden = false;
    const box = K.$('#gsiButton'); box.innerHTML = '<div class="hint">טוען את הכניסה של Google...</div>';
    // הערך מהשרת קודם: הוא תמיד הנכון. ההגדרה במכשיר נשארת כגיבוי בלבד.
    const cid = (K.S.data && K.S.data.googleClientId) || (window.MIKVEH_CONFIG || {}).googleClientId;
    if (!cid) {
      box.innerHTML = '<div class="fmsg bad">לא הוגדר מזהה Google. מנהל המערכת צריך להגדיר ' +
        '<code dir="ltr">GOOGLE_CLIENT_ID</code> במאפייני הסקריפט.</div>';
      return;
    }
    loadGis().then(() => {
      box.innerHTML = '';
      try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
      google.accounts.id.initialize({ client_id: cid, callback: (resp) => loginWithToken(resp.credential), ux_mode: 'popup', auto_select: false, itp_support: true });
      google.accounts.id.renderButton(box, { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'he', width: 280 });
    }).catch((err) => { box.innerHTML = '<div class="fmsg bad">' + esc(err.message) + '</div>'; });
  }
  function closeLogin() { MK().$('#loginModal').hidden = true; }

  let lastIdToken = '';
  function loginWithToken(idToken) {
    const K = MK();
    lastIdToken = idToken; // נשמר לבקשת גישה, שנשלחת עם אותה זהות מאומתת
    const msg = K.$('#loginMsg'); msg.textContent = 'מאמת מול Google...'; msg.className = 'fmsg';
    return K.DataSource.postRaw('login', { idToken }).then((res) => {
      saveSession({ token: res.token, user: res.user, expires: res.expires });
      msg.textContent = '';
      // כניסה ממסך הנעילה: הנתונים כלל לא נטענו (השרת סירב להגיש אותם),
      // ולכן פותחים את המערכת מחדש — עכשיו עם הסשן.
      if (document.body.classList.contains('locked')) { location.reload(); return res.user; }
      closeLogin(); renderUserButton();
      K.toast('שלום ' + res.user.name + ' (' + roleOf(res.user.role) + ')');
      if (loginCb) { const cb = loginCb; loginCb = null; cb(res.user); }
      return res.user;
    }).catch((err) => {
      // מי שנכנס עם Google ואינו רשום — לא מבוי סתום אלא בקשת גישה
      if (err.code === 'norequest') {
        msg.textContent = '';
        closeLogin();
        openJoin((err.payload && err.payload.google) || {});
        return null;
      }
      msg.textContent = 'הכניסה נכשלה: ' + err.message; msg.className = 'fmsg bad'; throw err;
    });
  }

  // ---- בקשת גישה ----
  /**
   * שם החשבון בגוגל אינו תמיד אומר מיהו האדם (חשבון על שם אחר, שם עסק).
   * לכן מבקשים גם שם מלא וטלפון — הטלפון הוא מה שמאפשר למנהל לזהות אותו
   * מול קבוצת הוואטסאפ, והשרת מוסיף לבקשה את השם שמופיע שם.
   */
  function openJoin(g) {
    const K = MK(), box = K.$('#joinBody');
    K.$('#joinModal').hidden = false;
    box.innerHTML = '<div class="join-who">' + (g.picture ? '<img class="avatar big" src="' + esc(g.picture) + '" alt="" referrerpolicy="no-referrer">' : '👤') +
      '<div><b>' + esc(g.name || '') + '</b><small>' + esc(g.email || '') + '</small></div></div>' +
      '<p style="font-size:.88rem;color:var(--muted);margin-bottom:12px">עדיין אין לך גישה. מלא את הפרטים, והמנהל יקבל התראה ויאשר. ' +
      'הכתובת שלמעלה היא זו שתיכנס איתה — אין צורך להקליד אותה.</p>' +
      '<label for="jName">שם מלא</label><input id="jName" type="text" value="' + esc(g.name || '') + '" placeholder="השם שבו מכירים אותך" style="margin-bottom:10px">' +
      '<label for="jPhone">טלפון</label><input id="jPhone" type="tel" inputmode="tel" placeholder="05x-xxxxxxx" style="margin-bottom:10px">' +
      '<label for="jNote">תפקיד או הערה (רשות)</label><input id="jNote" type="text" placeholder="למשל: מפקח איזור הדרום" style="margin-bottom:14px">' +
      '<button class="btn primary" id="jSend" type="button">שליחת הבקשה</button> <span class="fmsg" id="jMsg"></span>';
    const msg = K.$('#jMsg');
    K.$('#jSend').addEventListener('click', () => {
      const name = K.$('#jName').value.trim(), phone = K.$('#jPhone').value.trim(), note = K.$('#jNote').value.trim();
      if (!name) { msg.textContent = 'חסר שם'; msg.className = 'fmsg bad'; return; }
      if (phone.replace(/\D/g, '').length < 9) { msg.textContent = 'מספר הטלפון אינו תקין'; msg.className = 'fmsg bad'; return; }
      msg.textContent = 'שולח...'; msg.className = 'fmsg';
      K.$('#jSend').disabled = true;
      K.DataSource.postRaw('requestAccess', { idToken: lastIdToken, name, phone, note })
        .then((res) => {
          box.innerHTML = res.status === 'exists'
            ? '<p>החשבון שלך כבר רשום במערכת. אפשר פשוט להיכנס.</p><button class="btn primary" id="jBack" type="button">לכניסה</button>'
            : '<p><b>הבקשה נשלחה.</b></p><p style="font-size:.9rem;color:var(--muted);margin-top:8px">המנהל קיבל התראה בוואטסאפ. ' +
              'אחרי שיאשר תקבל הודעה, ואז אפשר להיכנס עם אותו חשבון Google.</p>' +
              '<button class="btn" id="jBack" type="button" style="margin-top:12px">סגירה</button>';
          const back = K.$('#jBack');
          if (back) back.addEventListener('click', () => { K.$('#joinModal').hidden = true; if (res.status === 'exists') openLogin(null); });
        })
        .catch((err) => { msg.textContent = err.message; msg.className = 'fmsg bad'; K.$('#jSend').disabled = false; });
    });
  }

  function logout() {
    const K = MK(), s = session();
    if (s) K.DataSource.postRaw('logout', {}, s.token).catch(() => {});
    saveSession(null); renderUserButton();
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    K.toast('יצאת מהמערכת');
    if (location.hash.startsWith('#/users')) location.hash = '#/';
    if (MK().$('#view-home').classList.contains('on')) MK().route();
  }

  // ---- תפריט משתמש ----
  function openMenu() {
    const K = MK(), u = me();
    if (!u) { openLogin(null); return; }
    const m = K.$('#userMenu');
    m.innerHTML = '<div class="um-head">' + (u.picture ? '<img class="avatar big" src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : '') + '<div><b>' + esc(u.name) + '</b><br><small>' + esc(u.email || '') + ' · ' + esc(u.role) + '</small></div></div>' +
      '<label for="umPhone">טלפון להתראות אישיות</label><div class="um-row"><input id="umPhone" type="tel" value="' + esc(u.phone || '') + '" placeholder="05x-xxxxxxx"><button class="btn small" id="umSavePhone" type="button">שמירה</button></div>' +
      (u.role === 'מנהל' ? '<a class="btn" href="#/users" id="umUsers">👥 ניהול משתמשים</a>' : '') +
      '<button class="btn" id="umLogout" type="button">יציאה</button>';
    m.hidden = false;
    K.$('#umLogout').addEventListener('click', () => { m.hidden = true; logout(); });
    if (K.$('#umUsers')) K.$('#umUsers').addEventListener('click', () => { m.hidden = true; });
    K.$('#umSavePhone').addEventListener('click', () => {
      const phone = K.$('#umPhone').value.trim();
      K.DataSource.post('updateMe', { phone }).then(() => { const s = session(); s.user.phone = phone; saveSession(s); K.toast('הטלפון נשמר'); m.hidden = true; }).catch((err) => K.toast('לא נשמר: ' + err.message));
    });
    setTimeout(() => document.addEventListener('click', (e) => { if (!m.contains(e.target) && e.target !== K.$('#btnUser')) m.hidden = true; }, { once: true }), 0);
  }

  // ---- ניהול משתמשים (מנהל) ----
  function renderUsersView() {
    const K = MK(), root = K.$('#view-users'), u = me();
    if (!enabled()) { root.innerHTML = '<div class="note-box">ניהול משתמשים פעיל רק כשמוגדרת כניסה עם Google (GOOGLE_CLIENT_ID).</div>'; return; }
    if (!u || u.role !== 'מנהל') { root.innerHTML = '<div class="empty">מסך זה למנהלים בלבד.</div>'; return; }
    root.innerHTML = '<div id="reqBox"></div>' +
      '<div class="toolbar"><div class="row"><div class="field grow"><label>הוספת משתמש מראש (יקבל את התפקיד כשייכנס עם Google)</label><div class="um-row"><input id="nuEmail" type="email" placeholder="אימייל (Gmail)"><input id="nuName" type="text" placeholder="שם"><input id="nuPhone" type="tel" placeholder="טלפון"><select id="nuRole">' + ROLES.map((r) => '<option' + (r === 'מפקח' ? ' selected' : '') + '>' + r + '</option>').join('') + '</select><button class="btn primary" id="nuAdd" type="button">הוספה</button></div></div></div>' +
      '<div class="summary">רק מי שנוסף כאן יכול להיכנס. מי שייכנס עם Google בלי שהוסף מראש יקבל "אין לך הרשאה להיכנס למערכת" ולא יירשם כלל. הטלפון משמש להתראות אישיות בוואטסאפ, וניתן לעריכה גם כאן וגם על ידי המשתמש עצמו בתפריט שלו.</div></div><div class="tbl-wrap"><table id="usersTable"><thead><tr><th></th><th>שם</th><th>אימייל</th><th>טלפון</th><th>תפקיד</th><th>פעיל</th><th>כניסה אחרונה</th></tr></thead><tbody><tr><td colspan="7" class="empty">טוען...</td></tr></tbody></table></div>';
    loadRequests();
    K.$('#nuAdd').addEventListener('click', () => {
      K.DataSource.post('addUser', { email: K.$('#nuEmail').value, name: K.$('#nuName').value, phone: K.$('#nuPhone').value, role: K.$('#nuRole').value })
        .then(() => { K.toast('המשתמש נוסף'); loadUsers(); }).catch((err) => K.toast('לא נוסף: ' + err.message));
    });
    loadUsers();

    /**
     * בקשות גישה (Access.js): מי שנכנס עם Google ואינו רשום ביקש להצטרף.
     * מוצג הכל זה לצד זה — השם שהוזן, השם בוואטסאפ לפי הטלפון, ושם החשבון
     * בגוגל — כי שם החשבון בגוגל לבדו לא תמיד אומר מיהו האדם.
     */
    function loadRequests() {
      const box = K.$('#reqBox');
      if (!box) return;
      K.DataSource.post('accessRequests', {}).then((res) => {
        const all = res.requests || [];
        const pending = all.filter((r) => r.status === 'ממתינה');
        const done = all.filter((r) => r.status !== 'ממתינה').slice(0, 5);
        if (!all.length) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="panel" style="margin-bottom:14px"><h3>בקשות גישה' +
          (pending.length ? ' <span class="badge warn">' + pending.length + ' ממתינות</span>' : '') + '</h3>' +
          (pending.length ? pending.map(reqCard).join('') : '<div class="hint">אין בקשות ממתינות.</div>') +
          (done.length ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:.85rem;color:var(--muted)">בקשות שטופלו (' + done.length + ')</summary>' +
            done.map(reqCard).join('') + '</details>' : '') + '</div>';
        box.querySelectorAll('[data-req]').forEach((card) => {
          const id = card.dataset.req;
          card.querySelectorAll('[data-decide]').forEach((b) => b.addEventListener('click', () => {
            const approve = b.dataset.decide === 'yes';
            const name = card.querySelector('[data-f="name"]');
            const role = card.querySelector('[data-f="role"]');
            if (!approve && !window.confirm('לדחות את הבקשה? אפשר לאשר אותה מאוחר יותר אם היא תוגש שוב.')) return;
            card.querySelectorAll('button').forEach((x) => { x.disabled = true; });
            K.DataSource.post('decideRequest', { id, approve, name: name ? name.value : undefined, role: role ? role.value : undefined })
              .then(() => { K.toast(approve ? 'הבקשה אושרה והמשתמש נוצר' : 'הבקשה נדחתה'); loadRequests(); loadUsers(); })
              .catch((err) => { card.querySelectorAll('button').forEach((x) => { x.disabled = false; }); K.toast('לא נשמר: ' + err.message); });
          }));
        });
      }).catch(() => { box.innerHTML = ''; });
    }

    function reqCard(r) {
      const pending = r.status === 'ממתינה';
      // שם שונה בין המקורות אינו פסול, אבל הוא מה שכדאי להסתכל עליו לפני אישור
      const diff = (a, b) => (a && b && a.trim() !== b.trim());
      const row = (label, value, warn) => value ? '<div><dt>' + label + '</dt><dd' + (warn ? ' class="mismatch"' : '') + '>' + esc(value) + '</dd></div>' : '';
      return '<div class="req ' + (pending ? 'pending' : 'done') + '" data-req="' + esc(r.id) + '">' +
        '<h4>' + (r.picture ? '<img class="avatar" src="' + esc(r.picture) + '" alt="" referrerpolicy="no-referrer">' : '👤') +
        esc(r.name) + (pending ? '' : ' <span class="badge">' + esc(r.status) + '</span>') +
        (r.source === 'טופס' ? ' <span class="badge warn" title="הכתובת הוקלדה בטופס ולא אומתה מול גוגל">מהטופס</span>' : '') + '</h4>' +
        '<div class="dl">' +
        row('בוואטסאפ', r.waName || '(הטלפון לא נמצא בהודעות הקבוצה)', diff(r.waName, r.name)) +
        row('טלפון', r.phone) +
        row('אימייל', r.email) +
        row('שם בגוגל', r.googleName, diff(r.googleName, r.name)) +
        row('הערה', r.note) +
        row('נשלחה', K.hebOf(r.ts) + ' ' + K.fmtDate(r.ts)) +
        (r.decidedBy ? row('טופל ע"י', r.decidedBy) : '') +
        '</div>' +
        (pending ? '<div class="req-act">' +
          '<input class="cell-input" data-f="name" value="' + esc(r.name) + '" title="השם שיירשם במערכת">' +
          '<select data-f="role">' + ROLES.filter((x) => x !== 'מנהל').map((x) => '<option' + (x === 'מפקח' ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' +
          '<button class="btn small primary" data-decide="yes" type="button">אישור</button>' +
          '<button class="btn small danger" data-decide="no" type="button">דחייה</button>' +
        '</div>' : '') + '</div>';
    }

    function loadUsers() {
      K.DataSource.post('users', {}).then((res) => {
        const tb = root.querySelector('#usersTable tbody');
        tb.innerHTML = (res.users || []).map((x) => '<tr data-id="' + esc(x.id) + '"><td>' + (x.picture ? '<img class="avatar" src="' + esc(x.picture) + '" alt="" referrerpolicy="no-referrer">' : '👤') + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.email || '') + '</td>' +
          '<td><input class="cell-input" type="tel" data-f="phone" value="' + esc(x.phone || '') + '" placeholder="05x-xxxxxxx"></td>' +
          '<td><select data-f="role">' + ROLES.map((r) => '<option' + (r === roleOf(x.role) ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></td>' +
          '<td><label class="pill chk"><input type="checkbox" data-f="active"' + (x.active ? ' checked' : '') + '><span>' + (x.active ? 'פעיל' : 'מושבת') + '</span></label></td><td>' + esc(x.lastLogin ? K.hebOf(x.lastLogin) + ' ' + K.fmtDate(x.lastLogin) : '') + '</td></tr>').join('') || '<tr><td colspan="7" class="empty">אין משתמשים</td></tr>';
        tb.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('change', () => {
          const id = el.closest('tr').dataset.id;
          const f = el.dataset.f;
          const patch = f === 'role' ? { role: el.value } : f === 'phone' ? { phone: el.value.trim() } : { active: el.checked };
          K.DataSource.post('updateUser', Object.assign({ id }, patch)).then(() => { K.toast('עודכן'); loadUsers(); }).catch((err) => { K.toast('לא עודכן: ' + err.message); loadUsers(); });
        }));
      }).catch((err) => { root.querySelector('#usersTable tbody').innerHTML = '<tr><td colspan="7" class="empty">' + esc(err.message) + '</td></tr>'; });
    }
  }

  // כפתורי ה-✕ של חלון הכניסה ושל חלון בקשת הגישה. נקשרים כאן ולא ב-initOnce
  // של app.js, כי במסך הנעילה initOnce כלל אינו רץ — ואז ה-✕ של חלון הכניסה
  // לא עשה כלום, ומי שפתח אותו נתקע מולו.
  (function bindCloseButtons() {
    const close = (id) => { const el = document.getElementById(id); if (el) el.hidden = true; };
    const bind = (btn, modal) => { const b = document.getElementById(btn); if (b) b.addEventListener('click', () => close(modal)); };
    bind('loginClose', 'loginModal');
    bind('joinClose', 'joinModal');
  })();

  window.MikvehAuth = {
    enabled, me, session, openLogin, logout, openMenu, renderUserButton, renderUsersView, loginWithToken, roleOf, openJoin,
    /** נקרא מ-app.js אחרי טעינת הנתונים */
    init: function () {
      const K = MK();
      if (!enabled()) return;
      const s = session();
      if (s && K.S.data.me) { s.user = K.S.data.me; saveSession(s); }
      else if (s && K.S.data.source === 'live' && !K.S.data.me) { saveSession(null); }
      renderUserButton();
      if (!me() && K.S.data.source === 'live') setTimeout(() => openLogin(null), 600);
    },
    /** בדיקת התחברות לפני כתיבה (מחליף את "מי אני") */
    requireUser: function () {
      if (!enabled()) return null; // מצב ישן – app.js מטפל
      if (me()) return true;
      openLogin(null);
      return false;
    },
    token: function () { const s = session(); return s ? s.token : ''; },
    onAuthError: function () { saveSession(null); renderUserButton(); openLogin(null); },
  };
})();
