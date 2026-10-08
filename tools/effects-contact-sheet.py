#!/usr/bin/env python3
"""Assemble labeled technical figures from unchanged native popup crops."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
folder = root / '.superpowers/sdd/2026-10-07-post-mvp-execution'
metadata = json.loads((folder / 'effects-inventory.json').read_text())
if not metadata.get('finished') or metadata.get('error') or len(metadata['captures']) != 44:
    raise SystemExit('Native inventory is incomplete')
try:
    font = ImageFont.truetype('DejaVuSans.ttf', 11)
except OSError:
    font = ImageFont.load_default()
for scheme in ['light', 'dark']:
    entries = [entry for entry in metadata['captures'] if entry['scheme'] == scheme]
    sheet = Image.new('RGB', (4*230, 6*355), '#dedede' if scheme == 'light' else '#303034')
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        image = Image.open(folder / Path(entry['path']).name).convert('RGB')
        x, y, w, h = entry['rectangle']
        crop = image.crop((x, y, x+w, y+h))
        crop.thumbnail((220, 320), Image.Resampling.LANCZOS)
        sx, sy = index % 4 * 230 + 5, index // 4 * 355 + 25
        sheet.paste(crop, (sx, sy))
        draw.text((sx, sy-20), entry['id'], font=font, fill='#111111' if scheme == 'light' else '#ffffff')
    sheet.save(folder / f'effects-inventory-{scheme}-sheet.png')
print('GAQ_EFFECTS_CONTACT_SHEETS_OK: 22 light +22 dark native crops; only scaled for the figure')
