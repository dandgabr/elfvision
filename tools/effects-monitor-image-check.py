#!/usr/bin/env python3
"""Actual 1.25-scale/nonzero-origin popup pixel controls; developer Pillow only."""
import json
from pathlib import Path
from PIL import Image

folder = Path(__file__).resolve().parents[1] / '.superpowers/sdd/2026-10-07-open-items'
metadata = json.loads((folder / 'monitor-effects.json').read_text())
if not metadata['finished'] or metadata['error'] or len(metadata['cases']) != 4:
    raise SystemExit('Monitor probe incomplete')

def edges(image, box):
    x, y, w, h = box
    horizontal = sum(abs(image.getpixel((j, k))[c] - image.getpixel((j + 1, k))[c]) for j in range(x, x+w-1) for k in range(y,y+h) for c in range(3))
    vertical = sum(abs(image.getpixel((j, k))[c] - image.getpixel((j, k+1))[c]) for j in range(x,x+w) for k in range(y,y+h-1) for c in range(3))
    return (horizontal+vertical) / (((w-1)*h+w*(h-1))*3)

def difference(a, b, box):
    x,y,w,h = box
    return sum(abs(a.getpixel((j,k))[c] - b.getpixel((j,k))[c]) for j in range(x,x+w) for k in range(y,y+h) for c in range(3)) / (w*h*3)

results=[]
for case in metadata['cases']:
    a,b = case['captures']
    scale=a['image'][0]/a['stage'][0]
    if abs(scale-1.25)>0.001:
        raise SystemExit('Screenshot scale mismatch')
    x,y,w,h=a['popup']
    bx,by,bw,bh=b['popup']
    if a['popup'] != b['popup']:
        raise SystemExit('Material switch changed viewport')
    # The fixture's central red stripe is deliberately flat. A left-gutter
    # sample overlapped it in dark cases after the popup's layout moved.
    # Use one fixed right-gutter region, never an adaptive search for texture.
    logical_region=[x+w-9,y+40,6,h-80]
    if a['sampleRegion'] != logical_region or b['sampleRegion'] != logical_region:
        raise SystemExit('Fixed material sample region mismatch')
    if a['scene'] != b['scene'] or a['sceneStripe'] != b['sceneStripe']:
        raise SystemExit('Material switch moved the synthetic scene')
    rx,ry,rw,rh=logical_region
    sx,sy,sw,sh=a['scene']
    tx,ty,tw,th=a['sceneStripe']
    if rw <= 0 or rh <= 0 or not (x <= rx and y <= ry and rx+rw <= x+w and ry+rh <= y+h):
        raise SystemExit('Material sample outside popup viewport')
    if not (sx <= rx and sy <= ry and rx+rw <= sx+sw and ry+rh <= sy+sh-60):
        raise SystemExit('Material sample outside textured fixture area')
    if rx < tx+tw and rx+rw > tx and ry < ty+th and ry+rh > ty:
        raise SystemExit('Material sample overlaps flat fixture stripe')
    region=[round(n*scale) for n in logical_region]
    translucent=Image.open(folder/Path(a['path']).name).convert('RGB')
    frost=Image.open(folder/Path(b['path']).name).convert('RGB')
    before,after=edges(translucent,region),edges(frost,region)
    if before<=.1 or after>=before*.5:
        raise SystemExit(f'Fractional frost positive control failed: {before} -> {after}')
    outside=[round((metadata['monitors'][1]['x']+50)*scale),180,35,100]
    outside_difference=difference(translucent,frost,outside)
    if outside_difference != 0:
        raise SystemExit(f'Outside monitor region changed: {outside_difference}')
    results.append({'scheme':case['scheme'],'rtl':case['rtl'],'large':case['large'],'region':region,'translucentEdge':before,'frostEdge':after,'outsideDifference':outside_difference})
value=metadata.get('cacheValue')
if value:
    a,b=[Image.open(folder/Path(path).name).convert('RGB') for path in value['paths']]
    region=[round(n*value['scale']) for n in value['region']]
    delta=difference(a,b,region)
    if delta < .5: raise SystemExit(f'Cached foreground value did not repaint: {delta}')
    results.append({'cacheValueDifference':delta,'region':region,'original':value['original'],'changed':value['changed']})
(folder/'monitor-image-metrics.json').write_text(json.dumps(results,indent=2)+'\n')
print('GAQ_MONITOR_IMAGE_OK: '+json.dumps(results))
