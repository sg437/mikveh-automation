/**
 * פרויקטי בנייה ושיפוץ: צ'ק-ליסט של תשעה שלבים לכל מקווה בבנייה או בשיפוץ.
 * מסך "פרויקטים" ולשונית בכרטיס המקווה. נשמר בלשוניות "פרויקטים" ו"שלבי פרויקט".
 */
(function () {
  'use strict';
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  const STAGES = [
    { key: 'plans', label: 'אישור תוכניות לפני תחילת העבודה' },
    { key: 'roof', label: 'גג איסוף מי גשמים — שיפועים ומרזבים' },
    { key: 'reservoir', label: 'המאגר — מידות, איטום, חיבורים' },
    { key: 'zeria', label: 'אוצר זריעה — מידות ופתח' },
    { key: 'hashaka', label: 'אוצר השקה — מידות ופתח ההשקה' },
    { key: 'bor', label: 'בור הטבילה' },
    { key: 'walls', label: 'ביקורת לפני סגירת קירות', critical: true },
    { key: 'fill', label: 'מילוי ראשון' },
    { key: 'cert', label: 'תעודת כשרות' },
  ];
  const TYPES = ['בנייה', 'שיפוץ'];
  const STATUSES = ['בתכנון', 'בביצוע', 'מושהה', 'הושלם'];
  const STAGE_STATUS = ['ממתין', 'בביצוע', 'אושר', 'נדרש תיקון'];
  const STAGE_CLASS = { 'ממתין': '', 'בביצוע': 'warn', 'אושר': 'ok', 'נדרש תיקון': 'bad' };

  let filter = 'active';
  /** מה המשתמש פתח או סגר ביד. נשמר כדי שסינון או רענון לא ישנו את המצב. */
  const openState = new Map();

  function all() { return MK().S.data.projects || []; }
  /** משתמשי המערכת הפעילים – רק מהם אפשר לבחור מפקח */
  function staff() { return (MK().S.data.users || []).filter((u) => u.name && u.active !== false); }
  function isAdmin() { const u = MK().getUser(); return !!(u && u.role === 'מנהל'); }
  function options(names, val) {
    const list = names.slice();
    if (val && list.indexOf(val) < 0) list.unshift(val);
    return list.map((n) => '<option' + (n === val ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
  }
  function stagesOf(id) { return (MK().S.data.projectStages || {})[id] || {}; }
  function forMikveh(mikvehId) { return all().filter((p) => p.mikvehId === mikvehId); }

  /** כמה שלבים אושרו מתוך תשעה */
  function progress(p) {
    const st = stagesOf(p.id);
    return STAGES.filter((s) => (st[s.key] || {}).status === 'אושר').length;
  }

  // ---------- תצוגה ----------
  function bar(p) {
    const done = progress(p), pct = Math.round(done / STAGES.length * 100);
    return '<div class="pbar" title="' + done + ' מתוך ' + STAGES.length + ' שלבים אושרו">' +
      '<span style="width:' + pct + '%"></span></div><small>' + done + '/' + STAGES.length + '</small>';
  }

  function checklist(p, editable) {
    const st = stagesOf(p.id);
    // מנהל רשאי לרשום שלב על שם מפקח אחר. לכל שאר התפקידים השלב נרשם על שם
    // מי שמחובר, ולכן אין להם את הבחירה הזו.
    const pickBy = editable && isAdmin();
    const names = pickBy ? staff().map((u) => u.name) : [];
    return '<div class="pstages">' + STAGES.map((s) => {
      const cur = st[s.key] || { status: 'ממתין' };
      const K = MK();
      const by = cur.by || (K.getUser().name || '');
      return '<div class="pstage ' + esc(STAGE_CLASS[cur.status] || '') + (s.critical ? ' crit' : '') + '" data-stage="' + esc(s.key) + '">' +
        '<div class="ps-head"><b>' + esc(s.label) + '</b>' +
        (s.critical ? '<span class="badge warn">נקודת אל-חזור</span>' : '') + '</div>' +
        '<div class="ps-row">' +
          (editable
            ? '<select data-f="status">' + STAGE_STATUS.map((x) => '<option' + (x === cur.status ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' +
              '<input type="date" data-f="date" value="' + esc((cur.date || '').slice(0, 10)) + '">' +
              (pickBy ? '<label class="ps-who">מפקח<select data-f="by">' + options(names, by) + '</select></label>' : '') +
              '<input type="text" data-f="note" placeholder="הערה" value="' + esc(cur.note || '') + '">'
            : '<span class="badge">' + esc(cur.status) + '</span>' +
              (cur.date ? ' <small>' + esc(K.hebOf(cur.date)) + '</small>' : '') +
              (cur.note ? ' <small>· ' + esc(cur.note) + '</small>' : '')) +
        '</div>' +
        (cur.by && !pickBy ? '<small class="ps-by">' + esc(cur.by) + '</small>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  /** כרטיס פרויקט נפתח: הכותרת תמיד גלויה, הצ'ק-ליסט רק כשפותחים אותו. */
  function card(p, open) {
    return '<details class="panel pcard" data-project="' + esc(p.id) + '"' + (open ? ' open' : '') + '>' +
      '<summary>' + head(p) + '<span class="pchev">▾</span></summary>' +
      '<div class="pbody">' +
        '<div class="panel-tools"><button type="button" class="btn small" data-edit="' + esc(p.id) + '">✏️ עריכת הפרויקט</button></div>' +
        checklist(p, true) + completePanel(p) + '</div></details>';
  }

  /** פרויקט יחיד נפתח מעצמו; ברשימה ארוכה הכל סגור עד שפותחים. */
  function cards(list) {
    return list.map((p) => card(p, openState.has(p.id) ? openState.get(p.id) : list.length === 1)).join('');
  }

  function bindCards(root) {
    root.querySelectorAll('.pcard').forEach((d) => {
      d.addEventListener('toggle', () => openState.set(d.dataset.project, d.open));
      // קישור לכרטיס המקווה שיושב בתוך ה-summary אינו אמור גם לפתוח את הכרטיס
      d.querySelectorAll('summary a').forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));
    });
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const p = all().filter((x) => x.id === b.dataset.edit)[0];
      if (p) editForm(p);
    }));
    bindComplete(root);
  }

  function head(p) {
    const K = MK();
    const m = p.mikvehId ? K.S.byId[p.mikvehId] : null;
    return '<div class="phead">' +
      '<h3>' + (p.type === 'שיפוץ' ? '🔧' : '🏗️') + ' ' +
        (m ? '<a href="#/m/' + encodeURIComponent(m.id) + '">' + esc(p.mikveh) + '</a>' : esc(p.mikveh)) +
        (m ? '' : ' <span class="badge">טרם בבסיס הנתונים</span>') + '</h3>' +
      '<div class="pmeta">' + esc(p.type) + ' · <b>' + esc(p.status) + '</b>' +
        (p.place ? ' · ' + esc(p.place) : '') +
        (p.supervisor ? ' · מפקח: ' + esc(p.supervisor) : '') +
        (p.contractor ? ' · קבלן: ' + esc(p.contractor) : '') +
        (p.targetDate ? ' · סיום משוער ' + esc(K.hebOf(p.targetDate)) : '') + '</div>' +
      (p.note ? '<div class="pmeta">' + esc(p.note) + '</div>' : '') +
      '<div class="pprog">' + bar(p) + '</div></div>';
  }

  // ---------- לשונית בכרטיס המקווה ----------
  function cardPane(m) {
    const list = forMikveh(m.id);
    if (!list.length) {
      return '<div class="panel"><h3>פרויקט בנייה / שיפוץ</h3>' +
        '<div class="empty">אין פרויקט פתוח למקווה זה.</div>' +
        '<div class="panel-tools"><button class="btn primary small" id="pNewForMikveh">פתיחת פרויקט</button></div></div>';
    }
    return cards(list);
  }

  function bindCardPane(root, m) {
    const btn = root.querySelector('#pNewForMikveh');
    if (btn) btn.addEventListener('click', () => openForm({ mikveh: m.name, place: m.place || '' }));
    bindCards(root);
    bindStages(root);
  }

  /** חיווט של כל הפקדים בצ'ק-ליסט (עובד גם בכרטיס וגם במסך) */
  function bindStages(root) {
    root.querySelectorAll('[data-project] .pstage [data-f]').forEach((el) => {
      el.addEventListener('change', () => {
        const K = MK();
        if (!K.requireUser()) return;
        const box = el.closest('.pstage');
        const pid = el.closest('[data-project]').dataset.project;
        const payload = { id: pid, stage: box.dataset.stage };
        box.querySelectorAll('[data-f]').forEach((x) => { payload[x.dataset.f] = x.value; });
        el.disabled = true;
        K.DataSource.post('updateProjectStage', payload).then((res) => {
          const map = K.S.data.projectStages || (K.S.data.projectStages = {});
          (map[pid] = map[pid] || {})[res.stage] = res.record;
          const def = STAGES.find((s) => s.key === res.stage) || {};
          box.className = 'pstage ' + (STAGE_CLASS[res.record.status] || '') + (def.critical ? ' crit' : '');
          // השרת מאשר על שם מי נרשם השלב בפועל (ומנקה את השם כשחוזרים ל"ממתין")
          const bySel = box.querySelector('[data-f=by]');
          if (bySel) {
            const val = res.record.by || '';
            if (val && !Array.from(bySel.options).some((o) => o.value === val)) bySel.add(new Option(val, val));
            bySel.value = val;
          }
          el.disabled = false;
          K.toast('השלב עודכן');
          refreshNav();
        }).catch((err) => { el.disabled = false; K.toast('לא נשמר: ' + err.message); });
      });
    });
  }

  // ---------- טופס פתיחה ----------
  const MIKVEH_MODES = [
    ['exists', 'קיים בבסיס הנתונים'],
    ['new', 'מקווה חדש לגמרי'],
    ['unlisted', 'קיים, אך אינו מופיע ברשימה'],
  ];

  /** למנהל – בחירה מתוך משתמשי המערכת; לשאר – השם שלהם, כמו עד היום. */
  function supervisorField(id, cur) {
    const names = isAdmin() ? staff().map((u) => u.name) : [];
    if (!names.length) return '<input id="' + id + '" type="text" value="' + esc(cur) + '"' + (isAdmin() ? '' : ' readonly') + '>';
    return '<select id="' + id + '">' + options(names, cur) + '</select>';
  }

  /** מועצה ויישוב זהים בהרבה רשויות – אין טעם להציג את אותו שם פעמיים. */
  function whereOf(m) {
    const out = [];
    [m.council, m.place].forEach((v) => { if (v && out.indexOf(v) < 0) out.push(v); });
    return out.join(' · ');
  }

  /** חיפוש מקווה בבסיס הנתונים – שם, יישוב או מועצה. */
  function searchMikvaot(q) {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const scored = [];
    (MK().S.data.mikvaot || []).forEach((m) => {
      const name = (m.name || '').toLowerCase();
      const hay = [m.name, m.place, m.council].join(' ').toLowerCase();
      if (!terms.every((t) => hay.indexOf(t) >= 0)) return;
      scored.push([name.indexOf(terms[0]) === 0 ? 0 : name.indexOf(terms[0]) >= 0 ? 1 : 2, m]);
    });
    scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'he'));
    return scored.slice(0, 8).map((x) => x[1]);
  }

  function openForm(pre) {
    const K = MK();
    if (!K.requireUser()) return;
    const body = K.$('#editBody');
    if (!body) return;
    // #editModal הוא הרקע הכהה בלבד; המבנה הפנימי (modal / modal-head / modal-body)
    // קבוע ב-index.html, ודריסתו משאירה את הרקע בלי החלון הלבן.
    K.$('#editTitle').textContent = 'פתיחת פרויקט';
    body.innerHTML = '<form id="pForm" class="rform" novalidate><div class="fgrid">' +
      '<div class="ff wide"><span class="lbl">המקווה</span><div class="pills" id="pModes">' +
        MIKVEH_MODES.map(([k, l], i) => '<label class="pill"><input type="radio" name="pmode" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
        '</div></div>' +
      '<div class="ff wide"><label for="pMikveh">שם המקווה <span class="req">*</span></label>' +
        '<input id="pMikveh" type="text" required autocomplete="off" value="' + esc((pre && pre.mikveh) || '') + '">' +
        '<div class="ac" id="pMikList"></div>' +
        '<small class="hint" id="pMikHint"></small></div>' +
      '<div class="ff wide" id="pMarkRow"><label class="pill chk"><input type="checkbox" id="pMark" checked>' +
        '<span>לסמן את המקווה "בשיפוץ" (לא פעיל) עד אישור הסיום</span></label></div>' +
      '<div class="ff"><label for="pPlace">יישוב</label><input id="pPlace" type="text" value="' + esc((pre && pre.place) || '') + '"></div>' +
      '<div class="ff"><label for="pType">סוג</label><select id="pType">' + TYPES.map((t) => '<option>' + t + '</option>').join('') + '</select></div>' +
      '<div class="ff"><label>מפקח אחראי</label>' + supervisorField('pSup', K.getUser().name || '') + '</div>' +
      '<div class="ff"><label for="pCon">קבלן</label><input id="pCon" type="text"></div>' +
      '<div class="ff"><label for="pStart">תאריך התחלה</label><input id="pStart" type="date"></div>' +
      '<div class="ff"><label for="pTarget">סיום משוער</label><input id="pTarget" type="date"></div>' +
      '<div class="ff wide"><label for="pNote">הערה</label><textarea id="pNote" rows="2"></textarea></div>' +
      '</div><div class="factions"><button class="btn primary" type="submit">פתיחה</button>' +
      '<button class="btn" type="button" id="pCancel">ביטול</button>' +
      '<span class="fmsg" id="pMsg"></span></div></form>';

    K.$('#editModal').hidden = false;
    K.$('#pCancel').addEventListener('click', () => { K.$('#editModal').hidden = true; });

    const inp = K.$('#pMikveh'), list = K.$('#pMikList'), hint = K.$('#pMikHint'), markRow = K.$('#pMarkRow');
    let chosen = null;
    const mode = () => (body.querySelector('input[name=pmode]:checked') || {}).value || 'exists';

    function paintMode() {
      const exists = mode() === 'exists';
      markRow.hidden = !exists || !chosen;
      if (!exists) { list.innerHTML = ''; }
      hint.textContent = exists
        ? (chosen ? '' : 'הקלד חלק מהשם, מהיישוב או מהמועצה ובחר מהרשימה.')
        : mode() === 'new' ? 'המקווה יתווסף לבסיס הנתונים רק באישור סיום הפרויקט.'
          : 'הפרויקט ינוהל על השם הזה. אפשר להוסיף את המקווה לבסיס הנתונים באישור הסיום.';
    }
    function pick(m) {
      chosen = m;
      inp.value = m.name;
      if (!K.$('#pPlace').value.trim()) K.$('#pPlace').value = m.place || '';
      list.innerHTML = '';
      hint.textContent = [whereOf(m), 'פעילות: ' + (m.activity || '—')].filter(Boolean).join(' · ');
      markRow.hidden = false;
    }
    function search() {
      if (mode() !== 'exists') { list.innerHTML = ''; return; }
      const matches = searchMikvaot(inp.value);
      list.innerHTML = matches.length
        ? matches.map((m, i) => '<button type="button" data-i="' + i + '"><span>' + esc(m.name) + '</span><small>' +
            esc(whereOf(m)) + '</small></button>').join('')
        : (inp.value.trim() ? '<div class="hint">לא נמצא מקווה מתאים. אם הוא אינו ברשימה — בחר למעלה "מקווה חדש" או "אינו מופיע ברשימה".</div>' : '');
      list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => pick(matches[+b.dataset.i])));
    }
    inp.addEventListener('input', () => { chosen = null; markRow.hidden = true; search(); paintMode(); });
    body.querySelectorAll('input[name=pmode]').forEach((r) => r.addEventListener('change', () => { chosen = null; search(); paintMode(); }));
    paintMode();
    if (inp.value.trim()) { const m = K.findByName(inp.value); if (m) pick(m); else search(); }

    K.$('#pForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = K.$('#pMsg');
      const name = inp.value.trim();
      if (!name) { msg.textContent = 'חסר שם מקווה'; msg.className = 'fmsg bad'; return; }
      if (mode() === 'exists' && !chosen) {
        chosen = K.findByName(name);
        if (!chosen) { msg.textContent = 'בחר מקווה מהרשימה, או סמן שהוא חדש / אינו מופיע ברשימה'; msg.className = 'fmsg bad'; return; }
      }
      const data = {
        mikveh: chosen ? chosen.name : name,
        mikvehMode: mode(),
        markInactive: mode() === 'exists' && K.$('#pMark').checked,
        place: K.$('#pPlace').value.trim(),
        type: K.$('#pType').value,
        supervisor: K.$('#pSup').value.trim(),
        contractor: K.$('#pCon').value.trim(),
        startDate: K.$('#pStart').value,
        targetDate: K.$('#pTarget').value,
        note: K.$('#pNote').value.trim(),
      };
      msg.textContent = 'שומר...'; msg.className = 'fmsg';
      K.DataSource.post('addProject', data).then((res) => {
        (K.S.data.projects = K.S.data.projects || []).unshift(res.record);
        pushMessages(res);
        applyMikvehResult(res.mikveh);
        K.$('#editModal').hidden = true;
        K.toast(res.mikveh && res.mikveh.changed ? 'הפרויקט נפתח והמקווה סומן "בשיפוץ"' : 'הפרויקט נפתח');
        refreshNav();
        location.hash = '#/projects';
        renderView();
      }).catch((err) => { msg.textContent = err.message; msg.className = 'fmsg bad'; });
    });
  }

  // ---------- עריכת פרויקט ----------
  function editForm(p) {
    const K = MK();
    if (!K.requireUser()) return;
    const body = K.$('#editBody');
    if (!body) return;
    K.$('#editTitle').textContent = 'עריכת פרויקט – ' + p.mikveh;
    body.innerHTML = '<form id="peForm" class="rform" novalidate><div class="fgrid">' +
      '<div class="ff"><label for="peType">סוג</label><select id="peType">' + TYPES.map((t) => '<option' + (t === p.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      '<div class="ff"><label for="peStatus">סטטוס</label><select id="peStatus">' + STATUSES.map((t) => '<option' + (t === p.status ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      '<div class="ff"><label>מפקח אחראי</label>' + supervisorField('peSup', p.supervisor || '') +
        (isAdmin() ? '' : '<small class="hint">שינוי המפקח האחראי נעשה על ידי מנהל.</small>') + '</div>' +
      '<div class="ff"><label for="peCon">קבלן</label><input id="peCon" type="text" value="' + esc(p.contractor || '') + '"></div>' +
      '<div class="ff"><label for="pePlace">יישוב</label><input id="pePlace" type="text" value="' + esc(p.place || '') + '"></div>' +
      '<div class="ff"><label for="peTarget">סיום משוער</label><input id="peTarget" type="date" value="' + esc((p.targetDate || '').slice(0, 10)) + '"></div>' +
      '<div class="ff wide"><label for="peNote">הערה</label><textarea id="peNote" rows="2">' + esc(p.note || '') + '</textarea></div>' +
      '</div><div class="factions"><button class="btn primary" type="submit">שמירה</button>' +
      '<button class="btn" type="button" id="peCancel">ביטול</button>' +
      '<span class="fmsg" id="peMsg"></span></div></form>';

    K.$('#editModal').hidden = false;
    K.$('#peCancel').addEventListener('click', () => { K.$('#editModal').hidden = true; });
    K.$('#peForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = K.$('#peMsg');
      const asked = K.$('#peSup').value.trim();
      msg.textContent = 'שומר...'; msg.className = 'fmsg';
      K.DataSource.post('updateProject', {
        id: p.id,
        type: K.$('#peType').value,
        status: K.$('#peStatus').value,
        supervisor: asked,
        contractor: K.$('#peCon').value.trim(),
        place: K.$('#pePlace').value.trim(),
        targetDate: K.$('#peTarget').value,
        note: K.$('#peNote').value.trim(),
      }).then((res) => {
        replaceProject(res.record);
        K.$('#editModal').hidden = true;
        // השרת מחזיר את המפקח שנרשם בפועל. אם הוא אינו מה שביקשו – הבקשה נדחתה.
        K.toast(asked && asked !== (res.record.supervisor || '')
          ? 'נשמר. שינוי המפקח האחראי נעשה על ידי מנהל בלבד.' : 'הפרויקט עודכן');
        refreshNav();
        repaint();
      }).catch((err) => { msg.textContent = err.message; msg.className = 'fmsg bad'; });
    });
  }

  // ---------- אישור סיום ----------
  function completePanel(p) {
    const done = progress(p), left = STAGES.length - done;
    if (p.status === 'הושלם') {
      return '<div class="pdone ok"><b>✅ הפרויקט הושלם</b> — המקווה בבסיס הנתונים ומסומן "פעיל".</div>';
    }
    const ready = left === 0;
    return '<div class="pdone' + (ready ? ' ready' : '') + '">' +
      '<b>' + (ready ? 'כל השלבים אושרו — אפשר להכניס את המקווה לשירות' : 'אישור סיום ייפתח כשכל השלבים יאושרו') + '</b>' +
      '<small>' + (ready ? 'האישור מעדכן את בסיס הנתונים: מקווה קיים חוזר ל"פעיל", ומקווה חדש נוסף עכשיו.'
        : 'נותרו ' + left + ' שלבים מתוך ' + STAGES.length + '.') + '</small>' +
      (isAdmin() && !ready ? '<label class="pill chk"><input type="checkbox" data-force="1"><span>אישור בכל זאת (מנהל)</span></label>' : '') +
      '<button type="button" class="btn primary small" data-complete="' + esc(p.id) + '"' + (ready || isAdmin() ? '' : ' disabled') + '>אישור סיום והכנסת המקווה לשירות</button>' +
      '</div>';
  }

  function bindComplete(root) {
    root.querySelectorAll('[data-complete]').forEach((b) => b.addEventListener('click', () => {
      const K = MK();
      if (!K.requireUser()) return;
      const box = b.closest('.pdone');
      const force = !!(box && box.querySelector('[data-force]') && box.querySelector('[data-force]').checked);
      const p = all().filter((x) => x.id === b.dataset.complete)[0];
      if (!p) return;
      if (!confirm('לאשר את סיום הפרויקט ולהכניס את "' + p.mikveh + '" לשירות בבסיס הנתונים?')) return;
      b.disabled = true;
      K.DataSource.post('completeProject', { id: p.id, force }).then((res) => {
        replaceProject(res.record);
        pushMessages(res);
        applyMikvehResult(res.mikveh);
        K.toast(res.created ? 'המקווה נוסף לבסיס הנתונים' : 'המקווה חזר לפעילות');
        refreshNav();
        repaint();
      }).catch((err) => { b.disabled = false; K.toast('לא אושר: ' + err.message); });
    }));
  }

  // ---------- עזרי מצב ----------
  function pushMessages(res) {
    const K = MK();
    const msgs = res.messages || (res.message ? [res.message] : []);
    K.S.data.messages = K.S.data.messages || [];
    msgs.forEach((m) => { if (m && !K.S.data.messages.some((x) => x.id === m.id)) K.S.data.messages.push(m); });
  }

  /** עדכון המקווה במצב המקומי אחרי שהשרת שינה את "פעילות המקוה". */
  function applyMikvehResult(info) {
    if (!info) return;
    const K = MK();
    K.S.data.mikvaot = K.S.data.mikvaot || [];
    const m = K.S.byId[info.id] || K.findByName(info.name);
    if (m) m.activity = info.activity;
    else if (info.record) K.S.data.mikvaot.push(info.record);
    else return;
    K.buildIndexes();
  }

  function replaceProject(rec) {
    const K = MK();
    const list = K.S.data.projects = K.S.data.projects || [];
    const i = list.findIndex((x) => x.id === rec.id);
    if (i >= 0) list[i] = rec; else list.unshift(rec);
  }

  /** ציור מחדש של המסך הפתוח (מסך הפרויקטים או כרטיס המקווה). */
  function repaint() {
    if (location.hash.indexOf('#/projects') === 0) renderView();
    else MK().route();
  }

  // ---------- המסך ----------
  function renderView() {
    const K = MK(), root = K.$('#view-projects');
    if (!root) return;
    const list = all().filter((p) => filter === 'all' || (filter === 'active' ? p.status !== 'הושלם' : p.status === filter));
    const cnt = (k) => all().filter((p) => k === 'all' || (k === 'active' ? p.status !== 'הושלם' : p.status === k)).length;
    const chips = [['active', 'פעילים'], ['בתכנון', 'בתכנון'], ['בביצוע', 'בביצוע'], ['מושהה', 'מושהה'], ['הושלם', 'הושלמו'], ['all', 'הכל']];

    root.innerHTML = '<div class="toolbar"><div class="chips" id="pChips">' +
        chips.map(([k, l]) => '<button type="button" class="chip' + (k === filter ? ' on' : '') + '" data-chip="' + k + '">' + l + ' <span class="n">' + cnt(k) + '</span></button>').join('') +
        '</div><div class="row"><button class="btn primary" id="pNew">פתיחת פרויקט</button></div>' +
        '<div class="summary">' + (K.S.data.source === 'static' ? '<span class="badge bad">דורש חיבור חי לגיליון</span> ' : '') +
        '<b>' + list.length + '</b> פרויקטים. כל פרויקט מלווה בצ\'ק-ליסט של ' + STAGES.length + ' שלבים.</div></div>' +
      (list.length ? cards(list)
        : '<div class="panel"><div class="empty">אין פרויקטים להצגה</div></div>');

    root.querySelectorAll('#pChips .chip').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.chip; renderView(); }));
    root.querySelector('#pNew').addEventListener('click', () => openForm(null));
    bindCards(root);
    bindStages(root);
  }

  function refreshNav() {
    const el = MK().$('#navCountProjects');
    if (el) el.textContent = all().filter((p) => p.status !== 'הושלם').length;
  }

  window.MikvehProjects = { renderView, cardPane, bindCardPane, forMikveh, refreshNav, openForm, STAGES };
})();
