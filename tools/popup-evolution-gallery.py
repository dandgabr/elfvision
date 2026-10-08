#!/usr/bin/env python3
"""Build an offline gallery of unchanged native screenshots and technical sheets."""
import html
import json
from pathlib import Path


def generate():
    root = Path(__file__).resolve().parents[1]
    folder = root / 'build/popup-evolution'
    captures = []
    for scheme in ('light', 'dark'):
        data = json.loads((folder / f'{scheme}-all.json').read_text())
        if not data['finished'] or data['error'] or len(data['captures']) != 154:
            raise SystemExit(f'Incomplete native matrix: {scheme}')
        captures.extend(data['captures'])
    if len({Path(row['path']).name for row in captures}) != 308:
        raise SystemExit('Duplicate capture names')
    elements = []
    for row in captures:
        name = Path(row['path']).name
        if not (folder / name).is_file():
            raise SystemExit(f'Missing native screenshot: {name}')
        x, y, width, height = [round(value) for value in row['rectangle']]
        caption = f"{row['id']} · {row['scheme']} · {row['mode']} · {row['material']} · {'transparent' if row['transparent'] else 'opaque'}"
        elements.append(f'''<article data-scheme="{row['scheme']}" data-mode="{row['mode']}" data-material="{row['material']}" data-id="{row['id']}">
<h2>{html.escape(caption)}</h2><a href="{name}" target="_blank" rel="noopener">
<div class="crop" style="width:{width}px;height:{height}px"><img alt="{html.escape(caption)}" loading="lazy" src="{name}" style="left:{-x}px;top:{-y}px"></div></a>
<p>Requested font: {html.escape(row.get('font') or '')}<br>Resolved: {html.escape(row.get('resolvedFont') or '')}</p></article>''')
    document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gnome AI Quota — native visual evidence</title><style>
body{font:16px system-ui;margin:24px;background:#eceef2;color:#18202a}h1{font-size:24px}h2{font-size:14px;max-width:420px}
nav{position:sticky;top:0;padding:12px;background:#eceef2;z-index:1;display:flex;gap:12px;flex-wrap:wrap}
select,input{font:inherit;padding:6px}main{display:flex;flex-wrap:wrap;gap:24px}article{padding:12px;background:white;border:1px solid #bbb;border-radius:8px}
.crop{position:relative;overflow:hidden;max-width:100%}.crop img{position:absolute;max-width:none}article p{font-size:12px;max-width:420px}article[hidden]{display:none}
</style><h1>Gnome AI Quota — native visual evidence</h1><p>Synthetic connectors only. Screenshots are unchanged; crops are made by the page's viewport. Click a popup to inspect its complete original frame.</p>
<nav><label>Theme <input id="theme" placeholder="Filter name"></label><label>Scheme <select id="scheme"><option value="">Both</option>light</option><option>dark</option></select></label>
<label>Effects <select id="mode"><option>full</option><option>off</option><option>subtle</option><option value="">All</option></select></label>
<label>Material <select id="material"><option>theme</option><option>translucent</option><option>decorative-glass</option><option>frosted-glass</option><option value="">All</option></select></label><span id="count"></span></nav><main>'''
    document += '\n'.join(elements)
    document += '''</main><script>
const controls=['theme','scheme','mode','material'].map(id=>document.getElementById(id));
function filter(){let shown=0;for(const card of document.querySelectorAll('article')){const [theme,scheme,mode,material]=controls.map(c=>c.value);
card.hidden=!(card.dataset.id.includes(theme)&&(!scheme||card.dataset.scheme===scheme)&&(!mode||card.dataset.mode===mode)&&(!material||card.dataset.material===material));if(!card.hidden)shown++;}
document.getElementById('count').textContent=shown+' of 308';}controls.forEach(c=>c.addEventListener('input',filter));filter();</script></html>'''
    (folder / 'index.html').write_text(document)
    # Technical contact sheets supplement originals; they never replace inspection.
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype('DejaVuSans.ttf', 12)
    ids = sorted({row['id'] for row in captures})
    for page in range(0, len(ids), 4):
        batch = ids[page:page + 4]
        sheet = Image.new('RGB', (4 * 285, len(batch) * 440), '#dddddd')
        draw = ImageDraw.Draw(sheet)
        for column, (scheme, mode) in enumerate([('light', 'off'), ('light', 'full'), ('dark', 'off'), ('dark', 'full')]):
            for index, theme_id in enumerate(batch):
                row = next(row for row in captures if row['id'] == theme_id and row['scheme'] == scheme and row['mode'] == mode and row['material'] == 'theme' and row['transparent'])
                x, y, width, height = [round(value) for value in row['rectangle']]
                image = Image.open(folder / Path(row['path']).name).convert('RGB').crop((x, y, x + width, y + height))
                image.thumbnail((275, 390), Image.Resampling.LANCZOS)
                sx, sy = column * 285 + 5, index * 440 + 40
                draw.text((sx, sy - 35), theme_id, font=font, fill='#111111')
                draw.text((sx, sy - 20), f'{scheme} / {mode}', font=font, fill='#111111')
                sheet.paste(image, (sx, sy))
        sheet.save(folder / f'contact-{page // 4 + 1}.png')
    print(f'GAQ_POPUP_GALLERY_OK: {len(captures)} original screenshots, offline gallery and six technical sheets')


if __name__ == '__main__':
    generate()
