#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
בונה קובץ HTML יחיד של האפליקציה (כל הסקריפטים והנתונים בפנים) – לשיתוף כקישור
או להצגה בלי שרת. שימוש: python3 tools/build_single.py [dist/mikvaot.html] [--artifact]

--artifact : פלט בלי <html>/<head>/<body> (לפרסום כ-Artifact), עם dir=rtl על המעטפת.
"""
import sys, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'app')


def read(name):
    with open(os.path.join(APP, name), encoding='utf-8') as f:
        return f.read()


def main():
    out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.join(ROOT, 'dist', 'mikvaot.html')
    artifact = '--artifact' in sys.argv
    html = read('index.html')
    # הסקריפטים – בסדר הטעינה שבקובץ
    scripts = re.findall(r'<script src="([^"]+)"></script>', html)
    inline = []
    for s in scripts:
        code = read(s)
        if s == 'app.js':
            # אין service worker בקובץ יחיד
            code = code.replace("if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {", "if (false) {")
        inline.append('<script>\n' + code.replace('</script', '<\\/script') + '\n</script>')
    html = re.sub(r'<script src="[^"]+"></script>\s*', '', html)
    html = html.replace('</body>', '\n'.join(inline) + '\n</body>')
    html = html.replace('<link rel="manifest" href="manifest.json">\n', '')
    if artifact:
        # מוציאים את תוכן ה-head (title + style) ואת תוכן ה-body
        head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
        body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
        title = re.search(r'<title>.*?</title>', head, re.S).group(0)
        style = re.search(r'<style>.*?</style>', head, re.S).group(0)
        html = title + '\n' + style + '\n<script>document.documentElement.setAttribute("dir","rtl");document.documentElement.setAttribute("lang","he");</script>\n<div dir="rtl" lang="he">' + body + '</div>\n'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(out, len(html.encode('utf-8')) // 1024, 'KB')


if __name__ == '__main__':
    main()
