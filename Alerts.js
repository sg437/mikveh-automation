/************************************************************************
 * מערכת כשרות המקוואות V2 — שלב 4א: התראות שגיאה בוואטסאפ
 * ========================================================
 * קובץ עצמאי (Alerts.gs) — נוסף לצד Code.gs ולא משנה בו כלום.
 *
 * העיקרון: "שומר" שרץ כל 5 דקות, בודק אם נוספו שורות חדשות
 * בלשונית "שגיאות", ואם כן — שולח סיכום בוואטסאפ דרך Green API.
 * כולל מצערת (Throttle): מקסימום התראה אחת ל-10 דקות, כדי שגל
 * שגיאות לא יציף את הטלפון.
 *
 * דרישות (Script Properties):
 *   GREEN_ID_INSTANCE — מספר האינסטנס מ-console.green-api.com
 *   GREEN_API_TOKEN   — ה-API Token של האינסטנס
 *   ALERT_CHAT_ID     — למי לשלוח, בפורמט 9725XXXXXXXX@c.us
 ************************************************************************/

const ALERTS = {
  THROTTLE_MIN: 10,      // מרווח מינימלי בין התראות
  MAX_ERRORS_IN_MSG: 3,  // כמה שגיאות לפרט בהודעה אחת
};

/**
 * הפונקציה שהטריגר מריץ כל 5 דקות.
 * משווה את מספר השורות בלשונית "שגיאות" לסמן השמור,
 * ואם נוספו שורות — שולחת התראה.
 */
function checkErrors() {
  const sheet = getSheet_(CONFIG.ERROR_SHEET);
  const last = sheet.getLastRow();

  const props = PropertiesService.getScriptProperties();
  const seen = parseInt(props.getProperty('ALERT_LAST_ROW') || '1', 10);

  if (last <= seen) return; // אין שגיאות חדשות

  const newCount = last - seen;

  // מעדכנים את הסמן מיד — כדי שלא נשלח שוב על אותן שורות
  props.setProperty('ALERT_LAST_ROW', String(last));

  // בונים את גוף ההודעה מהשגיאות האחרונות
  const take = Math.min(newCount, ALERTS.MAX_ERRORS_IN_MSG);
  const values = sheet.getRange(last - take + 1, 1, take, 3).getValues();

  let msg = '🚨 *מערכת המקוואות* — ' + newCount +
    (newCount === 1 ? ' שגיאה חדשה' : ' שגיאות חדשות') + '\n';
  values.forEach(function (v) {
    msg += '\n🕐 ' + v[0] + ' | ' + v[1] + '\n' +
      String(v[2]).slice(0, 150) + '\n';
  });
  if (newCount > take) {
    msg += '\n(ועוד ' + (newCount - take) + ' נוספות)\n';
  }
  msg += '\nפרטים מלאים: לשונית "שגיאות" בגיליון.';

  // מצערת — לא יותר מהתראה אחת בכל חלון זמן
  const cache = CacheService.getScriptCache();
  if (cache.get('alert_throttle')) return;
  cache.put('alert_throttle', '1', ALERTS.THROTTLE_MIN * 60);

  sendWhatsApp_(msg);
}

/** שליחת הודעת וואטסאפ דרך Green API */
function sendWhatsApp_(text) {
  const idInstance = requireProp_('GREEN_ID_INSTANCE');
  const apiToken = requireProp_('GREEN_API_TOKEN');
  const chatId = requireProp_('ALERT_CHAT_ID');

  const url = 'https://api.green-api.com/waInstance' + idInstance +
    '/sendMessage/' + apiToken;

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chatId: chatId, message: text }),
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    // לא זורקים שגיאה כדי לא ליצור לולאת התראות — רק רושמים ביומן הביצוע
    Logger.log('שליחת וואטסאפ נכשלה: ' + resp.getResponseCode() +
      ' | ' + resp.getContentText().slice(0, 200));
  }
}

/**
 * ★ מריצים פעם אחת ★
 * מכוון את הסמן לשורה הנוכחית (שגיאות עבר לא יישלחו)
 * ומתקין את טריגר השומר — כל 5 דקות.
 */
function installAlertTrigger() {
  const last = getSheet_(CONFIG.ERROR_SHEET).getLastRow();
  PropertiesService.getScriptProperties()
    .setProperty('ALERT_LAST_ROW', String(Math.max(last, 1)));

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkErrors') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('checkErrors').timeBased().everyMinutes(5).create();

  Logger.log('✅ שומר ההתראות הותקן — בדיקה כל 5 דקות.');
}

/** ★ בדיקה ידנית ★ שולח אליך הודעת ניסיון בוואטסאפ */
function testAlert() {
  sendWhatsApp_('✅ בדיקת מערכת ההתראות — מערכת המקוואות מחוברת אליך בהצלחה.');
  Logger.log('נשלחה הודעת בדיקה. בדוק את הוואטסאפ.');
}
