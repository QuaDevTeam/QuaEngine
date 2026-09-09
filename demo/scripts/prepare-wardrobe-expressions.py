"""Transfer approved facial acting onto generated outfits using stable hair landmarks.

This is offline asset preparation, never a runtime outfit resolver. Clothing,
hands, body and soft alpha come from the reviewed generated outfit. Only the
face interior is composited; no pose is relabeled as another pose. Requires
Pillow, numpy and OpenCV. Inspect candidates before publishing them.
"""
import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('expression_regions', Path(__file__).with_name('prepare-expression-layers.py'))
regions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(regions)


def rgb_crop(image, box):
    white = Image.new('RGBA', (256, 256), 'white')
    white.alpha_composite(image.crop(box))
    return np.asarray(white.convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS))


def prepare(job):
    character = job['character']
    ident = job['id']
    base_path = ROOT / job['candidate']
    base = Image.open(base_path).convert('RGBA')
    assert base.size == (768, 1536)
    old = Image.open(ROOT / job['source']).convert('RGBA')
    box = regions.BOXES[character]
    mask = Image.new('L', (256, 256))
    ImageDraw.Draw(mask).polygon(regions.FACES[character], fill=255)
    excluded = np.asarray(mask.filter(ImageFilter.MaxFilter(25)).resize((1024, 1024)))
    old_rgb, new_rgb = rgb_crop(old, box), rgb_crop(base, box)
    sift = cv2.SIFT_create(nfeatures=4000)
    k1, d1 = sift.detectAndCompute(cv2.cvtColor(old_rgb, cv2.COLOR_RGB2GRAY), 255-excluded)
    k2, d2 = sift.detectAndCompute(cv2.cvtColor(new_rgb, cv2.COLOR_RGB2GRAY), None)
    assert d1 is not None and d2 is not None, f'{ident}: missing hair landmarks'
    pairs = cv2.BFMatcher().knnMatch(d1, d2, k=2)
    matches = [a for pair in pairs if len(pair) == 2 for a, b in [pair] if a.distance < .72*b.distance]
    correlation = None
    if job.get('alignmentMethod') == 'reviewed-masked-ecc':
        # Explicit opt-in after inspecting both crops. Dense hair correlation
        # handles small redraws for which sparse SIFT matches are ambiguous.
        correlation, inverse = cv2.findTransformECC(
            cv2.cvtColor(new_rgb, cv2.COLOR_RGB2GRAY),
            cv2.cvtColor(old_rgb, cv2.COLOR_RGB2GRAY),
            np.eye(2, 3, dtype=np.float32), cv2.MOTION_AFFINE,
            (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 250, 1e-6),
            255-excluded, 5,
        )
        matrix = cv2.invertAffineTransform(inverse)
        singular = np.linalg.svd(matrix[:, :2])[1]
        assert correlation >= .87, f'{ident}: poor dense hair correlation'
        assert np.all((singular > .94) & (singular < 1.04)), f'{ident}: excessive face deformation'
        assert singular.max()/singular.min() < 1.07, f'{ident}: excessive anisotropy'
        assert np.linalg.det(matrix[:, :2]) > 0, f'{ident}: reflected face'
        inlier_count = None
    else:
        assert len(matches) >= 8, f'{ident}: insufficient matching hair landmarks ({len(matches)})'
        matrix, inliers = cv2.estimateAffinePartial2D(
            np.float32([k1[m.queryIdx].pt for m in matches]),
            np.float32([k2[m.trainIdx].pt for m in matches]),
            method=cv2.RANSAC, ransacReprojThreshold=5,
        )
        assert matrix is not None and int(inliers.sum()) >= 8, f'{ident}: weak alignment'
        inlier_count = int(inliers.sum())
    scale = float(np.hypot(matrix[0, 0], matrix[0, 1]))
    angle = float(np.degrees(np.arctan2(matrix[1, 0], matrix[0, 0])))
    assert .85 < scale < 1.15 and abs(angle) < 5, f'{ident}: head redrawn too far ({scale}, {angle})'
    face = np.minimum(np.asarray(mask), np.asarray(mask.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(1.6))))
    warped_mask = cv2.warpAffine(np.asarray(Image.fromarray(face).resize((1024, 1024))), matrix, (1024, 1024))
    alpha = np.asarray(Image.fromarray(warped_mask).resize((256, 256), Image.Resampling.LANCZOS))
    base_alpha = np.asarray(base.crop(box))[:, :, 3]
    assert np.all(base_alpha[alpha > 0] >= 230), f'{ident}: transferred face reaches silhouette/transparent area'
    output = ROOT / job['outputDir'] / ident
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for expression in job['expressions']:
        assert not expression.startswith('pose-'), 'body actions require an independently generated outfit pose'
        source = ROOT / f'demo/assets/characters/{character}/{expression}.png'
        original = Image.open(source).convert('RGBA')
        # This transfer is valid only for approved face-only variants of neutral.
        outside = np.ones((1536, 768), dtype=bool)
        outside[box[1]:box[3], box[0]:box[2]] = False
        assert np.array_equal(np.asarray(original)[outside], np.asarray(old)[outside]), f'{character}/{expression}: body or head pose differs; generate separately'
        aligned = cv2.warpAffine(rgb_crop(original, box), matrix, (1024, 1024), borderValue=(255, 255, 255))
        patch = Image.fromarray(aligned).resize((256, 256), Image.Resampling.LANCZOS).convert('RGBA')
        patch.putalpha(Image.fromarray(alpha))
        layer = Image.new('RGBA', base.size)
        layer.alpha_composite(patch, box[:2])
        result = Image.alpha_composite(base, layer)
        result.putalpha(base.getchannel('A'))
        unchanged = np.asarray(layer)[:, :, 3] == 0
        assert np.array_equal(np.asarray(result)[unchanged], np.asarray(base)[unchanged])
        assert np.array_equal(np.asarray(result)[:, :, 3], np.asarray(base)[:, :, 3])
        path = output / f'{expression}.png'
        result.save(path)
        records.append({'expression': expression, 'faceSource': str(source.relative_to(ROOT)), 'file': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    record = {**job, 'alignment': matrix.tolist(), 'stableMatches': len(matches), 'inliers': inlier_count, 'correlation': correlation,
              'scale': scale, 'angle': angle, 'alphaUnchanged': True, 'outsideFaceUnchanged': True,
              'status': 'candidate-needs-visual-review', 'variants': records}
    (output / 'review.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n')
    print(ident, len(records), 'faces; inliers', inlier_count, 'correlation', correlation, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--jobs', type=Path, required=True)
    args = parser.parse_args()
    failed = []
    for job in json.loads(args.jobs.read_text()):
        try:
            prepare(job)
        except Exception as error:
            failed.append(job['id'])
            print(job['id'], 'REVIEW REQUIRED:', error, flush=True)
    if failed:
        raise SystemExit(1)
