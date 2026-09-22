/**
 * שאלה לקבוצת הוואטסאפ (מסך ההגדרות).
 *
 * שולחים שאלה אחת לקבוצה — "מה כתובת המייל שלך?" — וכל מי שעונה, התשובה
 * נרשמת כאן עם השם והטלפון שלו. הצד השני יושב ב-Questions.js: הוא קולט את
 * התשובות מהוואטסאפ, שולח התראה לשואל, ומשלים כתובות מייל בלשונית המשתמשים.
 */
(function () {
  'use strict';
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);
  const TYPES = [
    { key: 'email', label: 'כתובת אימייל', ph: 'מה כתובת המייל שלך? (לרישום במערכת)' },
    { key: 'phone', label: 'מספר טלפון', ph: 'מה מספר הטלפון שלך?' },
    { key: 'text', label: 'תשובה חופשית', ph: 'מי יכול להגיע מחר לריקון המאגר בהוד השרון?' },
  ];
  let state = null; // { questions, answers }

  function admin() {
    const me = window.MikvehAuth ? MikvehAuth.me() : null;
    if (!window.MikvehAuth || !MikvehAuth.enabled()) return true; // מצב ישן — בלי תפקידים
    return !!me && (me.role === 'מנהל' || me.role === 'מפקח');
  }

  function render() {
    const K = MK(), root = K.$('#askBox');
    if (!root) return;
    if (!admin()) { root.innerHTML = ''; return; }
    if (!K.DataSource.url('data')) {
      root.innerHTML = '<div class="panel" style="margin-top:12px"><h3>שאלה לקבוצת הוואטסאפ</h3>' +
        '<div class="empty">דורש חיבור חי לגיליון.</div></div>';
      return;
    }
    root.innerHTML = '<div class="panel" style="margin-top:12px"><h3>שאלה לקבוצת הוואטסאפ</h3>' +
      '<p style="font-size:.88rem;color:var(--muted)">השאלה נשלחת לקבוצה, וכל מי שעונה — התשובה נרשמת כאן ' +
      'עם השם והטלפון שלו, ונשלחת אליך התראה בוואטסאפ. עונים ב"תשובה" (Reply) על ההודעה; ' +
      'בשאלת אימייל או טלפון גם הודעה רגילה שיש בה כתובת או מספר נקלטת.</p>' +
      '<div class="rform"><div class="fgrid">' +
      '<div class="ff wide"><label for="askText">השאלה</label>' +
      '<input id="askText" type="text" maxlength="900" placeholder="' + esc(TYPES[0].ph) + '"></div>' +
      '<div class="ff"><label for="askType">סוג התשובה</label><select id="askType">' +
      TYPES.map((t) => '<option value="' + t.key + '">' + esc(t.label) + '</option>').join('') + '</select></div>' +
      '</div><div class="factions"><button class="btn primary" id="askSend" type="button">📤 שליחה לקבוצה</button>' +
      '<span class="fmsg" id="askMsg"></span></div></div>' +
      '<div id="askList" style="margin-top:12px"><div class="hint">טוען...</div></div></div>';

    const type = K.$('#askType'), text = K.$('#askText'), msg = K.$('#askMsg');
    type.addEventListener('change', () => {
      const t = TYPES.filter((x) => x.key === type.value)[0] || TYPES[0];
      text.placeholder = t.ph;
    });
    K.$('#askSend').addEventListener('click', () => {
      const v = text.value.trim();
      if (!v) { msg.textContent = 'חסרה השאלה'; msg.className = 'fmsg bad'; return; }
      msg.textContent = 'שולח...'; msg.className = 'fmsg';
      K.DataSource.post('askGroup', { text: v, type: type.value })
        .then(() => { msg.textContent = 'נשלח לקבוצה'; msg.className = 'fmsg ok'; text.value = ''; load(true); })
        .catch((err) => { msg.textContent = err.message; msg.className = 'fmsg bad'; });
    });
    load(false);
  }

  function load(fresh) {
    const K = MK(), box = K.$('#askList');
    if (!box) return;
    if (state && !fresh) draw();
    K.DataSource.get('questions', {}).then((res) => { state = res; draw(); })
      .catch((err) => { if (!state) box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; });
  }

  function draw() {
    const K = MK(), box = K.$('#askList');
    if (!box || !state) return;
    const qs = state.questions || [], answers = state.answers || [];
    if (!qs.length) { box.innerHTML = '<div class="empty">עדיין לא נשלחו שאלות לקבוצה.</div>'; return; }
    const byQ = {};
    answers.forEach((a) => { (byQ[a.question] = byQ[a.question] || []).push(a); });
    box.innerHTML = qs.map((q) => {
      const list = byQ[q.id] || [];
      const open = q.status !== 'סגורה';
      return '<div class="panel" data-q="' + esc(q.id) + '" style="margin-bottom:10px">' +
        '<h4>' + (open ? '🟢' : '⚪') + ' ' + esc(q.text) + '</h4>' +
        '<div class="wl" style="font-size:.8rem;color:var(--muted)">נשלחה ' + esc(K.hebOf(q.ts)) +
        (q.by ? ' ע"י ' + esc(q.by) : '') + ' · ' + list.length + ' תשובות</div>' +
        (list.length ? '<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>מי</th><th>טלפון</th><th>התשובה</th><th>הערה</th><th>מתי</th></tr></thead><tbody>' +
          list.map((a) => '<tr><td>' + esc(a.name || '') + '</td><td dir="ltr">' + esc(a.phone || '') + '</td>' +
            '<td dir="ltr">' + esc(a.value || '') + '</td><td>' + esc(a.note || '') + '</td><td>' + esc(K.hebOf(a.ts)) + '</td></tr>').join('') +
          '</tbody></table></div>' : '<div class="hint" style="margin-top:6px">עדיין אין תשובות.</div>') +
        '<div class="panel-tools" style="margin-top:8px">' +
        '<button class="btn small" data-act="' + (open ? 'close' : 'open') + '">' + (open ? 'סגירת השאלה' : 'פתיחה מחדש') + '</button>' +
        (list.length ? '<button class="btn small" data-act="export">⬇ ייצוא לאקסל</button>' : '') +
        '</div></div>';
    }).join('');

    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const id = b.closest('[data-q]').dataset.q;
      const q = (state.questions || []).filter((x) => x.id === id)[0];
      if (b.dataset.act === 'export') {
        const list = (state.answers || []).filter((a) => a.question === id);
        K.exportTable(list.map((a) => ({ 'שם': a.name || '', 'טלפון': a.phone || '', 'התשובה': a.value || '', 'הערה': a.note || '', 'מתי': K.hebOf(a.ts) })),
          (q && q.text) || 'תשובות', 'answers');
        return;
      }
      b.disabled = true;
      K.DataSource.post('closeQuestion', { id: id, reopen: b.dataset.act === 'open' })
        .then(() => { K.toast(b.dataset.act === 'open' ? 'השאלה נפתחה מחדש' : 'השאלה נסגרה'); load(true); })
        .catch((err) => { b.disabled = false; K.toast('לא נשמר: ' + err.message); });
    }));
  }

  window.MikvehAsk = { render };
})();
