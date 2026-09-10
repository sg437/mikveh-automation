/************************************************************************
 * תזכורות תעודות (Reminders.gs)
 * ========================================================
 * שולח בוואטסאפ (לאותו chatId של ההתראות, ALERT_CHAT_ID) רשימה של מקוואות
 * בפיקוח שהתעודה שלהם פגה או עומדת לפוג בימים הקרובים, כדי לתכנן חידושים.
 *
 * הגדרות (Script Properties):
 *   REMINDER_DAYS — כמה ימים מראש (ברירת מחדל 45)
 * להתקנת טריגר שבועי (יום ראשון בבוקר): להריץ פעם אחת installReminderTrigger.
 ************************************************************************/

const REMINDERS = {
  DAYS_PROP: 'REMINDER_DAYS',
  DEFAULT_DAYS: 45,
  MAX_LIST: 40, // כמה מקוואות לפרט בכל קבוצה בהודעה
};

/** מחשב את רשימות התעודות: {expired, soon, days}. */
function certificateStatus_() {
  const days = parseInt(getProp_(REMINDERS.DAYS_PROP) || REMINDERS.DEFAULT_DAYS, 10);
  const id = getProp_(API.SHEET_ID_PROP);
  if (!id) throw new Error('חסר MIKVAOT_SHEET_ID');
  const ss = SpreadsheetApp.openById(id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today.getTime() + days * 86400000);

  const expired = [], soon = [];
  apiMikvaot_(ss).forEach(function (m) {
    if (String(m.supervised || '').trim() !== 'כן') return;
    const h = HebDate.parse(m.certificate || '');
    if (!h) return;
    const r = HebDate.monthRange(h); // התעודה בתוקף עד סוף החודש העברי
    if (r.end <= today) expired.push({ m: m, when: r.end });
    else if (r.start <= limit) soon.push({ m: m, when: r.start });
  });
  expired.sort(function (a, b) { return a.when - b.when; });
  soon.sort(function (a, b) { return a.when - b.when; });
  return { expired: expired, soon: soon, days: days };
}

/** הפונקציה שהטריגר מריץ. */
function certificateReminder() {
  const st = certificateStatus_();
  if (!st.expired.length && !st.soon.length) return;

  const line = function (x) {
    return '• ' + x.m.name + (x.m.council ? ' (' + x.m.council + ')' : '') + ' — ' + x.m.certificate;
  };
  const lines = ['📜 *תזכורת תעודות כשרות* — ' + HebDate.format(new Date()), ''];
  if (st.soon.length) {
    lines.push('⏳ *פגות ב-' + st.days + ' הימים הקרובים (' + st.soon.length + '):*');
    st.soon.slice(0, REMINDERS.MAX_LIST).forEach(function (x) { lines.push(line(x)); });
    if (st.soon.length > REMINDERS.MAX_LIST) lines.push('...ועוד ' + (st.soon.length - REMINDERS.MAX_LIST));
    lines.push('');
  }
  if (st.expired.length) {
    lines.push('❌ *פג תוקפן (' + st.expired.length + '):*');
    st.expired.slice(0, REMINDERS.MAX_LIST).forEach(function (x) { lines.push(line(x)); });
    if (st.expired.length > REMINDERS.MAX_LIST) lines.push('...ועוד ' + (st.expired.length - REMINDERS.MAX_LIST));
  }
  lines.push('', 'הרשימה המלאה: באפליקציה ➜ תכנון עבודה ➜ תעודות לחידוש');
  sendWhatsApp_(lines.join('\n'));
}

/** ★ להריץ פעם אחת ★ מתקין טריגר שבועי, יום ראשון 08:00. */
function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'certificateReminder') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('certificateReminder')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(8)
    .inTimezone(CONFIG.TIMEZONE).create();
  Logger.log('✅ טריגר תזכורת תעודות הותקן (יום ראשון 08:00)');
}

/** בדיקה מעורך הסקריפט: מדפיס את הרשימות בלי לשלוח. */
function testCertificateReminder() {
  const st = certificateStatus_();
  Logger.log('פגות בקרוב: ' + st.soon.length + ' | פג תוקף: ' + st.expired.length);
  Logger.log(st.soon.slice(0, 5).map(function (x) { return x.m.name + ' ' + x.m.certificate; }).join(' | '));
}
