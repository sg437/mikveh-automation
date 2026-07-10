/************************************************************************
 * דוח שבועי מרוכז בוואטסאפ — נשלח אוטומטית בכל יום ראשון בבוקר.
 * מסכם את יומן הדיווחים: סה"כ, מזוהים, דרוש בירור, פירוט לפי מפקח
 * (מי ביקר באילו מקוואות), פירוט לפי מקווה, ושגיאות מהשבוע האחרון.
 ************************************************************************/

const WEEKLY = {
  DAYS_BACK: 7,      // כמה ימים אחורה
  TOP_MIKVAOT: 10,   // כמה מקוואות לפרט בסיכום הכללי
};

function weeklyReport() {
  const since = new Date(Date.now() - WEEKLY.DAYS_BACK * 86400000);
  const sheet = getSheet_(CONFIG.REPORT_SHEET);
  const last = sheet.getLastRow();

  let total = 0, identified = 0, cityOnly = 0, needsCheck = 0,
      unknown = 0, notReport = 0;
  const perMikveh = {};
  const perPerson = {}; // { שם מפקח: { יעד: מספר ביקורים } }

  if (last >= 2) {
    const values = sheet.getRange(2, 1, last - 1, RCOLS.ID_STATUS).getValues();
    values.forEach(function (v) {
      const t = parseStamp_(v[RCOLS.STAMP - 1]);
      if (!t || t < since) return;

      const status = String(v[RCOLS.ID_STATUS - 1] || '');
      if (status === 'לא דיווח') { notReport++; return; }

      total++;

      // שם המפקח (ואם חסר — לפי הטלפון)
      const person = String(v[RCOLS.SENDER - 1] || '').trim() ||
        String(v[RCOLS.PHONE - 1] || 'לא ידוע');

      // היעד: מקווה מזוהה, או יישוב, או "לא זוהה"
      const mikveh = String(v[RCOLS.MIKVEH - 1] || '').trim();
      const settlement = String(v[RCOLS.SETTLEMENT - 1] || '').trim();
      let target;

      if (status === 'מזוהה' && mikveh) {
        identified++;
        target = mikveh;
        perMikveh[mikveh] = (perMikveh[mikveh] || 0) + 1;
      } else if (status.indexOf('דרוש בירור') !== -1) {
        needsCheck++;
        target = (settlement || 'עיר') + ' (דרוש בירור)';
      } else if (status === 'יישוב בלבד') {
        cityOnly++;
        target = settlement || 'יישוב';
      } else {
        unknown++;
        target = 'לא זוהה';
      }

      if (!perPerson[person]) perPerson[person] = {};
      perPerson[person][target] = (perPerson[person][target] || 0) + 1;
    });
  }

  // שגיאות מערכת מהשבוע האחרון
  let errors = 0;
  const errSheet = getSheet_(CONFIG.ERROR_SHEET);
  const errLast = errSheet.getLastRow();
  if (errLast >= 2) {
    errSheet.getRange(2, 1, errLast - 1, 1).getValues().forEach(function (v) {
      const t = parseStamp_(v[0]);
      if (t && t >= since) errors++;
    });
  }

  // ---------- בניית ההודעה ----------
  let msg = '📊 *דוח שבועי — כשרות המקוואות*\n';
  msg += Utilities.formatDate(since, CONFIG.TIMEZONE, 'dd/MM') + ' עד ' +
    Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy') + '\n\n';
  msg += 'סה"כ דיווחים: ' + total + '\n';
  msg += '✅ מזוהים: ' + identified + '\n';
  if (needsCheck) msg += '⚠️ דרוש בירור (עיר מרובת מקוואות): ' + needsCheck + '\n';
  if (cityOnly) msg += '🏙 יישוב בלבד: ' + cityOnly + '\n';
  if (unknown) msg += '❓ לא זוהו: ' + unknown + '\n';
  if (notReport) msg += '💬 הודעות שאינן דיווח: ' + notReport + '\n';
  if (errors) msg += '🚨 שגיאות מערכת: ' + errors + '\n';

  // פירוט לפי מפקח — מי ביקר איפה
  const people = Object.keys(perPerson).sort();
  if (people.length) {
    msg += '\n*פירוט לפי מפקח:*\n';
    people.forEach(function (p) {
      msg += '\n👤 *' + p + '*\n';
      const targets = Object.keys(perPerson[p]).sort(function (a, b) {
        return perPerson[p][b] - perPerson[p][a];
      });
      targets.forEach(function (tg) {
        const n = perPerson[p][tg];
        msg += '   • ' + tg + (n > 1 ? ' — ' + n + ' דיווחים' : '') + '\n';
      });
    });
  }

  // סיכום כללי לפי מקווה
  const names = Object.keys(perMikveh).sort(function (a, b) {
    return perMikveh[b] - perMikveh[a];
  });
  if (names.length) {
    msg += '\n*סיכום לפי מקווה:*\n';
    names.slice(0, WEEKLY.TOP_MIKVAOT).forEach(function (n) {
      msg += '• ' + n + ': ' + perMikveh[n] + '\n';
    });
    if (names.length > WEEKLY.TOP_MIKVAOT) {
      msg += '• ...ועוד ' + (names.length - WEEKLY.TOP_MIKVAOT) + ' מקוואות\n';
    }
  }

  if (!total && !errors) msg += '\nשבוע שקט — אין דיווחים חדשים.';

  sendWhatsApp_(msg);
}

/** ★ מריצים פעם אחת ★ דוח בכל יום ראשון בסביבות 08:00 */
function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(8)
    .create();
  Logger.log('✅ הדוח השבועי יישלח בכל יום ראשון בסביבות 08:00.');
}

/** ★ בדיקה ידנית ★ שולח את הדוח עכשיו */
function testWeeklyReport() {
  weeklyReport();
  Logger.log('הדוח נשלח לוואטסאפ.');
}