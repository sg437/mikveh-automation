/**
 * המרת תאריכים לועזיים לעבריים, בפורמט של המערכת ("כט אדר פ''ו", "אלול תש''פ").
 * אלגוריתם לוח עברי סטנדרטי (Calendrical Calculations). ללא תלות חיצונית.
 */
(function (global) {
  'use strict';

  var HEB_EPOCH = -1373427; // R.D. של א' תשרי שנה 1 (במונחי ימי R.D.)

  function gregorianToRD(y, m, d) {
    // Rata Die של תאריך לועזי
    var a = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    var jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
    return jdn - 1721425; // JDN -> R.D.
  }

  function isLeapYear(y) { return ((7 * y + 1) % 19) < 7; }

  function elapsedDays(y) {
    var months = Math.floor((235 * y - 234) / 19);
    var parts = 12084 + 13753 * months;
    var day = months * 29 + Math.floor(parts / 25920);
    if ((3 * (day + 1)) % 7 < 3) day += 1;
    return day;
  }

  function yearDelay(y) {
    var d1 = elapsedDays(y + 1) - elapsedDays(y);
    var d2 = elapsedDays(y + 2) - elapsedDays(y + 1);
    if (d2 === 356) return 2;
    if (d1 === 382) return 1;
    return 0;
  }

  function newYear(y) { return HEB_EPOCH + elapsedDays(y) + yearDelay(y); }
  function daysInYear(y) { return newYear(y + 1) - newYear(y); }
  function monthsInYear(y) { return isLeapYear(y) ? 13 : 12; }

  function daysInMonth(y, m) {
    // חודשים ממוספרים מניסן=1 ... אדר=12, אדר ב'=13 (בשנה מעוברת אדר א'=12, אדר ב'=13)
    if (m === 2 || m === 4 || m === 6 || m === 10 || m === 13) return 29;
    if (m === 12 && !isLeapYear(y)) return 29;
    var len = daysInYear(y);
    if (m === 8 && !(len % 10 === 5)) return 29; // חשון חסר אלא אם שנה שלמה
    if (m === 9 && len % 10 === 3) return 29;    // כסלו חסר בשנה חסרה
    return 30;
  }

  function toRD(y, m, d) {
    var rd = newYear(y) + d - 1;
    var mm;
    if (m < 7) {
      for (mm = 7; mm <= monthsInYear(y); mm++) rd += daysInMonth(y, mm);
      for (mm = 1; mm < m; mm++) rd += daysInMonth(y, mm);
    } else {
      for (mm = 7; mm < m; mm++) rd += daysInMonth(y, mm);
    }
    return rd;
  }

  function fromRD(rd) {
    var approx = Math.floor((rd - HEB_EPOCH) / (35975351 / 98496)) + 1;
    var y = approx - 1;
    while (newYear(y + 1) <= rd) y++;
    var start = (rd < toRD(y, 1, 1)) ? 7 : 1;
    var m = start;
    while (rd > toRD(y, m, daysInMonth(y, m))) m++;
    var d = rd - toRD(y, m, 1) + 1;
    return { year: y, month: m, day: d };
  }

  var MONTH_NAMES = {
    1: 'ניסן', 2: 'אייר', 3: 'סיון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
    7: 'תשרי', 8: 'חשון', 9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר', 13: 'אדר ב'
  };

  function monthName(y, m) {
    if (isLeapYear(y) && m === 12) return 'אדר א';
    return MONTH_NAMES[m];
  }

  var ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  var TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  var HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

  // מספר -> אותיות, ללא גרשיים (למשל 15 -> טו, 29 -> כט, 87 -> פז, 780 -> תשפ)
  function letters(n) {
    var s = '';
    while (n >= 400) { s += 'ת'; n -= 400; }
    s += HUNDREDS[Math.floor(n / 100)];
    n %= 100;
    if (n === 15) return s + 'טו';
    if (n === 16) return s + 'טז';
    s += TENS[Math.floor(n / 10)];
    s += ONES[n % 10];
    return s;
  }

  // שנה בפורמט המערכת: פ''ו (ללא אלפים ומאות כשהשנה >= 5780 -> "פ''ו"), תש''פ ל-5780, ע''ט ל-5779
  function yearLabel(y) {
    var short = y % 100;                       // 5786 -> 86
    if (y === 5780) return "תש''פ";
    var l = letters(short);
    if (l.length === 1) return l + "'";        // לא צפוי בפועל
    return l.slice(0, -1) + "''" + l.slice(-1);
  }

  function dayLabel(d) { return letters(d); }

  function fromDate(date) {
    var rd = gregorianToRD(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return fromRD(rd);
  }

  // "כט אדר פ''ו"
  function format(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    var h = fromDate(date);
    return dayLabel(h.day) + ' ' + monthName(h.year, h.month) + ' ' + yearLabel(h.year);
  }

  // "אדר פ''ו"
  function formatMonth(date) {
    var h = fromDate(date);
    return monthName(h.year, h.month) + ' ' + yearLabel(h.year);
  }

  // ---- פענוח תוקף תעודה "אדר פ''ז" / 'אלול תש"פ' -> {year, month} להשוואה ----
  var MONTH_LOOKUP = {
    'תשרי': 7, 'חשון': 8, 'חשוון': 8, 'מרחשון': 8, 'כסלו': 9, 'כסליו': 9, 'טבת': 10, 'שבט': 11,
    'אדר': 12, 'אדר א': 12, "אדר א'": 12, 'אדר ב': 13, "אדר ב'": 13,
    'ניסן': 1, 'אייר': 2, 'סיון': 3, 'סיוון': 3, 'תמוז': 4, 'אב': 5, 'אלול': 6
  };

  function lettersToNumber(s) {
    var map = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ל': 30, 'מ': 40, 'נ': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'צ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400, 'ך': 20, 'ם': 40, 'ן': 50, 'ף': 80, 'ץ': 90 };
    var n = 0;
    for (var i = 0; i < s.length; i++) n += map[s[i]] || 0;
    return n;
  }

  function parseYear(tok) {
    var s = tok.replace(/["'׳״]/g, '');
    if (!s) return null;
    var n = lettersToNumber(s);
    if (n === 0) return null;
    if (s[0] === 'ה' && n >= 700) n -= 5;     // ה'תשפ"ו
    if (n < 100) n += 700;                     // פ"ו -> 786
    return 5000 + n;
  }

  /** מחזיר {year, month, day|null} או null. מקבל "כט אדר פ''ו", "אדר פ''ז", 'סיון ע"ח'. */
  function parse(str) {
    if (!str) return null;
    var toks = String(str).replace(/\s+/g, ' ').trim().split(' ');
    if (toks.length < 2) return null;
    var yearTok = toks[toks.length - 1];
    var year = parseYear(yearTok);
    if (!year) return null;
    var rest = toks.slice(0, -1);
    var month = null, day = null;
    // חודש יכול להיות שתי מילים (אדר א / אדר ב)
    for (var take = Math.min(2, rest.length); take >= 1; take--) {
      var cand = rest.slice(rest.length - take).join(' ').replace(/["'׳״]/g, '');
      if (MONTH_LOOKUP[cand] !== undefined) {
        month = MONTH_LOOKUP[cand];
        rest = rest.slice(0, rest.length - take);
        break;
      }
    }
    if (month === null) return null;
    if (rest.length) {
      day = lettersToNumber(rest[rest.length - 1].replace(/["'׳״]/g, ''));
      if (!day || day > 30) day = null;
    }
    if (!isLeapYear(year) && month === 13) month = 12;
    return { year: year, month: month, day: day };
  }

  /** מפתח מיון/השוואה: שנה*100 + סדר החודש מתשרי */
  function ordinal(h) {
    if (!h) return null;
    var order = h.month >= 7 ? h.month - 7 : h.month + 6; // תשרי=0 ... אדר=11/12
    if (h.month === 13) order = 6;
    return h.year * 100 + order;
  }

  function toGregorian(h) {
    var rd = toRD(h.year, h.month, h.day || 1);
    var jdn = rd + 1721425;
    var a = jdn + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4);
    var d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
    return new Date(100 * b + d - 4800 + Math.floor(m / 10), (m + 3 - 12 * Math.floor(m / 10)) - 1, e - Math.floor((153 * m + 2) / 5) + 1);
  }

  /** החודש העברי הבא (יום א' בו). השנה מתחלפת בתשרי. */
  function nextMonth(h) {
    var y = h.year, m = h.month;
    if (m === 6) return { year: y + 1, month: 7, day: 1 };
    if (m === 12) return isLeapYear(y) ? { year: y, month: 13, day: 1 } : { year: y, month: 1, day: 1 };
    if (m === 13) return { year: y, month: 1, day: 1 };
    return { year: y, month: m + 1, day: 1 };
  }
  /** תחילת וסוף חודש עברי כתאריכים לועזיים: {start, end} (end = יום א' של החודש הבא) */
  function monthRange(h) {
    return { start: toGregorian({ year: h.year, month: h.month, day: 1 }), end: toGregorian(nextMonth(h)) };
  }
  /** אותו תאריך עברי בשנה הבאה (לתוקף תעודה). אדר ב' בשנה לא מעוברת -> אדר. */
  function addYears(h, n) {
    var y = h.year + n, m = h.month;
    if (m === 13 && !isLeapYear(y)) m = 12;
    return { year: y, month: m, day: h.day || 1 };
  }

  global.HebDate = {
    fromDate: fromDate, format: format, formatMonth: formatMonth, parse: parse,
    ordinal: ordinal, toGregorian: toGregorian, isLeapYear: isLeapYear, monthName: monthName, yearLabel: yearLabel,
    nextMonth: nextMonth, monthRange: monthRange, addYears: addYears
  };
})(typeof window !== 'undefined' ? window : globalThis);
