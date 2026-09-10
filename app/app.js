/**
 * מערכת כשרות המקוואות – לוגיקת האפליקציה.
 *
 * מקור הנתונים: window.MIKVEH_DATA (נוצר ע"י tools/export_excel.py).
 * בשלב הבא DataSource.load יקרא מ-API של Apps Script במקום מקובץ סטטי –
 * שאר הקוד לא צריך להשתנות.
 */
(function () {
  'use strict';

  // ============================================================ מקור נתונים
  const DataSource = {
    load: function () {
      // TODO(שלב 2): if (CONFIG.apiUrl) return fetch(CONFIG.apiUrl).then(r => r.json());
      return Promise.resolve(window.MIKVEH_DATA);
    }
  };

  const FORMS = [
    { key: 'inspection', title: 'דו"ח פיקוח', desc: 'ביקורת הלכתית מלאה: גג, מאגר, אוצרות, בור טבילה, טכני', url: 'https://goo.gl/forms/u96Zky0MJzGuswGC3' },
    { key: 'reservoir', title: 'דו"ח ריקון מאגר', desc: 'ריקון והחלפת מי גשמים במאגר', url: 'https://goo.gl/forms/oS2LeXLB00B7rnUs2' },
    { key: 'zeria', title: 'דו"ח החלפת אוצר זריעה', desc: 'ריקון, איטום ומילוי אוצר הזריעה', url: 'https://goo.gl/forms/ZrVkRw29lhalbuPJ2' },
    { key: 'hashaka', title: 'דו"ח החלפת אוצר השקה', desc: 'ריקון, איטום ומילוי אוצר ההשקה', url: 'https://goo.gl/forms/NUr4QBhyq6zonxu63' },
    { key: 'bor', title: 'דו"ח טיפול בור טבילה', desc: 'טיפול ותיקונים בבור הטבילה', url: 'https://goo.gl/forms/Ykm1PFoyCLnCf2U73' },
  ];

  // ============================================================ עזרים
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const val = (v) => (v == null || v === '' ? null : v);

  function parseISO(s) { return s ? new Date(s.replace(' ', 'T')) : null; }
  function fmtDate(iso) {
    const d = parseISO(iso);
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function hebOf(iso) {
    const d = parseISO(iso);
    return d && !isNaN(d) ? HebDate.format(d) : '';
  }
  function daysAgo(iso) {
    const d = parseISO(iso);
    if (!d || isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
  function ago(iso) {
    const n = daysAgo(iso);
    if (n == null) return '';
    if (n < 1) return 'היום';
    if (n < 30) return 'לפני ' + n + ' ימים';
    if (n < 365) return 'לפני ' + Math.round(n / 30) + ' חודשים';
    const y = Math.floor(n / 365);
    return y === 1 ? 'לפני שנה' : 'לפני ' + y + ' שנים';
  }

  // סטטוס לפי ערך של שדה פיקוח
  function statusClass(v) {
    if (!v) return '';
    if (/דחוף/.test(v)) return 'v-bad';
    if (/טעון|דרוש|לא תקין|חסר|ריק|מתחת/.test(v)) return 'v-warn';
    if (/^תקין$|^יש$|^לא$|^מלא$|^גדול$|^סביר$|^מעל/.test(v)) return 'v-ok';
    return '';
  }
  function badgeClass(v) {
    const c = statusClass(v);
    return c === 'v-bad' ? 'bad' : c === 'v-warn' ? 'warn' : c === 'v-ok' ? 'ok' : '';
  }

  // ---- תוקף תעודה ----
  const todayHeb = HebDate.fromDate(new Date());
  const todayOrd = HebDate.ordinal(todayHeb);
  function certStatus(m) {
    const c = (m.certificate || '').trim();
    if (!c || c === '?' || /אינו בפיקוח|אין/.test(c)) return { key: 'none', label: c && c !== '?' ? c : 'אין תעודה' };
    const h = HebDate.parse(c);
    if (!h) return { key: 'none', label: c };
    const ord = HebDate.ordinal(h);
    const diff = monthsDiff(h);
    if (ord < todayOrd) return { key: 'bad', label: c, ord, diff, sub: 'פג תוקף ' + (diff === 1 ? 'לפני חודש' : 'לפני ' + diff + ' חודשים') };
    if (diff >= -2) return { key: 'warn', label: c, ord, diff, sub: diff === 0 ? 'פג החודש' : 'פג בעוד ' + (-diff) + ' חודשים' };
    return { key: 'ok', label: c, ord, diff, sub: 'בתוקף' };
  }
  // כמה חודשים חלפו מתאריך עברי עד היום (חיובי = עבר)
  function monthsDiff(h) {
    const a = HebDate.toGregorian(h), b = new Date();
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  }

  // ============================================================ אינדקסים
  const S = { data: null, byId: {}, actions: {}, insp: {}, tasks: {}, plugs: {}, derived: {}, list: [], listShown: 0, filters: {} };

  function buildIndexes(data) {
    S.data = data;
    data.mikvaot.forEach((m) => { S.byId[m.id] = m; });
    const push = (map, key, rec) => { (map[key] = map[key] || []).push(rec); };
    data.actions.forEach((a) => a.mikvehId && push(S.actions, a.mikvehId, a));
    data.inspections.forEach((i) => i.mikvehId && push(S.insp, i.mikvehId, i));
    data.tasks.forEach((t) => t.mikvehId && push(S.tasks, t.mikvehId, t));
    Object.keys(data.plugs || {}).forEach((k) => {
      data.plugs[k].items.forEach((p) => {
        const m = findByName(p.mikveh);
        if (m) push(S.plugs, m.id, Object.assign({ group: data.plugs[k].title }, p));
      });
    });
    data.mikvaot.forEach((m) => {
      const ins = (S.insp[m.id] || []).slice().sort((a, b) => b.ts.localeCompare(a.ts));
      const acts = (S.actions[m.id] || []).slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      const tasks = S.tasks[m.id] || [];
      const cs = certStatus(m);
      S.derived[m.id] = {
        cert: cs,
        lastInsp: ins[0] || null,
        lastAction: acts[0] || null,
        inspCount: ins.length,
        actCount: acts.length,
        openTasks: tasks.length + (S.plugs[m.id] || []).length,
        urgent: tasks.some((t) => t.priority === 'דחוף') || (ins[0] && ins[0].urgent > 0),
      };
    });
  }

  const nameIndex = {};
  function normName(n) {
    return String(n || '').replace(/[–—]/g, '-').replace(/״/g, '"').replace(/''/g, '"').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  }
  function findByName(n) {
    if (!Object.keys(nameIndex).length) S.data.mikvaot.forEach((m) => { nameIndex[normName(m.name)] = m; });
    return nameIndex[normName(n)] || null;
  }

  // ============================================================ ניווט
  function route() {
    const h = location.hash || '#/';
    const parts = h.replace(/^#\/?/, '').split('/');
    const view = parts[0] || 'list';
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('on'));
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === (view === 'm' ? 'list' : view)));
    if (view === 'm' && parts[1]) {
      renderCard(decodeURIComponent(parts[1]), parts[2] || 'details');
      $('#view-card').classList.add('on');
    } else if (view === 'tasks') {
      renderTasks(); $('#view-tasks').classList.add('on');
    } else if (view === 'dashboard') {
      renderDashboard(); $('#view-dashboard').classList.add('on');
    } else if (view === 'forms') {
      renderForms(); $('#view-forms').classList.add('on');
    } else {
      $('#view-list').classList.add('on');
    }
    window.scrollTo(0, 0);
  }

  // ============================================================ רשימה
  function fillSelect(sel, values, allLabel) {
    const opts = ['<option value="">' + esc(allLabel || 'הכל') + '</option>'];
    values.forEach((v) => opts.push('<option value="' + esc(v) + '">' + esc(v) + '</option>'));
    sel.innerHTML = opts.join('');
  }
  function uniq(arr) { return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he')); }

  function initList() {
    const ms = S.data.mikvaot;
    fillSelect($('#fRegion'), uniq(ms.map((m) => m.region)));
    fillSelect($('#fCouncil'), uniq(ms.map((m) => m.council)));
    fillSelect($('#fAct'), uniq(ms.map((m) => m.activity)));
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('mikveh.filters') || '{}'); } catch (e) { saved = {}; }
    ['q', 'fRegion', 'fCouncil', 'fSup', 'fCert', 'fAct', 'fSort'].forEach((id) => {
      const el = $('#' + id);
      if (saved[id] != null) el.value = saved[id];
      // שדה טקסט: רק input (אירוע change נורה ביציאה מהשדה ומרנדר מחדש באמצע לחיצה על כרטיס)
      el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', applyList);
    });
    $('#fRegion').addEventListener('change', () => {
      // מועצות של האיזור שנבחר בלבד
      const r = $('#fRegion').value;
      const cur = $('#fCouncil').value;
      fillSelect($('#fCouncil'), uniq(ms.filter((m) => !r || m.region === r).map((m) => m.council)));
      $('#fCouncil').value = cur;
      applyList();
    });
    $('#btnClear').addEventListener('click', () => {
      ['q', 'fRegion', 'fCouncil', 'fSup', 'fCert', 'fAct'].forEach((id) => { $('#' + id).value = ''; });
      $('#fSort').value = 'name';
      applyList();
    });
    $('#listMore').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') { S.listShown += 120; drawList(); }
    });
    applyList();
  }

  function applyList() {
    const f = {
      q: $('#q').value.trim().toLowerCase(), region: $('#fRegion').value, council: $('#fCouncil').value,
      sup: $('#fSup').value, cert: $('#fCert').value, act: $('#fAct').value, sort: $('#fSort').value
    };
    try { localStorage.setItem('mikveh.filters', JSON.stringify({ q: f.q, fRegion: f.region, fCouncil: f.council, fSup: f.sup, fCert: f.cert, fAct: f.act, fSort: f.sort })); } catch (e) { /* ignore */ }
    const terms = f.q.split(/\s+/).filter(Boolean);
    let list = S.data.mikvaot.filter((m) => {
      const d = S.derived[m.id];
      if (f.region && m.region !== f.region) return false;
      if (f.council && m.council !== f.council) return false;
      if (f.sup && (m.supervised || '').trim() !== f.sup) return false;
      if (f.cert && d.cert.key !== f.cert) return false;
      if (f.act && m.activity !== f.act) return false;
      if (terms.length) {
        const hay = [m.name, m.council, m.place, m.address, m.attendant, m.phone, m.mikvehPhone, m.notes].join(' ').toLowerCase();
        return terms.every((t) => hay.includes(t));
      }
      return true;
    });
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, 'he'),
      council: (a, b) => (a.council || '').localeCompare(b.council || '', 'he') || a.name.localeCompare(b.name, 'he'),
      cert: (a, b) => (S.derived[a.id].cert.ord || 0) - (S.derived[b.id].cert.ord || 0),
      insp: (a, b) => ((S.derived[b.id].lastInsp || {}).ts || '').localeCompare((S.derived[a.id].lastInsp || {}).ts || ''),
      tasks: (a, b) => S.derived[b.id].openTasks - S.derived[a.id].openTasks,
    }[f.sort] || ((a, b) => a.name.localeCompare(b.name, 'he'));
    list.sort(cmp);
    S.list = list;
    S.listShown = 120;
    const sup = list.filter((m) => (m.supervised || '').trim() === 'כן').length;
    const bad = list.filter((m) => S.derived[m.id].cert.key === 'bad').length;
    $('#listSummary').innerHTML = '<b>' + list.length + '</b> מקוואות · <b>' + sup + '</b> בפיקוח · <b>' + bad + '</b> עם תעודה שפג תוקפה';
    drawList();
  }

  function drawList() {
    const list = S.list;
    if (!list.length) { $('#listGrid').innerHTML = '<div class="empty">לא נמצאו מקוואות התואמים לסינון</div>'; $('#listMore').innerHTML = ''; return; }
    const html = list.slice(0, S.listShown).map((m) => {
      const d = S.derived[m.id];
      const li = d.lastInsp;
      return '<a class="mcard s-' + d.cert.key + '" href="#/m/' + encodeURIComponent(m.id) + '">' +
        '<h3>' + esc(m.name) + '</h3>' +
        '<div class="loc">' + esc(m.council || '') + (m.region ? ' · ' + esc(m.region) : '') + (m.address ? ' · ' + esc(m.address) : '') + '</div>' +
        '<div class="tags">' +
          ((m.supervised || '').trim() === 'כן' ? '<span class="badge brand">בפיקוח</span>' : '<span class="badge">לא בפיקוח</span>') +
          (m.activity && m.activity !== 'פעיל' ? '<span class="badge warn">' + esc(m.activity) + '</span>' : '') +
          (d.urgent ? '<span class="badge bad">דחוף</span>' : '') +
          (d.openTasks ? '<span class="badge warn">' + d.openTasks + ' משימות</span>' : '') +
        '</div>' +
        '<div class="kv"><span>תעודה</span><b class="' + (d.cert.key === 'bad' ? 'v-bad' : '') + '">' + esc(d.cert.label) + '</b></div>' +
        '<div class="kv"><span>פיקוח אחרון</span><b>' + (li ? esc(li.hebDate || hebOf(li.ts)) : esc(m.lastInspection || '—')) + '</b></div>' +
        (m.attendant ? '<div class="kv"><span>בלנית</span><b>' + esc(m.attendant) + '</b></div>' : '') +
      '</a>';
    }).join('');
    $('#listGrid').innerHTML = html;
    $('#listMore').innerHTML = list.length > S.listShown ? '<button class="btn" type="button">הצג עוד (' + (list.length - S.listShown) + ' נוספים)</button>' : '';
  }

  // ============================================================ כרטיס מקווה
  function dl(pairs) {
    return '<dl class="dl">' + pairs.map(([k, v]) => '<div><dt>' + esc(k) + '</dt>' + (val(v) ? '<dd>' + v + '</dd>' : '<dd class="none">—</dd>') + '</div>').join('') + '</dl>';
  }
  function tel(p) { return p ? '<a href="tel:' + esc(String(p).replace(/[^\d+]/g, '')) + '">' + esc(p) + '</a>' : ''; }
  function badge(v, cls) { return v ? '<span class="badge ' + (cls || badgeClass(v)) + '">' + esc(v) + '</span>' : ''; }

  function renderCard(id, tab) {
    const m = S.byId[id];
    const root = $('#view-card');
    if (!m) { root.innerHTML = '<div class="empty">מקווה לא נמצא</div>'; return; }
    const d = S.derived[m.id];
    const acts = (S.actions[m.id] || []).slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    const ins = (S.insp[m.id] || []).slice().sort((a, b) => b.ts.localeCompare(a.ts));
    const tasks = S.tasks[m.id] || [];
    const plugs = S.plugs[m.id] || [];
    const li = ins[0];

    const formMenu = '<div class="menu" id="formMenu"><button class="btn primary" type="button">דיווח חדש ▾</button><div class="dd">' +
      FORMS.map((f) => '<a href="' + f.url + '" target="_blank" rel="noopener">' + esc(f.title) + '</a>').join('') + '</div></div>';

    const head = '<a class="back" href="#/">‹ חזרה לרשימה</a>' +
      '<div class="card-head"><div class="title"><div>' +
        '<h2>' + esc(m.name) + '</h2>' +
        '<div class="loc">' + [m.council, m.region, m.localityType, m.address].filter(Boolean).map(esc).join(' · ') + '</div>' +
        '<div class="tags">' +
          ((m.supervised || '').trim() === 'כן' ? badge('בפיקוח', 'brand') : badge('לא בפיקוח', '')) +
          badge(m.activity, m.activity === 'פעיל' ? 'ok' : 'warn') +
          badge(m.ownership, '') +
          (d.urgent ? badge('נדרש טיפול דחוף', 'bad') : '') +
        '</div></div>' +
        '<div class="actions">' + formMenu + '</div></div>' +
      '<div class="kpis">' +
        '<div class="kpi"><div class="l">תוקף תעודה</div><div class="v ' + (d.cert.key === 'bad' ? 'v-bad' : '') + '">' + esc(d.cert.label) + '</div><div class="s">' + esc(d.cert.sub || '') + '</div></div>' +
        '<div class="kpi"><div class="l">פיקוח אחרון</div><div class="v">' + (li ? esc(li.hebDate || hebOf(li.ts)) : esc(m.lastInspection || '—')) + '</div><div class="s">' + (li ? esc((li.rabbi || '') + ' · ' + ago(li.ts)) : '') + '</div></div>' +
        '<div class="kpi"><div class="l">פעולה אחרונה</div><div class="v">' + (d.lastAction ? esc(d.lastAction.action) : '—') + '</div><div class="s">' + (d.lastAction ? esc(hebOf(d.lastAction.ts) + ' · ' + ago(d.lastAction.ts)) : '') + '</div></div>' +
        '<div class="kpi"><div class="l">משימות פתוחות</div><div class="v">' + (tasks.length + plugs.length) + '</div><div class="s">' + (tasks.some((t) => t.priority === 'דחוף') ? 'כולל דחופות' : '') + '</div></div>' +
      '</div></div>';

    const tabs = [
      ['details', 'פרטים'], ['otzarot', 'אוצרות ומאגר'], ['history', 'היסטוריית פעולות', acts.length],
      ['inspections', 'דוחות פיקוח', ins.length], ['tasks', 'משימות', tasks.length + plugs.length], ['whatsapp', 'דיווחי וואטסאפ'],
    ];
    const tabBar = '<div class="tabs">' + tabs.map(([k, t, n]) =>
      '<button type="button" data-tab="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + t + (n != null ? '<span class="n">' + n + '</span>' : '') + '</button>').join('') + '</div>';

    const panes = {
      details: renderDetails(m),
      otzarot: renderOtzarot(m, li, plugs),
      history: renderHistory(acts),
      inspections: renderInspections(ins),
      tasks: renderCardTasks(tasks, plugs),
      whatsapp: '<div class="panel"><h3>דיווחי וואטסאפ</h3><div class="note-box">כאן יוצגו הדיווחים שמגיעים מקבוצת הוואטסאפ (מערכת הקליטה עם Green API וג\'מיני) ומזוהים למקווה זה. החיבור ליומן הדיווחים ייעשה בשלב הבא.</div></div>',
    };
    root.innerHTML = head + tabBar + Object.keys(panes).map((k) => '<div class="pane ' + (k === tab ? 'on' : '') + '" data-pane="' + k + '">' + panes[k] + '</div>').join('');

    root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
      history.replaceState(null, '', '#/m/' + encodeURIComponent(m.id) + '/' + b.dataset.tab);
      root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      root.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
    }));
    const menu = $('#formMenu');
    menu.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', () => menu.classList.remove('open'), { once: true });
  }

  function renderDetails(m) {
    return '<div class="panel"><h3>פרטים כלליים</h3>' + dl([
      ['שם המקוה', esc(m.name)], ['מועצה', esc(m.council)], ['יישוב', esc(m.place)], ['כתובת', esc(m.address)],
      ['איזור', esc(m.region)], ['סוג רשות', esc(m.localityType)], ['בעלות', esc(m.ownership)],
      ['פעילות', badge(m.activity, m.activity === 'פעיל' ? 'ok' : 'warn')], ['בפיקוח', esc(m.supervised)],
      ['תוקף תעודה', esc(m.certificate)], ['ביקור אחרון', esc(m.lastVisit)], ['פיקוח אחרון', esc(m.lastInspection)],
      ['רמת הנגשה', esc(m.accessibility)], ['תאום מראש', esc(m.coordination)],
    ]) + '</div>' +
    '<div class="panel"><h3>אנשי קשר</h3>' + dl([
      ['בלנית / אחראי', esc(m.attendant)], ['טלפון', tel(m.phone)], ['טלפון מקווה', tel(m.mikvehPhone)],
      ['מפתח מסטר', esc(m.masterKey)], ['איזה מפתח', esc(m.masterKeyWhich)],
    ]) + '</div>' +
    '<div class="panel"><h3>שעות פתיחה</h3>' + dl([
      ['קיץ', esc(m.hoursSummer)], ['חורף', esc(m.hoursWinter)], ['ערב שבת וחג', esc(m.hoursErev)], ['מוצ"ש ויו"ט', esc(m.hoursMotzash)],
    ]) + '</div>' +
    ((m.notes || m.notes2) ? '<div class="panel"><h3>הערות</h3><p>' + esc([m.notes, m.notes2].filter(Boolean).join(' · ')) + '</p></div>' : '');
  }

  function sectionOf(insp, key) {
    if (!insp) return null;
    return (insp.sections || []).find((s) => s.key === key) || null;
  }
  function tile(title, headBadge, rows) {
    return '<div class="tile"><h4>' + esc(title) + headBadge + '</h4>' +
      rows.filter((r) => val(r[1])).map((r) => '<div class="r"><span>' + esc(r[0]) + '</span><b>' + r[1] + '</b></div>').join('') + '</div>';
  }
  function secBadges(sec) {
    if (!sec) return '';
    const bad = sec.fields.filter((f) => /דחוף/.test(f[1])).length;
    const warn = sec.fields.filter((f) => /טעון|דרוש/.test(f[1])).length;
    return (bad ? badge(bad + ' דחוף', 'bad') : '') + (warn ? ' ' + badge(warn + ' לתיקון', 'warn') : '') + (!bad && !warn && sec.fields.length ? badge('תקין', 'ok') : '');
  }

  function renderOtzarot(m, li, plugs) {
    const z = sectionOf(li, 'zeria'), h = sectionOf(li, 'hashaka'), r = sectionOf(li, 'reservoir'), c = sectionOf(li, 'chabad');
    const lr = (li && li.lastReplaced) || {};
    const tiles = '<div class="tiles">' +
      tile('אוצר זריעה', secBadges(z), [['קיים', badge(m.otzarZeria)], ['החלפה אחרונה', esc(m.zeriaReplaced || lr.zeria)], ['טעון החלפה (פיקוח אחרון)', badge(li && li.zeriaReplace, li && li.zeriaReplace === 'לא' ? 'ok' : 'warn')]]) +
      tile('אוצר השקה', secBadges(h), [['קיים', badge(m.otzarHashaka)], ['סוג השקה', esc(m.hashakaType)], ['החלפה אחרונה', esc(m.hashakaReplaced || lr.hashaka)], ['טעון החלפה (פיקוח אחרון)', badge(li && li.hashakaReplace, li && li.hashakaReplace === 'לא' ? 'ok' : 'warn')]]) +
      tile('מאגר מי גשמים', secBadges(r), [['קיים', badge(m.reservoir)], ['ריקון אחרון', esc(m.reservoirEmptied || lr.reservoir)], ['טעון ריקון (פיקוח אחרון)', badge(li && li.reservoirEmpty, li && li.reservoirEmpty === 'לא' ? 'ok' : 'warn')]]) +
      tile("אוצר חב''ד", secBadges(c), [['החלפה אחרונה', esc(m.chabadReplaced || lr.chabad)], ['טעון החלפה', badge(li && li.chabadReplace, li && li.chabadReplace === 'לא' ? 'ok' : 'warn')]]) +
    '</div>';
    const tech = '<div class="panel" style="margin-top:12px"><h3>מתקנים</h3>' + dl([
      ['מיקום האוצרות', esc(m.otzarLocation)], ['פילטר', esc(m.filter)], ['מקוה כלים', esc(m.kelim)],
      ['שקע ליד האוצרות', esc(m.socket)], ['ברז לצינור', esc(m.hoseTap)],
    ]) + '</div>';
    const plugHtml = plugs.length ? '<div class="panel"><h3>פקקים ומילוי</h3>' + plugs.map((p) =>
      '<div class="bar"><span class="lbl">' + esc(p.group) + '</span><span>' + esc(p.hebDate || '') + (p.otzar ? ' · אוצר ' + esc(p.otzar) : '') + (p.note ? ' · ' + esc(p.note) : '') + '</span></div>').join('') + '</div>' : '';
    return '<div class="panel"><h3>מצב האוצרות והמאגר' + (li ? ' <small style="font-weight:400;color:var(--muted)">(לפי פיקוח ' + esc(li.hebDate || hebOf(li.ts)) + ')</small>' : '') + '</h3>' + tiles + '</div>' + tech + plugHtml;
  }

  function renderHistory(acts) {
    if (!acts.length) return '<div class="panel"><div class="empty">אין פעולות רשומות למקווה זה</div></div>';
    const items = acts.map((a) => {
      const bits = [];
      if (a.otzar) bits.push(badge('אוצר ' + a.otzar, 'brand'));
      if (a.validMonth) bits.push(badge('תוקף עד ' + a.validMonth + ' ' + (a.validYear || ''), 'ok'));
      if (a.drained) bits.push(badge('ריקון: ' + a.drained));
      if (a.sealed) bits.push(badge('איטום: ' + a.sealed));
      if (a.filled) bits.push(badge('מילוי: ' + a.filled));
      if (a.roofSealed) bits.push(badge('איטום גג: ' + a.roofSealed));
      if (a.reservoirSealed) bits.push(badge('איטום מאגר: ' + a.reservoirSealed));
      if (a.liters) bits.push(badge(a.liters + ' ליטר'));
      const notes = [a.note, a.note2].filter(Boolean).join(' · ');
      return '<li><div class="d">' + esc(hebOf(a.ts)) + '<small>' + esc(fmtDate(a.ts)) + '</small></div>' +
        '<div class="t"><div class="h">' + esc(a.action) + ' ' + bits.join(' ') + '</div>' +
        '<div class="n">' + esc([a.rabbi, a.attendant, a.phone].filter(Boolean).join(' · ')) + (notes ? '<br>' + esc(notes) : '') + '</div></div></li>';
    }).join('');
    return '<div class="panel"><h3>יומן פעולות</h3><ul class="timeline">' + items + '</ul></div>';
  }

  function renderInspections(ins) {
    if (!ins.length) return '<div class="panel"><div class="empty">אין דוחות פיקוח מפורטים למקווה זה</div></div>';
    return '<div class="panel"><h3>דוחות פיקוח הלכתי</h3>' + ins.map((i, idx) => {
      const secs = (i.sections || []).filter((s) => s.fields.length).map((s) =>
        '<div class="sec"><h4>' + esc(s.title) + '<span>' + secBadges(s) + '</span></h4>' +
        s.fields.map((f) => {
          const isNote = /תיאור|הערה/.test(f[0]);
          return '<div class="f ' + (isNote ? 'note' : statusClass(f[1])) + '"><span>' + esc(f[0]) + '</span><span>' + esc(f[1]) + '</span></div>';
        }).join('') + '</div>').join('');
      return '<details class="insp"' + (idx === 0 ? ' open' : '') + '><summary>' +
        '<span class="d">' + esc(i.hebDate || hebOf(i.ts)) + '</span><span class="r">' + esc(fmtDate(i.ts)) + ' · ' + esc(i.rabbi || '') + '</span>' +
        (i.urgent ? badge(i.urgent + ' תיקון דחוף', 'bad') : '') + (i.needed ? badge(i.needed + ' טעון תיקון', 'warn') : '') +
        (!i.urgent && !i.needed ? badge('תקין', 'ok') : '') +
        '</summary><div class="body">' + secs +
        (i.guidance ? '<div class="guidance"><b>הנחיות מיוחדות:</b> ' + esc(i.guidance) + '</div>' : '') +
        (i.contact || i.phone ? '<div class="guidance" style="background:var(--brand-soft)">נוכח בביקורת: ' + esc([i.contact, i.phone].filter(Boolean).join(' · ')) + '</div>' : '') +
        '</div></details>';
    }).join('') + '</div>';
  }

  function taskRow(t) {
    return '<tr class="link" data-id="' + esc(t.mikvehId || '') + '"><td>' + esc(t.mikveh) + '</td><td>' + esc(t.council || '') + '</td><td>' + esc(t.action || '') + '</td>' +
      '<td>' + badge(t.priority, t.priority === 'דחוף' ? 'bad' : 'warn') + '</td><td>' + esc(t.state || '') + '</td><td>' + (t.repairs || 0) + '</td><td>' + (t.roofRepairs || 0) + '</td>' +
      '<td>' + esc([t.needsEmptying ? 'טעון ריקון' : '', t.roofPlug ? 'פקק על הגג' : ''].filter(Boolean).join(', ')) + '</td></tr>';
  }
  const TASK_HEAD = '<thead><tr><th>מקווה</th><th>מועצה</th><th>משימה</th><th>עדיפות</th><th>מצב מאגר / נקב</th><th>תיקונים</th><th>תיקוני גג</th><th>הערות</th></tr></thead>';

  function renderCardTasks(tasks, plugs) {
    let html = '';
    html += '<div class="panel"><h3>משימות פתוחות</h3>' + (tasks.length ? '<div class="tbl-wrap"><table>' + TASK_HEAD + '<tbody>' + tasks.map(taskRow).join('') + '</tbody></table></div>' : '<div class="empty">אין משימות פתוחות</div>') + '</div>';
    if (plugs.length) html += '<div class="panel"><h3>פקקים ומילוי חוזר</h3>' + plugs.map((p) => '<div class="bar"><span class="lbl">' + esc(p.group) + '</span><span>' + esc(p.hebDate || '') + (p.otzar ? ' · אוצר ' + esc(p.otzar) : '') + (p.note ? ' · ' + esc(p.note) : '') + '</span></div>').join('') + '</div>';
    return html;
  }

  // ============================================================ משימות
  let tasksInit = false;
  function renderTasks() {
    const all = S.data.tasks;
    if (!tasksInit) {
      tasksInit = true;
      fillSelect($('#tAction'), uniq(all.map((t) => t.action)));
      ['tq', 'tAction', 'tPri'].forEach((id) => { const el = $('#' + id); el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderTasks); });
      $('#tasksTable').addEventListener('click', (e) => {
        const tr = e.target.closest('tr.link');
        if (tr && tr.dataset.id) location.hash = '#/m/' + encodeURIComponent(tr.dataset.id) + '/tasks';
      });
      const plugs = S.data.plugs || {};
      $('#plugsBox').innerHTML = Object.keys(plugs).map((k) => {
        const g = plugs[k];
        return '<div class="tile"><h4>' + esc(g.title) + '<span class="badge">' + g.items.length + '</span></h4>' +
          g.items.map((p) => { const m = findByName(p.mikveh); return '<div class="r"><span>' + (m ? '<a href="#/m/' + encodeURIComponent(m.id) + '/otzarot">' + esc(p.mikveh) + '</a>' : esc(p.mikveh)) + (p.council ? ' <small>(' + esc(p.council) + ')</small>' : '') + '</span><b>' + esc(p.hebDate || '') + (p.otzar ? ' · ' + esc(p.otzar) : '') + '</b></div>'; }).join('') +
          '</div>';
      }).join('');
    }
    const q = $('#tq').value.trim().toLowerCase(), act = $('#tAction').value, pri = $('#tPri').value;
    const list = all.filter((t) => (!q || (t.mikveh + ' ' + (t.council || '')).toLowerCase().includes(q)) && (!act || t.action === act) && (!pri || t.priority === pri));
    const order = { 'דחוף': 0, 'כן': 1 };
    list.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2) || (a.council || '').localeCompare(b.council || '', 'he'));
    $('#tasksSummary').innerHTML = '<b>' + list.length + '</b> משימות · <b>' + list.filter((t) => t.priority === 'דחוף').length + '</b> דחופות';
    $('#tasksTable').innerHTML = TASK_HEAD + '<tbody>' + (list.length ? list.map(taskRow).join('') : '<tr><td colspan="8" class="empty">אין משימות</td></tr>') + '</tbody>';
  }

  // ============================================================ לוח בקרה
  function renderDashboard() {
    const ms = S.data.mikvaot, D = S.derived;
    const sup = ms.filter((m) => (m.supervised || '').trim() === 'כן');
    const cnt = (key) => sup.filter((m) => D[m.id].cert.key === key).length;
    const year = new Date().getFullYear();
    const inspYear = S.data.inspections.filter((i) => i.ts.startsWith(String(year))).length;
    const actYear = S.data.actions.filter((a) => (a.ts || '').startsWith(String(year))).length;
    const urgentTasks = S.data.tasks.filter((t) => t.priority === 'דחוף').length;
    const noInsp2y = sup.filter((m) => { const li = D[m.id].lastInsp; return !li || daysAgo(li.ts) > 730; }).length;

    const stats = '<div class="stat-grid">' +
      stat('סה"כ מקוואות', ms.length, sup.length + ' בפיקוח') +
      stat('תעודות בתוקף', cnt('ok'), 'מתוך המקוואות בפיקוח', 'ok') +
      stat('תעודות שפג תוקפן', cnt('bad'), 'דורש חידוש', 'bad') +
      stat('פג בקרוב', cnt('warn'), 'בחודשיים הקרובים', 'warn') +
      stat('משימות דחופות', urgentTasks, 'מתוך ' + S.data.tasks.length + ' משימות', urgentTasks ? 'bad' : '') +
      stat('ללא פיקוח מפורט שנתיים+', noInsp2y, 'מקוואות בפיקוח', 'warn') +
      stat('ביקורות ' + year, inspYear, 'דוחות פיקוח השנה') +
      stat('פעולות ' + year, actYear, 'חידושים, החלפות, ריקונים') +
    '</div>';

    const byRegion = groupCount(ms, (m) => m.region || 'לא מוגדר');
    const byAction = groupCount(S.data.actions, (a) => a.action || 'לא מוגדר');
    const byCouncilBad = groupCount(sup.filter((m) => D[m.id].cert.key === 'bad'), (m) => m.council || 'לא מוגדר');
    const byRabbi = groupCount(S.data.inspections, (i) => i.rabbi || 'לא צוין');

    const panels = '<div class="two">' +
      '<div class="panel"><h3>מקוואות לפי איזור</h3>' + bars(byRegion, ms.length) + '</div>' +
      '<div class="panel"><h3>תעודות שפג תוקפן לפי מועצה (15 ראשונות)</h3>' + bars(byCouncilBad.slice(0, 15), byCouncilBad[0] ? byCouncilBad[0][1] : 1) + '</div>' +
      '<div class="panel"><h3>פעולות לפי סוג (כל השנים)</h3>' + bars(byAction, S.data.actions.length) + '</div>' +
      '<div class="panel"><h3>דוחות פיקוח לפי רב מפקח</h3>' + bars(byRabbi, S.data.inspections.length) + '</div>' +
    '</div>';

    const recent = S.data.actions.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 25);
    const recentHtml = '<div class="panel"><h3>פעולות אחרונות</h3><div class="tbl-wrap"><table><thead><tr><th>תאריך</th><th>מקווה</th><th>פעולה</th><th>אוצר</th><th>רב</th><th>הערה</th></tr></thead><tbody>' +
      recent.map((a) => '<tr class="link" data-id="' + esc(a.mikvehId || '') + '"><td>' + esc(hebOf(a.ts)) + '<br><small>' + esc(fmtDate(a.ts)) + '</small></td><td>' + esc(a.mikveh) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.otzar || '') + '</td><td>' + esc(a.rabbi || '') + '</td><td>' + esc(a.note || a.note2 || '') + '</td></tr>').join('') +
      '</tbody></table></div></div>';

    const root = $('#view-dashboard');
    root.innerHTML = stats + panels + recentHtml;
    root.querySelectorAll('tr.link').forEach((tr) => tr.addEventListener('click', () => { if (tr.dataset.id) location.hash = '#/m/' + encodeURIComponent(tr.dataset.id) + '/history'; }));
  }
  function stat(l, v, s, cls) { return '<div class="stat ' + (cls || '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div><div class="s">' + esc(s || '') + '</div></div>'; }
  function groupCount(arr, fn) {
    const c = {};
    arr.forEach((x) => { const k = fn(x); c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }
  function bars(entries, max) {
    return entries.map(([k, n]) => '<div class="bar"><span class="lbl">' + esc(k) + '</span><div class="trk"><div class="fil" style="width:' + Math.max(2, Math.round(100 * n / (max || 1))) + '%"></div></div><span class="num">' + n + '</span></div>').join('');
  }

  // ============================================================ טפסים
  function renderForms() {
    $('#formsList').innerHTML = FORMS.map((f) => '<a class="form-link" href="' + f.url + '" target="_blank" rel="noopener"><b>' + esc(f.title) + '</b><small>' + esc(f.desc) + '</small></a>').join('');
  }

  // ============================================================ הפעלה
  DataSource.load().then((data) => {
    buildIndexes(data);
    $('#navCountList').textContent = data.mikvaot.length;
    $('#navCountTasks').textContent = data.tasks.length;
    $('#headMeta').textContent = 'היום: ' + HebDate.format(new Date()) + ' · נתונים מעודכנים ל-' + fmtDate(data.meta.exportedAt);
    $('#footer').textContent = 'מקור הנתונים: קובץ האקסל ההיסטורי (' + data.mikvaot.length + ' מקוואות, ' + data.actions.length + ' פעולות, ' + data.inspections.length + ' דוחות פיקוח). גרסת מערכת 0.1';
    initList();
    window.addEventListener('hashchange', route);
    route();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }).catch((err) => {
    document.querySelector('main').innerHTML = '<div class="empty">שגיאה בטעינת הנתונים: ' + esc(err.message) + '</div>';
  });
})();
