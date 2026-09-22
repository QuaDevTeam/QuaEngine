#!/usr/bin/env python3
"""Export the reviewed mascot into brand and project assets (Pillow required)."""
from pathlib import Path
import argparse
import base64
import shutil
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from readme import export_readme
from editor import export_editor

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'assets/brand'


def export(font_path: Path):
    portrait = Image.open(BRAND / 'mascot.png').convert('RGB')
    if portrait.size != (1024, 1024):
        raise ValueError('Expected the reviewed 1024 x 1024 source portrait')
    def font(size):
        return ImageFont.truetype(str(font_path), size)
    def save(image, destination):
        image.save(destination, optimize=True)
    def resized(size):
        return portrait.resize((size, size), Image.Resampling.LANCZOS)
    def fit_font(text, size, width):
        while font(size).getlength(text) > width:
            size -= 1
        return font(size)
    def star(draw, x, y, radius, color):
        draw.polygon([(x, y-radius), (x+radius*.23, y-radius*.23), (x+radius, y), (x+radius*.23, y+radius*.23), (x, y+radius), (x-radius*.23, y+radius*.23), (x-radius, y), (x-radius*.23, y-radius*.23)], fill=color)

    export_readme(portrait, BRAND, font_path)
    export_editor(portrait)

    for name in ('quaengine-icon', 'quadevteam-icon'):
        save(portrait, BRAND / f'{name}.png')
    save(resized(64), BRAND / 'quaengine-favicon.png')

    # An opaque light title card stays legible in both GitHub color schemes.
    banner = Image.new('RGB', (1280, 640), '#fffaf6')
    d = ImageDraw.Draw(banner)
    d.ellipse((980, -260, 1530, 280), fill='#fbe9e9')
    d.ellipse((-270, 365, 320, 955), fill='#edf5ee')
    d.rounded_rectangle((20, 20, 1260, 620), radius=32, outline='#eddfd8', width=2)
    d.rounded_rectangle((47, 57, 567, 583), radius=34, fill='#f7e4e4')
    mask = Image.new('L', (512, 512))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 511, 511), radius=28, fill=255)
    banner.paste(resized(512), (44, 52), mask)
    d = ImageDraw.Draw(banner)
    d.text((607, 111), 'VISUAL NOVEL ENGINE', font=font(21), fill='#85717b')
    d.text((602, 175), 'QuaEngine', font=fit_font('QuaEngine', 101, 595), fill='#40363c')
    d.rounded_rectangle((607, 286, 721, 293), radius=3, fill='#a9cdb7')
    d.rounded_rectangle((729, 286, 786, 293), radius=3, fill='#e5a8bb')
    d.text((606, 326), 'A home for your', font=font(34), fill='#725d68')
    d.text((606, 371), 'next visual novel.', font=font(34), fill='#725d68')
    d.text((608, 443), 'TypeScript  /  QuaScript', font=font(24), fill='#85717b')
    d.text((608, 482), 'WEB  /  COCOS  /  NATIVE', font=font(19), fill='#85717b')
    d.rounded_rectangle((605, 540, 879, 579), radius=19, fill='#fbe9e9')
    d.text((624, 549), 'LET YOUR STORY BEGIN', font=font(17), fill='#ad4c6c')
    star(d, 1155, 370, 21, '#92c6b0')
    star(d, 1192, 401, 10, '#efb4c1')
    save(banner, BRAND / 'quaengine-banner.png')
    save(banner.resize((1200, 600), Image.Resampling.LANCZOS), BRAND / 'quaengine-social.png')
    portrait.resize((640, 640), Image.Resampling.LANCZOS).save(BRAND / 'mascot.webp', quality=90)
    portrait.resize((96, 96), Image.Resampling.LANCZOS).save(BRAND / 'avatar-96.webp', quality=90)

    org = Image.new('RGB', (960, 320), '#fffaf6')
    mask = Image.new('L', (280, 280))
    ImageDraw.Draw(mask).ellipse((0, 0, 279, 279), fill=255)
    org.paste(resized(280), (20, 20), mask)
    d = ImageDraw.Draw(org)
    d.text((336, 99), 'QuaDevTeam', font=fit_font('QuaDevTeam', 84, 580), fill='#40363c')
    d.text((340, 203), 'The team behind QuaEngine', font=font(25), fill='#85717b')
    save(org, BRAND / 'quadevteam-logo.png')

    # SVG image consumers cannot reliably load an external sibling PNG. Embed
    # the raster so existing SVG entrypoints stay portable and cannot retain
    # an obsolete mascot or development-status badge.
    wrappers = {
        'quaengine-icon.svg': resized(512),
        'quadevteam-icon.svg': resized(512),
        'quaengine-favicon.svg': resized(64),
        'quaengine-logo.svg': banner,
        'quaengine-logo-dark.svg': banner,
        'quaengine-social.svg': banner.resize((1200, 600), Image.Resampling.LANCZOS),
        'quadevteam-logo.svg': org,
        'quadevteam-logo-dark.svg': org,
    }
    for name, artwork in wrappers.items():
        data = BytesIO()
        artwork.save(data, format='PNG', optimize=True)
        encoded = base64.b64encode(data.getvalue()).decode('ascii')
        width, height = artwork.size
        label = 'QuaDevTeam' if name.startswith('quadevteam') else 'QuaEngine'
        (BRAND / name).write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{label} chibi identity">'
            f'<image href="data:image/png;base64,{encoded}" width="{width}" height="{height}"/></svg>\n'
        )

    destinations = [ROOT / 'demo/public', ROOT / 'packages/build/create-qua-game/templates/visual-novel-vue/assets/app']
    for directory in destinations:
        save(resized(512), directory / 'icon.png')
        shutil.copyfile(BRAND / 'quaengine-favicon.png', directory / 'favicon.png')
    print('Exported avatars, banner, theme-aware README covers, wordmark, and demo/starter icons.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', type=Path, required=True, help='Local TrueType font used for wordmarks; no font file is bundled.')
    export(parser.parse_args().font)
