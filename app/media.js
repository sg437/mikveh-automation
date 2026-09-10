/**
 * תמונות: בחירה/צילום, הקטנה במכשיר, העלאה לדרייב דרך ApiWrite (addMedia) והצגה.
 */
(function () {
  'use strict';
  const MAX_SIDE = 1400, QUALITY = 0.82;
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);

  /** מקטין תמונה ל-JPEG ומחזיר base64 (ללא הקידומת). */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ base64: c.toDataURL('image/jpeg', QUALITY).split(',')[1], mime: 'image/jpeg', name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', preview: c.toDataURL('image/jpeg', 0.5) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('קובץ תמונה לא תקין')); };
      img.src = url;
    });
  }

  /** תיבת בחירת תמונות עם תצוגה מקדימה. מחזיר {html, bind(root) -> getFiles()} */
  function picker(id) {
    const html = '<div class="mpick" id="' + id + '"><label class="btn small" for="' + id + '_in">📷 צרף תמונות</label><input id="' + id + '_in" type="file" accept="image/*" multiple hidden><div class="mprev"></div></div>';
    const bind = (root) => {
      const box = root.querySelector('#' + id), inp = box.querySelector('input'), prev = box.querySelector('.mprev');
      let items = [];
      inp.addEventListener('change', () => {
        Array.from(inp.files || []).forEach((f) => shrink(f).then((it) => { items.push(it); prev.insertAdjacentHTML('beforeend', '<span class="mth"><img src="' + it.preview + '" alt=""><button type="button" class="x" title="הסר">✕</button></span>'); const el = prev.lastElementChild; el.querySelector('.x').addEventListener('click', () => { items = items.filter((x) => x !== it); el.remove(); }); }).catch((err) => MK().toast(err.message)));
        inp.value = '';
      });
      return { get: () => items, clear: () => { items = []; prev.innerHTML = ''; } };
    };
    return { html, bind };
  }

  /** מעלה רשימת תמונות (אחת אחת) ומחזיר את הרשומות. */
  function upload(items, ctx) {
    const K = MK();
    const out = [];
    let p = Promise.resolve();
    items.forEach((it, i) => {
      p = p.then(() => { K.toast('מעלה תמונה ' + (i + 1) + ' מתוך ' + items.length + '...'); return K.DataSource.post('addMedia', Object.assign({ base64: it.base64, mime: it.mime, name: it.name }, ctx)); })
        .then((res) => { if (res.record) { K.S.data.media = K.S.data.media || []; K.S.data.media.push(res.record); out.push(res.record); } });
    });
    return p.then(() => out);
  }

  function forRef(context, refId) { return (MK().S.data.media || []).filter((m) => m.context === context && m.refId === refId); }
  function forMikveh(id) { return (MK().S.data.media || []).filter((m) => m.mikvehId === id); }
  function thumbs(list) {
    if (!list.length) return '';
    return '<div class="mthumbs">' + list.map((m) => '<a href="' + esc(m.url || m.view) + '" target="_blank" rel="noopener" title="' + esc(m.name || '') + '"><img src="' + esc(m.thumb || m.view) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></a>').join('') + '</div>';
  }
  function gallery(m) {
    const list = forMikveh(m.id).slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    if (!list.length) return '';
    return '<div class="panel"><h3>תמונות (' + list.length + ')</h3>' + thumbs(list) + '</div>';
  }

  window.MikvehMedia = { shrink, picker, upload, forRef, forMikveh, thumbs, gallery };
})();
