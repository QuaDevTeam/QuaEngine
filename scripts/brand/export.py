#!/usr/bin/env python3
"""Export the reviewed mascot into brand and project assets (Pillow required)."""
from pathlib import Path
import argparse
import shutil
from PIL import Image, ImageDraw, ImageFont

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

    for name in ('quaengine-icon', 'quadevteam-icon'):
        save(portrait, BRAND / f'{name}.png')
    save(resized(64), BRAND / 'quaengine-favicon.png')

    # An opaque light title card stays legible in both GitHub color schemes.
    banner = Image.new('RGB', (1280, 640), '#f7faff')
    d = ImageDraw.Draw(banner)
    d.ellipse((980, -260, 1530, 280), fill='#f0eafa')
    d.ellipse((-270, 365, 320, 955), fill='#e2f5fa')
    d.rounded_rectangle((20, 20, 1260, 620), radius=32, outline='#dce5f2', width=2)
    d.rounded_rectangle((47, 57, 567, 583), radius=34, fill='#e0edf6')
    mask = Image.new('L', (512, 512))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 511, 511), radius=28, fill=255)
    banner.paste(resized(512), (44, 52), mask)
    d = ImageDraw.Draw(banner)
    d.text((607, 111), 'VISUAL NOVEL ENGINE', font=font(21), fill='#697693')
    d.text((602, 175), 'QuaEngine', font=fit_font('QuaEngine', 101, 595), fill='#263b66')
    d.rounded_rectangle((607, 286, 721, 293), radius=3, fill='#79d5e3')
    d.rounded_rectangle((729, 286, 786, 293), radius=3, fill='#efb2d1')
    d.text((606, 326), 'A home for your', font=font(34), fill='#465b7b')
    d.text((606, 371), 'next visual novel.', font=font(34), fill='#465b7b')
    d.text((608, 443), 'TypeScript  /  QuaScript', font=font(24), fill='#697693')
    d.text((608, 482), 'WEB  /  COCOS  /  NATIVE', font=font(19), fill='#697693')
    d.rounded_rectangle((605, 540, 879, 579), radius=19, fill='#e9e3f7')
    d.text((624, 549), 'WIP  /  IN DEVELOPMENT', font=font(17), fill='#675285')
    star(d, 1155, 370, 21, '#8cdde7')
    star(d, 1192, 401, 10, '#ebb3d1')
    save(banner, BRAND / 'quaengine-banner.png')

    org = Image.new('RGB', (960, 320), '#f7faff')
    mask = Image.new('L', (280, 280))
    ImageDraw.Draw(mask).ellipse((0, 0, 279, 279), fill=255)
    org.paste(resized(280), (20, 20), mask)
    d = ImageDraw.Draw(org)
    d.text((336, 99), 'QuaDevTeam', font=fit_font('QuaDevTeam', 84, 580), fill='#263b66')
    d.text((340, 203), 'The team behind QuaEngine', font=font(25), fill='#697693')
    save(org, BRAND / 'quadevteam-logo.png')

    destinations = [ROOT / 'demo/public', ROOT / 'packages/build/create-qua-game/templates/visual-novel-vue/assets/app']
    for directory in destinations:
        save(resized(512), directory / 'icon.png')
        shutil.copyfile(BRAND / 'quaengine-favicon.png', directory / 'favicon.png')
    print('Exported avatars, banner, wordmark, and demo/starter icons.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', type=Path, required=True, help='Local TrueType font used for wordmarks; no font file is bundled.')
    export(parser.parse_args().font)
