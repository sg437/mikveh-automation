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

  // ---------- טפסי פעולה (לשונית "אוצר זריעה") ----------
  const F = {
    date: { k: 'date', t: 'date', l: 'תאריך ביצוע' },
    rabbi: { k: 'rabbi', t: 'text', l: 'שם הרב / המבצע' },
    note: { k: 'note', t: 'textarea', l: 'הערה' },
  };
  const ACTION_FORMS = {
    reservoir: { title: 'ריקון מאגר', action: 'ריקון מאגר', fields: [F.date, F.rabbi,
      { k: 'roofDone', t: 'checks', l: 'מה בוצע', opts: ['ניקוי הגג', 'ריקון המאגר', 'ניקוי המאגר', 'ייבוש המאגר'], def: ['ניקוי הגג', 'ריקון המאגר', 'ניקוי המאגר', 'ייבוש המאגר'] },
      { k: 'roofSealed', t: 'radio', l: 'איטום הגג', opts: STATUS }, { k: 'reservoirSealed', t: 'radio', l: 'איטום המאגר', opts: STATUS },
      { k: 'note2', t: 'textarea', l: 'הערה' }] },
    otzar: { title: 'החלפת אוצר', action: 'החלפת אוצר', fields: [F.date, F.rabbi,
      { k: 'otzar', t: 'radio', l: 'איזה אוצר', opts: ['זריעה', 'השקה', "חב''ד", 'כלים'], req: true },
      { k: 'drained', t: 'checks', l: 'פעולות לריקון האוצר', opts: ['ריקון האוצר', 'ניקוי האוצר', 'ייבוש המשכה', 'ייבוש האוצר'], def: ['ריקון האוצר', 'ניקוי האוצר', 'ייבוש המשכה', 'ייבוש האוצר'] },
      { k: 'sealed', t: 'radio', l: 'איטום האוצר', opts: STATUS },
      { k: 'filled', t: 'radio', l: 'מילוי האוצר', opts: ['מילוי תקין', 'נשאר פתוח לחסדי הבורא', 'טעון מילוי חוזר'] },
      { k: 'liters', t: 'number', l: 'כמות מים בליטר' }, F.note] },
    cert: { title: 'חידוש תעודה', action: 'חידוש תעודה', fields: [F.date, F.rabbi,
      { k: 'validMonth', t: 'hebmonth', l: 'תוקף עד – חודש', req: true }, { k: 'validYear', t: 'hebyear', l: 'שנה', req: true },
      { k: 'liters', t: 'number', l: 'כמות מים בליטר מתחת יציאת המים' }, F.note] },
    fillOk: { title: 'אישור מילוי אוצר (בפקק פתוח)', action: 'אישור מילוי אוצר (רק בפקק פתוח)', fields: [F.date, F.rabbi,
      { k: 'otzar', t: 'radio', l: 'איזה אוצר', opts: ['זריעה', 'השקה', "חב''ד"], req: true },
      { k: 'filled', t: 'radio', l: 'מילוי האוצר', opts: ['מילוי תקין', 'טעון מילוי חוזר'] }, F.note] },
    plug: { title: 'פקק על הגג', action: 'פקק על הגג', fields: [F.date, F.rabbi, F.note] },
    visit: { title: 'ביקור כשרות', action: 'ביקור כשרות', fields: [F.date, F.rabbi, { k: 'attendant', t: 'text', l: 'שם אחראי / בלנית' }, { k: 'phone', t: 'text', l: 'טלפון' }, F.note] },
    repair: { title: 'טיפול / תיקון כשרות', action: 'תיקון כשרות', fields: [F.date, F.rabbi,
      { k: 'treated', t: 'checks', l: 'מה טופל', opts: ['בור טבילה', 'אוצר זריעה', 'אוצר השקה', "אוצר חב''ד", 'מאגר', 'מקוה כלים', 'גג'] },
      { k: 'note', t: 'textarea', l: 'תיקוני כשרות – נא לפרט', req: true }] },
  };

  // ---------- דו"ח פיקוח מלא (לשונית "פיקוח הלכתי", 79 עמודות כמו טופס Google) ----------
  const S3 = (c, l) => ({ c, l, t: 'status' });
  const INSPECTION = [
    { title: 'גג', fields: [S3(5, 'איטום הגג'), S3(6, 'מתקנים / כלים על הגג'), S3(7, 'נקיון הגג'), S3(8, 'גיזום עצים'), S3(9, 'שיפועי הגג'), S3(10, 'חור הניקוז וסוג צינור'), { c: 11, l: 'הערות', t: 'textarea' }] },
    { title: 'מאגר', fields: [{ c: 12, l: 'מאגר', t: 'radio', opts: YES_NO }, S3(13, 'כיסוי מאגר'), S3(14, 'ניקיון מי המאגר'), S3(15, 'יציאת המים ופקקים'), S3(16, 'איטום המאגר'),
      { c: 17, l: 'מצב המאגר', t: 'radio', opts: ['מלא', 'חצי מלא', 'חסר', 'ריק'] }, { c: 18, l: 'ריקון מאגר', t: 'radio', opts: REPLACE }, { c: 19, l: 'תיאור / הערה', t: 'textarea' }] },
    { title: 'אוצר זריעה', fields: [{ c: 20, l: 'אוצר זריעה', t: 'radio', opts: YES_NO }, S3(21, 'כניסת מי גשמים'), S3(22, 'המשכה'), S3(23, 'כניסת מים שאובים'), S3(24, 'המשכה בפועל'), S3(25, 'ניקיון האוצר'), S3(26, 'צינור חזו"א'), S3(27, 'איטום אוצר / זחילה'),
      { c: 28, l: 'טעון החלפה', t: 'radio', opts: REPLACE }, { c: 29, l: 'תיאור / הערה', t: 'textarea' }] },
    { title: 'אוצר השקה', fields: [{ c: 30, l: 'אוצר השקה בנפרד', t: 'radio', opts: YES_NO }, { c: 31, l: 'סוג השקה', t: 'radio', opts: ['רגיל', "רגיל וחב''ד", 'בעג"ב בצד', "חב''ד"] },
      S3(32, 'כניסת מי גשמים'), S3(33, 'המשכה'), S3(34, 'ניקיון'), S3(35, 'איטום אוצר / זחילה'), { c: 36, l: 'טעון החלפה', t: 'radio', opts: REPLACE }, { c: 37, l: 'תיאור / הערה', t: 'textarea' }] },
    { title: 'בור טבילה', fields: [S3(38, 'סימון גובה מים'), S3(39, 'גובה המים'), S3(40, 'נקיון המים'), S3(41, 'זחילה'), S3(42, 'נקב השקה גודל ונקיון'), S3(43, 'נקב זריעה מקום'), S3(44, 'ברז מילוי'), S3(45, 'ברז אויר למשאבה'), S3(46, 'אל חזור למשאבה'),
      { c: 47, l: "קיבוע מערכות (מעקה, חימום וכדו')", t: 'radio', opts: ['מעל גובה המים', 'מתחת גובה המים'] }, { c: 48, l: 'פילטר', t: 'radio', opts: ['יש', 'אין', 'יש ללא מילוי תנאים'] },
      { c: 49, l: 'סוג משאבה', t: 'radio', opts: ['וואקום', 'חשמלי', 'חשמלי ולא תקין'] }, { c: 50, l: 'תיאור / הערה', t: 'textarea' }] },
    { title: 'טכני ומבנה', fields: [{ c: 51, l: 'מיקום האוצרות', t: 'radio', opts: ['פנימי', 'חיצוני', 'פנימי, חיצוני'] }, { c: 52, l: 'כמות חדרים', t: 'number' }, { c: 53, l: 'מצב המבנה (1 גרוע – 5 מצוין)', t: 'radio', opts: ['1', '2', '3', '4', '5'] },
      S3(54, 'רטיבות בחדר טבילה'), S3(55, 'רטיבות בחדרים'), S3(56, 'תאורה מעל בור הטבילה'), { c: 57, l: 'תאורת חירום', t: 'radio', opts: ['תקין', 'אין', 'טעון תיקון'] }, { c: 58, l: 'מקוה כלים', t: 'radio', opts: ['תקין', 'אין', 'טעון תיקון'] },
      { c: 59, l: 'תיאור / הערה', t: 'textarea' }, { c: 60, l: 'מפתח מסטר', t: 'radio', opts: YES_NO }, { c: 61, l: 'איזה מפתח', t: 'text' }, { c: 62, l: 'תוקף תעודה (כפי שתלויה במקווה)', t: 'text' },
      { c: 63, l: 'שקע ליד האוצרות', t: 'radio', opts: YES_NO }, { c: 64, l: 'ברז מים לצינור', t: 'radio', opts: YES_NO }, { c: 65, l: 'כניסה למאגר', t: 'radio', opts: ['גדול', 'סביר', 'צר'] }, { c: 66, l: 'כניסה לאוצרות', t: 'radio', opts: ['גדול', 'סביר', 'צר'] }] },
    { title: "אוצר השקה חב''ד (אם יש)", fields: [S3(67, 'כניסת מי גשמים'), S3(68, 'ניקיון וגודל נקב'), S3(69, 'ניקיון'), S3(70, 'איטום אוצר / זחילה'), S3(71, 'המשכה'), { c: 72, l: 'טעון החלפה', t: 'radio', opts: REPLACE }, { c: 73, l: 'תיאור / הערה', t: 'textarea' }] },
    { title: 'סיכום', fields: [{ c: 74, l: 'הנחיות מיוחדות לבלנית / אחראי', t: 'textarea' }, { c: 76, l: 'אוצר השקה נוסף', t: 'text' }, { c: 77, l: 'כניסת מי גשמים לבור טבילה', t: 'text' }] },
  ];

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
    let html = '<div class="rm-chosen"><div><div class="l">' + (key === 'inspection' ? 'דו"ח פיקוח' : esc(ACTION_FORMS[key].title)) + '</div><div class="v">' + esc(m.name) + '</div><div class="s">' + esc([m.council, m.region].filter(Boolean).join(' · ')) + '</div></div><button class="btn small" id="rmBack" type="button">חזרה</button></div>';
    html += '<form id="rmForm" class="rform" novalidate>';
    if (key === 'inspection') {
      html += '<div class="fgrid">' + fieldHtml(F.date, 'date') + fieldHtml({ k: 'rabbi', t: 'text', l: 'שם הרב המפקח' }, 'rabbi', user.name) + fieldHtml({ k: 'contact', t: 'text', l: 'שם אחראי / בלנית' }, 'contact', m.attendant || '') + fieldHtml({ k: 'phone', t: 'text', l: 'טלפון' }, 'phone', m.phone || '') + '</div>';
      html += INSPECTION.map((sec, i) => '<details class="fsec"' + (i === 0 ? ' open' : '') + '><summary>' + esc(sec.title) + '<span class="cnt"></span></summary><div class="fgrid">' + sec.fields.map((f) => fieldHtml(f, 'c' + f.c)).join('') + '</div></details>').join('');
      html += '<div class="note-box" style="margin-top:8px">שדות שלא סומנו יישארו ריקים בדוח, כמו בטופס המקורי. ניתן לסמן מהר: כל השדות בסעיף "תקין" <button type="button" class="btn small" id="allOk">סמן הכל תקין</button></div>';
    } else {
      const def = ACTION_FORMS[key];
      html += '<div class="fgrid">' + def.fields.map((f) => fieldHtml(f, f.k, f.k === 'rabbi' ? user.name : (f.k === 'otzar' && m._presetOtzar ? m._presetOtzar : undefined))).join('') + '</div>';
    }
    html += '<div class="factions"><button class="btn primary" type="submit" id="rmSubmit">שמירה בתיק המקווה</button><span class="fmsg" id="rmMsg"></span></div></form>';
    root.innerHTML = html;

    root.querySelector('#rmBack').addEventListener('click', () => { root.hidden = true; MK.$('#rmStep2').hidden = false; });
    root.querySelectorAll('input[type=date]').forEach((inp) => inp.addEventListener('input', () => { const s = root.querySelector('[data-heb-for="' + inp.id + '"]'); if (s) s.textContent = hebOfDateInput(inp.value); }));
    const allOk = root.querySelector('#allOk');
    if (allOk) allOk.addEventListener('click', () => { root.querySelectorAll('.ff.st').forEach((ff) => { const r = ff.querySelector('input[value="תקין"]'); if (r && !ff.querySelector('input:checked')) r.checked = true; }); });
    if (key === 'cert') {
      // ברירת מחדל: אותו חודש עברי בשנה הבאה
      const h = HebDate.addYears(HebDate.fromDate(new Date()), 1);
      root.querySelector('[name=validMonth]').value = HebDate.monthName(h.year, h.month);
      root.querySelector('[name=validYear]').value = HebDate.yearLabel(h.year).replace("''", '"');
    }
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
    const def = key === 'inspection' ? null : ACTION_FORMS[key];
    const missing = def ? def.fields.filter((f) => f.req && !(Array.isArray(v[f.k]) ? v[f.k].length : v[f.k])).map((f) => f.l) : [];
    if (missing.length) { msg.textContent = 'חסר: ' + missing.join(', '); msg.className = 'fmsg bad'; return; }
    btn.disabled = true; msg.textContent = 'שומר...'; msg.className = 'fmsg';

    let action, data;
    if (key === 'inspection') {
      const row = []; for (let i = 0; i < 79; i++) row.push('');
      Object.keys(v).forEach((k) => { const mm = k.match(/^c(\d+)$/); if (mm) row[+mm[1]] = v[k]; });
      action = 'addInspection';
      data = { mikveh: m.name, date: v.date, rabbi: v.rabbi, contact: v.contact, phone: v.phone, row };
    } else {
      action = 'addAction';
      data = Object.assign({}, v, { mikveh: m.name, action: def.action });
      if (key === 'repair' && v.treated && v.treated.length) data.note = 'טופל: ' + v.treated.join(', ') + (v.note ? ' — ' + v.note : '');
    }
    MK.DataSource.post(action, data).then((res) => {
      msg.textContent = 'נשמר בתיק המקווה ✓'; msg.className = 'fmsg ok';
      if (action === 'addAction' && res.record) MK.addAction(res.record);
      if (action === 'addInspection' && res.record) MK.toast('דו"ח הפיקוח נשמר. הדוח המלא יופיע בכרטיס לאחר רענון הנתונים.');
      MK.toast('נרשם בתיק ' + m.name + ': ' + (key === 'inspection' ? 'דו"ח פיקוח' : def.action));
      if (window.MikvehWork) MikvehWork.afterReport(m.id);
      setTimeout(() => { MK.closeReport(); location.hash = '#/m/' + encodeURIComponent(m.id) + (key === 'inspection' ? '/inspections' : '/history'); MK.route(); }, 900);
    }).catch((err) => {
      btn.disabled = false; msg.textContent = 'לא נשמר: ' + err.message; msg.className = 'fmsg bad';
    });
  }

  window.MikvehForms = {
    open: function (key, m) {
      if (!window.MK.requireUser()) return;
      const preset = { zeria: 'זריעה', hashaka: 'השקה' }[key];
      const k = preset ? 'otzar' : key;
      if (!ACTION_FORMS[k] && k !== 'inspection') return;
      openForm(k, Object.assign({}, m, { _presetOtzar: preset }));
    },
    keys: Object.keys(ACTION_FORMS),
  };
})();
