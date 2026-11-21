#!/usr/bin/env python3
"""Generate every app icon and favicon from the brand source image.

Usage (from the repo root):
    python3 docs/brand/generate_icons.py

Source: docs/brand/zuru-icon-source.png (the receipt-roll "Z" on a white
background). When a vector redraw replaces it, export a 1024px PNG with the
same look and re-run this script; nothing else needs to change.

Writes:
  apps/cashier/android/app/src/main/res/
    mipmap-*/ic_launcher.png              legacy icon (Android < 8)
    mipmap-*/ic_launcher_foreground.png   adaptive icon foreground
    mipmap-*/ic_launcher_monochrome.png   themed icon (Android 13+)
    mipmap-anydpi-v26/ic_launcher.xml     adaptive icon definition
    values/ic_launcher_colors.xml         adaptive icon background (amber)
  apps/dashboard/public/
    favicon.ico                           16/32 simplified, 48 full
    apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png
    logo-mark.png                         transparent mark for in-app use
  apps/landing/img/
    logo-lockup.png                       transparent mark + wordmark (site header)
    logo-mark.png                         transparent mark
    favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png
    og-image.png                          link preview (1200x630, lockup on paper)
  docs/brand/
    zuru-icon.png                         transparent master cut-out
    play-store-icon-512.png               Google Play listing icon
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/brand/zuru-icon-source.png"
LOCKUP_SOURCE = ROOT / "docs/brand/zuru-logo-source.png"
RES = ROOT / "apps/cashier/android/app/src/main/res"
PUBLIC = ROOT / "apps/dashboard/public"
LANDING = ROOT / "apps/landing/img"
BRAND = ROOT / "docs/brand"

INK = (26, 26, 26)  # #1A1A1A
AMBER = (200, 135, 58)  # #C8873A  palm-sugar amber
CREAM = (246, 240, 228)  # #F6F0E4  receipt paper

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def outside_mask(img: Image.Image) -> Image.Image:
    """White background around the mark: 255 outside, 0 on the mark."""
    light = img.convert("L").point(lambda p: 255 if p > 120 else 0)
    ImageDraw.floodfill(light, (0, 0), 128)
    return light.point(lambda p: 255 if p == 128 else 0)


def cutout(img: Image.Image) -> Image.Image:
    """Mark on a transparent background, with an anti-aliased outer edge."""
    img = img.convert("RGB")
    out = outside_mask(img)
    # Widen the outside region by a few px so the soft edge pixels are
    # re-blended as ink over transparency instead of ink over white.
    edge = out.filter(ImageFilter.MaxFilter(5))
    lum = img.convert("L")
    # Over the background: alpha from how dark the pixel is (white 0 -> ink 1).
    edge_alpha = lum.point(lambda p: max(0, min(255, round((245 - p) * 255 / (245 - 26)))))
    alpha = Image.composite(edge_alpha, Image.new("L", img.size, 255), edge)
    rgb = Image.composite(Image.new("RGB", img.size, INK), img, edge)
    rgba = rgb.copy()
    rgba.putalpha(alpha)
    return square(rgba)


def cutout_wide(img: Image.Image) -> Image.Image:
    """Like cutout(), cropped to the artwork instead of squared (the lockup)."""
    img = img.convert("RGB")
    out = outside_mask(img)
    edge = out.filter(ImageFilter.MaxFilter(5))
    lum = img.convert("L")
    edge_alpha = lum.point(lambda p: max(0, min(255, round((245 - p) * 255 / (245 - 26)))))
    alpha = Image.composite(edge_alpha, Image.new("L", img.size, 255), edge)
    rgb = Image.composite(Image.new("RGB", img.size, INK), img, edge)
    rgb.putalpha(alpha)
    return rgb.crop(alpha.point(lambda p: 255 if p > 8 else 0).getbbox())


def square(rgba: Image.Image) -> Image.Image:
    bbox = rgba.getchannel("A").point(lambda p: 255 if p > 8 else 0).getbbox()
    rgba = rgba.crop(bbox)
    side = max(rgba.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    return canvas


def without_text_lines(mark: Image.Image) -> Image.Image:
    """Simplified mark for tiny sizes: paint the receipt's text lines cream."""
    alpha = mark.getchannel("A")
    dark = mark.convert("L").point(lambda p: 255 if p < 110 else 0)
    dark = ImageChops.multiply(dark, alpha.point(lambda p: 255 if p > 200 else 0))
    # The outline is one connected shape touching the outer edge; the text
    # lines are separate islands inside the paper. Fill the outline from a
    # pixel on its left edge, then whatever dark is left is the text lines.
    w, h = dark.size
    y = h // 2
    x = next(x for x in range(w) if dark.getpixel((x, y)) == 255)
    ImageDraw.floodfill(dark, (x, y), 128)
    lines = dark.point(lambda p: 255 if p == 255 else 0).filter(ImageFilter.MaxFilter(7))
    paper = paper_colour(mark)
    simple = Image.composite(Image.new("RGBA", mark.size, paper + (255,)), mark, lines)
    # The paper has a slight gradient; diffuse the surrounding paper into the
    # filled areas so no ghost of the lines is left.
    for _ in range(12):
        simple = Image.composite(simple.filter(ImageFilter.GaussianBlur(6)), simple, lines)
    simple.putalpha(alpha)
    return simple


