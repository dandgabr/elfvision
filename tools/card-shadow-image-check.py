"""Require lateral shadow pixels against a shadow-free native control."""
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

evidence = Path('.superpowers/sdd/2026-10-07-open-items/card-shadow.json')
result = json.loads(evidence.read_text())


def check(condition, message):
    if not condition:
        raise SystemExit(message)


check(result['finished'] and not result['error'] and len(result['cases']) == 2, 'Incomplete shadow capture')
for case in result['cases']:
    # The helper's installed extension path is temporary; captures live under
    # the worktree's evidence directory after that private session is removed.
    original, control = [Image.open(evidence.parent / Path(path).name).convert('RGB') for path in case['paths']]
    check(original.size == control.size, 'Control screenshot size changed')
    check(original.size == tuple(case['stage']), 'Shadow pixel gate requires stage-to-image scale 1')
    x, y, width, height = case['card']
    check(width > 100 and height > 40, 'Card is not visibly allocated')
    for side, region in case['strips'].items():
        box = tuple(round(value) for value in region)
        check(0 <= box[0] < box[2] <= original.width, 'Side shadow outside screenshot width')
        check(0 <= box[1] < box[3] <= original.height, 'Side shadow outside screenshot height')
        difference = ImageChops.difference(original.crop(box), control.crop(box))
        delta = sum(ImageStat.Stat(difference).mean) / 3
        check(delta > 0.1, f'{case["scheme"]}/{side}: no lateral shadow pixels, delta={delta}')
        print(f'{case["scheme"]}/{side}: shadow delta={delta:.3f}')
