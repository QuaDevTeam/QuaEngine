"""Lay out model-generated transparent poses without modifying their soft alpha."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'demo/.generated/art'
HEIGHTS = dict(rin=163, mara=172, haruka=158, mayu=171, reiko=167, yumi=153)


def prepare(asset_id, job=None):
    name = asset_id.split('-')[0]
    result_path = ROOT / job['generationResult'] if job else ART / 'replicate' / f'{asset_id}-remove-complete.json'
    result = json.loads(result_path.read_text())
    assert result['data']['status'] == 'succeeded'
    source = ROOT / job['generatedImage'] if job else next((ART / 'replicate/cutouts' / asset_id).glob('*.png'))
    im = Image.open(source).convert('RGBA')
    assert im.getchannel('A').getextrema()[0] == 0, 'a genuine transparent source is required'
    ys, xs = np.where(np.asarray(im)[:, :, 3] > 8)
    core = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    bounds = max(0, core[0]-8), max(0, core[1]-8), min(im.width, core[2]+8), min(im.height, core[3]+8)
    scale = 1400 * HEIGHTS[name] / 172 / (core[3]-core[1])
    crop = im.crop(bounds)
    crop = crop.resize((round(crop.width*scale), round(crop.height*scale)), Image.Resampling.LANCZOS)
    x, y = (768-crop.width)//2, round(1488-(core[3]-bounds[1])*scale)
    assert x >= 0 and y >= 0 and y+crop.height <= 1536, 'pose exceeds authored canvas'
    canvas = Image.new('RGBA', (768,1536)); canvas.alpha_composite(crop,(x,y))
    out = ROOT / job['outputDir'] if job else ART / 'pose-candidates'
    out.mkdir(parents=True, exist_ok=True)
    canvas.save(out/f'{asset_id}.png')
    record = dict(assetId=asset_id, character=name, heightCm=HEIGHTS[name], footY=1488,
                  canvas=[768,1536], source=str(source.relative_to(ROOT)), bounds=bounds,
                  scale=scale, predictionId=result['data']['id'], model=result['data'].get('model'),
                  alpha='model soft alpha retained',
                  status='candidate-needs-visual-review')
    (out/f'{asset_id}.json').write_text(json.dumps(record,indent=2)+'\n')
    print(asset_id,'candidate',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('ids',nargs='*')
    parser.add_argument('--jobs', type=Path)
    args=parser.parse_args()
    jobs=json.loads(args.jobs.read_text()) if args.jobs else [{'id': item} for item in args.ids]
    if not jobs:
        parser.error('provide asset ids or --jobs')
    for job in jobs:
        prepare(job['id'], job if args.jobs else None)