def paper_colour(mark: Image.Image) -> tuple[int, int, int]:
    """The paper's actual colour in the source (it drifts from CREAM a little)."""
    colours = mark.resize((256, 256), Image.NEAREST).getcolors(256 * 256) or []
    paper = [(n, c) for n, c in colours if c[3] == 255 and sum(c[:3]) > 600]
    return max(paper)[1][:3] if paper else CREAM


def monochrome(mark: Image.Image) -> Image.Image:
    """Ink strokes only, as white-on-transparent (Android tints it)."""
    lum = mark.convert("L")
    ink = lum.point(lambda p: max(0, min(255, round((130 - p) * 255 / (130 - 26)))))
    ink = ImageChops.multiply(ink, mark.getchannel("A"))
    out = Image.new("RGBA", mark.size, (255, 255, 255, 0))
    out.putalpha(ink)
    return out


def place(mark: Image.Image, size: int, fraction: float, bg=None, radius: float = 0) -> Image.Image:
    """Mark scaled to `fraction` of a `size` canvas, centred, on optional bg."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if bg is not None:
        shape = Image.new("L", (size * 4, size * 4), 0)
        r = int(size * 4 * radius)
        ImageDraw.Draw(shape).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), r, fill=255)
        canvas.paste(Image.new("RGBA", (size, size), bg + (255,)), (0, 0), shape.resize((size, size), Image.LANCZOS))
    m = max(1, round(size * fraction))
    scaled = mark.resize((m, m), Image.LANCZOS)
    off = (size - m) // 2
    canvas.alpha_composite(scaled, (off, off))
    return canvas


def write(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print("wrote", path.relative_to(ROOT))


def android(mark: Image.Image) -> None:
    mono = monochrome(mark)
    for name, k in DENSITIES.items():
        d = RES / f"mipmap-{name}"
        # Legacy icon: amber rounded square, 48dp.
        write(place(mark, round(48 * k), 0.62, AMBER, radius=0.22), d / "ic_launcher.png")
        # Adaptive layers: 108dp canvas; the mark (48dp) stays inside the
        # 66dp safe zone every launcher mask keeps.
        write(place(mark, round(108 * k), 48 / 108), d / "ic_launcher_foreground.png")
        write(place(mono, round(108 * k), 48 / 108), d / "ic_launcher_monochrome.png")
    xml = RES / "mipmap-anydpi-v26/ic_launcher.xml"
    xml.parent.mkdir(parents=True, exist_ok=True)
    xml.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
        "</adaptive-icon>\n"
    )
    print("wrote", xml.relative_to(ROOT))
    colors = RES / "values/ic_launcher_colors.xml"
    colors.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        "    <!-- Brand amber (docs/brand). Generated by docs/brand/generate_icons.py. -->\n"
        '    <color name="ic_launcher_background">#C8873A</color>\n'
        "</resources>\n"
    )
    print("wrote", colors.relative_to(ROOT))


def dashboard(mark: Image.Image, simple: Image.Image) -> None:
    ico = PUBLIC / "favicon.ico"
    PUBLIC.mkdir(parents=True, exist_ok=True)
    frames = [place(simple, 16, 1.0), place(simple, 32, 1.0), place(mark, 48, 1.0)]
    frames[-1].save(ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=frames[:-1])
    print("wrote", ico.relative_to(ROOT))
    write(place(mark, 180, 0.64, AMBER), PUBLIC / "apple-touch-icon.png")
    write(place(mark, 192, 0.64, AMBER, radius=0.22), PUBLIC / "icon-192.png")
    write(place(mark, 512, 0.64, AMBER, radius=0.22), PUBLIC / "icon-512.png")
    write(place(mark, 512, 0.56, AMBER), PUBLIC / "icon-maskable-512.png")
    write(place(mark, 256, 1.0), PUBLIC / "logo-mark.png")


def landing(mark: Image.Image, simple: Image.Image) -> None:
    lockup = cutout_wide(Image.open(LOCKUP_SOURCE))
    LANDING.mkdir(parents=True, exist_ok=True)
    w = 480
    write(lockup.resize((w, round(lockup.height * w / lockup.width)), Image.LANCZOS), LANDING / "logo-lockup.png")
    write(place(mark, 384, 1.0), LANDING / "logo-mark.png")
    ico = LANDING / "favicon.ico"
    frames = [place(simple, 16, 1.0), place(simple, 32, 1.0), place(mark, 48, 1.0)]
    frames[-1].save(ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=frames[:-1])
    print("wrote", ico.relative_to(ROOT))
    write(place(mark, 180, 0.64, AMBER), LANDING / "apple-touch-icon.png")
    write(place(mark, 192, 0.64, AMBER, radius=0.22), LANDING / "icon-192.png")
    write(place(mark, 512, 0.64, AMBER, radius=0.22), LANDING / "icon-512.png")
    og = Image.new("RGBA", (1200, 630), CREAM + (255,))
    lw = 760
    big = lockup.resize((lw, round(lockup.height * lw / lockup.width)), Image.LANCZOS)
    og.alpha_composite(big, ((1200 - big.width) // 2, (630 - big.height) // 2))
    write(og.convert("RGB"), LANDING / "og-image.png")


def main() -> None:
    mark = cutout(Image.open(SOURCE))
    mark = mark.resize((1024, 1024), Image.LANCZOS)
    simple = without_text_lines(mark)
    write(mark, BRAND / "zuru-icon.png")
    write(simple, BRAND / "zuru-icon-simple.png")
    write(place(mark, 512, 0.62, AMBER), BRAND / "play-store-icon-512.png")
    android(mark)
    dashboard(mark, simple)
    landing(mark, simple)


if __name__ == "__main__":
    main()
