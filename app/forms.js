/**
 * טפסי הדיווח בתוך המערכת (במקום טפסי Google).
 * נטען אחרי app.js ומשתמש ב-window.MK (עזרים ומצב) שהאפליקציה חושפת.
 * כל טופס נשלח ל-Apps Script (ApiWrite.js) ונרשם בגיליון באותו מבנה של הטופס המקורי.
 */
(function () {
  'use strict';
  const STATUS = ['תקין', 'טעון תיקון', 'תיקון דחוף'];
  const YES_NO = ['יש', 'אין'];
  const REPLACE = ['לא', 'כן', 'דחוף'];

  // ---------- טפסי פעולה (לשונית "אוצר זריעה") – לפי טופס "פעולות" ----------
  // כל טופס = ענף אחד של הטופס המקורי: שם הרב, אחראי/בלנית, טלפון, ואז שדות הפעולה.
  const F = {
    date: { k: 'date', t: 'date', l: 'תאריך ביצוע' },
    rabbi: { k: 'rabbi', t: 'rabbi', l: 'שם הרב', req: true },
    attendant: { k: 'attendant', t: 'text', l: 'שם אחראי / בלנית' },
    phone: { k: 'phone', t: 'text', l: 'טלפון' },
    note: { k: 'note', t: 'textarea', l: 'הערה' },
  };
  const HEAD = [F.date, F.rabbi, F.attendant, F.phone];
  // בורר הפעולה – בדיוק ששת האפשרויות שבטופס
  const ACTION_PICK = { k: '_act', t: 'radio', l: 'פעולות', req: true, opts: ['החלפת אוצר', 'ריקון מאגר', 'תיקון כשרות', 'פקק על הגג', 'חידוש תעודה', 'אישור מילוי אוצר (רק בפקק פתוח)'] };
  const ACT_KEY = { 'החלפת אוצר': 'otzar', 'ריקון מאגר': 'reservoir', 'תיקון כשרות': 'repair', 'פקק על הגג': 'plug', 'חידוש תעודה': 'cert', 'אישור מילוי אוצר (רק בפקק פתוח)': 'fillOk' };
  const ACTION_FORMS = {
    otzar: { title: 'החלפת אוצר', action: 'החלפת אוצר', fields: HEAD.concat([
      { k: 'otzar', t: 'radio', l: 'אוצר', opts: ['זריעה', 'השקה', "חב''ד"], req: true },
      { k: 'drained', t: 'checks', l: 'פעולות לריקון האוצר – בוצע', opts: ['ריקון האוצר', 'ניקוי האוצר', 'ייבוש המשכה', 'ייבוש האוצר'], req: true },
      { k: 'sealed', t: 'radio', l: 'איטום האוצר', opts: STATUS, req: true },
      { k: 'filled', t: 'radio', l: 'מילוי האוצר', opts: ['מילוי תקין', 'נשאר פתוח לחסדי הבורא', 'טעון מילוי חוזר'], req: true },
      F.note]) },
    reservoir: { title: 'ריקון מאגר', action: 'ריקון מאגר', fields: HEAD.concat([
      { k: 'roofDone', t: 'checks', l: 'בוצע', opts: ['ניקוי הגג', 'ריקון המאגר', 'ניקוי המאגר', 'ייבוש המאגר'], req: true },
      { k: 'roofSealed', t: 'radio', l: 'איטום הגג', opts: STATUS }, { k: 'reservoirSealed', t: 'radio', l: 'איטום המאגר', opts: STATUS },
      { k: 'note2', t: 'textarea', l: 'הערה' }]) },
    repair: { title: 'תיקון כשרות', action: 'תיקון כשרות', fields: HEAD.concat([
      { k: 'treated', t: 'checks', l: 'מה טופל', opts: ['בור טבילה', 'אוצר זריעה', 'אוצר השקה', "אוצר חב''ד", 'מאגר', 'מקוה כלים', 'גג'] },
      { k: 'note', t: 'textarea', l: 'תיקוני כשרות – נא לפרט', req: true }]) },
    plug: { title: 'פקק על הגג', action: 'פקק על הגג', fields: HEAD.concat([F.note]) },
    cert: { title: 'חידוש תעודה', action: 'חידוש תעודה', fields: HEAD.concat([
      { k: 'validMonth', t: 'hebmonth', l: 'תוקף עד – חודש', req: true }, { k: 'validYear', t: 'hebyear', l: 'שנה', req: true },
      { k: 'liters', t: 'number', l: 'כמות מים בליטר מתחת יציאת המים' }, F.note]) },
    fillOk: { title: 'אישור מילוי אוצר (רק בפקק פתוח)', action: 'אישור מילוי אוצר (רק בפקק פתוח)', fields: HEAD.concat([
      { k: 'otzar', t: 'radio', l: 'אוצר', opts: ['זריעה', 'השקה', "חב''ד"], req: true },
      { k: 'filled', t: 'radio', l: 'מילוי האוצר', opts: ['מילוי תקין', 'טעון מילוי חוזר'], req: true }, F.note]) },
    visit: { title: 'ביקור כשרות', action: 'ביקור כשרות', fields: HEAD.concat([F.note]) },
  };

  // ---------- דו"ח פיקוח כשרות המקוואות – אחד לאחד לפי הטופס (לשונית "פיקוח הלכתי", 79 עמודות) ----------
  const S3 = (c, l) => ({ c, l, t: 'status' });                                  // תקין / טעון תיקון / תיקון דחוף
  const S3D = (c, l) => ({ c, l, t: 'status', opts: ['תקין', 'דרוש תיקון', 'תיקון דחוף'] }); // ניסוח "דרוש תיקון" כמו בטופס
  const INSPECTION = [
    { title: 'גג איסוף מי גשם', fields: [S3D(6, 'איטום'), S3D(7, 'ניקיון'), S3D(8, 'גיזום עצים'), S3D(9, 'שיפוע הגג'), S3D(10, 'סוג הצינור שמוריד הגשם'), { c: 11, l: 'הערות', t: 'textarea' }] },
    { title: 'מאגר', fields: [{ c: 12, l: 'מאגר', t: 'radio', opts: YES_NO, req: true },
      S3D(13, 'כיסוי מאגר'), S3D(14, 'ניקיון המים'), S3D(15, 'יציאת המים'), S3D(16, 'איטום המאגר'),
      { c: 17, l: 'מצב המאגר', t: 'radio', opts: ['מלא', 'חצי מלא', 'ריק'] }, { c: 18, l: 'ריקון המאגר', t: 'radio', opts: REPLACE },
      { c: 65, l: 'כניסה למאגר', t: 'radio', opts: ['גדול', 'סביר', 'קטן'] }, { c: 19, l: 'תיאור / הערה', t: 'textarea' }] },
    { title: 'אוצר זריעה', fields: [{ c: 20, l: 'אוצר זריעה', t: 'radio', opts: YES_NO, req: true },
      S3(21, 'כניסת מי גשמים'), S3(22, 'המשכה'), S3(23, 'כניסת מים שאובים'), S3(24, 'המשכה בפועל'), S3(25, 'ניקיון האוצר'), S3(26, 'צינור חזו"א'), S3(27, 'איטום אוצר'),
      { c: 28, l: 'טעון החלפה', t: 'radio', opts: REPLACE }, { c: 29, l: 'תיאור / הערה', t: 'textarea' },
      { c: 30, l: 'אוצר השקה בנפרד', t: 'radio', opts: ['אין', 'יש'], req: true }] },
    { title: 'אוצר השקה', fields: [{ c: 31, l: 'השקה מיוחד', t: 'radio', opts: ['רגיל', "רגיל וחב''ד", 'בעג"ב בצד', "חב''ד"] },
      S3(32, 'כניסת מי גשמים'), S3(33, 'המשכה'), S3(34, 'ניקיון'), S3(35, 'איטום אוצר'), { c: 36, l: 'טעון החלפה', t: 'radio', opts: REPLACE }, { c: 37, l: 'תיאור / הערה', t: 'textarea' }] },
    { title: 'בור טבילה', fields: [S3(38, 'סימון גובה מים'), S3(39, 'גובה המים'), S3(40, 'נקיון המים'), S3(41, 'זחילה'), S3(42, 'נקב השקה מקום גודל ונקיון'), S3(43, 'נקב זריעה מקום'), S3(44, 'ברז מילוי'), S3(45, 'ברז אויר למשאבה'), S3(46, 'אל חזור למשאבה'),
      { c: 49, l: 'סוג משאבה', t: 'radio', opts: ['וואקום', 'וואקום ולא תקין', 'חשמלי', 'חשמלי ולא תקין'] },
      { c: 47, l: "קיבוע מערכות (מעקה, חימום וכדו')", t: 'radio', opts: ['מעל גובה המים', 'מתחת גובה המים'] },
      { c: 48, l: 'פילטר', t: 'radio', opts: ['אין', 'יש', 'יש ללא מילוי תנאים'] }, { c: 50, l: 'תיאור / הערה', t: 'textarea' }] },
    { title: 'שונות / טכני', fields: [
      { c: 52, l: 'כמות חדרים', t: 'radio', opts: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
      { c: 53, l: 'מצב המבנה (1 = חדש … 10 = זקוק לשיפוץ)', t: 'radio', opts: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
      S3(54, 'רטיבות בחדר בור טבילה'), S3(55, 'רטיבות בחדרים'),
      { c: 56, l: 'תאורה מעל בור הטבילה', t: 'status', opts: ['תקין', 'טעון תיקון', 'אין'] }, { c: 57, l: 'תאורת חירום', t: 'status', opts: ['תקין', 'טעון תיקון', 'אין'] }, { c: 58, l: 'מקוה כלים', t: 'status', opts: ['תקין', 'טעון תיקון', 'אין'] },
      { c: 60, l: 'מפתח מסטר', t: 'radio', opts: YES_NO }, { c: 61, l: 'איזה', t: 'text' },
      { c: 51, l: 'מיקום האוצרות', t: 'checks', opts: ['פנימי', 'חיצוני'] }, { c: 66, l: 'כניסה לאוצרות', t: 'radio', opts: ['גדול', 'סביר', 'צר'] },
      { c: 63, l: 'שקע ליד האוצרות', t: 'radio', opts: YES_NO }, { c: 64, l: 'ברז מים לצינור', t: 'radio', opts: YES_NO },
      { c: 62, l: 'תוקף תעודה (החודש והשנה, למשל "אלול פ"ז")', t: 'text', req: true },
      { c: 59, l: 'תיאור / הערה', t: 'textarea' }, { c: 74, l: 'הנחיות מיוחדות לבלנית / אחראי', t: 'textarea' }] },
  ];
  // מדורי הדוח כפי שהם מוצגים בכרטיס (זהה למבנה שמחזיר ה-API)
  const SECTION_KEYS = ['roof', 'reservoir', 'zeria', 'hashaka', 'bor', 'technical'];

  const HEB_MONTHS = ['תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר א', 'אדר ב', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול'];

  function esc(s) { return window.MK.esc(s); }
  function today() { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function hebOfDateInput(v) { const p = (v || '').split('-'); if (p.length !== 3) return ''; return HebDate.format(new Date(+p[0], +p[1] - 1, +p[2], 12)); }
  function yearOptions() {
    const y = HebDate.fromDate(new Date()).year;
    return [y, y + 1, y + 2].map((yy) => HebDate.yearLabel(yy).replace("''", '"'));
  }

  function fieldHtml(f, name, val) {
    const id = 'f_' + name;
    const lab = '<label for="' + id + '">' + esc(f.l) + (f.req ? ' <span class="req">*</span>' : '') + '</label>';
    if (f.t === 'date') return '<div class="ff"><label for="' + id + '">' + esc(f.l) + '</label><input type="date" id="' + id + '" name="' + name + '" value="' + esc(val || today()) + '"><small class="heb" data-heb-for="' + id + '">' + esc(hebOfDateInput(val || today())) + '</small></div>';
    if (f.t === 'rabbi') {
      const K = window.MK, names = {};
      (K.S.data.actions || []).forEach((a) => { if (a.rabbi) names[a.rabbi] = (names[a.rabbi] || 0) + 1; });
      (K.S.data.inspections || []).forEach((i) => { if (i.rabbi) names[i.rabbi] = (names[i.rabbi] || 0) + 1; });
      (K.S.data.users || []).forEach((u) => { if (u.name && u.active !== false) names[u.name] = (names[u.name] || 0) + 1000; });
      const list = Object.keys(names).sort((a, b) => names[b] - names[a]).slice(0, 40);
      return '<div class="ff">' + lab + '<input id="' + id + '" name="' + name + '" list="rabbiList" value="' + esc(val || '') + '" placeholder="בחר או הקלד"' + (f.req ? ' required' : '') + '><datalist id="rabbiList">' + list.map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist></div>';
    }
    if (f.t === 'text') return '<div class="ff">' + lab + '<input type="text" id="' + id + '" name="' + name + '" value="' + esc(val || '') + '"' + (f.req ? ' required' : '') + '></div>';
    if (f.t === 'number') return '<div class="ff">' + lab + '<input type="number" inputmode="numeric" id="' + id + '" name="' + name + '" value="' + esc(val || '') + '"></div>';
    if (f.t === 'textarea') return '<div class="ff wide">' + lab + '<textarea id="' + id + '" name="' + name + '" rows="2"' + (f.req ? ' required' : '') + '>' + esc(val || '') + '</textarea></div>';
    if (f.t === 'hebmonth') return '<div class="ff">' + lab + '<select id="' + id + '" name="' + name + '">' + HEB_MONTHS.map((m) => '<option' + (m === val ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>';
    if (f.t === 'hebyear') return '<div class="ff">' + lab + '<select id="' + id + '" name="' + name + '">' + yearOptions().map((y) => '<option' + (y === val ? ' selected' : '') + '>' + esc(y) + '</option>').join('') + '</select></div>';
    if (f.t === 'radio' || f.t === 'status') {
      const opts = f.opts || STATUS;
      return '<div class="ff ' + (f.t === 'status' ? 'st' : '') + '"><span class="lbl">' + esc(f.l) + (f.req ? ' <span class="req">*</span>' : '') + '</span><div class="pills">' +
        opts.map((o, i) => '<label class="pill ' + (f.t === 'status' ? 'p' + i : '') + '"><input type="radio" name="' + name + '" value="' + esc(o) + '"' + (o === val ? ' checked' : '') + '><span>' + esc(o) + '</span></label>').join('') + '</div></div>';
    }
    if (f.t === 'checks') {
      const def = val || f.def || [];
      return '<div class="ff wide"><span class="lbl">' + esc(f.l) + '</span><div class="pills">' + f.opts.map((o) => '<label class="pill chk"><input type="checkbox" name="' + name + '" value="' + esc(o) + '"' + (def.indexOf(o) >= 0 ? ' checked' : '') + '><span>' + esc(o) + '</span></label>').join('') + '</div></div>';
    }
    return '';
  }

  function readForm(form) {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      if (el.type === 'checkbox') { (out[el.name] = out[el.name] || []); if (el.checked) out[el.name].push(el.value); }
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; }
      else out[el.name] = el.value;
    });
    return out;
  }

  function openForm(key, m) {
    const MK = window.MK;
    const root = MK.$('#rmStep3');
    MK.$('#rmStep1').hidden = true; MK.$('#rmStep2').hidden = true; root.hidden = false;
    const user = MK.getUser();
    let html = '<div class="rm-chosen"><div><div class="l">' + (key === 'inspection' ? 'דו"ח פיקוח כשרות המקוואות' : 'דיווח פעולה') + '</div><div class="v">' + esc(m.name) + '</div><div class="s">' + esc([m.council, m.region].filter(Boolean).join(' · ')) + '</div></div><button class="btn small" id="rmBack" type="button">חזרה</button></div>';
    html += '<form id="rmForm" class="rform" novalidate>';
    if (key === 'inspection') {
      html += '<div class="fgrid">' + fieldHtml(F.date, 'date') + fieldHtml(F.rabbi, 'rabbi', user.name) + fieldHtml({ k: 'contact', t: 'text', l: 'שם האחראי' }, 'contact', m.attendant || '') + fieldHtml({ k: 'phone', t: 'text', l: 'מספר טלפון' }, 'phone', m.phone || '') + '</div>';
      html += INSPECTION.map((sec, i) => '<details class="fsec"' + (i === 0 ? ' open' : '') + '><summary>' + esc(sec.title) + '<span class="cnt"></span></summary><div class="fgrid">' + sec.fields.map((f) => fieldHtml(f, 'c' + f.c)).join('') + '</div></details>').join('');
      html += '<div class="note-box" style="margin-top:8px">שדות שלא סומנו יישארו ריקים בדוח. לסימון מהיר: <button type="button" class="btn small" id="allOk">סמן את כל הבדיקות "תקין"</button></div>';
    } else {
      const def = ACTION_FORMS[key];
      html += '<div class="fgrid">' + HEAD.map((f) => fieldHtml(f, f.k, f.k === 'rabbi' ? user.name : f.k === 'attendant' ? (m.attendant || '') : f.k === 'phone' ? (m.phone || '') : undefined)).join('') + '</div>';
      html += '<div class="fgrid" style="margin-top:6px">' + fieldHtml(ACTION_PICK, '_act', def.action) + '</div>';
      html += '<div id="actFields" class="fgrid" style="margin-top:6px"></div>';
    }
    const pick = window.MikvehMedia ? MikvehMedia.picker('rmPics') : null;
    html += (pick ? '<div class="ff wide" style="margin-top:10px"><span class="lbl">תמונות (רשות)</span>' + pick.html + '</div>' : '');
    html += '<div class="factions"><button class="btn primary" type="submit" id="rmSubmit">שמירה בתיק המקווה</button><span class="fmsg" id="rmMsg"></span></div></form>';
    root.innerHTML = html;
    root._pics = pick ? pick.bind(root) : null;

    root.querySelector('#rmBack').addEventListener('click', () => { root.hidden = true; MK.$('#rmStep2').hidden = false; });
    const actBox = root.querySelector('#actFields');
    if (actBox) {
      const paint = () => {
        const sel = root.querySelector('input[name="_act"]:checked');
        const k = sel ? ACT_KEY[sel.value] : null;
        const d = k ? ACTION_FORMS[k] : null;
        root._actKey = k;
        actBox.innerHTML = d ? d.fields.filter((f) => HEAD.indexOf(f) < 0).map((f) => fieldHtml(f, f.k, f.k === 'otzar' && m._presetOtzar ? m._presetOtzar : undefined)).join('') : '';
        if (k === 'cert') {
          const h = HebDate.addYears(HebDate.fromDate(new Date()), 1);
          const mo = actBox.querySelector('[name=validMonth]'), yr = actBox.querySelector('[name=validYear]');
          if (mo) mo.value = HebDate.monthName(h.year, h.month);
          if (yr) yr.value = HebDate.yearLabel(h.year).replace("''", '"');
        }
        root.querySelector('#rmSubmit').textContent = 'שמירה בתיק המקווה';
      };
      root.querySelectorAll('input[name="_act"]').forEach((r) => r.addEventListener('change', paint));
      paint();
    }
    root.querySelectorAll('input[type=date]').forEach((inp) => inp.addEventListener('input', () => { const s = root.querySelector('[data-heb-for="' + inp.id + '"]'); if (s) s.textContent = hebOfDateInput(inp.value); }));
    const allOk = root.querySelector('#allOk');
    if (allOk) allOk.addEventListener('click', () => { root.querySelectorAll('.ff.st').forEach((ff) => { const r = ff.querySelector('input[value="תקין"]'); if (r && !ff.querySelector('input:checked')) r.checked = true; }); });
    root.querySelector('#rmForm').addEventListener('submit', (e) => { e.preventDefault(); submitForm(key, m, root); });
    root.scrollIntoView({ block: 'start' });
  }

  function submitForm(key, m, root) {
    const MK = window.MK;
    const form = root.querySelector('#rmForm');
    const msg = root.querySelector('#rmMsg');
    const btn = root.querySelector('#rmSubmit');
    const v = readForm(form);
    // בדיקת שדות חובה
    const actKey = root._actKey;
    const def = key === 'inspection' ? null : ACTION_FORMS[actKey || key];
    const reqFields = def ? [[ '_act', ACTION_PICK ]].concat(def.fields.map((f) => [f.k, f])) : [['rabbi', F.rabbi]].concat(INSPECTION.flatMap((sec) => sec.fields.map((f) => ['c' + f.c, f])));
    const missing = reqFields.filter(([k, f]) => f.req && !(Array.isArray(v[k]) ? v[k].length : v[k])).map(([k, f]) => f.l);
    if (missing.length) { msg.textContent = 'חסר: ' + missing.join(', '); msg.className = 'fmsg bad'; return; }
    btn.disabled = true; msg.textContent = 'שומר...'; msg.className = 'fmsg';

    let action, data;
    if (key === 'inspection') {
      const row = []; for (let i = 0; i < 79; i++) row.push('');
      Object.keys(v).forEach((k) => { const mm = k.match(/^c(\d+)$/); if (mm) row[+mm[1]] = Array.isArray(v[k]) ? v[k].join(', ') : v[k]; });
      action = 'addInspection';
      data = { mikveh: m.name, date: v.date, rabbi: v.rabbi, contact: v.contact, phone: v.phone, row };
      // הדוח כפי שיוצג מיד בכרטיס (אותו מבנה כמו מה-API)
      let urgent = 0, needed = 0;
      const sections = INSPECTION.map((sec, i) => ({ key: SECTION_KEYS[i], title: sec.title, fields: sec.fields.filter((f) => v['c' + f.c] && (!Array.isArray(v['c' + f.c]) || v['c' + f.c].length)).map((f) => { const val = Array.isArray(v['c' + f.c]) ? v['c' + f.c].join(', ') : v['c' + f.c]; if (/דחוף/.test(val)) urgent++; else if (/טעון|דרוש/.test(val)) needed++; return [f.l, val]; }) }));
      data._local = { sections, urgent, needed, guidance: v.c74 || '', contact: v.contact, phone: v.phone, address: m.address || null, council: m.council || null, lastReplaced: {}, repairs: {} };
    } else {
      action = 'addAction';
      data = Object.assign({}, v, { mikveh: m.name, action: def.action });
      delete data._act;
      if (actKey === 'repair' && v.treated && v.treated.length) data.note = 'טופל: ' + v.treated.join(', ') + (v.note ? ' — ' + v.note : '');
    }
    const local = data._local; delete data._local;
    data._local = undefined;
    MK.DataSource.post(action, data).then((res) => {
      data._local = local;
      msg.textContent = 'נשמר בתיק המקווה ✓'; msg.className = 'fmsg ok';
      const pics = root._pics ? root._pics.get() : [];
      if (res.queued) { msg.textContent = 'אין חיבור כרגע – נשמר במכשיר ויישלח אוטומטית ✓'; if (pics.length) MK.toast('התמונות יצורפו רק בדיווח עם חיבור'); }
      if (action === 'addInspection' && res.record) { const rec = Object.assign({ hebDate: MK.hebOf(res.record.ts) }, data._local, res.record); MK.S.data.inspections.push(rec); MK.buildIndexes(); }
      if (pics.length && res.record && !res.queued && window.MikvehMedia) {
        MikvehMedia.upload(pics, { mikveh: m.name, context: action === 'addInspection' ? 'inspection' : 'action', refId: res.record.ts })
          .then(() => { MK.toast('התמונות הועלו'); MK.route(); }).catch((err) => MK.toast('התמונות לא הועלו: ' + err.message));
      }
      if (action === 'addAction' && res.record) MK.addAction(res.record);
      MK.toast((res.queued ? 'נשמר במכשיר – ' : 'נרשם בתיק ') + m.name + ': ' + (key === 'inspection' ? 'דו"ח פיקוח' : def.action));
      if (window.MikvehWork) MikvehWork.afterReport(m.id);
      setTimeout(() => { MK.closeReport(); location.hash = '#/m/' + encodeURIComponent(m.id) + (key === 'inspection' ? '/inspections' : '/history'); MK.route(); }, 900);
    }).catch((err) => {
      btn.disabled = false; msg.textContent = 'לא נשמר: ' + err.message; msg.className = 'fmsg bad';
    });
  }

  window.MikvehForms = {
    open: function (key, m) {
      if (!window.MK.requireUser()) return;
      const k = key === 'inspection' ? 'inspection' : 'action';
      openForm(k === 'action' ? 'otzar' : k, Object.assign({}, m));
    },
    keys: Object.keys(ACTION_FORMS),
  };
})();
