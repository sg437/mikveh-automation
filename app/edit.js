/**
 * עריכת פרטי המקווה (בסיס הנתונים) והוספת מקווה חדש – מתוך המערכת.
 * הכתיבה לגיליון דרך ApiWrite (updateMikveh / addMikveh); שדות התאריכים והתעודה
 * מחושבים בגיליון ולכן אינם נערכים כאן.
 */
(function () {
  'use strict';
  const MK = () => window.MK;
  const esc = (s) => MK().esc(s);
  const YES_NO = ['', 'יש', 'אין'];
  const GROUPS = [
    { title: 'כללי', fields: [
      { k: 'council', l: 'מועצה', t: 'list' }, { k: 'place', l: 'יישוב' }, { k: 'address', l: 'כתובת' },
      { k: 'region', l: 'איזור', t: 'select', opts: ['', 'צפון', 'חיפה', 'מרכז', 'ירושלים', 'שומרון', 'מזרח', 'דרום'] },
      { k: 'localityType', l: 'סוג רשות', t: 'select', opts: ['', 'עיר', 'אזורית', 'מקומית'] },
      { k: 'ownership', l: 'בעלות', t: 'list' },
      { k: 'activity', l: 'פעילות', t: 'select', opts: ['', 'פעיל', 'בשיפוץ', 'מושבת'] },
      { k: 'supervised', l: 'בפיקוח', t: 'select', opts: ['', 'כן', 'לא'] },
      { k: 'accessibility', l: 'רמת הנגשה' }, { k: 'coordination', l: 'תאום מראש' },
    ] },
    { title: 'אנשי קשר', fields: [
      { k: 'attendant', l: 'בלנית / אחראי' }, { k: 'phone', l: 'טלפון', t: 'tel' }, { k: 'mikvehPhone', l: 'טלפון מקווה', t: 'tel' },
      { k: 'masterKey', l: 'מפתח מסטר', t: 'select', opts: YES_NO }, { k: 'masterKeyWhich', l: 'איזה מפתח' },
    ] },
    { title: 'אוצרות ומתקנים', fields: [
      { k: 'reservoir', l: 'מאגר', t: 'select', opts: YES_NO }, { k: 'otzarLocation', l: 'מיקום האוצרות', t: 'select', opts: ['', 'פנימי', 'חיצוני', 'פנימי, חיצוני'] },
      { k: 'otzarZeria', l: 'אוצר זריעה', t: 'select', opts: YES_NO }, { k: 'otzarHashaka', l: 'אוצר השקה', t: 'select', opts: YES_NO },
      { k: 'hashakaType', l: 'סוג השקה', t: 'select', opts: ['', 'רגיל', "רגיל וחב''ד", 'בעג"ב בצד', "חב''ד"] },
      { k: 'filter', l: 'פילטר', t: 'select', opts: YES_NO }, { k: 'kelim', l: 'מקוה כלים' },
      { k: 'socket', l: 'שקע ליד האוצרות', t: 'select', opts: YES_NO }, { k: 'hoseTap', l: 'ברז לצינור', t: 'select', opts: YES_NO },
    ] },
    { title: 'שעות פתיחה', fields: [
      { k: 'hoursSummer', l: 'קיץ' }, { k: 'hoursWinter', l: 'חורף' }, { k: 'hoursErev', l: 'ערב שבת וחג' }, { k: 'hoursMotzash', l: 'מוצ"ש ויו"ט' },
    ] },
    { title: 'הערות', fields: [{ k: 'notes', l: 'הערות', t: 'textarea' }, { k: 'notes2', l: 'הערות נוספות', t: 'textarea' }] },
  ];

  function listOptions(k) { return MK().uniq(MK().S.data.mikvaot.map((m) => m[k])); }

  function field(f, val) {
    const id = 'e_' + f.k, v = val == null ? '' : String(val);
    if (f.t === 'select') return '<div class="ff"><label for="' + id + '">' + esc(f.l) + '</label><select id="' + id + '" name="' + f.k + '">' + f.opts.map((o) => '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + (o || '—') + '</option>').join('') + (f.opts.indexOf(v) < 0 && v ? '<option selected>' + esc(v) + '</option>' : '') + '</select></div>';
    if (f.t === 'textarea') return '<div class="ff wide"><label for="' + id + '">' + esc(f.l) + '</label><textarea id="' + id + '" name="' + f.k + '" rows="2">' + esc(v) + '</textarea></div>';
    if (f.t === 'list') return '<div class="ff"><label for="' + id + '">' + esc(f.l) + '</label><input id="' + id + '" name="' + f.k + '" list="dl_' + f.k + '" value="' + esc(v) + '"><datalist id="dl_' + f.k + '">' + listOptions(f.k).map((o) => '<option value="' + esc(o) + '">').join('') + '</datalist></div>';
    return '<div class="ff"><label for="' + id + '">' + esc(f.l) + '</label><input id="' + id + '" name="' + f.k + '" type="' + (f.t === 'tel' ? 'tel' : 'text') + '" value="' + esc(v) + '"></div>';
  }

  /** m = מקווה קיים (עריכה) או null (חדש) */
  function open(m) {
    const K = MK();
    if (!K.requireUser()) return;
    const root = K.$('#editModal'), body = K.$('#editBody');
    K.$('#editTitle').textContent = m ? 'עריכת פרטים – ' + m.name : 'מקווה חדש';
    body.innerHTML = '<form id="editForm" class="rform" novalidate>' +
      (m ? '' : '<div class="fgrid"><div class="ff wide"><label for="e_name">שם המקווה <span class="req">*</span></label><input id="e_name" name="name" type="text" required placeholder="למשל: אשדוד - רובע ז"></div></div>') +
      GROUPS.map((g, i) => '<details class="fsec"' + (i === 0 ? ' open' : '') + '><summary>' + esc(g.title) + '</summary><div class="fgrid">' + g.fields.map((f) => field(f, m ? m[f.k] : '')).join('') + '</div></details>').join('') +
      (m ? '<div class="note-box" style="margin-top:10px">תוקף התעודה, ביקור אחרון ותאריכי ההחלפות מחושבים אוטומטית מהדיווחים ולא נערכים כאן. פרטי הקבלן והפניות אליו נמצאים בלשונית "קבלן" בכרטיס. שינוי "פעילות" ל"בשיפוץ" או "מושבת" מתעדכן גם באתר.</div>' : '') +
      '<div class="factions"><button class="btn primary" type="submit" id="editSubmit">' + (m ? 'שמירת השינויים' : 'הוספת המקווה') + '</button><button class="btn" type="button" id="editCancel">ביטול</button><span class="fmsg" id="editMsg"></span></div></form>';
    root.hidden = false;
    K.$('#editCancel').addEventListener('click', () => { root.hidden = true; });
    K.$('#editForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target, msg = K.$('#editMsg'), btn = K.$('#editSubmit');
      const fields = {};
      let name = m ? m.name : '';
      Array.from(form.elements).forEach((el) => { if (!el.name) return; if (el.name === 'name') name = el.value.trim(); else if (!m || String(m[el.name] == null ? '' : m[el.name]) !== el.value) fields[el.name] = el.value.trim(); });
      if (!name) { msg.textContent = 'חסר שם מקווה'; msg.className = 'fmsg bad'; return; }
      if (m && !Object.keys(fields).length) { msg.textContent = 'לא שונה דבר'; msg.className = 'fmsg'; return; }
      btn.disabled = true; msg.textContent = 'שומר...'; msg.className = 'fmsg';
      const p = m ? K.DataSource.post('updateMikveh', { mikveh: m.name, fields }) : K.DataSource.post('addMikveh', { name, fields });
      p.then((res) => {
        if (m) { Object.keys(fields).forEach((k) => { m[k] = fields[k] || null; }); }
        else if (res.record) { K.S.data.mikvaot.push(res.record); }
        if (res.message && !K.S.data.messages.some((x) => x.id === res.message.id)) K.S.data.messages.push(res.message);
        K.buildIndexes();
        root.hidden = true;
        K.toast(m ? 'הפרטים עודכנו' : 'המקווה נוסף');
        const id = m ? m.id : (res.record ? res.record.id : null);
        if (id) { location.hash = '#/m/' + encodeURIComponent(id); K.route(); }
      }).catch((err) => { btn.disabled = false; msg.textContent = 'לא נשמר: ' + err.message; msg.className = 'fmsg bad'; });
    });
  }

  window.MikvehEdit = { open };
})();
