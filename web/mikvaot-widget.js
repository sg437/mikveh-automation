/**
 * ווידג'ט המקוואות לאתר – מציג את הנתונים החיים מהמערכת (API ציבורי).
 *
 * שימוש באתר (בכל מערכת: וורדפרס, Wix, HTML רגיל):
 *   <div id="mikvaot" data-api="https://script.google.com/macros/s/XXXX/exec"
 *        data-council="" data-region="" data-search="1"></div>
 *   <script src="https://.../mikvaot-widget.js"></script>
 *
 * מה מוצג: שם המקווה, יישוב וכתובת, מצב (פעיל / בשיפוץ / סגור), טלפונים,
 * שעות פתיחה, הנגשה, ותוקף תעודת הכשרות – הכל מתעדכן מהמערכת בזמן אמת.
 * מידע פנימי (דיווחים, דיונים, קבלנים, משתמשים) לעולם אינו נחשף כאן.
 */
(function () {
  'use strict';
  var CSS = '\
.mkw{font-family:"Segoe UI","Arial Hebrew",Arial,sans-serif;direction:rtl;color:#1B2430}\
.mkw *{box-sizing:border-box}\
.mkw-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}\
.mkw-bar input,.mkw-bar select{padding:9px 11px;border:1px solid #D8DEE5;border-radius:8px;font:inherit;flex:1;min-width:150px}\
.mkw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}\
.mkw-card{border:1px solid #D8DEE5;border-radius:10px;padding:12px 14px;background:#fff;border-inline-start:5px solid #2E7D46}\
.mkw-card.renov{border-inline-start-color:#B7791F}\
.mkw-card.closed{border-inline-start-color:#C0392B;opacity:.85}\
.mkw-card h3{margin:0 0 2px;font-size:1.02rem}\
.mkw-loc{color:#5B6B7C;font-size:.85rem;margin-bottom:6px}\
.mkw-st{display:inline-block;border-radius:6px;padding:2px 9px;font-size:.75rem;font-weight:700;background:#E3F3E7;color:#2E7D46;margin-bottom:6px}\
.mkw-st.renov{background:#FBF1DC;color:#B7791F}.mkw-st.closed{background:#FBE4E1;color:#C0392B}\
.mkw-row{display:flex;justify-content:space-between;gap:8px;font-size:.83rem;padding:3px 0;border-bottom:1px dashed #E7ECF1}\
.mkw-row span:first-child{color:#5B6B7C}\
.mkw-row a{color:#1F5F8B;text-decoration:none}\
.mkw-note{font-size:.8rem;color:#5B6B7C;margin-top:6px}\
.mkw-empty,.mkw-load{padding:24px;text-align:center;color:#5B6B7C}\
.mkw-foot{margin-top:10px;font-size:.75rem;color:#5B6B7C;text-align:center}';

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tel(p) { return p ? '<a href="tel:' + esc(String(p).replace(/[^\d+]/g, '')) + '">' + esc(p) + '</a>' : ''; }

  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var cb = 'mkw_' + Math.random().toString(36).slice(2);
      var s = document.createElement('script');
      var t = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, 15000);
      function cleanup() { clearTimeout(t); delete window[cb]; if (s.parentNode) s.parentNode.removeChild(s); }
      window[cb] = function (data) { cleanup(); resolve(data); };
      s.onerror = function () { cleanup(); reject(new Error('network')); };
      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(s);
    });
  }

  function render(box, list, opts) {
    var grid = box.querySelector('.mkw-grid');
    var q = (box.querySelector('.mkw-q') || {}).value || '';
    var council = (box.querySelector('.mkw-council') || {}).value || '';
    var shown = list.filter(function (m) {
      if (council && m.council !== council) return false;
      if (!q) return true;
      return [m.name, m.place, m.council, m.address].join(' ').indexOf(q) >= 0;
    });
    grid.innerHTML = shown.length ? shown.map(function (m) {
      var cls = m.status === 'בשיפוץ' ? 'renov' : m.status === 'סגור' ? 'closed' : '';
      var h = m.hours || {};
      var rows = [
        ['טלפון', tel(m.phone)], ['בלנית', tel(m.attendantPhone)],
        ['שעות קיץ', esc(h.summer || '')], ['שעות חורף', esc(h.winter || '')],
        ['ערב שבת וחג', esc(h.erev || '')], ['מוצ"ש ויו"ט', esc(h.motzash || '')],
        ['הנגשה', esc(m.accessibility || '')], ['תאום מראש', esc(m.coordination || '')],
        ['תעודת כשרות', esc(m.certificate || '')],
      ].filter(function (r) { return r[1]; });
      return '<div class="mkw-card ' + cls + '"><h3>' + esc(m.name) + '</h3>' +
        '<div class="mkw-loc">' + esc([m.place, m.council, m.address].filter(Boolean).join(' · ')) + '</div>' +
        '<span class="mkw-st ' + cls + '">' + esc(m.status) + '</span>' +
        rows.map(function (r) { return '<div class="mkw-row"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>'; }).join('') +
        (m.statusNote ? '<div class="mkw-note">' + esc(m.statusNote) + '</div>' : '') + '</div>';
    }).join('') : '<div class="mkw-empty">לא נמצאו מקוואות</div>';
    var foot = box.querySelector('.mkw-foot');
    if (foot) foot.textContent = shown.length + ' מקוואות · עודכן ' + new Date(opts.generatedAt).toLocaleString('he-IL');
  }

  function init(box) {
    var api = box.getAttribute('data-api');
    if (!api) { box.textContent = 'חסר data-api'; return; }
    if (!document.getElementById('mkw-css')) {
      var st = el('style'); st.id = 'mkw-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    box.classList.add('mkw');
    var withSearch = box.getAttribute('data-search') !== '0';
    box.innerHTML = (withSearch ? '<div class="mkw-bar"><input class="mkw-q" type="search" placeholder="חיפוש מקווה או יישוב"><select class="mkw-council"><option value="">כל המועצות</option></select></div>' : '') +
      '<div class="mkw-grid"><div class="mkw-load">טוען את רשימת המקוואות...</div></div><div class="mkw-foot"></div>';
    var url = api + (api.indexOf('?') >= 0 ? '&' : '?') + 'action=public' +
      (box.getAttribute('data-council') ? '&council=' + encodeURIComponent(box.getAttribute('data-council')) : '') +
      (box.getAttribute('data-region') ? '&region=' + encodeURIComponent(box.getAttribute('data-region')) : '');
    jsonp(url).then(function (data) {
      var list = data.mikvaot || [];
      var sel = box.querySelector('.mkw-council');
      if (sel) {
        var councils = list.map(function (m) { return m.council; }).filter(Boolean);
        councils = councils.filter(function (c, i) { return councils.indexOf(c) === i; }).sort();
        councils.forEach(function (c) { var o = el('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
        sel.addEventListener('change', function () { render(box, list, data); });
      }
      var q = box.querySelector('.mkw-q');
      if (q) q.addEventListener('input', function () { render(box, list, data); });
      render(box, list, data);
    }).catch(function () {
      box.querySelector('.mkw-grid').innerHTML = '<div class="mkw-empty">לא ניתן לטעון את רשימת המקוואות כרגע</div>';
    });
  }

  function boot() { Array.prototype.forEach.call(document.querySelectorAll('[data-api][id^="mikvaot"], .mikvaot-widget[data-api]'), init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.MikvaotWidget = { init: init };
})();
