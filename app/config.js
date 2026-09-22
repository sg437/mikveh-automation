/**
 * הגדרות חיבור של האפליקציה לגיליון החי (דרך ה-Apps Script).
 *
 * apiUrl   — כתובת ה-Web App של הסקריפט (Deploy > Manage deployments > Web app URL),
 *            למשל: https://script.google.com/macros/s/AKfycb.../exec
 *            ריק = האפליקציה עובדת מקובץ data.js בלבד (ללא חיבור חי).
 * apiToken — אם הוגדר API_TOKEN ב-Script Properties, אותו ערך כאן.
 */
window.MIKVEH_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbzx0I9BeyjB1lqs8WdHP1Yvp_oGb1z9uvX2Qdl95wG1j-OzQFLiO3jWw-M5gkDOnIqh/exec',
  apiToken: '',
  // מזהה OAuth Client (Web application) מ-Google Cloud Console – לכניסה עם Google.
  // אותו ערך צריך להיות גם ב-Script Property בשם GOOGLE_CLIENT_ID. ריק = מצב "מי אני" הישן.
  googleClientId: '',
};

/**
 * אפשר גם לא לגעת בקובץ הזה: במסך "הגדרות והרשאות" יש "חיבור לגיליון" –
 * מדביקים שם את הכתובת, והיא נשמרת במכשיר וגוברת על מה שכתוב כאן.
 * (ההגדרה כאן נוחה כשרוצים שכל המשתמשים יקבלו את החיבור מוכן מראש.)
 */
try {
  var _mkSaved = JSON.parse(localStorage.getItem('mikveh.connection') || 'null');
  if (_mkSaved) Object.keys(_mkSaved).forEach(function (k) { if (_mkSaved[k]) window.MIKVEH_CONFIG[k] = _mkSaved[k]; });
} catch (e) { /* אין localStorage – ממשיכים עם הערכים שבקובץ */ }
