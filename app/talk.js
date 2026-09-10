/**
 * דיונים בתוך המערכת: ערוץ כללי + דיון לכל מקווה.
 * ההודעות נשמרות בלשונית "דיונים" בגיליון (ApiWrite.js) ומסתנכרנות בכל 40 שניות.
 */
(function () {
  'use strict';
  const POLL_MS = 40000;
  let timer = null, current = '', replyTo = null;

  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  function all() { return MK().S.data.messages || []; }
  function byChannel(ch) { return all().filter((m) => (m.mikvehId || '') === ch).sort((a, b) => (a.ts || '').localeCompare(b.ts || '')); }
  function channels() {
    const map = {};
    all().forEach((m) => { const k = m.mikvehId || ''; const c = map[k] || (map[k] = { id: k, count: 0, last: '' }); c.count++; if ((m.ts || '') > c.last) c.last = m.ts; });
    const list = Object.values(map).filter((c) => c.id !== '').sort((a, b) => b.last.localeCompare(a.last));
    return [{ id: '', count: (map[''] || {}).count || 0, last: (map[''] || {}).last || '' }].concat(list);
  }
  function name(id) { if (!id) return 'דיון כללי'; const m = MK().S.byId[id]; return m ? m.name : id; }

  function bubble(m, showChannel) {
    const K = MK();
    const me = K.getUser().name && m.author === K.getUser().name;
    const q = m.replyTo ? all().find((x) => x.id === m.replyTo) : null;
    if (m.source === 'system') return '<div class="msg sys" data-id="' + esc(m.id) + '"><div class="mb">' + esc(m.text || '') + '</div><div class="mh"><span class="mt">' + esc(K.hebOf(m.ts)) + ' · ' + esc(K.fmtDate(m.ts)) + '</span></div></div>';
    return '<div class="msg ' + (me ? 'me' : '') + '" data-id="' + esc(m.id) + '">' +
      '<div class="mh"><b>' + esc(m.author || '') + '</b>' + (m.pending ? ' ' + K.badge('ממתין לשליחה', 'warn') : '') + (showChannel && m.mikvehId ? ' · <a href="#/talk/' + encodeURIComponent(m.mikvehId) + '">' + esc(name(m.mikvehId)) + '</a>' : '') +
      '<span class="mt">' + esc(K.hebOf(m.ts)) + ' · ' + esc(K.fmtDate(m.ts)) + (K.parseISO(m.ts) ? ' ' + K.parseISO(m.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '') + '</span></div>' +
      (q ? '<div class="mq"><b>' + esc(q.author || '') + ':</b> ' + esc((q.text || '').slice(0, 120)) + '</div>' : '') +
      '<div class="mb">' + esc(m.text || '').replace(/\n/g, '<br>') + '</div>' +
      (window.MikvehMedia ? MikvehMedia.thumbs(MikvehMedia.forRef('message', m.id)) : '') +
      '<div class="ma"><button type="button" class="lnk" data-reply="' + esc(m.id) + '">השב</button></div></div>';
  }

  function composer(ch) {
    const pick = window.MikvehMedia ? MikvehMedia.picker('talkPics_' + (ch ? 'm' : 'g')) : null;
    return '<form class="composer" data-ch="' + esc(ch) + '"><div class="replybox" hidden></div>' +
      '<textarea rows="2" placeholder="' + (ch ? 'כתוב על ' + esc(name(ch)) + '...' : 'הודעה לדיון הכללי...') + ' (אפשר @שם לאזכור)"></textarea>' +
      '<div class="crow"><button class="btn primary" type="submit">שליחה</button>' + (pick ? pick.html : '') + '<span class="fmsg"></span></div></form>';
  }

  function threadHtml(ch, showChannel) {
    const K = MK();
    const list = byChannel(ch);
    const notice = K.S.data.source === 'static' ? '<div class="note-box">אין חיבור לגיליון כרגע: הודעות שתכתוב יישמרו במכשיר ויישלחו אוטומטית כשיהיה חיבור.</div>' : '';
    return notice + '<div class="thread">' + (list.length ? list.map((m) => bubble(m, showChannel)).join('') : '<div class="empty">עדיין אין הודעות. התחילו את הדיון.</div>') + '</div>' + composer(ch);
  }

  function bind(root, ch, onSent) {
    root.querySelectorAll('[data-reply]').forEach((b) => b.addEventListener('click', () => {
      replyTo = b.dataset.reply;
      const q = all().find((x) => x.id === replyTo);
      const rb = root.querySelector('.replybox');
      rb.hidden = false; rb.innerHTML = 'בתגובה ל-<b>' + esc(q ? q.author : '') + '</b>: ' + esc(q ? (q.text || '').slice(0, 80) : '') + ' <button type="button" class="lnk" id="cancelReply">✕</button>';
      rb.querySelector('#cancelReply').addEventListener('click', () => { replyTo = null; rb.hidden = true; });
      root.querySelector('textarea').focus();
    }));
    const form = root.querySelector('.composer');
    if (!form) return;
    const pics = window.MikvehMedia && form.querySelector('.mpick') ? MikvehMedia.picker(form.querySelector('.mpick').id).bind(form) : null;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const K = MK();
      if (!K.requireUser()) return;
      const ta = form.querySelector('textarea'), msg = form.querySelector('.fmsg'), btn = form.querySelector('button[type=submit]');
      const text = ta.value.trim() || (pics && pics.get().length ? '📷' : '');
      if (!text) return;
      btn.disabled = true; msg.textContent = 'שולח...'; msg.className = 'fmsg';
      const mid = form.dataset.ch;
      const m = mid ? K.S.byId[mid] : null;
      K.DataSource.post('addMessage', { mikveh: m ? m.name : '', text, replyTo: replyTo || '' }).then((res) => {
        if (res.record) { res.record.mikvehId = mid || null; K.S.data.messages.push(res.record); }
        const items = pics ? pics.get() : [];
        if (items.length && res.record) MikvehMedia.upload(items, { mikveh: m ? m.name : '', context: 'message', refId: res.record.id }).then(() => onSent()).catch((err) => K.toast('התמונות לא הועלו: ' + err.message));
        const nc = K.$('#navCountTalk'); if (nc) nc.textContent = all().length;
        replyTo = null; ta.value = ''; btn.disabled = false; msg.textContent = '';
        onSent();
      }).catch((err) => { btn.disabled = false; msg.textContent = 'לא נשלח: ' + err.message; msg.className = 'fmsg bad'; });
    });
    const th = root.querySelector('.thread'); if (th) th.scrollTop = th.scrollHeight;
  }

  // ---- מסך הדיונים ----
  function renderView(ch) {
    const K = MK();
    current = ch ? decodeURIComponent(ch) : '';
    const root = K.$('#view-talk');
    const chs = channels();
    root.innerHTML = '<div class="talk"><aside class="chlist"><div class="chhead"><b>ערוצים</b><button class="btn small" id="talkNew" type="button">＋ דיון על מקווה</button></div>' +
      chs.map((c) => '<a class="ch ' + (c.id === current ? 'on' : '') + '" href="#/talk/' + encodeURIComponent(c.id) + '"><span>' + esc(name(c.id)) + '</span><small>' + c.count + (c.last ? ' · ' + esc(K.hebOf(c.last)) : '') + '</small></a>').join('') +
      (current && !chs.some((c) => c.id === current) ? '<a class="ch on" href="#/talk/' + encodeURIComponent(current) + '"><span>' + esc(name(current)) + '</span><small>חדש</small></a>' : '') +
      '</aside><section class="chmain"><div class="chtitle"><h2>' + esc(name(current)) + '</h2>' + (current ? '<a class="btn small" href="#/m/' + encodeURIComponent(current) + '">לכרטיס המקווה</a>' : '<span class="sub">שיחה כללית של הצוות – מה שלא שייך למקווה מסוים</span>') + '</div>' +
      threadHtml(current, false) + '</section></div>';
    bind(root, current, () => renderView(current));
    K.$('#talkNew').addEventListener('click', () => K.pickMikveh((m) => { location.hash = '#/talk/' + encodeURIComponent(m.id); }));
    startPolling();
  }

  // ---- לשונית דיון בכרטיס המקווה ----
  function renderPane(m) { return '<div class="panel"><h3>דיון על ' + esc(m.name) + '</h3>' + threadHtml(m.id, false) + '</div>'; }
  function bindPane(root, m) { bind(root, m.id, () => { const pane = root.querySelector('[data-pane="talk"]'); if (pane) { pane.innerHTML = renderPane(m); bindPane(root, m); } }); startPolling(); }

  // ---- סנכרון ----
  function startPolling() {
    if (timer) return;
    timer = setInterval(sync, POLL_MS);
  }
  function sync() {
    const K = MK();
    if (document.hidden || K.S.data.source === 'static') return;
    const url = K.DataSource.url('sync');
    if (!url) return;
    const since = all().reduce((mx, m) => (m.ts > mx ? m.ts : mx), '');
    fetch(url + '&since=' + encodeURIComponent(since), { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d.media) K.S.data.media = d.media;
      if (d.work) {
        // סנכרון מלא של השיבוצים (מי לקח מה)
        const changed = JSON.stringify(d.work) !== JSON.stringify(K.S.data.work);
        K.S.data.work = d.work;
        const el = K.$('#navCountWork'); if (el) el.textContent = d.work.filter((w) => w.status !== 'done').length;
        if (changed && K.$('#view-work').classList.contains('on') && window.MikvehWork) MikvehWork.renderView();
      }
      if (!d.messages || !d.messages.length) return;
      const have = new Set(all().map((m) => m.id));
      let added = 0;
      d.messages.forEach((m) => { if (!have.has(m.id)) { K.S.data.messages.push(m); added++; } });
      if (added) {
        K.$('#navCountTalk').textContent = all().length;
        if (K.$('#view-talk').classList.contains('on')) renderView(current);
        else if (K.$('#view-card').classList.contains('on')) { const pane = document.querySelector('[data-pane="talk"].on'); if (pane) K.route(); }
        K.toast(added + ' הודעות חדשות בדיונים');
      }
    }).catch(() => {});
  }

  window.MikvehTalk = { renderView, renderPane, bindPane, count: () => all().length };
})();
