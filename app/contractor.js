/**
 * קבלן המקווה: פרטי הקבלן, שליחת הערות אליו במייל או בוואטסאפ, ותיעוד הפניות בתיק.
 * מוצג בלשונית "קבלן" בכרטיס, בעיקר למקוואות בשיפוץ או בבנייה.
 */
(function () {
  'use strict';
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  function forMikveh(id) { return (MK().S.data.contractors || []).filter((c) => c.mikvehId === id)[0] || null; }
  function msgsFor(id) { return (MK().S.data.contractorMsgs || []).filter((c) => c.mikvehId === id).sort((a, b) => (b.ts || '').localeCompare(a.ts || '')); }
  function count(m) { return (forMikveh(m.id) ? 1 : 0) + msgsFor(m.id).length; }

  /** תבניות מוכנות להערה לקבלן */
  function templates(m) {
    const K = MK();
    const ins = (K.S.insp[m.id] || []).slice().sort((a, b) => b.ts.localeCompare(a.ts))[0];
    const out = [];
    if (ins) {
      const bad = [], warn = [];
      (ins.sections || []).forEach((s) => s.fields.forEach((f) => {
        if (/דחוף/.test(f[1])) bad.push(s.title + ' – ' + f[0]);
        else if (/טעון|דרוש/.test(f[1])) warn.push(s.title + ' – ' + f[0]);
      }));
      if (bad.length || warn.length) {
        out.push({ label: 'ליקויים מדוח הפיקוח האחרון (' + (ins.hebDate || K.hebOf(ins.ts)) + ')',
          text: (bad.length ? 'טעון תיקון דחוף:\n' + bad.map((x) => '• ' + x).join('\n') + '\n\n' : '') +
                (warn.length ? 'טעון תיקון:\n' + warn.map((x) => '• ' + x).join('\n') : '') });
      }
      if (ins.guidance) out.push({ label: 'הנחיות מיוחדות מהפיקוח', text: ins.guidance });
    }
    out.push({ label: 'בקשת עדכון על התקדמות', text: 'נבקש לקבל עדכון על התקדמות העבודות במקווה ומועד צפוי לסיום, כדי לתאם ביקורת כשרות.' });
    out.push({ label: 'תיאום ביקורת לפני סגירת קירות', text: 'נא לתאם ביקורת כשרות לפני סגירת הקירות ולפני יציקת רצפת הבור, כדי שלא יידרשו פירוקים בהמשך.' });
    return out;
  }

  function pane(m) {
    const K = MK();
    const c = forMikveh(m.id) || {};
    const msgs = msgsFor(m.id);
    const inRenovation = /שיפוץ|בנייה|מושבת/.test(m.activity || '');
    return '<div class="panel"><h3>פרטי הקבלן' + (inRenovation ? ' <span class="badge warn">' + esc(m.activity) + '</span>' : '') + '</h3>' +
      '<form id="ctrForm" class="rform"><div class="fgrid">' +
        '<div class="ff"><label for="ctrName">שם הקבלן</label><input id="ctrName" value="' + esc(c.name || '') + '"></div>' +
        '<div class="ff"><label for="ctrEmail">אימייל</label><input id="ctrEmail" type="email" value="' + esc(c.email || '') + '"></div>' +
        '<div class="ff"><label for="ctrPhone">טלפון</label><input id="ctrPhone" type="tel" value="' + esc(c.phone || '') + '"></div>' +
        '<div class="ff"><label for="ctrStatus">סטטוס העבודה</label><select id="ctrStatus">' + ['פעיל', 'הושלם', 'מושהה'].map((s) => '<option' + (s === (c.status || 'פעיל') ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
        '<div class="ff wide"><label for="ctrWork">סוג העבודה / פרויקט</label><input id="ctrWork" value="' + esc(c.work || '') + '" placeholder="למשל: שיפוץ בור הטבילה והחלפת אוצרות"></div>' +
      '</div><div class="factions"><button class="btn" type="submit">שמירת פרטי הקבלן</button><span class="fmsg" id="ctrMsg"></span></div></form></div>' +

      '<div class="panel"><h3>הערה או הודעה לקבלן</h3>' +
      '<div class="ctpl">' + templates(m).map((t, i) => '<button type="button" class="chip" data-tpl="' + i + '">' + esc(t.label) + '</button>').join('') + '</div>' +
      '<form id="ctrSend" class="rform" style="margin-top:10px"><div class="fgrid">' +
        '<div class="ff wide"><label for="ctrSubject">נושא</label><input id="ctrSubject" value="' + esc('מקווה ' + m.name + ' – הערות מהפיקוח') + '"></div>' +
        '<div class="ff wide"><label for="ctrText">ההודעה</label><textarea id="ctrText" rows="6" placeholder="מה צריך לתקן, מה לתאם, ומה לוח הזמנים"></textarea></div>' +
      '</div><div class="factions"><button class="btn primary" type="button" id="ctrMail">✉️ שליחה במייל</button>' +
      '<button class="btn" type="button" id="ctrWa">💬 שליחה בוואטסאפ</button><span class="fmsg" id="ctrSendMsg"></span></div></form></div>' +

      '<div class="panel"><h3>פניות קודמות לקבלן (' + msgs.length + ')</h3>' +
      (msgs.length ? '<ul class="feed">' + msgs.map((x) => '<li><span class="fi">' + (x.channel === 'מייל' ? '✉️' : '💬') + '</span><div class="ft"><b>' + esc(x.subject || '') + '</b><div>' + esc(x.text || '').replace(/\n/g, '<br>') + '</div><small>' + esc([K.hebOf(x.ts), x.by, x.status].filter(Boolean).join(' · ')) + '</small></div></li>').join('') + '</ul>'
        : '<div class="empty">עדיין לא נשלחו פניות לקבלן ממקווה זה</div>') + '</div>';
  }

  function bind(root, m) {
    const K = MK();
    const tpls = templates(m);
    const q = (id) => root.querySelector(id);
    root.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
      const t = tpls[+b.dataset.tpl];
      const ta = q('#ctrText');
      ta.value = (ta.value ? ta.value + '\n\n' : '') + t.text;
      ta.focus();
    }));
    const form = q('#ctrForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!K.requireUser()) return;
      const msg = q('#ctrMsg'); msg.textContent = 'שומר...'; msg.className = 'fmsg';
      K.DataSource.post('saveContractor', { mikveh: m.name, name: q('#ctrName').value, email: q('#ctrEmail').value, phone: q('#ctrPhone').value, work: q('#ctrWork').value, status: q('#ctrStatus').value })
        .then((res) => {
          K.S.data.contractors = (K.S.data.contractors || []).filter((c) => c.mikvehId !== m.id);
          if (res.record) K.S.data.contractors.push(res.record);
          msg.textContent = 'נשמר ✓'; msg.className = 'fmsg ok'; K.toast('פרטי הקבלן נשמרו');
        }).catch((err) => { msg.textContent = 'לא נשמר: ' + err.message; msg.className = 'fmsg bad'; });
    });
    const send = (channel) => {
      if (!K.requireUser()) return;
      const msg = q('#ctrSendMsg'), text = q('#ctrText').value.trim();
      if (!text) { msg.textContent = 'ההודעה ריקה'; msg.className = 'fmsg bad'; return; }
      msg.textContent = 'שולח...'; msg.className = 'fmsg';
      K.DataSource.post('notifyContractor', { mikveh: m.name, subject: q('#ctrSubject').value, text, channel, email: q('#ctrEmail').value, phone: q('#ctrPhone').value })
        .then((res) => {
          K.S.data.contractorMsgs = K.S.data.contractorMsgs || [];
          if (res.record) K.S.data.contractorMsgs.push(res.record);
          if (res.message) K.S.data.messages.push(res.message);
          if (channel === 'whatsapp' && res.waLink) window.open(res.waLink, '_blank', 'noopener');
          msg.textContent = (res.record && res.record.status) || 'נשלח ✓'; msg.className = 'fmsg ok';
          q('#ctrText').value = '';
          K.toast(channel === 'email' ? 'המייל נשלח לקבלן ונרשם בתיק' : 'ההודעה נפתחה בוואטסאפ ונרשמה בתיק');
          K.route();
        }).catch((err) => { msg.textContent = 'לא נשלח: ' + err.message; msg.className = 'fmsg bad'; });
    };
    if (q('#ctrMail')) q('#ctrMail').addEventListener('click', () => send('email'));
    if (q('#ctrWa')) q('#ctrWa').addEventListener('click', () => send('whatsapp'));
  }

  window.MikvehContractor = { pane, bind, count, forMikveh };
})();
