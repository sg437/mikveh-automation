/**
 * דיונים: ערוץ כללי, דיון לכל מקווה, וקבוצות לפי נושא (עם רשימת חברים).
 * תמונות, סרטונים והקלטות, תגובות אימוג'י, ואזכור @שם.
 * הכל נשמר בגיליון (ApiWrite) ומסתנכרן כל 40 שניות.
 */
(function () {
  'use strict';
  const POLL_MS = 40000;
  const EMOJIS = ['👍', '❤️', '😂', '🙏', '✅', '❗'];
  let timer = null, current = '', replyTo = null;

  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  function all() { return MK().S.data.messages || []; }
  function groups() { return (MK().S.data.groups || []).filter((g) => g.active !== false); }
  function reactions() { return MK().S.data.reactions || []; }
  function myId() { const u = MK().getUser(); return u.id || u.name || ''; }

  /** ערוץ: '' כללי · 'g:<id>' קבוצה · אחרת מזהה מקווה */
  function isGroup(ch) { return ch.indexOf('g:') === 0; }
  function groupOf(ch) { return groups().filter((g) => g.id === ch.slice(2))[0] || null; }
  function chOf(m) { return m.group ? 'g:' + m.group : (m.mikvehId || ''); }
  function byChannel(ch) { return all().filter((m) => chOf(m) === ch).sort((a, b) => (a.ts || '').localeCompare(b.ts || '')); }
  function name(ch) {
    if (!ch) return 'דיון כללי';
    if (isGroup(ch)) { const g = groupOf(ch); return g ? g.name : 'קבוצה'; }
    const m = MK().S.byId[ch];
    return m ? m.name : ch;
  }
  function canPost(ch) {
    if (!isGroup(ch)) return true;
    const g = groupOf(ch);
    if (!g) return false;
    const id = myId();
    return g.open || !id || g.members.indexOf(id) >= 0;
  }

  function channels() {
    const map = {};
    all().forEach((m) => { const k = chOf(m); const c = map[k] || (map[k] = { id: k, count: 0, last: '' }); c.count++; if ((m.ts || '') > c.last) c.last = m.ts; });
    const mine = myId();
    const gs = groups().filter((g) => g.open || !mine || g.members.indexOf(mine) >= 0)
      .map((g) => ({ id: 'g:' + g.id, count: (map['g:' + g.id] || {}).count || 0, last: (map['g:' + g.id] || {}).last || g.ts || '', group: true }));
    const mikvaot = Object.keys(map).filter((k) => k && !isGroup(k)).map((k) => map[k]).sort((a, b) => b.last.localeCompare(a.last));
    return { general: { id: '', count: (map[''] || {}).count || 0, last: (map[''] || {}).last || '' }, groups: gs.sort((a, b) => b.last.localeCompare(a.last)), mikvaot };
  }

  // ---- הודעה ----
  function reactionBar(m) {
    const list = reactions().filter((r) => r.messageId === m.id);
    const byEmoji = {};
    list.forEach((r) => { (byEmoji[r.emoji] = byEmoji[r.emoji] || []).push(r.name || ''); });
    const mine = myId();
    const chips = Object.keys(byEmoji).map((e) => '<button type="button" class="react ' + (list.some((r) => r.emoji === e && r.userId === mine) ? 'on' : '') + '" data-emoji="' + esc(e) + '" data-msg="' + esc(m.id) + '" title="' + esc(byEmoji[e].join(', ')) + '">' + e + ' ' + byEmoji[e].length + '</button>').join('');
    return '<div class="reacts">' + chips + '<button type="button" class="react add" data-add="' + esc(m.id) + '" title="הוסף תגובה">🙂+</button></div>';
  }

  function bubble(m, showChannel) {
    const K = MK();
    const me = K.getUser().name && m.author === K.getUser().name;
    const q = m.replyTo ? all().find((x) => x.id === m.replyTo) : null;
    if (m.source === 'system') return '<div class="msg sys" data-id="' + esc(m.id) + '"><div class="mb">' + esc(m.text || '') + '</div><div class="mh"><span class="mt">' + esc(K.hebOf(m.ts)) + ' · ' + esc(K.fmtDate(m.ts)) + '</span></div></div>';
    return '<div class="msg ' + (me ? 'me' : '') + '" data-id="' + esc(m.id) + '">' +
      '<div class="mh"><b>' + esc(m.author || '') + '</b>' + (m.pending ? ' ' + K.badge('ממתין לשליחה', 'warn') : '') +
      (showChannel && chOf(m) ? ' · <a href="#/talk/' + encodeURIComponent(chOf(m)) + '">' + esc(name(chOf(m))) + '</a>' : '') +
      '<span class="mt">' + esc(K.hebOf(m.ts)) + ' · ' + esc(K.fmtDate(m.ts)) + (K.parseISO(m.ts) ? ' ' + K.parseISO(m.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '') + '</span></div>' +
      (q ? '<div class="mq"><b>' + esc(q.author || '') + ':</b> ' + esc((q.text || '').slice(0, 120)) + '</div>' : '') +
      '<div class="mb">' + esc(m.text || '').replace(/\n/g, '<br>') + '</div>' +
      (window.MikvehMedia ? MikvehMedia.thumbs(MikvehMedia.forRef('message', m.id)) : '') +
      reactionBar(m) +
      '<div class="ma"><button type="button" class="lnk" data-reply="' + esc(m.id) + '">השב</button></div></div>';
  }

  function composer(ch) {
    const K = MK();
    if (!canPost(ch)) return '<div class="note-box">אינך חבר/ה בקבוצה הזו, אפשר לקרוא בלבד.</div>';
    const pick = window.MikvehMedia ? MikvehMedia.picker('talkPics_' + (ch ? ch.replace(/[^\w]/g, '') : 'g')) : null;
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
    const K = MK();
    root.querySelectorAll('[data-reply]').forEach((b) => b.addEventListener('click', () => {
      replyTo = b.dataset.reply;
      const q = all().find((x) => x.id === replyTo);
      const rb = root.querySelector('.replybox');
      if (!rb) return;
      rb.hidden = false; rb.innerHTML = 'בתגובה ל-<b>' + esc(q ? q.author : '') + '</b>: ' + esc(q ? (q.text || '').slice(0, 80) : '') + ' <button type="button" class="lnk" id="cancelReply">✕</button>';
      rb.querySelector('#cancelReply').addEventListener('click', () => { replyTo = null; rb.hidden = true; });
      const ta = root.querySelector('textarea'); if (ta) ta.focus();
    }));
    // תגובות אימוג'י
    root.querySelectorAll('[data-emoji]').forEach((b) => b.addEventListener('click', () => react(b.dataset.msg, b.dataset.emoji, onSent)));
    root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const old = document.querySelector('.epick'); if (old) old.remove();
      const box = document.createElement('div');
      box.className = 'epick';
      box.innerHTML = EMOJIS.map((x) => '<button type="button">' + x + '</button>').join('');
      document.body.appendChild(box);
      const r = b.getBoundingClientRect();
      box.style.top = (r.bottom + 6) + 'px';
      box.style.left = Math.max(8, Math.min(window.innerWidth - 200, r.left)) + 'px';
      box.querySelectorAll('button').forEach((eb) => eb.addEventListener('click', () => { box.remove(); react(b.dataset.add, eb.textContent, onSent); }));
      setTimeout(() => document.addEventListener('click', () => box.remove(), { once: true }), 0);
    }));
    const form = root.querySelector('.composer');
    if (!form) return;
    const pickBox = form.querySelector('.mpick');
    const pics = window.MikvehMedia && pickBox ? MikvehMedia.picker(pickBox.id).bind(form) : null;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!K.requireUser()) return;
      const ta = form.querySelector('textarea'), msg = form.querySelector('.fmsg'), btn = form.querySelector('button[type=submit]');
      const items = pics ? pics.get() : [];
      const text = ta.value.trim() || (items.length ? (items[0].kind === 'audio' ? '🎤 הקלטה' : items[0].kind === 'video' ? '🎬 סרטון' : '📷 תמונה') : '');
      if (!text) return;
      btn.disabled = true; msg.textContent = 'שולח...'; msg.className = 'fmsg';
      const chan = form.dataset.ch;
      const g = isGroup(chan) ? groupOf(chan) : null;
      const m = !isGroup(chan) && chan ? K.S.byId[chan] : null;
      K.DataSource.post('addMessage', { mikveh: m ? m.name : '', group: g ? g.id : '', text, replyTo: replyTo || '' }).then((res) => {
        if (res.record) { if (m) res.record.mikvehId = m.id; if (g) res.record.group = g.id; K.S.data.messages.push(res.record); }
        const nc = K.$('#navCountTalk'); if (nc) nc.textContent = all().length;
        replyTo = null; ta.value = ''; btn.disabled = false; msg.textContent = '';
        if (items.length && res.record && !res.queued) {
          MikvehMedia.upload(items, { mikveh: m ? m.name : '', context: 'message', refId: res.record.id }).then(() => onSent()).catch((err) => K.toast('המדיה לא הועלתה: ' + err.message));
        } else {
          if (items.length && res.queued) K.toast('המדיה תצורף רק בשליחה עם חיבור');
          onSent();
        }
      }).catch((err) => { btn.disabled = false; msg.textContent = 'לא נשלח: ' + err.message; msg.className = 'fmsg bad'; });
    });
    const th = root.querySelector('.thread'); if (th) th.scrollTop = th.scrollHeight;
  }

  function react(messageId, emoji, onDone) {
    const K = MK();
    if (!K.requireUser()) return;
    const mine = myId();
    const list = K.S.data.reactions = K.S.data.reactions || [];
    const at = list.findIndex((r) => r.messageId === messageId && r.userId === mine && r.emoji === emoji);
    if (at >= 0) list.splice(at, 1); else list.push({ messageId, userId: mine, name: K.getUser().name || '', emoji });
    onDone();
    K.DataSource.post('react', { messageId, emoji }).catch((err) => K.toast('התגובה לא נשמרה: ' + err.message));
  }

  // ---- קבוצות ----
  function openGroupModal(existing) {
    const K = MK();
    if (!K.requireUser()) return;
    const users = (K.S.data.users || []).filter((u) => u.active !== false);
    const g = existing || { name: '', topic: '', members: [], open: false };
    const body = K.$('#editBody');
    K.$('#editTitle').textContent = existing ? 'עריכת קבוצה' : 'קבוצת דיון חדשה';
    body.innerHTML = '<form id="grpForm" class="rform" novalidate><div class="fgrid">' +
      '<div class="ff wide"><label for="gName">שם הקבוצה <span class="req">*</span></label><input id="gName" type="text" value="' + esc(g.name) + '" placeholder="למשל: ריקון מאגרים צפון"></div>' +
      '<div class="ff wide"><label for="gTopic">נושא</label><input id="gTopic" type="text" value="' + esc(g.topic || '') + '" placeholder="במה הקבוצה עוסקת"></div>' +
      '<div class="ff wide"><span class="lbl">מי בקבוצה</span><div class="pills" id="gMembers">' +
        (users.length ? users.map((u) => '<label class="pill chk"><input type="checkbox" value="' + esc(u.id) + '"' + (g.members.indexOf(u.id) >= 0 ? ' checked' : '') + '><span>' + esc(u.name) + '</span></label>').join('') : '<span class="hint">אין עדיין משתמשים רשומים. אפשר לפתוח קבוצה פתוחה לכולם.</span>') + '</div></div>' +
      '<div class="ff wide"><label class="pill chk"><input type="checkbox" id="gOpen"' + (g.open ? ' checked' : '') + '><span>פתוחה לכל מי שנכנס למערכת</span></label></div>' +
      '</div><div class="factions"><button class="btn primary" type="submit">' + (existing ? 'שמירה' : 'פתיחת הקבוצה') + '</button>' +
      (existing ? '<button class="btn" type="button" id="gArchive">ארכוב הקבוצה</button>' : '') +
      '<button class="btn" type="button" id="gCancel">ביטול</button><span class="fmsg" id="gMsg"></span></div></form>';
    K.$('#editModal').hidden = false;
    K.$('#gCancel').addEventListener('click', () => { K.$('#editModal').hidden = true; });
    if (K.$('#gArchive')) K.$('#gArchive').addEventListener('click', () => {
      K.DataSource.post('updateGroup', { id: existing.id, active: false }).then(() => { K.S.data.groups = groups().filter((x) => x.id !== existing.id); K.$('#editModal').hidden = true; K.toast('הקבוצה אורכבה'); location.hash = '#/talk'; renderView(''); }).catch((err) => K.toast('לא בוצע: ' + err.message));
    });
    K.$('#grpForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = K.$('#gMsg');
      const data = { name: K.$('#gName').value.trim(), topic: K.$('#gTopic').value.trim(), open: K.$('#gOpen').checked,
        members: Array.from(K.$('#gMembers').querySelectorAll('input:checked')).map((c) => c.value) };
      if (!data.name) { msg.textContent = 'חסר שם'; msg.className = 'fmsg bad'; return; }
      msg.textContent = 'שומר...'; msg.className = 'fmsg';
      const p = existing ? K.DataSource.post('updateGroup', Object.assign({ id: existing.id }, data)) : K.DataSource.post('addGroup', data);
      p.then((res) => {
        K.S.data.groups = K.S.data.groups || [];
        if (existing) { const i = K.S.data.groups.findIndex((x) => x.id === existing.id); if (i >= 0) K.S.data.groups[i] = res.record; }
        else K.S.data.groups.push(res.record);
        K.$('#editModal').hidden = true;
        K.toast(existing ? 'הקבוצה עודכנה' : 'הקבוצה נפתחה');
        location.hash = '#/talk/' + encodeURIComponent('g:' + res.record.id);
        renderView('g:' + res.record.id);
      }).catch((err) => { msg.textContent = 'לא נשמר: ' + err.message; msg.className = 'fmsg bad'; });
    });
  }

  // ---- מסך הדיונים ----
  function renderView(ch) {
    const K = MK();
    current = ch ? decodeURIComponent(ch) : '';
    const root = K.$('#view-talk');
    const chs = channels();
    const link = (c, icon) => '<a class="ch ' + (c.id === current ? 'on' : '') + '" href="#/talk/' + encodeURIComponent(c.id) + '"><span class="chi">' + icon + '</span><span>' + esc(name(c.id)) + '</span><small>' + (c.count || 0) + (c.last ? ' · ' + esc(K.hebOf(c.last)) : '') + '</small></a>';
    const g = isGroup(current) ? groupOf(current) : null;
    const members = g ? (K.S.data.users || []).filter((u) => g.members.indexOf(u.id) >= 0).map((u) => u.name) : [];
    root.innerHTML = '<div class="talk"><aside class="chlist">' +
      '<div class="chhead"><b>ערוצים</b></div>' +
      link(chs.general, '💬') +
      '<div class="chsec">קבוצות לפי נושא <button class="btn small" id="talkNewGroup" type="button">＋</button></div>' +
      (chs.groups.length ? chs.groups.map((c) => link(c, '👥')).join('') : '<div class="hint" style="padding:4px 10px">אין קבוצות. אפשר לפתוח קבוצה לפי נושא ולבחור מי בה.</div>') +
      '<div class="chsec">מקוואות <button class="btn small" id="talkNew" type="button">＋</button></div>' +
      (chs.mikvaot.length ? chs.mikvaot.map((c) => link(c, '🕍')).join('') : '<div class="hint" style="padding:4px 10px">אין דיונים על מקוואות</div>') +
      (current && !isGroup(current) && !chs.mikvaot.some((c) => c.id === current) ? link({ id: current, count: 0, last: '' }, '🕍') : '') +
      '</aside><section class="chmain"><div class="chtitle"><h2>' + esc(name(current)) + '</h2>' +
        (g ? '<div class="sub">' + esc(g.topic || '') + (members.length ? ' · ' + esc(members.join(', ')) : g.open ? ' · פתוחה לכולם' : '') + '</div><button class="btn small" id="grpEdit" type="button">חברים והגדרות</button>'
          : current ? '<a class="btn small" href="#/m/' + encodeURIComponent(current) + '">לכרטיס המקווה</a>'
          : '<span class="sub">שיחה כללית של הצוות – מה שלא שייך למקווה או לקבוצה</span>') + '</div>' +
      threadHtml(current, false) + '</section></div>';
    bind(root, current, () => renderView(current));
    K.$('#talkNew').addEventListener('click', () => K.pickMikveh((m) => { location.hash = '#/talk/' + encodeURIComponent(m.id); }));
    K.$('#talkNewGroup').addEventListener('click', () => openGroupModal(null));
    if (K.$('#grpEdit')) K.$('#grpEdit').addEventListener('click', () => openGroupModal(g));
    startPolling();
  }

  // ---- לשונית דיון בכרטיס המקווה ----
  function renderPane(m) { return '<div class="panel"><h3>דיון על ' + esc(m.name) + '</h3>' + threadHtml(m.id, false) + '</div>'; }
  function bindPane(root, m) { bind(root, m.id, () => { const pane = root.querySelector('[data-pane="talk"]'); if (pane) { pane.innerHTML = renderPane(m); bindPane(root, m); } }); startPolling(); }

  // ---- סנכרון ----
  function startPolling() { if (!timer) timer = setInterval(sync, POLL_MS); }
  function sync() {
    const K = MK();
    if (document.hidden || K.S.data.source === 'static') return;
    const url = K.DataSource.url('sync');
    if (!url) return;
    const since = all().reduce((mx, m) => (m.ts > mx ? m.ts : mx), '');
    fetch(url + '&since=' + encodeURIComponent(since), { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d.media) K.S.data.media = d.media;
      if (d.groups) K.S.data.groups = d.groups;
      if (d.reactions) K.S.data.reactions = d.reactions;
      if (d.work) {
        const changed = JSON.stringify(d.work) !== JSON.stringify(K.S.data.work);
        K.S.data.work = d.work;
        const el = K.$('#navCountWork'); if (el) el.textContent = d.work.filter((w) => w.status !== 'done').length;
        if (changed && K.$('#view-work').classList.contains('on') && window.MikvehWork) MikvehWork.renderView();
      }
      const have = new Set(all().map((m) => m.id));
      let added = 0;
      (d.messages || []).forEach((m) => { if (!have.has(m.id)) { K.S.data.messages.push(m); added++; } });
      if (K.$('#view-talk').classList.contains('on')) renderView(current);
      if (added) {
        K.$('#navCountTalk').textContent = all().length;
        if (!K.$('#view-talk').classList.contains('on')) K.toast(added + ' הודעות חדשות בדיונים');
      }
    }).catch(() => {});
  }

  window.MikvehTalk = { renderView, renderPane, bindPane, openGroupModal, count: () => all().length };
})();
