"""Pack Replicate RGBA outputs; never infer or repaint the foreground matte.

Run from the repository root with Pillow, numpy and scipy installed.
The model originals and CLI prediction JSON stay in .generated/art/replicate.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / '.generated/art'
HEIGHTS = dict(rin=163, mara=172, haruka=158, mayu=171, reiko=167, yumi=153)


def prediction_image(name):
    result = json.loads((ART / 'replicate' / f'{name}-result.json').read_text())
    assert result['ok'] and result['data']['status'] == 'succeeded', name
    files = list((ART / 'replicate' / name).glob('*.png'))
    assert len(files) == 1, (name, files)
    image = Image.open(files[0]).convert('RGBA')
    return image, result['data']['id']


def pack(name, image, prediction_id, owner=None):
    pixels = np.array(image)
    if owner is not None:
        # Ownership separates two people only. Retain every model alpha value.
        pixels[~owner] = 0
    alpha = pixels[:, :, 3]
    ys, xs = np.where(alpha > 8)
    core = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    bounds = (max(0, core[0] - 8), max(0, core[1] - 8),
              min(image.width, core[2] + 8), min(image.height, core[3] + 8))
    # Threshold above measures layout only; no threshold modifies the matte.
    scale = (1400 * HEIGHTS[name] / 172) / (core[3] - core[1])
    crop = Image.fromarray(pixels).crop(bounds)
    crop = crop.resize((round(crop.width * scale), round(crop.height * scale)),
                       Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (768, 1536))
    x = (canvas.width - crop.width) // 2
    y = round(1488 - (core[3] - bounds[1]) * scale)
    assert x >= 0 and y >= 0 and y + crop.height <= canvas.height
    canvas.alpha_composite(crop, (x, y))
    out = ART / 'reviewed' / f'{name}-neutral.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    return dict(character=name, heightCm=HEIGHTS[name], canvas=[768, 1536],
                footY=1488, sourceBounds=list(bounds), sourceCoreBounds=list(core),
                scale=scale, predictionId=prediction_id, output=str(out.relative_to(ROOT)))


def main():
    pair, prediction_id = prediction_image('heroine-pair')
    alpha = np.array(pair)[:, :, 3]
    labels, _ = ndimage.label(alpha > 128)
    sizes = np.bincount(labels.ravel())
    parts = sorted(np.argsort(sizes[1:])[-2:] + 1,
                   key=lambda label: np.where(labels == label)[1].mean())
    distances = np.stack([ndimage.distance_transform_edt(labels != p) for p in parts])
    ownership = distances.argmin(axis=0)
    records = [pack(name, pair, prediction_id, ownership == i)
               for i, name in enumerate(('rin', 'mara'))]
    for name in ('haruka', 'mayu', 'reiko', 'yumi'):
        image, prediction_id = prediction_image(name)
        records.append(pack(name, image, prediction_id))
    (ART / 'replicate' / 'packed-layout.json').write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
