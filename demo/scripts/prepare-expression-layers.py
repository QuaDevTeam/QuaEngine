"""Align reviewed face edits to the approved sprite; never alter its outer matte.

Requires Pillow, numpy and opencv-python-headless. Writes candidates under
.generated/art/expression-candidates only. A visual review is required before
copying the layer into assets or adding it to a sprite manifest.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'demo/.generated/art'
BOXES = {'rin': (256, 152, 512, 408), 'mara': (230, 70, 486, 326),
         'haruka': (244, 186, 500, 442), 'mayu': (258, 70, 514, 326),
         'reiko': (260, 100, 516, 356), 'yumi': (266, 220, 522, 476)}
# Interior color-edit regions, not foreground/background extraction masks.
FACES = {
    'rin': [(85, 108), (137, 93), (192, 106), (205, 146), (190, 179), (148, 207), (126, 211), (97, 187), (85, 156)],
    'mara': [(69, 138), (100, 100), (144, 87), (169, 109), (176, 157), (161, 197), (135, 216), (112, 211), (82, 186)],
    'haruka': [(84, 109), (139, 91), (194, 117), (202, 153), (180, 187), (148, 215), (134, 219), (112, 198), (91, 173)],
    'mayu': [(64, 104), (103, 70), (130, 73), (153, 114), (151, 157), (136, 183), (114, 198), (89, 181), (70, 155)],
    'reiko': [(60, 119), (100, 86), (140, 86), (159, 119), (151, 170), (129, 196), (102, 210), (83, 198), (65, 161)],
    'yumi': [(64, 125), (114, 102), (170, 106), (192, 144), (185, 180), (163, 211), (130, 224), (98, 214), (76, 190)]}


def prepare(asset_id):
    name = asset_id.split('-')[0]
    source = next((ART / 'replicate/generated' / f'{asset_id}-face').glob('*.png'))
    result = json.loads((ART / 'replicate' / f'{asset_id}-face-generation-complete.json').read_text())
    assert result['data']['status'] == 'succeeded'
    base = Image.open(ROOT / f'demo/assets/characters/{name}/neutral.png').convert('RGBA')
    box = BOXES[name]
    target = Image.new('RGBA', (256, 256), 'white')
    target.alpha_composite(base.crop(box))
    target = target.convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS)
    generated = Image.open(source).convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS)
    mask = Image.new('L', (256, 256))
    ImageDraw.Draw(mask).polygon(FACES[name], fill=255)
    exclude = mask.filter(ImageFilter.MaxFilter(21)).resize((1024, 1024))
    features_mask = 255 - np.asarray(exclude)
    sift = cv2.SIFT_create(nfeatures=2500)
    k1, d1 = sift.detectAndCompute(cv2.cvtColor(np.array(generated), cv2.COLOR_RGB2GRAY), features_mask)
    k2, d2 = sift.detectAndCompute(cv2.cvtColor(np.array(target), cv2.COLOR_RGB2GRAY), features_mask)
    if d1 is None or d2 is None:
        raise ValueError(f'{asset_id}: insufficient stable hair/outline landmarks')
    matches = cv2.BFMatcher().knnMatch(d1, d2, k=2)
    good = [m for pair in matches if len(pair) == 2 for m, n in [pair] if m.distance < .72 * n.distance]
    if len(good) < 8:
        raise ValueError(f'{asset_id}: only {len(good)} stable matches; manual review needed')
    src = np.float32([k1[m.queryIdx].pt for m in good])
    dst = np.float32([k2[m.trainIdx].pt for m in good])
    matrix, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=6)
    if matrix is None or int(inliers.sum()) < 8:
        raise ValueError(f'{asset_id}: alignment could not be established')
    scale = float(np.hypot(matrix[0, 0], matrix[0, 1]))
    angle = float(np.degrees(np.arctan2(matrix[1, 0], matrix[0, 0])))
    if not .85 < scale < 1.15 or abs(angle) > 5:
        raise ValueError(f'{asset_id}: excessive redraw scale={scale:.3f}, angle={angle:.2f}')
    aligned = cv2.warpAffine(np.array(generated), matrix, (1024, 1024), borderValue=(255, 255, 255))
    aligned = Image.fromarray(aligned).resize((256, 256), Image.Resampling.LANCZOS)
    # Feather only inside the explicitly selected face. Keep alpha byte-identical.
    interior = mask.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(1.6))
    alpha = np.minimum(np.array(interior), np.array(mask))
    assert np.all(np.asarray(base.crop(box))[:, :, 3][alpha > 0] >= 250), 'edit touches outer matte'
    layer = Image.new('RGBA', base.size)
    patch = aligned.convert('RGBA'); patch.putalpha(Image.fromarray(alpha))
    layer.alpha_composite(patch, box[:2])
    composite = Image.alpha_composite(base, layer)
    composite.putalpha(base.getchannel('A'))
    assert np.array_equal(np.array(base)[:, :, 3], np.array(composite)[:, :, 3])
    unchanged = np.array(layer)[:, :, 3] == 0
    assert np.array_equal(np.array(base)[unchanged], np.array(composite)[unchanged])
    out = ART / 'expression-candidates'; out.mkdir(exist_ok=True)
    layer.save(out / f'{asset_id}-layer.png')
    composite.save(out / f'{asset_id}.png')
    record = dict(assetId=asset_id, predictionId=result['data']['id'],
                  quality=result['data']['input'].get('quality'), source=str(source.relative_to(ROOT)),
                  baseCrop=box, facePolygon=FACES[name], alignment=matrix.tolist(),
                  stableMatches=len(good), inliers=int(inliers.sum()), scale=scale, angle=angle,
                  alphaUnchanged=True, bodyUnchanged=True, status='candidate-needs-visual-review')
    (out / f'{asset_id}.json').write_text(json.dumps(record, indent=2) + '\n')
    print(asset_id, 'candidate', round(scale, 3), int(inliers.sum()), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('ids', nargs='+'); args = parser.parse_args()
    for asset_id in args.ids:
        try:
            prepare(asset_id)
        except Exception as error:
            print(asset_id, 'REVIEW REQUIRED', error, flush=True)
