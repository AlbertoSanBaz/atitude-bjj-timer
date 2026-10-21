#!/usr/bin/env python3
"""Genera todos los iconos e imágenes derivadas a partir de branding/logo.png.

Salidas:
  web/img/logo.webp                      logo de la interfaz
  web/img/icons/*.png                    iconos de la PWA (any + maskable), apple-touch, favicon
  android-tv/app/src/main/res/mipmap-*   icono del launcher (legacy + adaptativo)
  android-tv/app/src/main/res/drawable-xhdpi/tv_banner.png   banner 320x180 del launcher de Android TV

Uso:   python3 tools/generate_assets.py
Requisitos: pip install pillow fonttools brotli
"""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "branding" / "logo.png"
WEB = ROOT / "web"
RES = ROOT / "android-tv" / "app" / "src" / "main" / "res"

INK = (13, 11, 11, 255)        # --ink
RED = (220, 42, 49, 255)       # --red
CHALK = (245, 243, 241, 255)   # --chalk
MUTE = (163, 157, 155, 255)    # --mute


def load_logo() -> Image.Image:
    return Image.open(LOGO).convert("RGBA")


def fit(logo: Image.Image, size: int) -> Image.Image:
    return logo.resize((size, size), Image.LANCZOS)


def on_background(logo: Image.Image, size: int, scale: float, bg=INK) -> Image.Image:
    """Logo centrado sobre un fondo sólido; scale = fracción del lado que ocupa el logo."""
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * scale)
    off = (size - inner) // 2
    canvas.alpha_composite(fit(logo, inner), (off, off))
    return canvas


def woff2_font(name: str, px: int) -> ImageFont.FreeTypeFont:
    """Carga una fuente .woff2 de web/fonts convirtiéndola a TTF en memoria."""
    from fontTools.ttLib import TTFont

    font = TTFont(str(WEB / "fonts" / name))
    font.flavor = None
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, px)


def web_icons(logo: Image.Image) -> None:
    icons = WEB / "img" / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    # "any": el escudo es circular, se usa tal cual con fondo transparente
    for s in (192, 512):
        fit(logo, s).save(icons / f"icon-{s}.png", optimize=True)
    # "maskable": el contenido debe caber en el círculo seguro del 80 %
    for s in (192, 512):
        on_background(logo, s, 0.78).save(icons / f"icon-maskable-{s}.png", optimize=True)
    on_background(logo, 180, 0.88).convert("RGB").save(icons / "apple-touch-icon.png", optimize=True)
    fit(logo, 32).save(icons / "favicon-32.png", optimize=True)
    fit(logo, 320).save(WEB / "img" / "logo.webp", quality=92, method=6)


DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def android_icons(logo: Image.Image) -> None:
    for name, d in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        legacy = int(48 * d)
        fit(logo, legacy).save(folder / "ic_launcher.png", optimize=True)
        fit(logo, legacy).save(folder / "ic_launcher_round.png", optimize=True)
        # icono adaptativo: lienzo de 108 dp, zona segura de 66 dp
        fg_size = int(108 * d)
        fg = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
        inner = int(70 * d)
        off = (fg_size - inner) // 2
        fg.alpha_composite(fit(logo, inner), (off, off))
        fg.save(folder / "ic_launcher_foreground.png", optimize=True)


def tv_banner(logo: Image.Image) -> None:
    """Banner del launcher de Android TV: 320x180 px en drawable-xhdpi."""
    w, h = 320, 180
    img = Image.new("RGBA", (w, h), INK)
    draw = ImageDraw.Draw(img)
    # franja roja inferior, como acento de marca
    draw.rectangle((0, h - 8, w, h), fill=RED)
    ls = 132
    img.alpha_composite(fit(logo, ls), (16, (h - 8 - ls) // 2))

    title = woff2_font("barlow-condensed-latin-800-italic.woff2", 42)
    sub = woff2_font("barlow-condensed-latin-700-normal.woff2", 22)
    x = 16 + ls + 12
    draw.text((x, 34), "ATITUDE", font=title, fill=CHALK)
    draw.text((x, 74), "BJJ", font=title, fill=RED)
    draw.text((x + 2, 124), "ROUND TIMER", font=sub, fill=MUTE)

    out = RES / "drawable-xhdpi"
    out.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out / "tv_banner.png", optimize=True)


def main() -> None:
    logo = load_logo()
    web_icons(logo)
    android_icons(logo)
    tv_banner(logo)
    print("Assets generados.")


if __name__ == "__main__":
    main()
