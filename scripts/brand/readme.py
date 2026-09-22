"""Compose theme-aware README covers from the reviewed mascot; no AI calls."""
from PIL import Image, ImageDraw, ImageFont


def export_readme(portrait, directory, font_path):
    def font(size):
        return ImageFont.truetype(str(font_path), size)

    palettes = {
        'light': dict(bg='#fffaf6', ink='#40363c', muted='#806d76', accent='#b45172',
                      line='#e9dcd6', pink='#f8e5e9', mint='#e9f3ec', star='#94baa6'),
        'dark': dict(bg='#241f26', ink='#fff3f0', muted='#c5b3bd', accent='#f1adc3',
                     line='#493943', pink='#3e2b37', mint='#293d36', star='#a4cbb6'),
    }
    for mode, p in palettes.items():
        cover = Image.new('RGB', (1600, 600), p['bg'])
        d = ImageDraw.Draw(cover)
        d.ellipse((1260, -310, 1900, 330), fill=p['pink'])
        d.ellipse((-150, 510, 360, 1020), fill=p['mint'])
        d.rounded_rectangle((1, 1, 1598, 598), radius=34, outline=p['line'], width=2)
        d.text((82, 68), 'FOR THE LOVE OF STORIES', font=font(21), fill=p['muted'])
        d.text((75, 136), 'QuaEngine', font=font(130), fill=p['ink'])
        d.text((82, 312), 'A little engine.', font=font(43), fill=p['ink'])
        d.text((82, 365), 'A world of stories.', font=font(43), fill=p['accent'])
        d.line((84, 459, 720, 459), fill=p['line'], width=2)
        d.text((84, 490), 'QuaScript  /  TypeScript', font=font(24), fill=p['muted'])
        d.text((84, 531), 'WEB  /  COCOS  /  NATIVE', font=font(18), fill=p['muted'])

        # The original cream ground is intentional in both themes. Retain the
        # actual artwork instead of recoloring the character for dark mode.
        card = Image.new('RGBA', (508, 538))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle((0, 0, 507, 537), radius=24, fill='#fffaf6', outline='#ebdcd7', width=2)
        tile = portrait.resize((466, 466), Image.Resampling.LANCZOS)
        mask = Image.new('L', tile.size)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, 465, 465), radius=15, fill=255)
        card.paste(tile, (21, 19), mask)
        cd.text((37, 499), 'HELLO, STORYTELLER!', font=font(17), fill='#806d76')
        cd.text((463, 497), '+', font=font(22), fill='#b45172')
        card = card.rotate(-5, resample=Image.Resampling.BICUBIC, expand=True)
        cover.paste(card, (970, 8), card)
        d = ImageDraw.Draw(cover)
        for x, y, r, color in [(927, 113, 20, p['star']), (909, 156, 10, p['accent']), (1534, 523, 15, p['star'])]:
            d.polygon([(x, y-r), (x+r*.22, y-r*.22), (x+r, y), (x+r*.22, y+r*.22),
                       (x, y+r), (x-r*.22, y+r*.22), (x-r, y), (x-r*.22, y-r*.22)], fill=color)
        cover.save(directory / f'quaengine-readme-{mode}.png', optimize=True)
