/**
 * מדיה: תמונות, סרטונים והקלטות קול.
 * בחירה או צילום מהמכשיר, הקלטה ישירה, הקטנת תמונות, העלאה לדרייב (addMedia) והצגה.
 */
(function () {
  'use strict';
  const MAX_SIDE = 1400, QUALITY = 0.82, MAX_MB = 25;
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  function kindOf(mime, name) {
    const m = String(mime || '');
    if (m.indexOf('video') === 0) return 'video';
    if (m.indexOf('audio') === 0) return 'audio';
    if (m.indexOf('image') === 0) return 'image';
    if (/\.(mp4|mov|webm)$/i.test(name || '')) return 'video';
    if (/\.(m4a|mp3|ogg|wav)$/i.test(name || '')) return 'audio';
    return 'file';
  }
  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
      r.readAsDataURL(blob);
    });
  }

  /** מקטין תמונה ל-JPEG; סרטון והקלטה נשלחים כמו שהם. מחזיר {base64, mime, name, kind, preview} */
  function prepare(file) {
    const kind = kindOf(file.type, file.name);
    if (kind !== 'image') {
      if (file.size > MAX_MB * 1024 * 1024) return Promise.reject(new Error('הקובץ גדול מדי (עד ' + MAX_MB + 'MB)'));
      return toBase64(file).then((base64) => ({ base64, mime: file.type || (kind === 'video' ? 'video/mp4' : 'audio/m4a'), name: file.name || (kind === 'video' ? 'video.mp4' : 'audio.m4a'), kind, preview: null, size: file.size }));
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ base64: c.toDataURL('image/jpeg', QUALITY).split(',')[1], mime: 'image/jpeg', name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', kind: 'image', preview: c.toDataURL('image/jpeg', 0.5) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('קובץ תמונה לא תקין')); };
      img.src = url;
    });
  }
  const shrink = prepare; // תאימות לאחור

  const ICON = { image: '🖼', video: '🎬', audio: '🎤', file: '📎' };

  /**
   * תיבת צירוף מדיה. opts.record=true מוסיף כפתור הקלטה.
   * מחזיר {html, bind(root) -> {get, clear}}
   */
  function picker(id, opts) {
    const o = opts || {};
    const html = '<div class="mpick" id="' + id + '">' +
      '<label class="btn small" for="' + id + '_in" title="תמונה, סרטון או קובץ קול">📎 צרף</label>' +
      '<input id="' + id + '_in" type="file" accept="image/*,video/*,audio/*" multiple hidden>' +
      (o.record === false ? '' : '<button type="button" class="btn small rec" id="' + id + '_rec">🎤 הקלטה</button>') +
      '<div class="mprev"></div></div>';
    const bind = (root) => {
      const box = root.querySelector('#' + id);
      if (!box) return { get: () => [], clear: () => {} };
      const inp = box.querySelector('input'), prev = box.querySelector('.mprev');
      let items = [];
      const addThumb = (it) => {
        items.push(it);
        const inner = it.kind === 'image' ? '<img src="' + it.preview + '" alt="">' : '<span class="mfile">' + ICON[it.kind] + '<small>' + esc((it.name || '').slice(0, 14)) + '</small></span>';
        prev.insertAdjacentHTML('beforeend', '<span class="mth">' + inner + '<button type="button" class="x" title="הסר">✕</button></span>');
        const el = prev.lastElementChild;
        el.querySelector('.x').addEventListener('click', () => { items = items.filter((x) => x !== it); el.remove(); });
      };
      inp.addEventListener('change', () => {
        Array.from(inp.files || []).forEach((f) => prepare(f).then(addThumb).catch((err) => MK().toast(err.message)));
        inp.value = '';
      });
      const recBtn = box.querySelector('.rec');
      if (recBtn) {
        let rec = null, chunks = [], timer = null, t0 = 0;
        recBtn.addEventListener('click', () => {
          if (rec && rec.state === 'recording') { rec.stop(); return; }
          if (!navigator.mediaDevices || !window.MediaRecorder) { MK().toast('המכשיר לא תומך בהקלטה מהדפדפן'); return; }
          navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
            chunks = []; rec = new MediaRecorder(stream);
            rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
            rec.onstop = () => {
              clearInterval(timer); recBtn.classList.remove('on'); recBtn.textContent = '🎤 הקלטה';
              stream.getTracks().forEach((t) => t.stop());
              const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
              const secs = Math.round((Date.now() - t0) / 1000);
              toBase64(blob).then((base64) => addThumb({ base64, mime: blob.type, name: 'הקלטה ' + secs + ' שניות.webm', kind: 'audio', preview: null }));
            };
            rec.start(); t0 = Date.now(); recBtn.classList.add('on');
            timer = setInterval(() => { recBtn.textContent = '⏹ עצור (' + Math.round((Date.now() - t0) / 1000) + '")'; }, 500);
          }).catch(() => MK().toast('אין הרשאה למיקרופון'));
        });
      }
      return { get: () => items, clear: () => { items = []; prev.innerHTML = ''; } };
    };
    return { html, bind };
  }

  /** מעלה רשימת פריטים (אחד אחרי השני) ומחזיר את הרשומות. */
  function upload(items, ctx) {
    const K = MK();
    const out = [];
    let p = Promise.resolve();
    items.forEach((it, i) => {
      p = p.then(() => { K.toast('מעלה ' + (i + 1) + ' מתוך ' + items.length + '...'); return K.DataSource.post('addMedia', Object.assign({ base64: it.base64, mime: it.mime, name: it.name }, ctx)); })
        .then((res) => { if (res.record) { K.S.data.media = K.S.data.media || []; K.S.data.media.push(res.record); out.push(res.record); } });
    });
    return p.then(() => out);
  }

  function forRef(context, refId) { return (MK().S.data.media || []).filter((m) => m.context === context && m.refId === refId); }
  function forMikveh(id) { return (MK().S.data.media || []).filter((m) => m.mikvehId === id); }

  /** תצוגת מדיה מוטמעת (ליד הודעה או דיווח) */
  function thumbs(list) {
    if (!list.length) return '';
    return '<div class="mthumbs">' + list.map((m) => {
      if (m.kind === 'audio') return '<audio class="mplay" controls preload="none" src="' + esc(m.view || m.url) + '"></audio>';
      if (m.kind === 'video') return '<a class="mvid" href="' + esc(m.url || m.view) + '" target="_blank" rel="noopener">🎬 סרטון<small>' + esc(m.name || '') + '</small></a>';
      return '<a href="' + esc(m.url || m.view) + '" target="_blank" rel="noopener" title="' + esc(m.name || '') + '"><img src="' + esc(m.thumb || m.view) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></a>';
    }).join('') + '</div>';
  }
  function gallery(m) {
    const list = forMikveh(m.id).slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    if (!list.length) return '';
    return '<div class="panel"><h3>מדיה (' + list.length + ')</h3>' + thumbs(list) + '</div>';
  }

  /** מזהה קובץ דרייב מתוך קישור */
  function driveId(url) { const m = String(url || '').match(/[-\w]{25,}/); return m ? m[0] : null; }

  /** לשונית "מדיה": כל התמונות, הסרטונים וההקלטות של המקווה עם הטקסט שנכתב לידם. */
  function photosPane(m) {
    const K = MK(), items = [];
    const actByTs = {}; (K.S.actions[m.id] || []).forEach((a) => { actByTs[a.ts] = a; });
    const msgById = {}; (K.S.data.messages || []).forEach((x) => { msgById[x.id] = x; });
    forMikveh(m.id).forEach((x) => {
      let cap = '', who = x.by || '';
      if (x.context === 'message') { const msg = msgById[x.refId]; cap = msg ? (msg.text || '') : 'הודעה בדיון'; who = msg ? msg.author : who; }
      else if (x.context === 'inspection') { cap = 'דו"ח פיקוח'; }
      else { const a = actByTs[x.refId]; cap = a ? a.action + (a.otzar ? ' ' + a.otzar : '') + (a.note || a.note2 ? ' – ' + (a.note || a.note2) : '') : 'דיווח'; who = a ? (a.rabbi || who) : who; }
      items.push({ ts: x.ts, kind: x.kind || 'image', thumb: x.thumb || x.view, url: x.url || x.view, view: x.view, cap, who, src: x.context === 'message' ? 'דיון' : x.context === 'inspection' ? 'פיקוח' : 'דיווח' });
    });
    (K.S.wa[m.id] || []).forEach((w) => {
      (w.media || []).forEach((u) => { const id = driveId(u); items.push({ ts: w.ts, kind: 'image', thumb: id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400' : null, url: u, cap: w.summary || w.text || '', who: w.sender || '', src: 'וואטסאפ' }); });
    });
    items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    if (!items.length) return '<div class="panel"><div class="empty">עדיין אין מדיה למקווה זה. אפשר לצרף תמונות, סרטונים והקלטות בכל דיווח ובכל הודעה בדיון.</div></div>';
    const counts = items.reduce((c, i) => { c[i.kind] = (c[i.kind] || 0) + 1; return c; }, {});
    const sub = ['image', 'video', 'audio'].filter((k) => counts[k]).map((k) => ICON[k] + ' ' + counts[k]).join(' · ');
    return '<div class="panel"><h3>מדיה (' + items.length + ') <small style="font-weight:400;color:var(--muted)">' + sub + '</small></h3><div class="pgrid">' + items.map((it) => {
      const head = it.kind === 'audio'
        ? '<div class="pph audio">🎤<audio controls preload="none" src="' + esc(it.view || it.url) + '"></audio></div>'
        : it.kind === 'video' ? '<div class="pph">🎬 סרטון</div>'
        : (it.thumb ? '<img src="' + esc(it.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<div class="pph">📎 קובץ</div>');
      const inner = '<div class="pc"><span class="badge brand">' + esc(it.src) + '</span> <span class="pt">' + esc(K.hebOf(it.ts)) + '</span><div class="pcap">' + esc((it.cap || '').slice(0, 160)) + '</div>' + (it.who ? '<small>' + esc(it.who) + '</small>' : '') + '</div>';
      return it.kind === 'audio' ? '<div class="pcard">' + head + inner + '</div>' : '<a class="pcard" href="' + esc(it.url || it.view) + '" target="_blank" rel="noopener">' + head + inner + '</a>';
    }).join('') + '</div></div>';
  }
  function photosCount(m) { const K = MK(); return forMikveh(m.id).length + (K.S.wa[m.id] || []).reduce((n, w) => n + (w.media || []).length, 0); }

  window.MikvehMedia = { shrink, prepare, picker, upload, forRef, forMikveh, thumbs, gallery, photosPane, photosCount, kindOf };
})();
