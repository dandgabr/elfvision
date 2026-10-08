#!/usr/bin/env python3
"""Compare unmodified private native captures; screenshot count is not a visual gate."""
import json
import os
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
folder = root / '.superpowers/sdd/2026-10-07-post-mvp-execution'
prefix = 'dark-' if os.getenv('GAQ_EFFECTS_SCHEME') == 'dark' else ''
metadata = json.loads((folder / f'effects-{prefix}visual.json').read_text())
if metadata.get('error') or not metadata.get('finished'):
    raise SystemExit('Native visual capture did not finish')

def load(name):
    return Image.open(folder / f'effects-{prefix}{name}.png').convert('RGB')

def difference(a, b, region):
    x, y, w, h = region
    return sum(abs(a.getpixel((j, k))[c] - b.getpixel((j, k))[c])
               for k in range(y, y+h) for j in range(x, x+w) for c in range(3)) / (w*h*3)

def edges(image, region):
    x, y, w, h = region
    horizontal = sum(abs(image.getpixel((j, k))[c] - image.getpixel((j+1, k))[c])
                     for k in range(y, y+h) for j in range(x, x+w-1) for c in range(3))
    vertical = sum(abs(image.getpixel((j, k))[c] - image.getpixel((j, k+1))[c])
                   for k in range(y, y+h-1) for j in range(x, x+w) for c in range(3))
    return (horizontal + vertical) / (((w-1)*h + (h-1)*w)*3)

translucent, decorative, frost = map(load, ['translucent', 'decorative-glass', 'frosted-glass'])
region = metadata['popupRegion']
controlled = [270, 160, 100, 120]
outside = [200, 160, 30, 120]
metrics = {
    'popupRegion': region,
    'popupTranslucentEdge': edges(translucent, region),
    'popupFrostEdge': edges(frost, region),
    'popupDecorativeDifference': difference(translucent, decorative, region),
    'popupFrostDifference': difference(translucent, frost, region),
    'popupMovingWindowDifference': difference(frost, load('frost-moving'), region),
    'leafPhaseDifference': difference(load('leaves'), load('leaves-phase'), metadata['leafRegion']),
    'outsideBlurDifference': difference(translucent, frost, outside),
    'controlTranslucentEdge': edges(load('control-translucent'), controlled),
    'controlFrostEdge': edges(load('control-frosted-glass'), controlled),
    'controlMovingWindowDifference': difference(load('control-frosted-glass'), load('control-frost-moving'), [500, 160, 120, 240]),
    'controlOutsideDifference': difference(load('control-translucent'), load('control-frosted-glass'), outside),
}
if metrics['popupTranslucentEdge'] <= 0.1:
    raise SystemExit('Unblurred backdrop lacks measurable checker edges: ' + json.dumps(metrics))
if not (metrics['popupFrostEdge'] < metrics['popupTranslucentEdge'] * 0.5):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
if not (metrics['popupDecorativeDifference'] > 0.01):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
if not (metrics['popupFrostDifference'] > 0.1):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
if not (metrics['popupMovingWindowDifference'] > 0.1):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
if not (metrics['leafPhaseDifference'] > 0.01):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
if not (metrics['outsideBlurDifference'] == 0):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
if not (metrics['controlFrostEdge'] < metrics['controlTranslucentEdge'] * 0.5):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
if not (metrics['controlMovingWindowDifference'] > 0.1):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
if not (metrics['controlOutsideDifference'] == 0):
    raise SystemExit('Visual gate failed: ' + json.dumps(metrics))
(folder / f'effects-{prefix}image-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
print('GAQ_EFFECTS_IMAGE_OK: ' + json.dumps(metrics))
