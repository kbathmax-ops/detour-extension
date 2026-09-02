#!/usr/bin/env python3
"""
Generates the toolbar icon set: "DTR" on the detour blue.

Kept in the repo so the icons are reproducible rather than a one-off export.
Run from the repo root:  python3 design/make-icons.py

The mark is a condensed "DTR" rather than the full "detour" wordmark because a
wordmark is unreadable in a 16px toolbar slot -- at that size the script letters
collapse into a smudge (see design/preview-compare.png, kept from that
comparison). Three condensed capitals still resolve.
"""
from PIL import Image, ImageDraw, ImageFont

BLUE = (46, 36, 107)          # #2e246b -- same blue as the popup support button
INK = (255, 255, 255)
FONT = "/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf"
TEXT = "DTR"
SS = 8                        # supersample factor; downsampled for clean edges

def fitted_font(draw, target_w):
    """Largest size whose rendered width still fits target_w."""
    size = 10
    while True:
        f = ImageFont.truetype(FONT, size)
        w = draw.textbbox((0, 0), TEXT, font=f)[2] - draw.textbbox((0, 0), TEXT, font=f)[0]
        if w > target_w:
            return ImageFont.truetype(FONT, size - 1)
        size += 1

def make(px):
    n = px * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # A softer radius at 16px: heavy rounding eats the corners at that scale.
    radius = int(n * (0.16 if px <= 16 else 0.22))
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=radius, fill=BLUE)
    # Small sizes get a wider fill -- every pixel of letter counts at 16px.
    fill = 0.86 if px <= 16 else 0.74
    font = fitted_font(d, n * fill)
    box = d.textbbox((0, 0), TEXT, font=font)
    d.text((n / 2 - (box[2] + box[0]) / 2, n / 2 - (box[3] + box[1]) / 2), TEXT, font=font, fill=INK)
    return img.resize((px, px), Image.LANCZOS)

for px in (16, 32, 48, 128):
    make(px).save(f"icons/icon{px}.png")
    print(f"icons/icon{px}.png")
make(256).save("design/mark-dtr-256.png")
