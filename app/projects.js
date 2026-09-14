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

  function all() { return MK().S.data.projects || []; }
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
    return '<div class="pstages">' + STAGES.map((s) => {
      const cur = st[s.key] || { status: 'ממתין' };
      const K = MK();
      return '<div class="pstage ' + esc(STAGE_CLASS[cur.status] || '') + (s.critical ? ' crit' : '') + '" data-stage="' + esc(s.key) + '">' +
        '<div class="ps-head"><b>' + esc(s.label) + '</b>' +
        (s.critical ? '<span class="badge warn">נקודת אל-חזור</span>' : '') + '</div>' +
        '<div class="ps-row">' +
          (editable
            ? '<select data-f="status">' + STAGE_STATUS.map((x) => '<option' + (x === cur.status ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' +
              '<input type="date" data-f="date" value="' + esc((cur.date || '').slice(0, 10)) + '">' +
              '<input type="text" data-f="note" placeholder="הערה" value="' + esc(cur.note || '') + '">'
            : '<span class="badge">' + esc(cur.status) + '</span>' +
              (cur.date ? ' <small>' + esc(K.hebOf(cur.date)) + '</small>' : '') +
              (cur.note ? ' <small>· ' + esc(cur.note) + '</small>' : '')) +
        '</div>' +
        (cur.by ? '<small class="ps-by">' + esc(cur.by) + '</small>' : '') +
        '</div>';
    }).join('') + '</div>';
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
    return list.map((p) => '<div class="panel" data-project="' + esc(p.id) + '">' + head(p) +
      checklist(p, true) + '</div>').join('');
  }

  function bindCardPane(root, m) {
    const btn = root.querySelector('#pNewForMikveh');
    if (btn) btn.addEventListener('click', () => openForm({ mikveh: m.name, place: m.place || '' }));
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
          el.disabled = false;
          K.toast('השלב עודכן');
          refreshNav();
        }).catch((err) => { el.disabled = false; K.toast('לא נשמר: ' + err.message); });
      });
    });
  }

  // ---------- טופס פתיחה ----------
  function openForm(pre) {
    const K = MK();
    if (!K.requireUser()) return;
    const body = K.$('#editBody');
    if (!body) return;
    // #editModal הוא הרקע הכהה בלבד; המבנה הפנימי (modal / modal-head / modal-body)
    // קבוע ב-index.html, ודריסתו משאירה את הרקע בלי החלון הלבן.
    K.$('#editTitle').textContent = 'פתיחת פרויקט';
    body.innerHTML = '<form id="pForm" class="rform" novalidate><div class="fgrid">' +
      '<div class="ff wide"><label>שם המקווה <span class="req">*</span></label>' +
        '<input id="pMikveh" type="text" required value="' + esc((pre && pre.mikveh) || '') + '">' +
        '<small class="hint">אפשר גם מקווה שעדיין אינו בבסיס הנתונים — פרויקט בנייה נפתח לפניו.</small></div>' +
      '<div class="ff"><label>יישוב</label><input id="pPlace" type="text" value="' + esc((pre && pre.place) || '') + '"></div>' +
      '<div class="ff"><label>סוג</label><select id="pType">' + TYPES.map((t) => '<option>' + t + '</option>').join('') + '</select></div>' +
      '<div class="ff"><label>מפקח אחראי</label><input id="pSup" type="text" value="' + esc(K.getUser().name || '') + '"></div>' +
      '<div class="ff"><label>קבלן</label><input id="pCon" type="text"></div>' +
      '<div class="ff"><label>תאריך התחלה</label><input id="pStart" type="date"></div>' +
      '<div class="ff"><label>סיום משוער</label><input id="pTarget" type="date"></div>' +
      '<div class="ff wide"><label>הערה</label><textarea id="pNote" rows="2"></textarea></div>' +
      '</div><div class="factions"><button class="btn primary" type="submit">פתיחה</button>' +
      '<button class="btn" type="button" id="pCancel">ביטול</button>' +
      '<span class="fmsg" id="pMsg"></span></div></form>';

    K.$('#editModal').hidden = false;
    K.$('#pCancel').addEventListener('click', () => { K.$('#editModal').hidden = true; });
    K.$('#pForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = K.$('#pMsg');
      const data = {
        mikveh: K.$('#pMikveh').value.trim(),
        place: K.$('#pPlace').value.trim(),
        type: K.$('#pType').value,
        supervisor: K.$('#pSup').value.trim(),
        contractor: K.$('#pCon').value.trim(),
        startDate: K.$('#pStart').value,
        targetDate: K.$('#pTarget').value,
        note: K.$('#pNote').value.trim(),
      };
      if (!data.mikveh) { msg.textContent = 'חסר שם מקווה'; msg.className = 'fmsg bad'; return; }
      msg.textContent = 'שומר...'; msg.className = 'fmsg';
      K.DataSource.post('addProject', data).then((res) => {
        (K.S.data.projects = K.S.data.projects || []).unshift(res.record);
        if (res.message) K.S.data.messages.push(res.message);
        K.$('#editModal').hidden = true;
        K.toast('הפרויקט נפתח');
        refreshNav();
        location.hash = '#/projects';
        renderView();
      }).catch((err) => { msg.textContent = err.message; msg.className = 'fmsg bad'; });
    });
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
      (list.length ? list.map((p) => '<div class="panel" data-project="' + esc(p.id) + '">' + head(p) + checklist(p, true) + '</div>').join('')
        : '<div class="panel"><div class="empty">אין פרויקטים להצגה</div></div>');

    root.querySelectorAll('#pChips .chip').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.chip; renderView(); }));
    root.querySelector('#pNew').addEventListener('click', () => openForm(null));
    bindStages(root);
  }

  function refreshNav() {
    const el = MK().$('#navCountProjects');
    if (el) el.textContent = all().filter((p) => p.status !== 'הושלם').length;
  }

  window.MikvehProjects = { renderView, cardPane, bindCardPane, forMikveh, refreshNav, openForm, STAGES };
})();
