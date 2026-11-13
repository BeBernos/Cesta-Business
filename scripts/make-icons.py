"""Gera os ícones do app (PNG). Uso: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw, ImageFilter
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "app", "icons")
S = 1024  # desenha grande e reduz (antialias)
VERDE = (74, 222, 128, 255)
PETROLEO = (111, 216, 236, 255)
AMBAR = (255, 209, 102, 255)
CLARO = (238, 240, 242, 255)


def fundo():
    bg = Image.new("RGBA", (S, S), (18, 19, 21, 255))
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse([-S * 0.2, -S * 0.25, S * 0.9, S * 0.75], fill=(20, 110, 130, 200))
    d.ellipse([S * 0.35, S * 0.4, S * 1.25, S * 1.25], fill=(30, 120, 70, 170))
    glow = glow.filter(ImageFilter.GaussianBlur(170))
    return Image.alpha_composite(bg, glow)


def cesta(img, escala=1.0):
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S * 0.52
    k = escala
    w, top, bot = S * 0.56 * k, cy - S * 0.06 * k, cy + S * 0.25 * k
    # alça
    d.arc([cx - w * 0.33, top - S * 0.30 * k, cx + w * 0.33, top + S * 0.30 * k], 180, 360, fill=CLARO, width=int(S * 0.045 * k))
    # borda superior
    d.rounded_rectangle([cx - w / 2 - S * 0.03 * k, top - S * 0.035 * k, cx + w / 2 + S * 0.03 * k, top + S * 0.045 * k], radius=int(S * 0.03 * k), fill=CLARO)
    # corpo (trapézio)
    corpo = [(cx - w / 2, top + S * 0.04 * k), (cx + w / 2, top + S * 0.04 * k), (cx + w * 0.40, bot), (cx - w * 0.40, bot)]
    d.polygon(corpo, fill=PETROLEO)
    # frestas
    for i in (-1, 0, 1):
        x = cx + i * w * 0.2
        d.line([(x, top + S * 0.08 * k), (x - i * S * 0.02 * k, bot - S * 0.04 * k)], fill=(15, 52, 64, 255), width=int(S * 0.028 * k))
    # etiqueta de preço verde (menor preço)
    tx, ty, r = cx + w * 0.43, bot - S * 0.03 * k, S * 0.125 * k
    d.ellipse([tx - r - S * 0.022 * k, ty - r - S * 0.022 * k, tx + r + S * 0.022 * k, ty + r + S * 0.022 * k], fill=(18, 19, 21, 255))
    d.ellipse([tx - r, ty - r, tx + r, ty + r], fill=VERDE)
    sw = int(S * 0.03 * k)
    d.line([(tx - r * 0.45, ty + r * 0.02), (tx - r * 0.1, ty + r * 0.38), (tx + r * 0.5, ty - r * 0.35)], fill=(5, 46, 22, 255), width=sw, joint="curve")


def icon(size, rounded, maskable=False):
    img = fundo()
    cesta(img, 0.78 if maskable else 1.0)
    if rounded:
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
        img.putalpha(m)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon(192, True).save(os.path.join(OUT, "icon-192.png"))
icon(512, True).save(os.path.join(OUT, "icon-512.png"))
icon(512, False, maskable=True).save(os.path.join(OUT, "maskable-512.png"))
icon(180, False).save(os.path.join(OUT, "apple-touch-icon.png"))
print("ok")
