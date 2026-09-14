#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
בונה את app/talk/index.html מתוך app/index.html.

למה תיקייה נפרדת: כרום מזהה אפליקציה מותקנת לפי ה-scope שלה. כששתי
האפליקציות יושבות באותה תיקייה (`?app=talk`), הדיונים נחשבים חלק
מהמערכת שכבר מותקנת ואין הצעת התקנה שנייה. תיקייה משלהם (app/talk/)
עם manifest ו-service worker משלה = אפליקציה שנייה לכל דבר, שאפשר
להתקין בטלפון כאייקון "דיונים" נפרד.

הקובץ הנבנה מוחזק בריפו (כדי שגם פתיחה מקומית תעבוד), ונבנה מחדש
אוטומטית בפרסום לאתר (.github/workflows/pages.yml) כדי שלא ייווצר פער
בינו לבין index.html.

הרצה:  python3 tools/make_talk.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'app', 'index.html')
DST_DIR = os.path.join(ROOT, 'app', 'talk')
DST = os.path.join(DST_DIR, 'index.html')

HEADER = ('<!-- נוצר אוטומטית מתוך app/index.html ע"י tools/make_talk.py — אין לערוך ידנית. -->\n')

# הסקריפט שמחליף manifest לפי ?app=talk מיותר כאן: לתיקייה יש manifest משלה.
OLD_SWITCH = re.compile(r'<script>if\(/\[\?&\]app=talk/\.test\(location\.search\)\).*?</script>\n', re.S)
NEW_SWITCH = '<script>window.TALK_APP=1;</script>\n'


def build(text):
    if not OLD_SWITCH.search(text):
        sys.exit('make_talk: לא נמצא סקריפט החלפת ה-manifest ב-index.html — יש לעדכן את הכלי')
    text = OLD_SWITCH.sub(NEW_SWITCH, text, count=1)
    text = text.replace('<title>מערכת כשרות המקוואות</title>', '<title>דיוני כשרות המקוואות</title>')
    text = text.replace('<meta name="apple-mobile-web-app-title" content="מקוואות">',
                        '<meta name="apple-mobile-web-app-title" content="דיונים">')
    text = text.replace('<link rel="apple-touch-icon" href="apple-touch-icon.png">',
                        '<link rel="apple-touch-icon" href="../talk-icon-192.png">')
    text = text.replace('<link rel="icon" href="icon-192.png">',
                        '<link rel="icon" href="../talk-icon-192.png">')
    # הקבצים המשותפים נשארים ברמה אחת מעל; manifest.json נשאר יחסי – הוא של התיקייה הזו
    text = re.sub(r'<script src="([\w.\-]+\.js)"></script>', r'<script src="../\1"></script>', text)
    text = text.replace('href="privacy.html"', 'href="../privacy.html"')
    text = text.replace('href="terms.html"', 'href="../terms.html"')
    return HEADER + text


def main():
    with io.open(SRC, encoding='utf-8') as fh:
        text = fh.read()
    out = build(text)
    if not os.path.isdir(DST_DIR):
        os.makedirs(DST_DIR)
    with io.open(DST, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(out)
    print('נכתב: ' + os.path.relpath(DST, ROOT) + ' (' + str(len(out)) + ' תווים)')


if __name__ == '__main__':
    main()
