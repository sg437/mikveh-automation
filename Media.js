/************************************************************************
 * תמונות וקבצים מהאפליקציה (Media.gs)
 * ========================================================
 * העלאה: POST ?action=addMedia עם { data: { mikveh, context, refId, name, mime, base64 } }
 * הקובץ נשמר בדרייב בתיקיית הארכיון של המקווה (MIKVEH_ARCHIVE_FOLDER_ID ➜ <מקווה> ➜
 * "מהמערכת"), משותף לצפייה לכל מי שיש לו את הקישור, ונרשם בלשונית "מדיה".
 * context: message (הודעה בדיון) / action (דיווח) / inspection (דו"ח פיקוח)
 * refId:   מזהה ההודעה, או חותמת הזמן של הדיווח – כך התמונה מוצגת ליד הרשומה.
 ************************************************************************/

const MEDIA = {
  SHEET: 'מדיה',
  HEADERS: ['מזהה', 'זמן', 'מקווה', 'הקשר', 'מזהה רשומה', 'מזהה קובץ', 'קישור', 'שם קובץ', 'הועלה ע"י', 'סוג'],
  FOLDER_PROP: 'MIKVEH_ARCHIVE_FOLDER_ID',
  SUBFOLDER: 'מהמערכת',
  GENERAL_FOLDER: 'דיון כללי',
  MAX_BYTES: 25 * 1024 * 1024,
  LIMIT: 3000,
};

function mediaSheet_(ss) {
  let sh = ss.getSheetByName(MEDIA.SHEET);
  if (!sh) {
    sh = ss.insertSheet(MEDIA.SHEET);
    sh.appendRow(MEDIA.HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function mediaFolder_(mikveh) {
  const rootId = getProp_(MEDIA.FOLDER_PROP);
  if (!rootId) throw new Error('חסר MIKVEH_ARCHIVE_FOLDER_ID (תיקיית הארכיון בדרייב)');
  const root = DriveApp.getFolderById(rootId);
  const parent = findOrCreateFolder_(root, mikveh ? sanitizeName_(mikveh) : MEDIA.GENERAL_FOLDER);
  return findOrCreateFolder_(parent, MEDIA.SUBFOLDER);
}

function mediaKind_(mime, name) {
  const m = String(mime || '');
  if (m.indexOf('video') === 0) return 'video';
  if (m.indexOf('audio') === 0) return 'audio';
  if (m.indexOf('image') === 0) return 'image';
  if (/\.(mp4|mov|webm)$/i.test(String(name || ''))) return 'video';
  if (/\.(m4a|mp3|ogg|webm|wav)$/i.test(String(name || ''))) return 'audio';
  return 'file';
}

function mediaRecord_(v) {
  const fileId = String(v[5] || '');
  const kind = apiClean_(v[9]) || mediaKind_('', v[7]);
  return apiCompact_({
    id: String(v[0]), ts: apiIso_(v[1]), mikveh: apiClean_(v[2]), context: apiClean_(v[3]), refId: apiClean_(v[4]),
    fileId: fileId, url: apiClean_(v[6]), name: apiClean_(v[7]), by: apiClean_(v[8]), kind: kind,
    view: fileId ? 'https://drive.google.com/uc?export=view&id=' + fileId : null,
    thumb: fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800' : null,
    play: fileId ? 'https://drive.google.com/file/d/' + fileId + '/preview' : null,
  });
}

function addMedia_(ss, d, user) {
  const b64 = String(d.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!b64) return { error: 'חסר קובץ' };
  if (b64.length * 0.75 > MEDIA.MAX_BYTES) return { error: 'הקובץ גדול מדי (עד 25MB)' };
  let mikveh = '';
  if (d.mikveh) {
    mikveh = canonicalMikveh_(ss, d.mikveh);
    if (!mikveh) return { error: 'המקווה "' + txt_(d.mikveh, 80) + '" לא נמצא' };
  }
  const mime = txt_(d.mime, 60) || 'image/jpeg';
  const kind = mediaKind_(mime, d.name);
  const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH-mm');
  const ext = kind === 'video' ? '.mp4' : kind === 'audio' ? '.m4a' : (mime.indexOf('png') >= 0 ? '.png' : '.jpg');
  const name = txt_(d.name, 80) || (stamp + ext);
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, (mikveh ? mikveh + ' ' : '') + stamp + ' ' + name);
  const folder = mediaFolder_(mikveh);
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (ignore) {}
  const id = Utilities.getUuid();
  const now = new Date();
  const row = [id, now, mikveh, txt_(d.context, 20) || 'message', txt_(d.refId, 80), file.getId(), file.getUrl(), name, user.name, kind];
  mediaSheet_(ss).appendRow(row);
  const rec = mediaRecord_(row);
  rec.mikvehId = mikveh ? apiNorm_(mikveh) : null;
  return { ok: true, record: rec };
}

function apiMedia_(ss) {
  const sh = ss.getSheetByName(MEDIA.SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow();
  const first = Math.max(2, last - MEDIA.LIMIT + 1);
  const values = sh.getRange(first, 1, last - first + 1, MEDIA.HEADERS.length).getValues();
  const out = [];
  values.forEach(function (v) { if (v[0]) out.push(mediaRecord_(v)); });
  return out;
}
