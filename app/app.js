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
  // חיבור חי לגיליון דרך ה-Apps Script (Api.js). אם אין כתובת או שהרשת נופלת –
  // האפליקציה ממשיכה לעבוד מקובץ data.js (עותק סטטי).
  const DataSource = {
    config: function () { return window.MIKVEH_CONFIG || {}; },
    url: function (action) {
      const cfg = this.config();
      if (!cfg.apiUrl) return null;
      return cfg.apiUrl + (cfg.apiUrl.indexOf('?') >= 0 ? '&' : '?') + 'action=' + action +
        (cfg.apiToken ? '&token=' + encodeURIComponent(cfg.apiToken) : '');
    },
    load: function () {
      let url = this.url('data');
      if (url && window.MikvehAuth) { try { const t = MikvehAuth.token(); if (t) url += '&session=' + encodeURIComponent(t); } catch (e) { /* ignore */ } }
      const fallback = (err) => {
        const d = Object.assign({}, window.MIKVEH_DATA || { mikvaot: [], actions: [], inspections: [], tasks: [], plugs: {}, meta: {} });
        d.source = url ? 'fallback' : 'static';
        d.loadError = err ? err.message : '';
        return d;
      };
      if (!url) return Promise.resolve(fallback(null));
      return fetch(url, { redirect: 'follow', cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().then((d) => [d, r.headers.get('X-From-Cache') === '1']); })
        .then(([d, cached]) => { if (d.error) throw new Error(d.error); d.source = cached ? 'cached' : 'live'; return d; })
        .catch((err) => { console.warn('טעינה מהגיליון נכשלה, עובדים מהעותק המקומי:', err); return fallback(err); });
    },
    /** כתיבה לגיליון דרך ApiWrite.js. בלי חיבור – דיווחים והודעות נשמרים במכשיר ונשלחים אחר כך. */
    post: function (action, data) {
      const token = window.MikvehAuth ? MikvehAuth.token() : '';
      if (!this.url(action) || !navigator.onLine) {
        if (Outbox.CAN_QUEUE.indexOf(action) >= 0) return Promise.resolve(Outbox.add(action, data));
        return Promise.reject(new Error(!this.url(action) ? 'הפעולה הזו דורשת חיבור לגיליון (עדיין לא הוגדר בקובץ config.js)' : 'אין חיבור לאינטרנט. נסה שוב כשיהיה חיבור.'));
      }
      return this.postRaw(action, data, token).catch((err) => {
        if (err.code === 'auth' && window.MikvehAuth) MikvehAuth.onAuthError();
        if (err.message === 'Failed to fetch' && Outbox.CAN_QUEUE.indexOf(action) >= 0) return Outbox.add(action, data);
        throw err;
      });
    },
    postRaw: function (action, data, token) {
      const url = this.url(action);
      if (!url) return Promise.reject(new Error('אין חיבור לגיליון – יש להגדיר apiUrl בקובץ config.js'));
      if (!navigator.onLine) return Promise.reject(new Error('אין חיבור לאינטרנט'));
      return fetch(url, { method: 'POST', redirect: 'follow', cache: 'no-store', body: JSON.stringify({ action, user: getUser(), token: token || '', data }) })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((d) => { if (d.error) { const e = new Error(d.error); e.code = d.code; throw e; } return d; });
    }
  };

  // ============================================================ תור שליחה (בלי חיבור)
  const Outbox = {
    KEY: 'mikveh.outbox',
    CAN_QUEUE: ['addAction', 'addInspection', 'addMessage'],
    list: function () { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
    save: function (l) { try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) { /* ignore */ } renderOutbox(); },
    /** שומר את הפעולה במכשיר ומחזיר רשומה מקומית כדי שהכרטיס יתעדכן מיד */
    add: function (action, data) {
      const u = getUser();
      const now = new Date();
      const iso = (d) => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + 'T' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
      const id = 'local-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 7);
      let record;
      if (action === 'addMessage') {
        const m = data.mikveh ? findByName(data.mikveh) : null;
        record = { id, ts: iso(now), mikveh: data.mikveh || null, mikvehId: m ? m.id : null, author: u.name || 'אני', phone: u.phone || '', text: data.text, replyTo: data.replyTo || null, source: 'app', pending: true };
      } else {
        const m = findByName(data.mikveh);
        const when = data.date ? new Date(data.date + 'T12:00:00') : now;
        record = Object.assign({}, data, { ts: iso(when), mikveh: data.mikveh, mikvehId: m ? m.id : null, rabbi: data.rabbi || u.name || '', pending: true });
        if (action === 'addInspection') record = { ts: iso(when), mikveh: data.mikveh, mikvehId: m ? m.id : null, rabbi: data.rabbi || u.name || '', pending: true };
        ['drained', 'roofDone', 'treated'].forEach((k) => { if (Array.isArray(record[k])) record[k] = record[k].join(', '); });
      }
      const l = this.list(); l.push({ id, action, data, ts: iso(now), user: u });
      this.save(l);
      return { ok: true, queued: true, record };
    },
    /** שולח את מה שממתין (כשיש חיבור) */
    flush: function () {
      const l = this.list();
      if (!l.length || !DataSource.url('data') || !navigator.onLine) return Promise.resolve(0);
      let p = Promise.resolve(), sent = 0;
      l.forEach((item) => {
        p = p.then(() => DataSource.postRaw(item.action, item.data, window.MikvehAuth ? MikvehAuth.token() : '').then(() => { sent++; this.save(this.list().filter((x) => x.id !== item.id)); }).catch((err) => { if (err.code === 'auth') throw err; }));
      });
      return p.then(() => { if (sent) toast(sent + ' דיווחים שהמתינו במכשיר נשלחו לגיליון'); return sent; }).catch(() => sent);
    },
  };
  function renderOutbox() {
    const l = Outbox.list();
    const b = $('#outboxBadge');
    if (b) { b.hidden = !l.length; b.textContent = l.length ? '⏳ ' + l.length + ' ממתינים לשליחה' : ''; }
    const box = $('#outboxList');
    if (box) box.innerHTML = l.length ? '<div class="panel"><h3>ממתינים לשליחה מהמכשיר הזה (' + l.length + ')</h3><ul class="feed">' + l.map((it) => '<li><span class="fi">⏳</span><div class="ft"><b>' + esc(it.data.mikveh || 'דיון כללי') + '</b> · ' + esc(it.action === 'addMessage' ? 'הודעה: ' + (it.data.text || '').slice(0, 60) : it.action === 'addInspection' ? 'דו"ח פיקוח' : it.data.action) + '<small>' + esc(hebOf(it.ts)) + '</small></div></li>').join('') + '</ul><div class="note-box">יישלחו אוטומטית כשהאפליקציה תהיה מחוברת לגיליון.</div></div>' : '';
  }

  // ============================================================ המשתמש במכשיר הזה
  function getUser() {
    if (window.MikvehAuth && MikvehAuth.enabled()) return MikvehAuth.me() || {};
    try { return JSON.parse(localStorage.getItem('mikveh.user') || '{}'); } catch (e) { return {}; }
  }
  function setUser(u) {
    try { localStorage.setItem('mikveh.user', JSON.stringify(u)); } catch (e) { /* ignore */ }
    const b = $('#btnUser'); if (b) b.textContent = u.name ? '👤 ' + u.name : '👤 מי אני?';
  }
  let userCb = null;
  function openUserModal(cb) {
    userCb = cb || null;
    const u = getUser();
    $('#uName').value = u.name || ''; $('#uPhone').value = u.phone || '';
    $('#userModal').hidden = false; setTimeout(() => $('#uName').focus(), 50);
  }
  /** מחזיר true אם יש שם משתמש; אחרת פותח את חלון ההזדהות ומחזיר false. */
  function requireUser() {
    if (window.MikvehAuth) { const r = MikvehAuth.requireUser(); if (r !== null) return r; }
    if (getUser().name) return true;
    toast('קודם נגדיר מי אתה (פעם אחת במכשיר הזה)');
    openUserModal(null);
    return false;
  }
  function initUser() {
    setUser(getUser());
    $('#btnUser').addEventListener('click', () => { if (window.MikvehAuth && MikvehAuth.enabled()) MikvehAuth.openMenu(); else openUserModal(null); });
    $('#userClose').addEventListener('click', () => { $('#userModal').hidden = true; });
    $('#userForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const u = { name: $('#uName').value.trim(), phone: $('#uPhone').value.trim() };
      if (!u.name) return;
      setUser(u); $('#userModal').hidden = true;
      toast('שלום ' + u.name);
      if (userCb) { const cb = userCb; userCb = null; cb(u); }
    });
  }

  // ============================================================ הודעה קופצת
  let toastTimer = null;
  function toast(text) {
    const t = $('#toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  /** הוספת פעולה שנרשמה עכשיו (מהטופס) לנתונים המקומיים ורענון האינדקסים. */
  function addAction(rec) {
    S.data.actions.push(rec);
    rebuild();
  }
  function rebuild() {
    S.byId = {}; S.actions = {}; S.insp = {}; S.tasks = {}; S.plugs = {}; S.wa = {}; S.derived = {};
    buildIndexes(S.data);
  }

  // כל הדיווחים נעשים בתוך המערכת (forms.js). אין הפניה לטפסים חיצוניים.
  const FORMS = [
    { key: 'inspection', icon: '📋', title: 'דו"ח פיקוח', desc: 'ביקורת הלכתית מלאה: גג, מאגר, אוצרות, בור טבילה, טכני' },
    { key: 'reservoir', icon: '🌧', title: 'ריקון מאגר', desc: 'ריקון והחלפת מי גשמים במאגר' },
    { key: 'zeria', icon: '🔄', title: 'החלפת אוצר זריעה', desc: 'ריקון, איטום ומילוי אוצר הזריעה' },
    { key: 'hashaka', icon: '🔁', title: 'החלפת אוצר השקה', desc: 'ריקון, איטום ומילוי אוצר ההשקה' },
    { key: 'repair', icon: '🛠', title: 'טיפול / תיקון', desc: 'טיפול בבור הטבילה, באוצרות, במאגר או בגג' },
    { key: 'cert', icon: '📜', title: 'חידוש תעודה', desc: 'תעודת כשרות חדשה עם תוקף לשנה' },
    { key: 'visit', icon: '👣', title: 'ביקור כשרות', desc: 'ביקור שוטף ללא דוח מלא' },
    { key: 'plug', icon: '🔌', title: 'פקק על הגג', desc: 'הנחת פקק לפתיחת המאגר לגשם' },
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
  const S = { data: null, byId: {}, actions: {}, insp: {}, tasks: {}, plugs: {}, wa: {}, derived: {}, list: [], listShown: 0, filters: {} };

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
    // דיווחי וואטסאפ: לפי שם מקווה, ואם אין – לפי יישוב (כל המקוואות של אותו יישוב)
    data.whatsapp = data.whatsapp || [];
    const byPlace = {};
    data.mikvaot.forEach((m) => { [m.place, m.council].filter(Boolean).forEach((p) => push(byPlace, normName(p), m.id)); });
    data.whatsapp.forEach((w) => {
      const m = w.mikvehId ? S.byId[w.mikvehId] : findByName(w.mikveh);
      if (m) { w.mikvehId = m.id; push(S.wa, m.id, w); return; }
      const ids = byPlace[normName(w.settlement)] || [];
      w.viaSettlement = ids.length > 0;
      ids.forEach((id) => push(S.wa, id, w));
    });
    // מפתח חודש עברי לכל פעולה/ביקורת (לסטטיסטיקה חיה)
    const ordOf = (iso) => { const d = parseISO(iso); if (!d || isNaN(d)) return null; const h = HebDate.fromDate(d); return { ord: HebDate.ordinal(h), h }; };
    data.actions.forEach((a) => { const o = ordOf(a.ts); a._ord = o ? o.ord : null; a._h = o ? o.h : null; });
    data.inspections.forEach((i) => { const o = ordOf(i.ts); i._ord = o ? o.ord : null; i._h = o ? o.h : null; });
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
        waCount: (S.wa[m.id] || []).length,
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
    const view = parts[0] || 'home';
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('on'));
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === (view === 'm' ? 'list' : view)));
    document.body.classList.remove('nav-open');
    if (view === 'home') { renderHome(); $('#view-home').classList.add('on'); window.scrollTo(0, 0); return; }
    if (view === 'm' && parts[1]) {
      renderCard(decodeURIComponent(parts[1]), parts[2] || 'details');
      $('#view-card').classList.add('on');
    } else if (view === 'tasks') {
      renderTasks(); $('#view-tasks').classList.add('on');
    } else if (view === 'dashboard') {
      renderDashboard(); $('#view-dashboard').classList.add('on');
    } else if (view === 'forms') {
      renderForms(); $('#view-forms').classList.add('on');
    } else if (view === 'whatsapp') {
      renderWhatsappView(); $('#view-whatsapp').classList.add('on');
    } else if (view === 'plan') {
      renderPlan(parts[1]); $('#view-plan').classList.add('on');
    } else if (view === 'talk') {
      if (window.MikvehTalk) MikvehTalk.renderView(parts[1] || ''); $('#view-talk').classList.add('on');
    } else if (view === 'work') {
      if (window.MikvehWork) MikvehWork.renderView(parts[1] || ''); $('#view-work').classList.add('on');
    } else if (view === 'users') {
      if (window.MikvehAuth) MikvehAuth.renderUsersView(); $('#view-users').classList.add('on');
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
    $('#btnExportList').addEventListener('click', () => exportMikvaot(S.list));
    $('#btnNewMikveh').addEventListener('click', () => { if (window.MikvehEdit) MikvehEdit.open(null); });
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

    const formMenu = '<button class="btn primary" id="cardReport" type="button">＋ דיווח / עדכון</button><button class="btn" id="cardEdit" type="button" title="עריכת פרטי המקווה">✏️ עריכת פרטים</button>';

    const head = '<a class="back" href="#/list">‹ חזרה לרשימה</a>' +
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
      ['inspections', 'דוחות פיקוח', ins.length], ['tasks', 'משימות', tasks.length + plugs.length + (window.MikvehWork ? MikvehWork.forMikveh(m.id).length : 0)],
      ['talk', 'דיון', (S.data.messages || []).filter((x) => x.mikvehId === m.id).length], ['photos', 'תמונות', window.MikvehMedia ? MikvehMedia.photosCount(m) : 0], ['whatsapp', 'דיווחי וואטסאפ', (S.wa[m.id] || []).length],
    ];
    const tabBar = '<div class="tabs">' + tabs.map(([k, t, n]) =>
      '<button type="button" data-tab="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + t + (n != null ? '<span class="n">' + n + '</span>' : '') + '</button>').join('') + '</div>';

    const panes = {
      details: renderDetails(m),
      otzarot: renderOtzarot(m, li, plugs),
      history: renderHistory(acts),
      inspections: renderInspections(ins),
      tasks: (window.MikvehWork ? MikvehWork.renderCardPane(m) : '') + renderCardTasks(tasks, plugs),
      talk: window.MikvehTalk ? MikvehTalk.renderPane(m) : '',
      photos: window.MikvehMedia ? MikvehMedia.photosPane(m) : '',
      whatsapp: renderWhatsapp(S.wa[m.id] || [], m),
    };
    root.innerHTML = head + tabBar + Object.keys(panes).map((k) => '<div class="pane ' + (k === tab ? 'on' : '') + '" data-pane="' + k + '">' + panes[k] + '</div>').join('');

    root.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
      history.replaceState(null, '', '#/m/' + encodeURIComponent(m.id) + '/' + b.dataset.tab);
      root.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      root.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
    }));
    $('#cardReport').addEventListener('click', () => openReport(m));
    $('#cardEdit').addEventListener('click', () => { if (window.MikvehEdit) MikvehEdit.open(m); });
    if (window.MikvehTalk) MikvehTalk.bindPane(root, m);
    if (window.MikvehWork) MikvehWork.bindCardPane(root, m);
    root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.export === 'history') exportActions(acts, m.name);
      else exportInspections(ins, m.name);
    }));
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
      if (a.pending) bits.push(badge('ממתין לשליחה', 'warn'));
      const pics = window.MikvehMedia ? MikvehMedia.thumbs(MikvehMedia.forRef('action', a.ts)) : '';
      return '<li><div class="d">' + esc(hebOf(a.ts)) + '<small>' + esc(fmtDate(a.ts)) + '</small></div>' +
        '<div class="t"><div class="h">' + esc(a.action) + ' ' + bits.join(' ') + '</div>' +
        '<div class="n">' + esc([a.rabbi, a.attendant, a.phone].filter(Boolean).join(' · ')) + (notes ? '<br>' + esc(notes) : '') + '</div>' + pics + '</div></li>';
    }).join('');
    return '<div class="panel"><h3>יומן פעולות</h3><div class="panel-tools"><button class="btn small" type="button" data-export="history">⬇ ייצוא לאקסל</button></div><ul class="timeline">' + items + '</ul></div>';
  }

  function renderInspections(ins) {
    if (!ins.length) return '<div class="panel"><div class="empty">אין דוחות פיקוח מפורטים למקווה זה</div></div>';
    return '<div class="panel"><h3>דוחות פיקוח הלכתי</h3><div class="panel-tools"><button class="btn small" type="button" data-export="inspections">⬇ ייצוא לאקסל</button></div>' + ins.map((i, idx) => {
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
      $('#btnExportTasks').addEventListener('click', () => exportTasks(S.tasksShown || []));
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
    S.tasksShown = list;
    $('#tasksSummary').innerHTML = '<b>' + list.length + '</b> משימות · <b>' + list.filter((t) => t.priority === 'דחוף').length + '</b> דחופות';
    $('#tasksTable').innerHTML = TASK_HEAD + '<tbody>' + (list.length ? list.map(taskRow).join('') : '<tr><td colspan="8" class="empty">אין משימות</td></tr>') + '</tbody>';
  }

  // ============================================================ דף הבית
  function renderHome() {
    const ms = S.data.mikvaot, D = S.derived;
    const sup = ms.filter((m) => (m.supervised || '').trim() === 'כן');
    const certOk = sup.filter((m) => D[m.id].cert.key === 'ok' || D[m.id].cert.key === 'warn').length;
    const certBad = sup.filter((m) => D[m.id].cert.key === 'bad').length;
    const certSoon = sup.filter((m) => D[m.id].cert.key === 'warn').length;
    const year = todayHeb.year, yl = HebDate.yearLabel(year);
    const ytd = periodStats((o) => o >= year * 100 && o <= todayOrd);
    const month = periodStats((o) => o === todayOrd);
    const treated = new Set();
    S.data.actions.forEach((a) => { if (a._ord && a._ord >= year * 100 && a._ord <= todayOrd) treated.add(a.mikvehId || a.mikveh); });
    S.data.inspections.forEach((i) => { if (i._ord && i._ord >= year * 100 && i._ord <= todayOrd) treated.add(i.mikvehId || i.mikveh); });
    const work = (S.data.work || []).filter((w) => w.status !== 'done');
    const drained = drainedRows().length;
    const urgentTasks = S.data.tasks.filter((t) => t.priority === 'דחוף').length;
    const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
    const user = getUser();
    const mo = HebDate.monthName(todayHeb.year, todayHeb.month);

    const tile = (cls, ic, num, lbl, sub, href, ring) => '<a class="t3 ' + cls + '" href="' + href + '">' + (ring != null ? '<span class="ring" style="--p:' + ring + '" data-p="' + ring + '"></span>' : '') + '<span class="ic">' + ic + '</span><span class="num">' + num.toLocaleString('he-IL') + '</span><span class="lbl">' + lbl + '</span><span class="sub">' + sub + '</span></a>';
    const tiles = '<div class="tiles3d">' +
      tile('', '🕍', sup.length, 'מקוואות בפיקוח טהרת המשפחה', 'מתוך ' + ms.length.toLocaleString('he-IL') + ' מקוואות במאגר', '#/list', pct(sup.length, ms.length)) +
      tile('gold', '📜', certOk, 'עם תעודת כשרות בתוקף', certBad + ' פג תוקפן · ' + certSoon + ' פגות בקרוב', '#/plan/certs', pct(certOk, sup.length)) +
      tile('green', '🛠', treated.size, 'מקוואות שטופלו השנה', 'מתחילת שנת ' + esc(yl) + ' · ' + ytd.total.toLocaleString('he-IL') + ' פעולות', '#/dashboard') +
      tile('teal', '💧', ytd.otzar, 'החליפו אוצרות השנה', ytd.otzarot + ' אוצרות · ' + ytd.drain + ' ריקוני מאגר', '#/plan/drained') +
      tile('plum', '📋', ytd.cert, 'קיבלו תעודה השנה', 'החודש (' + esc(mo) + '): ' + month.cert, '#/dashboard') +
      tile('rust', '✋', work.length, 'משימות פתוחות לחלוקה', work.filter((w) => w.status === 'taken').length + ' נלקחו · ' + drained + ' מאגרים ממתינים למילוי', '#/work') +
    '</div>';

    const quick = '<div class="quick">' +
      '<button type="button" id="homeReport"><span class="ic">＋</span> דיווח / עדכון</button>' +
      '<a href="#/plan/certs"><span class="ic">📜</span> תעודות לחידוש <span class="n ' + (certBad ? 'bad' : '') + '">' + (certBad + certSoon) + '</span></a>' +
      '<a href="#/plan/drained"><span class="ic">💧</span> מאגרים לתכנון מילוי <span class="n">' + drained + '</span></a>' +
      '<a href="#/tasks"><span class="ic">⚠️</span> משימות דחופות <span class="n ' + (urgentTasks ? 'warn' : '') + '">' + urgentTasks + '</span></a>' +
      '<a href="#/talk"><span class="ic">💬</span> דיונים <span class="n">' + (S.data.messages || []).length + '</span></a>' +
    '</div>';

    // פעילות אחרונה: פעולות + דיווחי וואטסאפ + הודעות, לפי זמן
    const feed = [];
    S.data.actions.slice(-40).forEach((a) => a.ts && feed.push({ ts: a.ts, ic: '📝', html: '<b>' + (a.mikvehId ? '<a href="#/m/' + encodeURIComponent(a.mikvehId) + '/history">' + esc(a.mikveh) + '</a>' : esc(a.mikveh)) + '</b> · ' + esc(a.action) + (a.otzar ? ' ' + esc(a.otzar) : '') + (a.rabbi ? '<small>' + esc(a.rabbi) + '</small>' : '') }));
    (S.data.whatsapp || []).slice(0, 20).forEach((w) => w.ts && feed.push({ ts: w.ts, ic: '📱', html: '<b>' + esc(w.mikveh || w.settlement || 'וואטסאפ') + '</b> · ' + esc(w.summary || (w.text || '').slice(0, 80)) + '<small>' + esc(w.sender || '') + '</small>' }));
    (S.data.messages || []).slice(-20).forEach((x) => x.ts && feed.push({ ts: x.ts, ic: x.source === 'system' ? '🔔' : '💬', html: (x.mikvehId ? '<b><a href="#/talk/' + encodeURIComponent(x.mikvehId) + '">' + esc((S.byId[x.mikvehId] || {}).name || '') + '</a></b> · ' : '') + esc((x.text || '').slice(0, 90)) + '<small>' + esc(x.author || '') + '</small>' }));
    feed.sort((a, b) => b.ts.localeCompare(a.ts));
    const feedHtml = '<div class="panel"><h3>פעילות אחרונה</h3><ul class="feed">' + feed.slice(0, 12).map((f) => '<li><span class="fi">' + f.ic + '</span><div class="ft">' + f.html + '</div><small style="white-space:nowrap">' + esc(hebOf(f.ts)) + '</small></li>').join('') + '</ul></div>';

    const byRegion = groupCount(sup, (m) => m.region || 'לא מוגדר');
    const regionHtml = '<div class="panel"><h3>מקוואות בפיקוח לפי איזור</h3>' + bars(byRegion, byRegion[0] ? byRegion[0][1] : 1) + '</div>';
    const soon = certRows().filter((c) => !c.expired && c.days <= 45).slice(0, 8);
    const soonHtml = '<div class="panel"><h3>תעודות שפגות ב-45 הימים הקרובים</h3>' + (soon.length ? '<ul class="feed">' + soon.map((c) => '<li><span class="fi">📜</span><div class="ft"><b><a href="#/m/' + encodeURIComponent(c.m.id) + '">' + esc(c.m.name) + '</a></b> · ' + esc(c.m.council || '') + '<small>' + esc(c.m.certificate) + ' · ' + (c.days <= 0 ? 'פג החודש' : 'בעוד ' + c.days + ' ימים') + '</small></div></li>').join('') + '</ul>' : '<div class="empty">אין תעודות שפגות בקרוב</div>') + '<div class="panel-tools" style="margin-top:8px"><a class="btn small" href="#/plan/certs">לרשימה המלאה</a></div></div>';
    const monthHtml = '<div class="panel"><h3>החודש – ' + esc(mo + ' ' + HebDate.yearLabel(todayHeb.year)) + '</h3><div class="dl"><dl class="dl">' +
      [['קיבלו תעודה', month.cert], ['החליפו אוצרות', month.otzar], ['רוקנו מאגר', month.drain], ['תיקונים וטיפולים', month.other], ['ביקורות פיקוח', month.insp], ['סה"כ פעולות', month.total]].map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl></div><div class="panel-tools" style="margin-top:8px"><a class="btn small" href="#/dashboard">לנתונים החיים המלאים</a></div></div>';

    $('#view-home').innerHTML = '<div class="hero"><div><h2>טהרת המשפחה · <span>כשרות המקוואות</span></h2><div class="sub">' + (user.name ? 'שלום ' + esc(user.name) + '. ' : '') + 'תמונת מצב חיה של כל המקוואות בפיקוח.</div></div><div class="today">היום <b>' + esc(HebDate.format(new Date())) + '</b> · ' + esc(fmtDate(new Date().toISOString())) + '</div></div>' +
      tiles + quick + '<div class="home-grid">' + feedHtml + soonHtml + monthHtml + regionHtml + '</div>';
    $('#homeReport').addEventListener('click', () => openReport(null));
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
    root.innerHTML = liveStatsHtml() + stats + panels + recentHtml;
    root.querySelectorAll('tr.link').forEach((tr) => tr.addEventListener('click', () => { if (tr.dataset.id) location.hash = '#/m/' + encodeURIComponent(tr.dataset.id) + '/history'; }));
    $('#liveMonth').addEventListener('change', (e) => { S.liveMonth = +e.target.value; $('#liveBody').innerHTML = liveStatsBody(); });
  }
  // ---- נתונים חיים לפי חודש עברי / מתחילת השנה ----
  function periodStats(pred) {
    const sets = { cert: new Set(), otzar: new Set(), drain: new Set(), other: new Set(), insp: new Set() };
    let total = 0, otzarot = 0;
    S.data.actions.forEach((a) => {
      if (!a._ord || !pred(a._ord)) return;
      total++;
      const id = a.mikvehId || a.mikveh, t = a.action || '';
      if (t === 'חידוש תעודה') sets.cert.add(id);
      else if (/החלפת אוצר|מילוי אוצר/.test(t)) { sets.otzar.add(id); otzarot++; }
      else if (t === 'ריקון מאגר') sets.drain.add(id);
      else sets.other.add(id);
    });
    S.data.inspections.forEach((i) => { if (i._ord && pred(i._ord)) sets.insp.add(i.mikvehId || i.mikveh); });
    return { cert: sets.cert.size, otzar: sets.otzar.size, otzarot, drain: sets.drain.size, other: sets.other.size, insp: sets.insp.size, total };
  }
  function monthOptions() {
    // כל החודשים שיש בהם פעולות בשנתיים האחרונות + החודש הנוכחי
    const seen = {};
    seen[todayOrd] = todayHeb;
    S.data.actions.forEach((a) => { if (a._ord && a._ord >= todayOrd - 300 && !seen[a._ord]) seen[a._ord] = a._h; });
    return Object.keys(seen).map(Number).sort((a, b) => b - a).map((ord) => ({ ord, label: HebDate.monthName(seen[ord].year, seen[ord].month) + ' ' + HebDate.yearLabel(seen[ord].year) }));
  }
  function liveStatsHtml() {
    if (!S.liveMonth) S.liveMonth = todayOrd;
    const opts = monthOptions().map((o) => '<option value="' + o.ord + '"' + (o.ord === S.liveMonth ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('');
    return '<div class="live"><div class="hd"><h3>נתונים חיים – כמה מקוואות טופלו</h3><div><label for="liveMonth" style="font-size:.8rem;color:var(--muted);margin-inline-end:6px">חודש</label><select id="liveMonth">' + opts + '</select></div></div>' +
      '<div class="tbl-wrap"><table id="liveBody">' + liveStatsBody() + '</table></div></div>';
  }
  function liveStatsBody() {
    const ord = S.liveMonth || todayOrd;
    const year = Math.floor(ord / 100);
    const month = periodStats((o) => o === ord);
    const ytd = periodStats((o) => o >= year * 100 && o <= ord);
    const prevYtd = periodStats((o) => o >= (year - 1) * 100 && o <= ord - 100);
    const prevAll = periodStats((o) => o >= (year - 1) * 100 && o < year * 100);
    const yl = HebDate.yearLabel(year), pl = HebDate.yearLabel(year - 1);
    const mo = monthOptions().find((o) => o.ord === ord);
    const rows = [
      ['קיבלו תעודה', 'cert'], ['החליפו אוצרות', 'otzar'], ['רוקנו מאגר', 'drain'], ['תיקונים וטיפולים אחרים', 'other'], ['עברו ביקורת פיקוח מפורטת', 'insp'], ['סה"כ פעולות שנרשמו', 'total'],
    ];
    return '<thead><tr><th></th><th>' + esc(mo ? mo.label : '') + '</th><th>מתחילת שנת ' + esc(yl) + '</th><th>אותה תקופה ' + esc(pl) + '</th><th>כל שנת ' + esc(pl) + '</th></tr></thead><tbody>' +
      rows.map(([l, k]) => '<tr><td>' + l + '</td><td>' + month[k] + (k === 'otzar' && month.otzarot ? '<small>' + month.otzarot + ' אוצרות</small>' : '') + '</td><td>' + ytd[k] + (k === 'otzar' && ytd.otzarot ? '<small>' + ytd.otzarot + ' אוצרות</small>' : '') + '</td><td>' + prevYtd[k] + '</td><td>' + prevAll[k] + '</td></tr>').join('') + '</tbody>';
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

  // ============================================================ וואטסאפ
  function waItem(w, showMikveh) {
    const media = (w.media || []).map((u, i) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">מדיה ' + (i + 1) + '</a>').join(' · ');
    const target = showMikveh ? (w.mikvehId ? '<a href="#/m/' + encodeURIComponent(w.mikvehId) + '/whatsapp">' + esc(w.mikveh || w.settlement) + '</a>' : esc(w.mikveh || w.settlement || '')) : '';
    const statusCls = /מזוהה|זוהה/.test(w.status || '') && !/לא/.test(w.status || '') ? 'ok' : /בירור/.test(w.status || '') ? 'warn' : '';
    return '<li><div class="d">' + esc(hebOf(w.ts) || w.ts || '') + '<small>' + esc(fmtDate(w.ts) + (parseISO(w.ts) ? ' ' + parseISO(w.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '')) + '</small></div>' +
      '<div class="t"><div class="h">' + (target ? target + ' · ' : '') + esc(w.sender || w.phone || '') + ' ' +
        (w.defect ? badge(w.defect, 'warn') : '') + (w.status ? badge(w.status, statusCls) : '') + (w.viaSettlement ? badge('לפי יישוב', '') : '') + '</div>' +
      '<div>' + esc(w.summary || w.text || '') + '</div>' +
      (w.summary && w.text && w.text !== w.summary ? '<div class="n">' + esc(w.text) + '</div>' : '') +
      ((media || w.archive) ? '<div class="n">' + media + (w.archive ? (media ? ' · ' : '') + '<a href="' + esc(w.archive) + '" target="_blank" rel="noopener">קובץ מקורי</a>' : '') + '</div>' : '') +
      '</div></li>';
  }
  function waNotice() {
    const src = S.data.source;
    if (src === 'live') return '';
    if (src === 'cached') return '<div class="note-box">אין חיבור כרגע, מוצג העותק השמור האחרון מהגיליון.</div>';
    return '<div class="note-box">' + (src === 'static'
      ? 'האפליקציה עובדת מעותק סטטי. דיווחי הוואטסאפ מגיעים רק בחיבור חי לגיליון (הגדרת apiUrl בקובץ config.js).'
      : 'לא הצלחנו להתחבר לגיליון, מוצג העותק המקומי האחרון.') + '</div>';
  }
  function renderWhatsapp(list, m) {
    const items = list.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    return '<div class="panel"><h3>דיווחי וואטסאפ</h3>' + waNotice() +
      (items.length ? '<ul class="timeline">' + items.map((w) => waItem(w, false)).join('') + '</ul>' :
        '<div class="empty">אין דיווחי וואטסאפ שזוהו למקווה זה' + (m.place ? ' או ליישוב ' + esc(m.place) : '') + '</div>') + '</div>';
  }
  let waInit = false;
  function renderWhatsappView() {
    const all = S.data.whatsapp || [];
    if (!waInit) {
      waInit = true;
      $('#wq').addEventListener('input', renderWhatsappView);
      $('#wStatus').addEventListener('change', renderWhatsappView);
      fillSelect($('#wStatus'), uniq(all.map((w) => w.status)));
      $('#btnExportWa').addEventListener('click', () => exportWhatsapp(S.waShown || []));
    }
    const q = $('#wq').value.trim().toLowerCase(), st = $('#wStatus').value;
    const list = all.filter((w) => (!st || w.status === st) && (!q || [w.mikveh, w.settlement, w.sender, w.text, w.summary, w.defect].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 300);
    S.waShown = list;
    $('#waSummary').innerHTML = '<b>' + list.length + '</b> דיווחים מוצגים מתוך <b>' + all.length + '</b>';
    $('#waList').innerHTML = waNotice() + (list.length ? '<div class="panel"><ul class="timeline">' + list.map((w) => waItem(w, true)).join('') + '</ul></div>' : '<div class="empty">אין דיווחים</div>');
  }

  // ============================================================ תכנון עבודה
  const PLAN = { init: false, certChip: 'soon3', drainChip: 'all', certs: [], drained: [], planned: [] };
  const CERT_CHIPS = [['expired', 'פג תוקף'], ['month', 'החודש'], ['soon3', '3 חודשים'], ['soon6', '6 חודשים'], ['year', 'השנה הקרובה'], ['all', 'כל התעודות']];
  const DRAIN_CHIPS = [['all', 'כל הממתינים'], ['d30', '30+ ימים'], ['d90', '90+ ימים'], ['plug', 'עם פקק על הגג']];

  function certRows() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out = [];
    S.data.mikvaot.forEach((m) => {
      if ((m.supervised || '').trim() !== 'כן') return;
      const h = HebDate.parse(m.certificate || '');
      if (!h) return;
      const r = HebDate.monthRange(h);
      const days = Math.round((r.start - today) / 86400000);
      const expired = r.end <= today;
      const lastCert = (S.actions[m.id] || []).filter((a) => a.action === 'חידוש תעודה').sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))[0];
      out.push({ m, h, ord: HebDate.ordinal(h), days, expired, start: r.start, lastCert });
    });
    out.sort((a, b) => a.start - b.start);
    return out;
  }
  function certFilter(c, chip) {
    if (chip === 'all') return true;
    if (chip === 'expired') return c.expired;
    if (c.expired) return false;
    if (chip === 'month') return c.ord === todayOrd || c.days <= 31;
    if (chip === 'soon3') return c.days <= 92;
    if (chip === 'soon6') return c.days <= 183;
    return c.days <= 366;
  }
  function drainedRows() {
    const out = [];
    S.data.mikvaot.forEach((m) => {
      const acts = (S.actions[m.id] || []).filter((a) => a.ts);
      let drain = null, fill = null, plug = null;
      acts.forEach((a) => {
        if (a.action === 'ריקון מאגר' && (!drain || a.ts > drain.ts)) drain = a;
        if (/החלפת אוצר|מילוי אוצר/.test(a.action || '') && (!fill || a.ts > fill.ts)) fill = a;
        if (a.action === 'פקק על הגג' && (!plug || a.ts > plug.ts)) plug = a;
      });
      if (!drain) return;
      if (fill && fill.ts > drain.ts) return; // כבר מולא אחרי הריקון
      const days = daysAgo(drain.ts);
      out.push({ m, drain, days, plug: plug && plug.ts > drain.ts ? plug : null, task: (S.tasks[m.id] || []).find((t) => t.action === 'ריקון מאגר') || null });
    });
    out.sort((a, b) => (b.drain.ts || '').localeCompare(a.drain.ts || ''));
    return out;
  }
  function workBadge(mid) {
    const w = (S.data.work || []).filter((x) => x.mikvehId === mid && x.status !== 'done');
    if (!w.length) return '';
    return ' ' + w.map((x) => badge(x.status === 'taken' ? 'נלקח: ' + (x.takenBy || '') : 'פתוח לחלוקה', x.status === 'taken' ? 'brand' : 'warn')).join(' ');
  }
  function dueCell(c) {
    if (c.expired) return '<span class="due-bad">פג תוקף לפני ' + Math.abs(Math.round((new Date() - c.start) / 86400000)) + ' ימים</span>';
    if (c.days <= 0) return '<span class="due-warn">פג החודש</span>';
    return '<span class="' + (c.days <= 31 ? 'due-warn' : 'due-ok') + '">בעוד ' + c.days + ' ימים</span>';
  }
  function renderPlan(tab) {
    if (!PLAN.init) {
      PLAN.init = true;
      PLAN.certs = certRows(); PLAN.drained = drainedRows();
      PLAN.planned = S.data.tasks.filter((t) => /ריקון|אוצר/.test(t.action || ''));
      $('#planTabs').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-tab]'); if (!b) return;
        history.replaceState(null, '', '#/plan/' + b.dataset.tab); showPlanTab(b.dataset.tab);
      });
      $('#certChips').innerHTML = CERT_CHIPS.map(([k, l]) => '<button type="button" class="chip" data-chip="' + k + '">' + l + ' <span class="n"></span></button>').join('');
      $('#certChips').addEventListener('click', (e) => { const b = e.target.closest('[data-chip]'); if (b) { PLAN.certChip = b.dataset.chip; drawCerts(); } });
      $('#drainChips').innerHTML = DRAIN_CHIPS.map(([k, l]) => '<button type="button" class="chip" data-chip="' + k + '">' + l + ' <span class="n"></span></button>').join('');
      $('#drainChips').addEventListener('click', (e) => { const b = e.target.closest('[data-chip]'); if (b) { PLAN.drainChip = b.dataset.chip; drawDrained(); } });
      const regions = uniq(S.data.mikvaot.map((m) => m.region));
      ['certRegion', 'drainRegion', 'plannedRegion'].forEach((id) => fillSelect($('#' + id), regions));
      fillSelect($('#certCouncil'), uniq(PLAN.certs.map((c) => c.m.council)));
      fillSelect($('#plannedType'), uniq(PLAN.planned.map((t) => t.action)));
      $('#certRegion').addEventListener('change', () => { fillSelect($('#certCouncil'), uniq(PLAN.certs.filter((c) => !$('#certRegion').value || c.m.region === $('#certRegion').value).map((c) => c.m.council))); drawCerts(); });
      $('#certCouncil').addEventListener('change', drawCerts);
      $('#drainRegion').addEventListener('change', drawDrained);
      $('#plannedType').addEventListener('change', drawPlanned); $('#plannedRegion').addEventListener('change', drawPlanned);
      $('#btnExportCerts').addEventListener('click', () => exportTable(PLAN.certsShown.map((c) => ({ 'מקווה': c.m.name, 'מועצה': c.m.council || '', 'איזור': c.m.region || '', 'תוקף תעודה': c.m.certificate, 'מצב': c.expired ? 'פג תוקף' : 'בעוד ' + c.days + ' ימים', 'תאריך לועזי (תחילת חודש)': fmtDate(c.start.toISOString()), 'חידוש אחרון': c.lastCert ? hebOf(c.lastCert.ts) : '', 'רב מחדש אחרון': c.lastCert ? (c.lastCert.rabbi || '') : '', 'בלנית': c.m.attendant || '', 'טלפון': c.m.phone || '', 'טלפון מקווה': c.m.mikvehPhone || '', 'כתובת': c.m.address || '', 'שיבוץ': '' })), 'תעודות לחידוש', 'certificates-due'));
      $('#btnExportDrained').addEventListener('click', () => exportTable(PLAN.drainedShown.map((d) => ({ 'מקווה': d.m.name, 'מועצה': d.m.council || '', 'איזור': d.m.region || '', 'תאריך ריקון': hebOf(d.drain.ts), 'תאריך לועזי': fmtDate(d.drain.ts), 'ימים מאז הריקון': d.days, 'מי רוקן': d.drain.rabbi || '', 'פקק על הגג': d.plug ? hebOf(d.plug.ts) : '', 'אוצר זריעה': d.m.otzarZeria || '', 'אוצר השקה': d.m.otzarHashaka || '', 'בלנית': d.m.attendant || '', 'טלפון': d.m.phone || '', 'כתובת': d.m.address || '', 'שיבוץ': '' })), 'ממתינים למילוי', 'drained-reservoirs'));
      $('#btnExportPlanned').addEventListener('click', () => exportTasks(PLAN.plannedShown || []));
      ['certTable', 'drainTable', 'plannedTable'].forEach((id) => $('#' + id).addEventListener('click', (e) => { if (e.target.closest('.selcol')) return; const tr = e.target.closest('tr.link'); if (tr && tr.dataset.id) location.hash = '#/m/' + encodeURIComponent(tr.dataset.id) + (id === 'certTable' ? '/history' : '/otzarot'); }));
      if (window.MikvehWork) MikvehWork.initPlanSelection();
      $('#planCountCerts').textContent = PLAN.certs.filter((c) => c.expired || c.days <= 92).length;
      $('#planCountDrained').textContent = PLAN.drained.length;
      $('#planCountPlanned').textContent = PLAN.planned.length;
      drawCerts(); drawDrained(); drawPlanned();
    }
    showPlanTab(tab || 'certs');
  }
  function showPlanTab(tab) {
    $('#planTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#view-plan').querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === tab));
  }
  function drawCerts() {
    const region = $('#certRegion').value, council = $('#certCouncil').value;
    const base = PLAN.certs.filter((c) => (!region || c.m.region === region) && (!council || c.m.council === council));
    $('#certChips').querySelectorAll('[data-chip]').forEach((b) => { b.classList.toggle('on', b.dataset.chip === PLAN.certChip); b.querySelector('.n').textContent = base.filter((c) => certFilter(c, b.dataset.chip)).length; });
    const list = base.filter((c) => certFilter(c, PLAN.certChip));
    PLAN.certsShown = list;
    $('#certSummary').innerHTML = '<b>' + list.length + '</b> מקוואות · לחיצה על שורה פותחת את הכרטיס';
    $('#certTable').innerHTML = '<thead><tr><th class="selcol"><input type="checkbox" class="selall" title="בחר הכל"></th><th>מקווה</th><th>מועצה</th><th>איזור</th><th>תוקף תעודה</th><th>מצב</th><th>חידוש אחרון</th><th>בלנית</th><th>טלפון</th></tr></thead><tbody>' +
      (list.length ? list.map((c) => '<tr class="link" data-id="' + esc(c.m.id) + '"><td class="selcol"><input type="checkbox" class="sel" value="' + esc(c.m.id) + '"></td><td>' + esc(c.m.name) + workBadge(c.m.id) + '</td><td>' + esc(c.m.council || '') + '</td><td>' + esc(c.m.region || '') + '</td><td>' + esc(c.m.certificate) + '<br><small>' + esc(fmtDate(c.start.toISOString())) + '</small></td><td>' + dueCell(c) + '</td><td>' + (c.lastCert ? esc(hebOf(c.lastCert.ts)) + '<br><small>' + esc(c.lastCert.rabbi || '') + '</small>' : '') + '</td><td>' + esc(c.m.attendant || '') + '</td><td>' + tel(c.m.phone) + '</td></tr>').join('') : '<tr><td colspan="9" class="empty">אין תעודות בקטגוריה זו</td></tr>') + '</tbody>';
  }
  function drawDrained() {
    const region = $('#drainRegion').value;
    const base = PLAN.drained.filter((d) => !region || d.m.region === region);
    const f = (d, chip) => chip === 'all' || (chip === 'd30' && d.days >= 30) || (chip === 'd90' && d.days >= 90) || (chip === 'plug' && !!d.plug);
    $('#drainChips').querySelectorAll('[data-chip]').forEach((b) => { b.classList.toggle('on', b.dataset.chip === PLAN.drainChip); b.querySelector('.n').textContent = base.filter((d) => f(d, b.dataset.chip)).length; });
    const list = base.filter((d) => f(d, PLAN.drainChip));
    PLAN.drainedShown = list;
    $('#drainSummary').innerHTML = '<b>' + list.length + '</b> מאגרים שרוקנו ועדיין לא נרשמה אחריהם החלפת/מילוי אוצר';
    $('#drainTable').innerHTML = '<thead><tr><th class="selcol"><input type="checkbox" class="selall" title="בחר הכל"></th><th>מקווה</th><th>מועצה</th><th>איזור</th><th>תאריך ריקון</th><th>ימים</th><th>מי רוקן</th><th>פקק על הגג</th><th>אוצרות</th><th>בלנית</th></tr></thead><tbody>' +
      (list.length ? list.map((d) => '<tr class="link" data-id="' + esc(d.m.id) + '"><td class="selcol"><input type="checkbox" class="sel" value="' + esc(d.m.id) + '"></td><td>' + esc(d.m.name) + workBadge(d.m.id) + (d.task ? ' ' + badge('משימה: ' + (d.task.priority || ''), d.task.priority === 'דחוף' ? 'bad' : 'warn') : '') + '</td><td>' + esc(d.m.council || '') + '</td><td>' + esc(d.m.region || '') + '</td><td>' + esc(hebOf(d.drain.ts)) + '<br><small>' + esc(fmtDate(d.drain.ts)) + '</small></td><td>' + d.days + '</td><td>' + esc(d.drain.rabbi || '') + '</td><td>' + (d.plug ? badge(hebOf(d.plug.ts), 'brand') : '') + '</td><td>' + [d.m.otzarZeria ? 'זריעה: ' + d.m.otzarZeria : '', d.m.otzarHashaka ? 'השקה: ' + d.m.otzarHashaka : ''].filter(Boolean).map(esc).join('<br>') + '</td><td>' + esc(d.m.attendant || '') + (d.m.phone ? '<br>' + tel(d.m.phone) : '') + '</td></tr>').join('') : '<tr><td colspan="10" class="empty">אין מאגרים ממתינים</td></tr>') + '</tbody>';
  }
  function drawPlanned() {
    const type = $('#plannedType').value, region = $('#plannedRegion').value;
    const list = PLAN.planned.filter((t) => (!type || t.action === type) && (!region || !t.mikvehId || (S.byId[t.mikvehId] || {}).region === region));
    const order = { 'דחוף': 0, 'כן': 1 };
    list.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2) || (a.council || '').localeCompare(b.council || '', 'he'));
    PLAN.plannedShown = list;
    $('#plannedSummary').innerHTML = '<b>' + list.length + '</b> משימות · <b>' + list.filter((t) => t.priority === 'דחוף').length + '</b> דחופות';
    $('#plannedTable').innerHTML = TASK_HEAD + '<tbody>' + (list.length ? list.map(taskRow).join('') : '<tr><td colspan="8" class="empty">אין משימות</td></tr>') + '</tbody>';
  }

  // ============================================================ טפסים
  function renderForms() {
    $('#formsList').innerHTML = FORMS.map((f) => '<a class="form-link" href="#" data-form="' + f.key + '"><b>' + f.icon + ' ' + esc(f.title) + '</b><small>' + esc(f.desc) + '</small></a>').join('');
    $('#formsList').querySelectorAll('[data-form]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const key = a.dataset.form;
      pickMikveh((m) => openReport(m, key));
    }));
    renderOutbox();
  }

  // ============================================================ ייצוא לאקסל
  let xlsxLoading = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = () => resolve(window.XLSX);
      sc.onerror = () => { xlsxLoading = null; reject(new Error('xlsx lib')); };
      document.head.appendChild(sc);
    });
    return xlsxLoading;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  /** rows = מערך אובייקטים עם מפתחות בעברית (סדר המפתחות = סדר העמודות).
   *  שם הקובץ באנגלית (חלק מהדפדפנים מאבדים שם קובץ בעברית), שם הגיליון בעברית. */
  function exportTable(rows, sheetName, fileBase) {
    if (!rows.length) { alert('אין נתונים לייצוא'); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    const name = fileBase.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + stamp;
    loadXlsx().then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(rows);
      const keys = Object.keys(rows[0]);
      ws['!cols'] = keys.map((k) => ({ wch: Math.min(45, Math.max(10, k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] == null ? '' : r[k]).length))) }));
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
      XLSX.writeFile(wb, name + '.xlsx');
    }).catch(() => {
      // ללא רשת: CSV עם BOM (נפתח באקסל עם עברית תקינה)
      const keys = Object.keys(rows[0]);
      const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const csv = '\ufeff' + keys.map(q).join(',') + '\n' + rows.map((r) => keys.map((k) => q(r[k])).join(',')).join('\n');
      download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name + '.csv');
    });
  }
  const L = () => (S.data.meta && S.data.meta.fieldLabels) || {};
  function exportMikvaot(list) {
    const lab = L();
    const cols = ['name', 'council', 'place', 'address', 'region', 'localityType', 'activity', 'supervised', 'certificate', 'attendant', 'phone', 'mikvehPhone', 'ownership', 'reservoir', 'reservoirEmptied', 'otzarZeria', 'zeriaReplaced', 'otzarHashaka', 'hashakaType', 'hashakaReplaced', 'chabadReplaced', 'filter', 'kelim', 'otzarLocation', 'hoursSummer', 'hoursWinter', 'hoursErev', 'hoursMotzash', 'accessibility', 'coordination', 'notes', 'notes2'];
    exportTable(list.map((m) => {
      const d = S.derived[m.id], o = {};
      cols.forEach((k) => { o[lab[k] || k] = m[k] || ''; });
      o['מצב תעודה'] = { ok: 'בתוקף', warn: 'פג בקרוב', bad: 'פג תוקף', none: 'אין' }[d.cert.key];
      o['פיקוח מפורט אחרון'] = d.lastInsp ? (d.lastInsp.hebDate || hebOf(d.lastInsp.ts)) : (m.lastInspection || '');
      o['פעולה אחרונה'] = d.lastAction ? d.lastAction.action + ' (' + hebOf(d.lastAction.ts) + ')' : '';
      o['משימות פתוחות'] = d.openTasks;
      o['דיווחי וואטסאפ'] = d.waCount || 0;
      return o;
    }), 'מקוואות', 'mikvaot');
  }
  function exportActions(acts, title) {
    exportTable(acts.map((a) => ({
      'תאריך עברי': hebOf(a.ts), 'תאריך': fmtDate(a.ts), 'שם המקוה': a.mikveh, 'פעולה': a.action, 'אוצר': a.otzar || '', 'שם הרב': a.rabbi || '',
      'אחראי / בלנית': a.attendant || '', 'טלפון': a.phone || '', 'ריקון': a.drained || '', 'איטום': a.sealed || '', 'מילוי': a.filled || '',
      'איטום גג': a.roofSealed || '', 'איטום מאגר': a.reservoirSealed || '', 'ליטר': a.liters || '', 'תוקף עד': [a.validMonth, a.validYear].filter(Boolean).join(' '),
      'הערה': [a.note, a.note2].filter(Boolean).join(' · '),
    })), 'פעולות', 'actions-' + (title ? 'mikveh' : 'all'));
  }
  function exportInspections(ins, title) {
    exportTable(ins.map((i) => {
      const o = { 'תאריך עברי': i.hebDate || hebOf(i.ts), 'תאריך': fmtDate(i.ts), 'שם המקוה': i.mikveh, 'מועצה': i.council || '', 'שם הרב': i.rabbi || '', 'תיקון דחוף': i.urgent, 'טעון תיקון': i.needed,
        'ריקון מאגר': i.reservoirEmpty || '', 'החלפת זריעה': i.zeriaReplace || '', 'החלפת השקה': i.hashakaReplace || '' };
      (i.sections || []).forEach((s) => s.fields.forEach((f) => { o[s.title + ' - ' + f[0]] = f[1]; }));
      o['הנחיות מיוחדות'] = i.guidance || '';
      return o;
    }), 'פיקוח', 'inspections-' + (title ? 'mikveh' : 'all'));
  }
  function exportTasks(list) {
    exportTable(list.map((t) => ({ 'מקווה': t.mikveh, 'מועצה': t.council || '', 'משימה': t.action || '', 'עדיפות': t.priority || '', 'מצב מאגר / נקב': t.state || '',
      'תיקונים': t.repairs || 0, 'תיקוני גג': t.roofRepairs || 0, 'טעון ריקון': t.needsEmptying || '', 'פקק על הגג': t.roofPlug || '' })), 'משימות', 'tasks');
  }
  function exportWhatsapp(list) {
    exportTable(list.map((w) => ({ 'תאריך עברי': hebOf(w.ts), 'תאריך ושעה': w.ts || '', 'שם מקווה': w.mikveh || '', 'יישוב': w.settlement || '', 'שולח': w.sender || '', 'טלפון': w.phone || '',
      'סוג ליקוי': w.defect || '', 'תקציר': w.summary || '', 'טקסט': w.text || '', 'סטטוס זיהוי': w.status || '', 'מדיה': (w.media || []).join(' '), 'קובץ מקורי': w.archive || '' })), 'וואטסאפ', 'whatsapp');
  }

  // ============================================================ חלון דיווח / עדכון
  const RM = { chosen: null, sel: 0, matches: [], pickCb: null };
  function openReport(m, formKey) {
    RM.chosen = m || null; RM.pickCb = null;
    $('#reportTitle').textContent = 'דיווח / עדכון';
    $('#reportModal').hidden = false;
    if (m && formKey && window.MikvehForms) { rmShowStep2(); MikvehForms.open(formKey, m); return; }
    if (m) rmShowStep2(); else { rmShowStep1(); }
  }
  /** בחירת מקווה בלבד (למשל לפתיחת דיון): פותח את חלון החיפוש ומחזיר את המקווה ל-cb. */
  function pickMikveh(cb) {
    RM.chosen = null; RM.pickCb = cb;
    $('#reportTitle').textContent = 'בחירת מקווה';
    $('#reportModal').hidden = false;
    rmShowStep1();
  }
  function closeReport() { $('#reportModal').hidden = true; $('#rmStep3').hidden = true; RM.pickCb = null; }
  function rmShowStep1() {
    $('#rmStep1').hidden = false; $('#rmStep2').hidden = true; $('#rmStep3').hidden = true;
    $('#rmName').value = ''; rmSearch(''); setTimeout(() => $('#rmName').focus(), 50);
  }
  function rmSearch(q) {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = $('#rmList');
    if (!terms.length) { list.innerHTML = '<div class="hint">הקלד חלק משם המקווה, היישוב או המועצה</div>'; RM.matches = []; return; }
    const scored = [];
    S.data.mikvaot.forEach((m) => {
      const name = (m.name || '').toLowerCase(), hay = [m.name, m.place, m.council].join(' ').toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return;
      scored.push([name.startsWith(terms[0]) ? 0 : name.includes(terms[0]) ? 1 : 2, m]);
    });
    scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'he'));
    RM.matches = scored.slice(0, 10).map((x) => x[1]); RM.sel = 0;
    list.innerHTML = RM.matches.length ? RM.matches.map((m, i) => '<button type="button" data-i="' + i + '" class="' + (i === 0 ? 'sel' : '') + '"><span>' + esc(m.name) + '</span><small>' + esc([m.council, m.region].filter(Boolean).join(' · ')) + '</small></button>').join('') +
      (scored.length > 10 ? '<div class="hint">ועוד ' + (scored.length - 10) + ' תוצאות, המשך להקליד</div>' : '') : '<div class="hint">לא נמצא מקווה מתאים</div>';
  }
  function rmChoose(m) {
    RM.chosen = m;
    if (RM.pickCb) { const cb = RM.pickCb; closeReport(); cb(m); return; }
    rmShowStep2();
  }
  function rmShowStep2() {
    const m = RM.chosen;
    $('#rmStep1').hidden = true; $('#rmStep2').hidden = false; $('#rmStep3').hidden = true;
    $('#rmChosenName').textContent = m.name;
    $('#rmChosenSub').textContent = [m.council, m.region, m.address].filter(Boolean).join(' · ');
    $('#rmActions').innerHTML = FORMS.map((f) => '<button type="button" data-form="' + f.key + '"><span class="ic">' + f.icon + '</span>' + esc(f.title) + '<small>' + esc(f.desc) + '</small></button>').join('') +
      '<button type="button" class="card" data-form="card"><span class="ic">📁</span>פתיחת הכרטיס<small>כל הנתונים של המקווה</small></button>';
    $('#rmNote').hidden = !!DataSource.url('data') && navigator.onLine;
  }
  function initReport() {
    $('#btnReport').addEventListener('click', () => openReport(null));
    $('#reportClose').addEventListener('click', closeReport);
    $('#reportModal').addEventListener('click', (e) => { if (e.target === $('#reportModal')) closeReport(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#reportModal').hidden) closeReport(); });
    $('#rmName').addEventListener('input', (e) => rmSearch(e.target.value));
    $('#rmName').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { RM.sel = Math.min(RM.sel + 1, RM.matches.length - 1); rmHighlight(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { RM.sel = Math.max(RM.sel - 1, 0); rmHighlight(); e.preventDefault(); }
      else if (e.key === 'Enter' && RM.matches[RM.sel]) { rmChoose(RM.matches[RM.sel]); e.preventDefault(); }
    });
    $('#rmList').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) rmChoose(RM.matches[+b.dataset.i]); });
    $('#rmChange').addEventListener('click', rmShowStep1);
    $('#rmActions').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-form]'); if (!b) return;
      const m = RM.chosen;
      if (b.dataset.form === 'card') { closeReport(); location.hash = '#/m/' + encodeURIComponent(m.id); return; }
      const f = FORMS.find((x) => x.key === b.dataset.form);
      if (window.MikvehForms) MikvehForms.open(f.key, m);
    });
  }
  function rmHighlight() { $('#rmList').querySelectorAll('button[data-i]').forEach((b, i) => b.classList.toggle('sel', i === RM.sel)); }

  // ============================================================ הפעלה
  // הטעינה מתחילה אחרי שכל הסקריפטים (auth.js וכו') נטענו, כדי שהסשן יישלח עם הבקשה
  const start = () => DataSource.load().then((data) => {
    buildIndexes(data);
    $('#navCountList').textContent = data.mikvaot.length;
    $('#navCountTasks').textContent = data.tasks.length;
    $('#navCountWa').textContent = (data.whatsapp || []).length;
    $('#navCountPlan').textContent = certRows().filter((c) => c.expired || c.days <= 92).length + drainedRows().length;
    const when = data.meta && data.meta.exportedAt ? parseISO(data.meta.exportedAt) : null;
    const whenTxt = when ? when.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const srcTxt = data.source === 'live' ? '<span class="badge ok">מחובר לגיליון</span> ' + esc(whenTxt)
      : data.source === 'cached' ? '<span class="badge warn">לא מקוון</span> עותק שמור מהגיליון מ-' + esc(whenTxt)
      : data.source === 'fallback' ? '<span class="badge bad">אין חיבור לגיליון</span> עותק מקומי מ-' + esc(whenTxt)
      : '<span class="badge">עותק סטטי</span> ' + esc(whenTxt);
    $('#headMeta').innerHTML = 'היום: ' + esc(HebDate.format(new Date())) + ' · ' + srcTxt + ' <button class="btn small" id="btnReload" type="button" title="טעינה מחדש מהגיליון">רענן</button>';
    $('#btnReload').addEventListener('click', () => location.reload());
    $('#footer').textContent = (data.source === 'live' || data.source === 'cached' ? 'מקור הנתונים: ' + (data.meta.spreadsheet || 'הגיליון החי') : 'מקור הנתונים: עותק מקומי של הגיליון') +
      ' (' + data.mikvaot.length + ' מקוואות, ' + data.actions.length + ' פעולות, ' + data.inspections.length + ' דוחות פיקוח, ' + (data.whatsapp || []).length + ' דיווחי וואטסאפ). גרסת מערכת 0.2';
    window.MK = { S, $, esc, hebOf, fmtDate, parseISO, badge, tel, findByName, DataSource, route, buildIndexes: rebuild, addAction, getUser, requireUser, openUserModal, toast, openReport, closeReport, pickMikveh, exportTable, uniq, fillSelect, certRows, drainedRows };
    data.messages = data.messages || []; data.work = data.work || []; data.media = data.media || []; data.users = data.users || [];
    $('#navCountTalk').textContent = data.messages.length;
    $('#navCountWork').textContent = data.work.filter((w) => w.status !== 'done').length;
    initList();
    initReport();
    initUser();
    $('#navToggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    $('#navBackdrop').addEventListener('click', () => document.body.classList.remove('nav-open'));
    if (window.MikvehAuth) MikvehAuth.init();
    renderOutbox();
    Outbox.flush();
    window.addEventListener('online', () => Outbox.flush());
    window.addEventListener('hashchange', route);
    route();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }).catch((err) => {
    document.querySelector('main').innerHTML = '<div class="empty">שגיאה בטעינת הנתונים: ' + esc(err.message) + '</div>';
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
