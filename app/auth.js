/**
 * כניסה עם Google, סשן במכשיר, תפריט משתמש וניהול משתמשים (למנהל).
 * נטען אחרי app.js. כשהשרת לא הגדיר GOOGLE_CLIENT_ID – נשאר מצב "מי אני" הישן.
 */
(function () {
  'use strict';
  const KEY = 'mikveh.session';
  const ROLES = ['מנהל', 'מפקח', 'בלנית', 'צופה'];
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  function session() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
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
    const cid = (window.MIKVEH_CONFIG || {}).googleClientId;
    if (!cid) { box.innerHTML = '<div class="fmsg bad">חסר googleClientId בקובץ config.js</div>'; return; }
    loadGis().then(() => {
      box.innerHTML = '';
      google.accounts.id.initialize({ client_id: cid, callback: (resp) => loginWithToken(resp.credential), ux_mode: 'popup', auto_select: false, itp_support: true });
      google.accounts.id.renderButton(box, { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'he', width: 280 });
    }).catch((err) => { box.innerHTML = '<div class="fmsg bad">' + esc(err.message) + '</div>'; });
  }
  function closeLogin() { MK().$('#loginModal').hidden = true; }

  function loginWithToken(idToken) {
    const K = MK();
    const msg = K.$('#loginMsg'); msg.textContent = 'מאמת מול Google...'; msg.className = 'fmsg';
    return K.DataSource.postRaw('login', { idToken }).then((res) => {
      saveSession({ token: res.token, user: res.user, expires: res.expires });
      msg.textContent = '';
      closeLogin(); renderUserButton();
      K.toast('שלום ' + res.user.name + ' (' + res.user.role + ')');
      if (loginCb) { const cb = loginCb; loginCb = null; cb(res.user); }
      return res.user;
    }).catch((err) => { msg.textContent = 'הכניסה נכשלה: ' + err.message; msg.className = 'fmsg bad'; throw err; });
  }

  function logout() {
    const K = MK(), s = session();
    if (s) K.DataSource.postRaw('logout', {}, s.token).catch(() => {});
    saveSession(null); renderUserButton();
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    K.toast('יצאת מהמערכת');
    if (location.hash.startsWith('#/users')) location.hash = '#/';
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
    root.innerHTML = '<div class="toolbar"><div class="row"><div class="field grow"><label>הוספת משתמש מראש (יקבל את התפקיד כשייכנס עם Google)</label><div class="um-row"><input id="nuEmail" type="email" placeholder="אימייל (Gmail)"><input id="nuName" type="text" placeholder="שם"><input id="nuPhone" type="tel" placeholder="טלפון"><select id="nuRole">' + ROLES.map((r) => '<option' + (r === 'מפקח' ? ' selected' : '') + '>' + r + '</option>').join('') + '</select><button class="btn primary" id="nuAdd" type="button">הוספה</button></div></div></div>' +
      '<div class="summary">משתמש חדש שנכנס עם Google בלי הוספה מראש מקבל תפקיד "מפקח" (ניתן לשינוי ב-Script Property בשם DEFAULT_ROLE).</div></div><div class="tbl-wrap"><table id="usersTable"><thead><tr><th></th><th>שם</th><th>אימייל</th><th>טלפון</th><th>תפקיד</th><th>פעיל</th><th>כניסה אחרונה</th></tr></thead><tbody><tr><td colspan="7" class="empty">טוען...</td></tr></tbody></table></div>';
    K.$('#nuAdd').addEventListener('click', () => {
      K.DataSource.post('addUser', { email: K.$('#nuEmail').value, name: K.$('#nuName').value, phone: K.$('#nuPhone').value, role: K.$('#nuRole').value })
        .then(() => { K.toast('המשתמש נוסף'); loadUsers(); }).catch((err) => K.toast('לא נוסף: ' + err.message));
    });
    loadUsers();
    function loadUsers() {
      K.DataSource.post('users', {}).then((res) => {
        const tb = root.querySelector('#usersTable tbody');
        tb.innerHTML = (res.users || []).map((x) => '<tr data-id="' + esc(x.id) + '"><td>' + (x.picture ? '<img class="avatar" src="' + esc(x.picture) + '" alt="" referrerpolicy="no-referrer">' : '👤') + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.email || '') + '</td><td>' + esc(x.phone || '') + '</td>' +
          '<td><select data-f="role">' + ROLES.map((r) => '<option' + (r === x.role ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></td>' +
          '<td><label class="pill chk"><input type="checkbox" data-f="active"' + (x.active ? ' checked' : '') + '><span>' + (x.active ? 'פעיל' : 'מושבת') + '</span></label></td><td>' + esc(x.lastLogin ? K.hebOf(x.lastLogin) + ' ' + K.fmtDate(x.lastLogin) : '') + '</td></tr>').join('') || '<tr><td colspan="7" class="empty">אין משתמשים</td></tr>';
        tb.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('change', () => {
          const id = el.closest('tr').dataset.id;
          const patch = el.dataset.f === 'role' ? { role: el.value } : { active: el.checked };
          K.DataSource.post('updateUser', Object.assign({ id }, patch)).then(() => { K.toast('עודכן'); loadUsers(); }).catch((err) => { K.toast('לא עודכן: ' + err.message); loadUsers(); });
        }));
      }).catch((err) => { root.querySelector('#usersTable tbody').innerHTML = '<tr><td colspan="7" class="empty">' + esc(err.message) + '</td></tr>'; });
    }
  }

  window.MikvehAuth = {
    enabled, me, session, openLogin, logout, openMenu, renderUserButton, renderUsersView, loginWithToken,
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
