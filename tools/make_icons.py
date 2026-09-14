#!/usr/bin/env python3
"""
מחולל אייקוני ה-PWA (tools/make_icons.py).

Chrome מציע "התקן אפליקציה" רק כשיש במניפסט אייקוני PNG של 192 ו-512.
אין בסביבה ספריית גרפיקה, ולכן הקובץ מצייר ישירות למאגר פיקסלים
וכותב PNG בעצמו (zlib + מבנה chunks), עם החלקת קצוות בדגימת-על.

הצורות זהות ל-SVG שהיה מוטמע במניפסט: גל מים לאפליקציה הראשית,
ובועת דיבור לאפליקציית הדיונים.

    python3 tools/make_icons.py        # כותב אל app/
"""
import math
import os
import struct
import zlib

BRAND = (0x12, 0x3C, 0x5A)   # --brand
ACCENT = (0xE8, 0xC1, 0x5A)  # --accent
SS = 3                       # דגימת-על לכל ציר


def write_png(path, size, sample):
    """sample(u, v) -> (r, g, b, a) במרחב 64x64. כותב PNG בגודל size."""
    raw = bytearray()
    step = 64.0 / (size * SS)
    half = step / 2.0
    for py in range(size):
        raw.append(0)  # filter: none
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                v = (py * SS + sy) * step + half
                for sx in range(SS):
                    u = (px * SS + sx) * step + half
                    cr, cg, cb, ca = sample(u, v)
                    r += cr * ca; g += cg * ca; b += cb * ca; a += ca
            n = SS * SS
            if a:
                raw += bytes((round(r / a), round(g / a), round(b / a), round(a / n)))
            else:
                raw += b'\x00\x00\x00\x00'

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(png)
    print('%-28s %4dx%-4d %6d bytes' % (os.path.basename(path), size, size, len(png)))


def in_round_rect(u, v, radius=14.0):
    """ריבוע עם פינות מעוגלות במרחב 64x64."""
    dx = abs(u - 32.0) - (32.0 - radius)   # כמה חורגים מהקטע הישר
    dy = abs(v - 32.0) - (32.0 - radius)
    if dx > radius or dy > radius:         # מחוץ לריבוע
        return False
    if dx <= 0 or dy <= 0:                 # ברצועה הישרה – בפנים
        return True
    return math.hypot(dx, dy) <= radius    # אזור הפינה


def on_wave(u, v):
    """גל המים: קו בעובי w מ-x0 עד x1, סביב y=mid.

    המחזור נבחר כך שהטווח מכיל מספר שלם של מחזורים והגל מתחיל ומסתיים
    בשיא. שם השיפוע אפס, ולכן העובי הניצב שווה בדיוק ל-w/2 ונפגש חלק
    עם הקצה המעוגל – אחרת נוצר זיז בכל קצה.
    """
    x0, x1, mid, amp, period, w = 12.0, 52.0, 36.0, 4.5, 20.0, 4.5
    if u < x0 - w / 2 or u > x1 + w / 2:
        return False
    k = 2 * math.pi / period
    cu = min(max(u, x0), x1)
    y = mid - amp * math.cos(k * (cu - x0))
    if u < x0 or u > x1:                     # קצוות מעוגלים
        return math.hypot(u - cu, v - y) <= w / 2
    slope = amp * k * math.sin(k * (cu - x0))
    return abs(v - y) <= (w / 2) * math.hypot(1.0, slope)


def in_bubble(u, v):
    """בועת דיבור: M14 20h36v22H32l-10 8v-8h-8z"""
    if 14 <= u <= 50 and 20 <= v <= 42:
        return True
    if 22 <= u <= 32 and 42 <= v <= 50:      # הזנב
        return (v - 42) <= (32 - u) * 0.8
    return False


def make(shape, maskable=False, invert=False):
    """invert: רקע זהב וצורה כחולה – לאפליקציית הדיונים, כדי ששני האייקונים
    יהיו נבדלים במבט חטוף במגירת האפליקציות ולא רק בצורה שבתוכם."""
    bg, fg = (ACCENT, BRAND) if invert else (BRAND, ACCENT)

    def sample(u, v):
        if maskable:
            # אזור בטוח: התוכן מכווץ ל-80% והרקע מכסה את כל הריבוע
            u = (u - 32.0) / 0.8 + 32.0
            v = (v - 32.0) / 0.8 + 32.0
            if shape(u, v):
                return fg + (255,)
            return bg + (255,)
        if not in_round_rect(u, v):
            return (0, 0, 0, 0)
        if shape(u, v):
            return fg + (255,)
        return bg + (255,)
    return sample


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
    jobs = [
        ('icon-192.png', 192, make(on_wave)),
        ('icon-512.png', 512, make(on_wave)),
        ('icon-maskable-512.png', 512, make(on_wave, maskable=True)),
        ('apple-touch-icon.png', 180, make(on_wave, maskable=True)),
        ('talk-icon-192.png', 192, make(in_bubble, invert=True)),
        ('talk-icon-512.png', 512, make(in_bubble, invert=True)),
        ('talk-icon-maskable-512.png', 512, make(in_bubble, maskable=True, invert=True)),
    ]
    for name, size, sample in jobs:
        write_png(os.path.join(out, name), size, sample)


if __name__ == '__main__':
    main()
