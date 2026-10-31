"""Draws the app icons (PNG) from the touchgrass grass-tuft logo.

Run once after changing the logo:  python site/scripts/make_icons.py
Needs Pillow (pip install pillow). Output goes to site/public/icons/.
"""
from pathlib import Path

from PIL import Image, ImageDraw

INK = (19, 40, 30)
LIME = (200, 241, 105)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"

# The four blades from the SVG logo (viewBox 26 x 22), as cubic Béziers.
BLADES = [
    ((4, 21), (4, 14), (2, 9), (1, 6)),
    ((9, 21), (9, 13), (9, 6), (11, 1)),
    ((14, 21), (14, 15), (16, 10), (20, 7)),
    ((19, 21), (20, 17), (22, 14), (25, 13)),
]


def bezier(p0, p1, p2, p3, steps=80):
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        yield (u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
               u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1])


def icon(size: int, logo_fraction: float) -> Image.Image:
    """Ink square with the lime logo centred, taking `logo_fraction` of the width."""
    scale = 4  # draw big, then shrink: smooth edges
    big = size * scale
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, big - 1, big - 1], fill=INK)  # square: each OS rounds it its own way

    unit = big * logo_fraction / 26  # logo is 26 units wide, 22 tall
    ox = (big - 26 * unit) / 2
    oy = (big - 22 * unit) / 2
    r = 2.4 * unit / 2
    for blade in BLADES:
        # A dense row of overlapping discs: a thick stroke with round caps and
        # clean edges (Pillow's thick curved lines leave gaps).
        for x, y in bezier(*blade, steps=600):
            x, y = ox + x * unit, oy + y * unit
            draw.ellipse([x - r, y - r, x + r, y + r], fill=LIME)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon(192, 0.62).save(OUT / "icon-192.png")
    icon(512, 0.62).save(OUT / "icon-512.png")
    # Maskable: Android crops to a circle/squircle, so keep the logo in the middle 60%.
    icon(512, 0.50).save(OUT / "icon-maskable-512.png")
    # iOS adds its own rounded corners and dislikes transparency.
    icon(180, 0.62).convert("RGB").save(OUT / "apple-touch-icon.png")
    print(f"Icons written to {OUT}")


if __name__ == "__main__":
    main()
