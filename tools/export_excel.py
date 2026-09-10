#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ייצוא נתוני המקוואות מקובץ האקסל ההיסטורי לקובץ נתונים אחד (app/data.js).

שימוש:
    python3 tools/export_excel.py <קובץ.xlsx> [app/data.js]

הגיליונות שנקראים:
    בסיס הנתונים                 -> mikvaot      (כרטיס אב לכל מקווה)
    אוצר זריעה                   -> actions      (יומן פעולות: חידוש תעודה, החלפת אוצר, ריקון מאגר...)
    פיקוח הלכתי מערכת            -> inspections  (דוחות פיקוח מלאים, מחולקים למדורים)
    משימות לריקון והחלפת מי גשמים -> tasks        (משימות פתוחות)
    -פקקים מילוי חוזר            -> plugs        (מעקב פקקים ומילוי חוזר)

גיליונות נגזרים (תעודות, לבסיס נתונים, -פעולה סיכום, -פיקוח הלכתי סיכום)
הם נוסחאות על אותם נתונים ולכן אינם מיובאים.
"""
import sys, json, re, datetime, collections
import openpyxl

EXCEL_EPOCH = datetime.datetime(1899, 12, 30)


def clean(v):
    """מנקה ערך תא: רווחים, שגיאות נוסחה, None."""
    if v is None:
        return None
    if isinstance(v, float) and v != v:  # NaN
        return None
    if isinstance(v, datetime.datetime):
        return v.isoformat(timespec='seconds')
    s = str(v).strip()
    if s in ('', '#N/A', '#REF!', '#VALUE!', '#DIV/0!', 'None'):
        return None
    return s


def serial_to_iso(v):
    """ממיר מספר תאריך של אקסל ל-ISO. מחזיר None אם זה לא תאריך."""
    v = clean(v)
    if v is None:
        return None
    if isinstance(v, str) and re.match(r'^\d{4}-\d{2}-\d{2}', v):
        return v[:19]
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f < 30000 or f > 80000:  # מחוץ לטווח 1982-2119 – לא תאריך
        return None
    d = EXCEL_EPOCH + datetime.timedelta(days=f)
    return d.isoformat(timespec='seconds')


def num(v):
    v = clean(v)
    if v is None:
        return None
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except ValueError:
        return v


def norm(name):
    """נרמול שם מקווה להשוואה: רווחים כפולים, מקפים שונים, גרשיים."""
    if not name:
        return ''
    s = str(name).replace('–', '-').replace('—', '-').replace('״', '"').replace("''", '"').replace('׳', "'")
    s = re.sub(r'\s*-\s*', ' - ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def rows_of(wb, name):
    return list(wb[name].iter_rows(values_only=True))


# ---------------------------------------------------------------- מקוואות
MASTER_FIELDS = [
    # (עמודה, מפתח, כותרת בעברית)
    (0, 'name', 'שם המקוה'),
    (1, 'council', 'מועצה'),
    (2, 'place', 'מקום'),
    (3, 'address', 'כתובת'),
    (4, 'activity', 'פעילות המקוה'),
    (5, 'supervised', 'בפיקוח'),
    (6, 'notes', 'הערות'),
    (7, 'certificate', 'תוקף תעודה'),
    (8, 'lastVisit', 'ביקור אחרון'),
    (9, 'attendant', 'שם הבלנית / אחראי'),
    (10, 'phone', 'טלפון'),
    (11, 'mikvehPhone', 'טלפון מקווה'),
    (12, 'ownership', 'בעלות'),
    (13, 'reservoir', 'מאגר'),
    (14, 'reservoirEmptied', 'ריקון מאגר אחרון'),
    (15, 'otzarLocation', 'מיקום האוצרות'),
    (16, 'otzarZeria', 'אוצר זריעה'),
    (17, 'zeriaReplaced', 'החלפת זריעה אחרונה'),
    (18, 'otzarHashaka', 'אוצר השקה'),
    (19, 'hashakaType', 'סוג השקה'),
    (20, 'hashakaReplaced', 'החלפת השקה אחרונה'),
    (21, 'chabadReplaced', 'החלפת אוצר חב"ד'),
    (22, 'filter', 'פילטר'),
    (23, 'kelim', 'מקוה כלים'),
    (24, 'masterKey', 'מפתח מסטר'),
    (25, 'masterKeyWhich', 'איזה מפתח'),
    (26, 'socket', 'שקע ליד האוצרות'),
    (27, 'hoseTap', 'ברז לצינור'),
    (28, 'localityType', 'מושב/עיר'),
    (29, 'region', 'איזור'),
    (30, 'hoursSummer', 'שעות פתיחה קיץ'),
    (31, 'hoursWinter', 'שעות פתיחה חורף'),
    (32, 'hoursErev', 'שעות פתיחה ערב שבת וחג'),
    (33, 'hoursMotzash', 'שעות פתיחה מוצ"ש ויו"ט'),
    (34, 'accessibility', 'רמת הנגשה'),
    (35, 'coordination', 'תאום מראש'),
    (36, 'notes2', 'הערות נוספות'),
    (47, 'lastInspection', 'פיקוח אחרון'),
    (49, 'oldListDate', 'רשימה ישנה'),
]


def export_mikvaot(wb):
    rows = rows_of(wb, 'בסיס הנתונים')
    out, seen = [], set()
    for i, r in enumerate(rows[1:], start=2):
        name = clean(r[0])
        if not name:
            continue
        rec = {}
        for col, key, _ in MASTER_FIELDS:
            rec[key] = clean(r[col]) if col < len(r) else None
        # מזהה יציב: השם המנורמל (השם הוא המפתח בכל הגיליונות). הקוד המספרי נשמר כשדה.
        code = num(r[50]) if len(r) > 50 else None
        rec['code'] = str(code) if isinstance(code, int) else None
        rec['id'] = norm(name)
        if rec['id'] in seen:
            rec['id'] = rec['id'] + ' (%d)' % i
        seen.add(rec['id'])
        # תאריכי מערכת (מספרי אקסל) -> ISO
        rec['certificateDate'] = serial_to_iso(r[46])   # תוצאה – התאריך האחרון של תעודה
        rec['lastInspectionDate'] = serial_to_iso(r[45])
        rec['lastRenewalDate'] = serial_to_iso(r[44])
        out.append(rec)
    return out


# ---------------------------------------------------------------- פעולות
def export_actions(wb):
    rows = rows_of(wb, 'אוצר זריעה')
    out = []
    for r in rows[1:]:
        ts = serial_to_iso(r[0])
        name = clean(r[2])
        if not name and not ts:
            continue
        action = clean(r[5]) or ''
        rec = {
            'ts': ts,
            'rabbi': clean(r[1]),
            'mikveh': name,
            'attendant': clean(r[3]),
            'phone': clean(r[4]),
            'action': action.strip(),
            'otzar': clean(r[6]),            # זריעה / השקה / חב"ד / כלים
            'drained': clean(r[7]),          # פעולות לריקון האוצר [בוצע]
            'sealed': clean(r[8]),           # איטום האוצר
            'filled': clean(r[9]),           # מילוי האוצר
            'note': clean(r[10]),
            'roofDone': clean(r[12]),        # [בוצע] (ריקון מאגר)
            'roofSealed': clean(r[13]),      # איטום הגג
            'reservoirSealed': clean(r[14]), # איטום המאגר
            'note2': clean(r[15]),
            'liters': num(r[19]),
            'validMonth': clean(r[20]),
            'validYear': clean(r[21]),
        }
        out.append({k: v for k, v in rec.items() if v not in (None, '')})
    out.sort(key=lambda a: a.get('ts') or '')
    return out


# ---------------------------------------------------------------- פיקוח
INSPECTION_SECTIONS = [
    # (מפתח, כותרת, עמודות)
    ('roof', 'גג', range(15, 22)),
    ('reservoir', 'מאגר', range(22, 30)),
    ('zeria', 'אוצר זריעה', range(30, 40)),
    ('hashaka', 'אוצר השקה', range(40, 48)),
    ('bor', 'בור טבילה', range(48, 61)),
    ('technical', 'טכני ומבנה', range(61, 77)),
    ('chabad', "אוצר השקה חב''ד", range(77, 84)),
]


def export_inspections(wb):
    rows = rows_of(wb, 'פיקוח הלכתי מערכת')
    hdr = [clean(h) or '' for h in rows[0]]
    out = []
    for r in rows[1:]:
        ts = serial_to_iso(r[1])
        name = clean(r[0])
        if not ts or not name:
            continue
        sections = []
        for key, title, cols in INSPECTION_SECTIONS:
            fields = []
            for c in cols:
                label = hdr[c].strip()
                val = clean(r[c])
                if val is None:
                    continue
                fields.append([label, val])
            sections.append({'key': key, 'title': title, 'fields': fields})
        rec = {
            'ts': ts,
            'hebDate': clean(r[8]),
            'mikveh': name,
            'council': clean(r[9]),
            'rabbi': clean(r[12]),
            'contact': clean(r[13]),
            'phone': clean(r[14]),
            'urgent': num(r[3]) or 0,
            'needed': num(r[4]) or 0,
            'reservoirEmpty': clean(r[5]),
            'zeriaReplace': clean(r[6]),
            'hashakaReplace': clean(r[7]),
            'chabadReplace': clean(r[90]),
            'sections': sections,
            'guidance': clean(r[84]),
            'address': clean(r[89]),
            'lastReplaced': {
                'zeria': clean(r[85]), 'hashaka': clean(r[86]),
                'reservoir': clean(r[87]), 'chabad': clean(r[88]),
            },
            'repairs': {
                'reservoir': num(r[92]) or 0, 'zeria': num(r[93]) or 0,
                'hashaka': num(r[95]) or 0, 'chabad': num(r[97]) or 0,
                'bor': num(r[99]) or 0, 'roof': num(r[100]) or 0,
            },
        }
        out.append(rec)
    out.sort(key=lambda a: a['ts'])
    return out


# ---------------------------------------------------------------- משימות
def export_tasks(wb):
    rows = rows_of(wb, 'משימות לריקון והחלפת מי גשמים')
    out = []
    # הבלוק "מסודר לפי מועצות" (עמודות 11-20) הוא הרשימה המלאה
    for r in rows[2:]:
        name = clean(r[11])
        if not name:
            continue
        rec = {
            'mikveh': name,
            'council': clean(r[12]),
            'action': clean(r[13]),
            'priority': clean(r[14]),          # דחוף / כן / לא
            'state': clean(r[15]),             # מצב מאגר / נקב אוצר
            'repairs': num(r[16]) or 0,
            'roofRepairs': num(r[17]) or 0,
            'reservoir': clean(r[18]),
            'needsEmptying': clean(r[19]),
            'roofPlug': clean(r[20]),
        }
        out.append(rec)
    return out


def export_plugs(wb):
    rows = rows_of(wb, '-פקקים מילוי חוזר')
    groups = {
        'openOnRoof': {'title': 'פקק על הגג', 'cols': (0, 1, 2, 4, None)},
        'openForFill': {'title': 'פקק פתוח למילוי', 'cols': (5, 6, 7, None, 8)},
        'needRefill': {'title': 'טעון מילוי חוזר', 'cols': (9, 10, 11, None, 12)},
    }
    out = {}
    for key, g in groups.items():
        d, n, c, note, otzar = g['cols']
        items = []
        for r in rows[2:]:
            name = clean(r[n]) if n < len(r) else None
            if not name:
                continue
            items.append({
                'hebDate': clean(r[d]), 'mikveh': name, 'council': clean(r[c]),
                'note': clean(r[note]) if note is not None else None,
                'otzar': clean(r[otzar]) if otzar is not None else None,
            })
        out[key] = {'title': g['title'], 'items': items}
    return out


def export_hebrew_dates(wb):
    """טבלת מספר-אקסל -> תאריך עברי, לבדיקת ממיר התאריכים."""
    rows = rows_of(wb, 'תאריך עברי')
    out = {}
    for r in rows:
        s, h = num(r[0]), clean(r[1])
        if isinstance(s, int) and h:
            out[s] = h
    return out


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else 'app/data.js'
    wb = openpyxl.load_workbook(src, data_only=True)

    mikvaot = export_mikvaot(wb)
    actions = export_actions(wb)
    inspections = export_inspections(wb)
    tasks = export_tasks(wb)
    plugs = export_plugs(wb)

    # קישור פעולות/פיקוח/משימות לכרטיס לפי שם המקווה
    names = {norm(m['name']): m['id'] for m in mikvaot}
    unmatched = collections.Counter()
    for coll in (actions, inspections, tasks):
        for rec in coll:
            mid = names.get(norm(rec.get('mikveh')))
            if mid:
                rec['mikvehId'] = mid
            elif rec.get('mikveh'):
                unmatched[rec['mikveh']] += 1

    data = {
        'meta': {
            'exportedAt': datetime.datetime.now().isoformat(timespec='seconds'),
            'source': 'excel',
            'counts': {
                'mikvaot': len(mikvaot), 'actions': len(actions),
                'inspections': len(inspections), 'tasks': len(tasks),
            },
            'fieldLabels': {k: t for _, k, t in MASTER_FIELDS},
        },
        'mikvaot': mikvaot,
        'actions': actions,
        'inspections': inspections,
        'tasks': tasks,
        'plugs': plugs,
    }
    js = 'window.MIKVEH_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(js)

    hd = export_hebrew_dates(wb)
    with open(dst.replace('data.js', 'hebdate-test.json'), 'w', encoding='utf-8') as f:
        json.dump(hd, f, ensure_ascii=False)

    print('mikvaot', len(mikvaot), '| actions', len(actions), '| inspections', len(inspections),
          '| tasks', len(tasks), '| size KB', len(js.encode('utf-8')) // 1024)
    print('unmatched names (top 15):', unmatched.most_common(15), 'total', sum(unmatched.values()))


if __name__ == '__main__':
    main()
