#!/usr/bin/env python3
"""Compose the Editor app icon from the reviewed mascot (Pillow required)."""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'assets/brand'
ICON_SIZE = 1024
TILE_INSET = 100
TILE_SIZE = ICON_SIZE - 2 * TILE_INSET


def squircle_mask(scale):
    """Continuous-corner silhouette for the flattened macOS PNG/ICNS export.

    Match the 824/1024 footprint of macOS app icons. Three cubic segments
    ease each corner into its straight edges, unlike a circular rounded rect.
    Keep this geometry portable; do not depend on installed system artwork.
    """
    radius = TILE_SIZE * 0.225
    corner = [
        (1.528665, 0),
        (1.088493, 0), (0.868407, 0), (0.631494, 0.074911),
        (0.372823, 0.169060), (0.169060, 0.372823), (0.074911, 0.631494),
        (0, 0.868407), (0, 1.088493), (0, 1.528665),
    ]
    arc = []
    for start in (0, 3, 6):
        controls = corner[start:start + 4]
        for step in range(65):
            t = step / 64
            weights = ((1 - t) ** 3, 3 * (1 - t) ** 2 * t,
                       3 * (1 - t) * t ** 2, t ** 3)
            arc.append(tuple(radius * sum(p[axis] * w for p, w in zip(controls, weights))
                             for axis in (0, 1)))
    points = []
    for turn in range(4):
        for x, y in arc:
            for _ in range(turn):
                x, y = y, TILE_SIZE - x
            points.append(((x + TILE_INSET) * scale, (y + TILE_INSET) * scale))
    mask = Image.new('L', (ICON_SIZE * scale, ICON_SIZE * scale))
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def export_editor(portrait=None):
    portrait = (portrait or Image.open(BRAND / 'mascot.png')).convert('RGBA')
    if portrait.size != (1024, 1024):
        raise ValueError('Expected the reviewed 1024 x 1024 source portrait')
    scale = 3
    # Keep the reviewed composition in its original 896-unit authoring space.
    # Scale the complete artwork together, then clip it to the app silhouette.
    artwork = portrait.resize((896 * scale, 896 * scale), Image.Resampling.LANCZOS)

    # A mint pencil distinguishes the authoring app without covering the face.
    pencil = Image.new('RGBA', (144 * scale, 432 * scale))
    draw = ImageDraw.Draw(pencil)
    def box(bounds, **options):
        draw.rounded_rectangle(tuple(v * scale for v in bounds), **options)
    def polygon(points, color):
        draw.polygon([(x * scale, y * scale) for x, y in points], fill=color)
    box((20, 12, 124, 90), radius=26 * scale, fill='#e9a5b9')
    box((20, 64, 124, 324), radius=0, fill='#8abfa7')
    box((20, 88, 46, 324), radius=0, fill='#b3d9c5')
    box((101, 88, 124, 324), radius=0, fill='#69a78e')
    box((20, 58, 124, 89), radius=0, fill='#fff4df')
    box((20, 82, 124, 89), radius=0, fill='#e4d2b8')
    polygon([(20, 324), (124, 324), (72, 414)], '#efd1a8')
    polygon([(101, 324), (124, 324), (72, 414)], '#d7b58f')
    polygon([(54, 383), (90, 383), (72, 414)], '#53454e')
    pencil = pencil.rotate(-38, resample=Image.Resampling.BICUBIC, expand=True)
    outline = pencil.getchannel('A').filter(ImageFilter.MaxFilter(12 * scale + 1))
    sticker = Image.new('RGBA', pencil.size, '#fffaf6')
    sticker.putalpha(outline)
    sticker.alpha_composite(pencil)
    position = (int(724 * scale - pencil.width / 2), int(694 * scale - pencil.height / 2))
    shade = Image.new('RGBA', pencil.size, '#53454e')
    shade.putalpha(outline.filter(ImageFilter.GaussianBlur(6 * scale)).point(lambda a: a * 0.24))
    artwork.alpha_composite(shade, (position[0], position[1] + 5 * scale))
    artwork.alpha_composite(sticker, position)

    mask = squircle_mask(scale)
    canvas = Image.new('RGBA', mask.size)
    shadow = Image.new('RGBA', mask.size, '#40363c')
    shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(8 * scale)).point(lambda a: a * 0.16))
    canvas.alpha_composite(shadow, (0, 5 * scale))
    tile = Image.new('RGBA', mask.size)
    tile.paste(artwork.resize((TILE_SIZE * scale, TILE_SIZE * scale), Image.Resampling.LANCZOS),
               (TILE_INSET * scale, TILE_INSET * scale))
    tile.putalpha(mask)
    canvas.alpha_composite(tile)
    # The highlight follows the same silhouette; no separate circular border.
    edge = Image.new('RGBA', mask.size, '#fffaf6')
    edge.putalpha(ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(2 * scale + 1))))
    canvas.alpha_composite(edge)
    canvas.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS).save(BRAND / 'quaeditor-icon.png', optimize=True)


if __name__ == '__main__':
    export_editor()
    print('Exported assets/brand/quaeditor-icon.png')
