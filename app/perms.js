/**
 * מסך הגדרות: מי רשאי לעשות מה (טבלת הרשאות לפי תפקיד) – למנהל בלבד.
 */
(function () {
  'use strict';
  const ROLES = ['מפקח', 'בלנית', 'צופה'];
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  function render() {
    const K = MK(), root = K.$('#view-settings');
    const me = window.MikvehAuth ? MikvehAuth.me() : null;
    const authOn = window.MikvehAuth && MikvehAuth.enabled();
    if (!authOn) { root.innerHTML = '<div class="note-box">מסך ההרשאות פעיל כשמוגדרת כניסה עם Google (GOOGLE_CLIENT_ID). בלי זה כל מי שנכנס יכול לדווח.</div>'; return; }
    if (!me || me.role !== 'מנהל') { root.innerHTML = '<div class="empty">מסך זה למנהלים בלבד.</div>'; return; }
    root.innerHTML = '<div class="note-box">מנהל רשאי לכל הפעולות תמיד. כאן קובעים מה מותר לכל תפקיד אחר. השינוי נכנס לתוקף מיד.</div>' +
      '<div class="tbl-wrap"><table id="permTable"><thead><tr><th>פעולה</th>' + ROLES.map((r) => '<th>' + r + '</th>').join('') + '</tr></thead><tbody><tr><td colspan="4" class="empty">טוען...</td></tr></tbody></table></div>' +
      '<div class="panel" style="margin-top:12px"><h3>ניהול משתמשים</h3><p style="font-size:.88rem;color:var(--muted)">הוספת משתמשים, שינוי תפקיד והשבתה נעשים במסך המשתמשים.</p><div class="panel-tools"><a class="btn" href="#/users">👥 למסך המשתמשים</a></div></div>';
    load();

    function load() {
      const cached = K.S.data.perms;
      if (cached) { draw(cached); }
      K.DataSource.post('perms', {}).then((res) => { K.S.data.perms = res.perms; draw(res.perms); }).catch((err) => {
        if (!cached) root.querySelector('#permTable tbody').innerHTML = '<tr><td colspan="4" class="empty">' + esc(err.message) + '</td></tr>';
      });
    }
    function draw(perms) {
      const labels = perms._labels || {};
      const keys = Object.keys(perms).filter((k) => k !== '_labels');
      root.querySelector('#permTable tbody').innerHTML = keys.map((k) => '<tr data-k="' + esc(k) + '"><td>' + esc(labels[k] || k) + '</td>' +
        ROLES.map((r) => '<td style="text-align:center"><label class="pill chk"><input type="checkbox" data-role="' + esc(r) + '"' + (perms[k][r] ? ' checked' : '') + '><span>' + (perms[k][r] ? 'מותר' : 'חסום') + '</span></label></td>').join('') + '</tr>').join('');
      root.querySelectorAll('#permTable input[type=checkbox]').forEach((c) => c.addEventListener('change', () => {
        const k = c.closest('tr').dataset.k, r = c.dataset.role;
        const patch = {}; patch[k] = {}; patch[k][r] = c.checked;
        c.disabled = true;
        K.DataSource.post('setPerms', { perms: patch }).then((res) => { K.S.data.perms = res.perms; K.toast('ההרשאה עודכנה'); draw(res.perms); })
          .catch((err) => { c.disabled = false; c.checked = !c.checked; K.toast('לא נשמר: ' + err.message); });
      }));
    }
  }

  window.MikvehPerms = { render };
})();
