/**
 * חלוקת עבודה: משימות (מילוי אחרי ריקון מאגר, חידוש תעודה, אחר) שנפתחות מרשימות
 * "תכנון עבודה", וכל מפקח לוחץ "אני לוקח". נשמר בלשונית "שיבוצים" בגיליון.
 * "דווח ביצוע" פותח את טופס הדיווח המתאים, ובשמירה המשימה נסגרת.
 */
(function () {
  'use strict';
  const TYPES = { fill: { label: 'מילוי מאגר / החלפת אוצר', form: 'zeria', icon: '💧' }, cert: { label: 'חידוש תעודה', form: 'cert', icon: '📜' }, other: { label: 'משימה', form: 'repair', icon: '🛠' } };
  const STATUS = { open: 'פתוח לבחירה', taken: 'נלקח', done: 'בוצע' };
  let filter = 'active', typeFilter = '';

  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);
  function all() { return MK().S.data.work || []; }
  function forMikveh(id) { return all().filter((w) => w.mikvehId === id && w.status !== 'done'); }
  function mk(id) { return MK().S.byId[id] || { name: id }; }

  function card(w) {
    const K = MK(), m = mk(w.mikvehId), me = K.getUser().name;
    const t = TYPES[w.type] || TYPES.other;
    const mine = w.status === 'taken' && w.takenBy === me;
    return '<div class="wcard ' + esc(w.status) + '" data-id="' + esc(w.id) + '">' +
      '<h4>' + t.icon + ' <a href="#/m/' + encodeURIComponent(w.mikvehId) + '">' + esc(m.name) + '</a></h4>' +
      '<div class="wl">' + esc(t.label) + (w.note ? ' · ' + esc(w.note) : '') + '</div>' +
      '<div class="wl">' + esc([m.council, m.region, m.address].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="wl">נפתח ' + esc(K.hebOf(w.ts)) + (w.by ? ' ע"י ' + esc(w.by) : '') + '</div>' +
      (w.status !== 'open' ? '<div class="wl"><b>' + esc(STATUS[w.status]) + '</b>' + (w.takenBy ? ' · ' + esc(w.takenBy) : '') + (w.takenAt ? ' · ' + esc(K.hebOf(w.takenAt)) : '') + (w.doneAt ? ' · בוצע ' + esc(K.hebOf(w.doneAt)) : '') + '</div>' : '') +
      '<div class="wb">' +
        (w.status === 'open' ? '<button class="btn primary small" data-act="take">אני לוקח</button>' : '') +
        (w.status === 'taken' ? '<button class="btn small" data-act="report">דווח ביצוע</button>' + (mine ? '<button class="btn small" data-act="release">שחרר</button>' : '') : '') +
        (w.status !== 'done' ? '<button class="btn small" data-act="done">סמן בוצע</button>' : '') +
      '</div></div>';
  }

  function bindCards(root, rerender) {
    root.querySelectorAll('.wcard [data-act]').forEach((b) => b.addEventListener('click', () => {
      const K = MK();
      if (!K.requireUser()) return;
      const id = b.closest('.wcard').dataset.id;
      const w = all().find((x) => x.id === id);
      if (!w) return;
      const act = b.dataset.act;
      if (act === 'report') {
        const t = TYPES[w.type] || TYPES.other;
        const m = K.S.byId[w.mikvehId];
        if (!m) return;
        window.MikvehWork.pending = w.id;
        K.openReport(m, t.form);
        return;
      }
      const status = act === 'take' ? 'taken' : act === 'release' ? 'open' : 'done';
      b.disabled = true;
      update(w, status).then(() => { K.toast(status === 'taken' ? 'נרשם: ' + K.getUser().name + ' לוקח את ' + mk(w.mikvehId).name : status === 'done' ? 'סומן כבוצע' : 'שוחרר'); rerender(); })
        .catch((err) => { b.disabled = false; K.toast('לא נשמר: ' + err.message); });
    }));
  }

  function update(w, status) {
    return MK().DataSource.post('updateWorkItem', { id: w.id, status }).then((res) => {
      if (res.record) Object.assign(w, res.record);
      if (res.message && !MK().S.data.messages.some((m) => m.id === res.message.id)) MK().S.data.messages.push(res.message);
      refreshNav();
    });
  }

  /** פתיחת משימות לחלוקה מרשימת התכנון. items = [{mikveh, type, note}] */
  function assign(items, typeKey) {
    const K = MK();
    if (!K.requireUser()) return Promise.reject(new Error('אין משתמש'));
    if (!items.length) { K.toast('לא נבחרו שורות'); return Promise.reject(new Error('empty')); }
    return K.DataSource.post('addWorkItems', { items: items.map((i) => ({ mikveh: i.mikveh, type: typeKey, note: i.note || '' })) }).then((res) => {
      (res.records || []).forEach((r) => { if (!all().some((w) => w.id === r.id)) K.S.data.work.push(r); });
      if (res.message) K.S.data.messages.push(res.message);
      refreshNav();
      K.toast((res.records || []).length + ' משימות נפתחו לחלוקה. נשלחה הודעה לדיון הכללי.');
      location.hash = '#/work';
    });
  }

  function refreshNav() { const el = MK().$('#navCountWork'); if (el) el.textContent = all().filter((w) => w.status !== 'done').length; }

  function renderView() {
    const K = MK();
    const root = K.$('#view-work');
    const list = all().filter((w) => (filter === 'all' || (filter === 'active' ? w.status !== 'done' : w.status === filter)) && (!typeFilter || w.type === typeFilter))
      .sort((a, b) => (a.status === 'open' ? 0 : a.status === 'taken' ? 1 : 2) - (b.status === 'open' ? 0 : b.status === 'taken' ? 1 : 2) || (b.ts || '').localeCompare(a.ts || ''));
    const me = K.getUser().name;
    const chips = [['active', 'פתוחות ונלקחו'], ['open', 'פתוחות לבחירה'], ['taken', 'נלקחו'], ['mine', 'שלי'], ['done', 'בוצעו'], ['all', 'הכל']];
    const cnt = (k) => all().filter((w) => k === 'all' || (k === 'active' ? w.status !== 'done' : k === 'mine' ? (w.takenBy === me && w.status !== 'done') : w.status === k)).length;
    const shown = filter === 'mine' ? all().filter((w) => w.takenBy === me && w.status !== 'done') : list;
    root.innerHTML = '<div class="toolbar"><div class="chips">' + chips.map(([k, l]) => '<button type="button" class="chip ' + (k === filter ? 'on' : '') + '" data-f="' + k + '">' + l + ' <span class="n">' + cnt(k) + '</span></button>').join('') + '</div>' +
      '<div class="row" style="margin-top:8px"><div class="field"><label for="wType">סוג</label><select id="wType"><option value="">הכל</option>' + Object.keys(TYPES).map((k) => '<option value="' + k + '"' + (k === typeFilter ? ' selected' : '') + '>' + esc(TYPES[k].label) + '</option>').join('') + '</select></div>' +
      '<button class="btn" id="wExport" type="button">⬇ ייצוא לאקסל</button><a class="btn" href="#/plan">＋ פתיחת משימות מתכנון העבודה</a></div>' +
      '<div class="summary">' + (K.S.data.source === 'static' ? '<span class="badge bad">דורש חיבור חי לגיליון</span>' : '') + ' <b>' + shown.length + '</b> משימות. כל אחד לוחץ "אני לוקח" על מה שהוא לוקח, וזה נרשם לכולם.</div></div>' +
      (shown.length ? '<div class="wgrid">' + shown.map(card).join('') + '</div>' : '<div class="empty">אין משימות. פותחים משימות מתוך "תכנון עבודה": מסמנים מאגרים שרוקנו או תעודות לחידוש ולוחצים "שלח לחלוקת עבודה".</div>');
    root.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; renderView(); }));
    K.$('#wType').addEventListener('change', (e) => { typeFilter = e.target.value; renderView(); });
    K.$('#wExport').addEventListener('click', () => K.exportTable(shown.map((w) => { const m = mk(w.mikvehId); return { 'מקווה': m.name, 'מועצה': m.council || '', 'איזור': m.region || '', 'סוג': (TYPES[w.type] || TYPES.other).label, 'סטטוס': STATUS[w.status] || w.status, 'נלקח ע"י': w.takenBy || '', 'נלקח בתאריך': K.hebOf(w.takenAt), 'בוצע בתאריך': K.hebOf(w.doneAt), 'נפתח': K.hebOf(w.ts), 'נפתח ע"י': w.by || '', 'הערה': w.note || '' }; }), 'חלוקת עבודה', 'work-items'));
    bindCards(root, renderView);
  }

  function renderCardPane(m) {
    const items = all().filter((w) => w.mikvehId === m.id).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    if (!items.length) return '';
    return '<div class="panel"><h3>חלוקת עבודה</h3><div class="wgrid">' + items.map(card).join('') + '</div></div>';
  }
  function bindCardPane(root, m) { bindCards(root, () => MK().route()); }

  /** נקרא מ-forms.js אחרי שמירת דיווח: סוגר משימה שנפתחה ממנה. */
  function afterReport(mikvehId) {
    const K = MK();
    const id = window.MikvehWork.pending; window.MikvehWork.pending = null;
    const w = id ? all().find((x) => x.id === id) : all().find((x) => x.mikvehId === mikvehId && x.status !== 'done' && x.takenBy === K.getUser().name);
    if (!w) return Promise.resolve();
    return update(w, 'done').then(() => K.toast('המשימה סומנה כבוצעה')).catch(() => {});
  }

  /** צ'קבוקסים ברשימות התכנון + כפתורי השליחה */
  function initPlanSelection() {
    const K = MK();
    const wire = (tableId, btnId, cntId, typeKey, rowsFn) => {
      const table = K.$('#' + tableId), btn = K.$('#' + btnId);
      if (!table || !btn) return;
      const count = () => { const n = table.querySelectorAll('input.sel:checked').length; K.$('#' + cntId).textContent = n; };
      table.addEventListener('change', (e) => { if (e.target.classList.contains('sel')) count(); if (e.target.classList.contains('selall')) { table.querySelectorAll('input.sel').forEach((c) => { c.checked = e.target.checked; }); count(); } });
      new MutationObserver(count).observe(table, { childList: true });
      btn.addEventListener('click', () => {
        const ids = Array.from(table.querySelectorAll('input.sel:checked')).map((c) => c.value);
        const items = ids.map((id) => ({ mikveh: mk(id).name, note: rowsFn(id) }));
        assign(items, typeKey).catch(() => {});
      });
    };
    wire('drainTable', 'btnAssignDrained', 'selDrained', 'fill', (id) => { const d = (K.drainedRows() || []).find((x) => x.m.id === id); return d ? 'רוקן ' + K.hebOf(d.drain.ts) + (d.drain.rabbi ? ' ע"י ' + d.drain.rabbi : '') : ''; });
    wire('certTable', 'btnAssignCerts', 'selCerts', 'cert', (id) => { const c = (K.certRows() || []).find((x) => x.m.id === id); return c ? 'תוקף ' + c.m.certificate : ''; });
  }

  window.MikvehWork = { renderView, renderCardPane, bindCardPane, forMikveh, assign, afterReport, initPlanSelection, pending: null, TYPES };
})();
