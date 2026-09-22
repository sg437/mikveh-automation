/**
 * טופס הפרטים לקבוצה (מסך ההגדרות, למנהל).
 *
 * שולח לקבוצת הוואטסאפ כפתור שמוביל לדף טופס עצמאי (app/join/) — שם, מייל
 * וטלפון. כל מילוי נוחת ב"בקשות גישה" שבמסך המשתמשים, ומחכה לאישור.
 * כך אפשר לאסוף את פרטי הצוות **לפני** ששולחים לאיש את הקישור למערכת עצמה.
 */
(function () {
  'use strict';
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);
  const DEFAULT_TEXT = 'רישום למערכת כשרות המקוואות — נא למלא שם מלא, כתובת מייל וטלפון. ' +
    'זה לוקח חצי דקה, ופעם אחת בלבד.';

  function admin() {
    const me = window.MikvehAuth ? MikvehAuth.me() : null;
    if (!window.MikvehAuth || !MikvehAuth.enabled()) return true; // מצב ישן — בלי תפקידים
    return !!me && me.role === 'מנהל';
  }

  /** כתובת דף הטופס, נגזרת מהכתובת של המערכת עצמה. */
  function formUrl() {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '').replace(/talk\/$/, '');
    return base + 'join/';
  }

  function render() {
    const K = MK(), root = K.$('#joinFormBox');
    if (!root) return;
    if (!admin()) { root.innerHTML = ''; return; }
    if (!K.DataSource.url('data')) {
      root.innerHTML = '<div class="panel" style="margin-top:12px"><h3>טופס פרטים לקבוצה</h3>' +
        '<div class="empty">דורש חיבור חי לגיליון.</div></div>';
      return;
    }
    draw(null);
    K.DataSource.post('joinForm', { do: 'status' }).then((res) => draw(res)).catch(() => {});
  }

  function draw(state) {
    const K = MK(), root = K.$('#joinFormBox');
    const url = formUrl();
    const open = state ? !!state.open : null;
    const badge = open === null ? '<span class="badge">בבדיקה</span>'
      : open ? '<span class="badge ok">פתוח לקבלת פרטים</span>'
      : '<span class="badge">סגור</span>';
    root.innerHTML = '<div class="panel" style="margin-top:12px"><h3>טופס פרטים לקבוצה ' + badge + '</h3>' +
      '<p style="font-size:.88rem;color:var(--muted)">שולח לקבוצה כפתור לדף טופס קצר — שם, מייל וטלפון. ' +
      'הדף אינו המערכת ואין ממנו גישה לשום נתון, ולכן אפשר לשלוח אותו לפני שהמערכת עצמה נפתחת לכולם. ' +
      'כל מילוי מופיע ב<a href="#/users">בקשות גישה</a> וממתין לאישור שלך.</p>' +
      '<div class="rform"><div class="fgrid">' +
      '<div class="ff wide"><label for="jfText">ההודעה שתישלח</label>' +
      '<input id="jfText" type="text" maxlength="600" value="' + esc(DEFAULT_TEXT) + '"></div>' +
      '<div class="ff wide"><label for="jfUrl">הקישור לטופס</label>' +
      '<input id="jfUrl" type="text" dir="ltr" value="' + esc(url) + '" readonly></div>' +
      '</div><div class="factions">' +
      '<button class="btn primary" id="jfSend" type="button">📤 שליחה לקבוצה</button>' +
      '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">פתיחת הטופס</a>' +
      '<button class="btn" id="jfCopy" type="button">העתקת הקישור</button>' +
      (open === false ? '<button class="btn" id="jfOpen" type="button">פתיחת הטופס לקבלת פרטים</button>' : '') +
      (open === true ? '<button class="btn danger" id="jfClose" type="button">סגירת הטופס</button>' : '') +
      '<span class="fmsg" id="jfMsg"></span></div></div>' +
      '<p style="font-size:.8rem;color:var(--muted);margin-top:8px">כשהטופס <b>סגור</b> הקישור מפסיק לקבל מילויים — ' +
      'כדאי לסגור אותו אחרי שכולם נרשמו. המייל שמוקלד בטופס אינו מאומת מול גוגל, ולכן מי שייכנס ' +
      'בסוף עם חשבון אחר יוכל לבקש גישה ישירות מהמערכת.</p></div>';

    const msg = K.$('#jfMsg');
    K.$('#jfCopy').addEventListener('click', () => {
      const inp = K.$('#jfUrl');
      inp.select();
      const done = () => { msg.textContent = 'הקישור הועתק'; msg.className = 'fmsg ok'; };
      if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done).catch(() => { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
    const bind = (id, act, text) => {
      const b = K.$('#' + id);
      if (!b) return;
      b.addEventListener('click', () => {
        b.disabled = true;
        msg.textContent = text; msg.className = 'fmsg';
        K.DataSource.post('joinForm', { do: act, url: formUrl(), text: (K.$('#jfText') || {}).value })
          .then((res) => {
            draw(res);
            const m = K.$('#jfMsg');
            if (act === 'send') {
              // וואטסאפ אינו תמיד מציג כפתורים ממספר רגיל. חשוב שתדע מה נשלח בפועל.
              m.textContent = res.how === 'button' ? 'נשלח לקבוצה ככפתור'
                : res.how === 'link' ? 'וואטסאפ לא קיבל כפתור' + (res.detail ? ' (' + res.detail + ')' : '') + ' — נשלחה הודעה עם הקישור'
                : 'השליחה נכשלה' + (res.detail ? ': ' + res.detail : '');
              m.className = res.how === 'failed' ? 'fmsg bad' : 'fmsg ok';
            } else {
              m.textContent = act === 'close' ? 'הטופס נסגר' : 'הטופס פתוח';
              m.className = 'fmsg ok';
            }
          })
          .catch((err) => { b.disabled = false; msg.textContent = err.message; msg.className = 'fmsg bad'; });
      });
    };
    bind('jfSend', 'send', 'שולח...');
    bind('jfOpen', 'open', 'פותח...');
    bind('jfClose', 'close', 'סוגר...');
  }

  window.MikvehJoinForm = { render, formUrl };
})();
