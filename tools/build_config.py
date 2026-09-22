#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
כותב את app/config.js לפי משתני הסביבה, לפני פרסום האתר.

למה: בלי כתובת הגיליון, כל מי שפותח את הקישור מקבל אפליקציה "לא מחוברת" —
ומי שמקבל את הקישור אינו אמור להדביק כתובות. הכתובת נשמרת פעם אחת
בהגדרות הריפו (Settings ⇠ Secrets and variables ⇠ Actions ⇠ Variables):

    MIKVEH_API_URL           כתובת ה-Web App של הסקריפט (מסתיימת ב-/exec)
    MIKVEH_API_TOKEN         רק אם הוגדר API_TOKEN ב-Script Properties
    MIKVEH_GOOGLE_CLIENT_ID  לא חובה — מגיע ממילא מהסקריפט

שימו לב: האתר ציבורי, ולכן כל מה שנכתב כאן גלוי לכל מי שפותח את הקוד —
גם הטוקן. הוא אינו הגנה על הנתונים; ההגנה היא הכניסה עם Google, שנאכפת
בשרת (Api.js, REQUIRE_LOGIN).

הרצה:  MIKVEH_API_URL=https://script.google.com/... python3 tools/build_config.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, 'app', 'config.js')

FIELDS = [
    ('apiUrl', 'MIKVEH_API_URL'),
    ('apiToken', 'MIKVEH_API_TOKEN'),
    ('googleClientId', 'MIKVEH_GOOGLE_CLIENT_ID'),
]


def apply(text, values):
    """מחליף את הערכים בתוך window.MIKVEH_CONFIG, בלי לגעת בהערות."""
    for key, value in values.items():
        pattern = re.compile(r"(\n\s*" + key + r":\s*')([^']*)(')")
        if not pattern.search(text):
            sys.exit('build_config: לא נמצא השדה %s ב-app/config.js' % key)
        text = pattern.sub(lambda m: m.group(1) + value.replace("'", "") + m.group(3), text, count=1)
    return text


def main():
    values = {}
    for key, env in FIELDS:
        v = (os.environ.get(env) or '').strip()
        if v:
            values[key] = v
    if not values.get('apiUrl'):
        print('build_config: MIKVEH_API_URL אינו מוגדר — האתר יפורסם בלי כתובת הגיליון,')
        print('              וכל מי שיפתח את הקישור יראה "המערכת אינה מחוברת".')
        print('              להגדרה: Settings ⇠ Secrets and variables ⇠ Actions ⇠ Variables.')
        return 0
    if not values['apiUrl'].startswith('https://'):
        sys.exit('build_config: MIKVEH_API_URL חייב להתחיל ב-https://')
    with io.open(CONFIG, encoding='utf-8') as fh:
        text = fh.read()
    out = apply(text, values)
    with io.open(CONFIG, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(out)
    print('build_config: נכתבו %s (%s)' % (len(values), ', '.join(sorted(values))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
