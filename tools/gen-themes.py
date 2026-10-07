#!/usr/bin/env python3
"""Generate gnome-ai-quota theme files from the estilos-visuais style gallery.

Each gallery style defines design tokens for ONE color scheme (33 dark, 39 light).
This tool reads those tokens, derives the missing scheme in OKLCH, corrects
contrast automatically, and writes one theme.json per style.

Usage:
    python3 -I tools/gen-themes.py --styles /path/to/estilos-visuais \
        --out themes/builtin [--only themes/v1.txt]

Contrast targets (WCAG): text 7:1, secondary text and status colors 4.5:1,
accent 3:1, text on accent 4.5:1, all measured against the card surface.
The command exits with status 1 when any generated scheme still fails.
"""
import argparse
import json
import math
import pathlib
import re
import sys

# ---------------------------------------------------------------- colors

def parse(value):
    """Parse #hex, rgb()/rgba() or 'transparent' into (r, g, b, a) or None."""
    if value is None:
        return None
    value = value.strip().lower()
    if value == 'transparent':
        return (0, 0, 0, 0.0)
    m = re.fullmatch(r'#([0-9a-f]{3,8})', value)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (r, g, b, a)
    m = re.fullmatch(r'rgba?\(([^)]+)\)', value)
    if m:
        parts = [p for p in re.split(r'[\s,/]+', m.group(1).strip()) if p]
        rgb = [float(p[:-1]) * 2.55 if p.endswith('%') else float(p) for p in parts[:3]]
        a = 1.0
        if len(parts) > 3:
            a = float(parts[3][:-1]) / 100 if parts[3].endswith('%') else float(parts[3])
        return (rgb[0], rgb[1], rgb[2], a)
    return None


def over(fg, bg):
    """Alpha-composite fg over an opaque bg."""
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def _lin(x):
    x /= 255
    return x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4


def _unlin(x):
    x = 12.92 * x if x <= .0031308 else 1.055 * (x ** (1 / 2.4)) - .055
    return max(0, min(1, x)) * 255


def luminance(c):
    return .2126 * _lin(c[0]) + .7152 * _lin(c[1]) + .0722 * _lin(c[2])


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)


def to_oklch(c):
    r, g, b = _lin(c[0]), _lin(c[1]), _lin(c[2])
    l = .4122214708 * r + .5363325363 * g + .0514459929 * b
    m = .2119034982 * r + .6806995451 * g + .1073969566 * b
    s = .0883024619 * r + .2817188376 * g + .6299787005 * b
    l, m, s = (math.copysign(abs(x) ** (1 / 3), x) for x in (l, m, s))
    big_l = .2104542553 * l + .793617785 * m - .0040720468 * s
    a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s
    bb = .0259040371 * l + .7827717662 * m - .808675766 * s
    return big_l, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def from_oklch(big_l, chroma, hue):
    """OKLCH to sRGB, reducing chroma until the color is inside the gamut."""
    for _ in range(40):
        a = chroma * math.cos(math.radians(hue))
        b = chroma * math.sin(math.radians(hue))
        l_ = big_l + .3963377774 * a + .2158037573 * b
        m_ = big_l - .1055613458 * a - .0638541728 * b
        s_ = big_l - .0894841775 * a - 1.291485548 * b
        l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
        r = 4.0767416621 * l - 3.3077115913 * m + .2309699292 * s
        g = -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s
        bl = -.0041960863 * l - .7034186147 * m + 1.707614701 * s
        if all(-.0005 <= x <= 1.0005 for x in (r, g, bl)):
            break
        chroma *= .93
    return (_unlin(r), _unlin(g), _unlin(bl), 1.0)


def to_hex(c):
    return '#%02x%02x%02x' % tuple(int(round(max(0, min(255, x)))) for x in c[:3])


def tune(big_l, chroma, hue, against, target, toward):
    """Move lightness (+1 lighter, -1 darker) until contrast with `against` is met."""
    for _ in range(80):
        color = from_oklch(big_l, chroma, hue)
        if contrast(color, against) >= target:
            return color
        big_l = max(0, min(1, big_l + .012 * toward))
        if big_l in (0, 1):
            break
    return from_oklch(big_l, chroma, hue)


# ---------------------------------------------------------------- input

TOKEN_RE = re.compile(r'--([a-z0-9-]+)\s*:\s*([^;{}]+);')
IMPORT_RE = re.compile(r"@import url\('([^']+)'\)")
GROUP_RE = re.compile(r"\.\.\.g\('([^']+)',\s*\[(.*?)\n\s*\]\)", re.S)
ITEM_RE = re.compile(r"\['([^']+)',\s*'([^']*)',\s*'((?:[^'\\]|\\.)*)'")

# Estimated difficulty of painting the style in St (see docs/adr/0006-theming.md).
HARD = {
    'glassmorphism', 'aurora-mesh-gradient', 'fluid-liquid-morph', 'holographic-foil-iridescent',
    '3d-immersive-webgl', 'glitch', 'cyberpunk', 'ai-native-generative-ui', 'kinetic-typography',
    'parallax-scrolling', 'scrollytelling', 'isometric', 'grain-noise-texture',
    'vaporwave-synthwave', 'frutiger-aero', 'claymorphism', 'neumorphism', 'skeuomorphism',
    'weirdcore-dreamcore', 'collage-scrapbook', 'hand-drawn-sketch', 'psychedelic-60s',
    'pop-art-halftone', 'gothicpunk', 'steampunk', 'clockpunk', 'biopunk', 'nanopunk',
    'dieselpunk', 'atompunk', 'cassette-futurism', 'y2k-revival', 'gradient-duotone',
    'dungeon-synth-dark-fantasy', 'art-nouveau-arts-crafts', 'silkpunk', 'sandalpunk',
    'lunarpunk', 'maximalism', 'micro-interactions', 'organic-biophilic', 'solarpunk',
    'kawaii-pastel-soft', 'acid-anti-design', 'broken-grid',
}
MEDIUM = {
    'neo-brutalism', 'web-brutalism', 'brutalist-monochrome', 'terminal-tui',
    'blueprint-cad-schematic', 'retro-computing-pixel', 'art-deco', 'bauhaus', 'de-stijl',
    'memphis', 'risograph-zine', 'material-you', 'constructivism-propaganda',
    'analog-newspaper-broadsheet', 'editorial-archive-luxury',
    'expressive-variable-typography', 'indie-web-revival', 'mid-century-modern',
    'bento-grid', 'split-screen-dualism',
}
DEFAULT_MONO = "ui-monospace,'JetBrains Mono',monospace"


def read_styles(repo):
    styles = {}
    for css in sorted((repo / 'styles').glob('*.css')):
        slug = css.stem
        if slug == 'base':
            continue
        text = css.read_text(encoding='utf-8')
        m = re.search(r'#stage\[data-style="%s"\]\s*\{(.*?)\}' % re.escape(slug), text, re.S)
        if not m:
            print(f'warning: no token block in {css.name}', file=sys.stderr)
            continue
        tokens = {k: v.strip() for k, v in TOKEN_RE.findall(m.group(1))}
        tokens['_imports'] = IMPORT_RE.findall(text)
        styles[slug] = tokens
    return styles


def read_registry(repo):
    meta = {}
    text = (repo / 'styles' / 'registry.js').read_text(encoding='utf-8')
    for gm in GROUP_RE.finditer(text):
        for im in ITEM_RE.finditer(gm.group(2)):
            meta[im.group(1)] = {'name': im.group(2), 'group': gm.group(1),
                                 'description': im.group(3).replace("\\'", "'")}
    return meta


def is_hard_shadow(shadow):
    return bool(re.search(r'(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+0(?:px)?(?:\s|$)', shadow or ''))


def recolor_shadow(shadow, color):
    return re.sub(r'#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)', color, shadow)


def hue_gap(a, b):
    """Smallest angle between two hues, in degrees."""
    d = abs(a - b) % 360
    return min(d, 360 - d)


MIN_ACCENT_GAP = 35   # degrees of hue between the accent and warn or danger
MIN_STATE_GAP = 25    # the same, for the error color
MIN_BORDER_RATIO = 1.4


def refine(scheme):
    """Keep the accent apart from the state colors, add an error color, and keep
    the card border visible. Returns the list of changed keys."""
    changed = []
    sf = parse(scheme['surface'])
    toward = +1 if luminance(sf) < .4 else -1
    warn_h = to_oklch(parse(scheme['warn']))[2]
    danger_h = to_oklch(parse(scheme['danger']))[2]

    # An accent too close to warn or danger makes a normal bar look like a problem.
    l_ac, c_ac, h_ac = to_oklch(parse(scheme['accent']))
    if min(hue_gap(h_ac, warn_h), hue_gap(h_ac, danger_h)) < MIN_ACCENT_GAP and c_ac > .03:
        best = max((230, 255, 200, 285, 160),
                   key=lambda h: min(hue_gap(h, warn_h), hue_gap(h, danger_h)))
        scheme['accent'] = to_hex(tune(l_ac, max(c_ac, .12), best, sf, 3, toward))
        changed.append('accent')

    # error: a hue away from warn and danger, readable on the surface.
    ok_h = to_oklch(parse(scheme['ok']))[2]
    def state_gap(h):
        return min(hue_gap(h, warn_h), hue_gap(h, danger_h))
    # Orange reads as "trouble but not a quota problem"; fall back to violet or teal.
    candidates = (55, 320, 290, 200)
    best_h = next((h for h in candidates if state_gap(h) >= MIN_STATE_GAP), max(candidates, key=state_gap))
    lightness = .80 if toward > 0 else .52
    scheme['error'] = to_hex(tune(lightness, .14, best_h, sf, 4.5, toward))
    changed.append('error')

    # A hairline border the eye can find.
    bd = parse(scheme['border'])
    if contrast(bd, sf) < MIN_BORDER_RATIO and contrast(bd, sf) < 4:
        lightness, chroma, hue = to_oklch(bd)
        scheme['border'] = to_hex(tune(lightness, chroma, hue, sf, MIN_BORDER_RATIO, toward))
        changed.append('border')
    return changed


# ---------------------------------------------------------------- build

def token(tokens, key, fallback):
    return parse(tokens.get(key)) or parse(fallback)


def build_theme(slug, tokens, meta):
    bg = token(tokens, 'bg', '#f6f6f4')
    if bg[3] < 1:
        bg = over(bg, (255, 255, 255, 1))
    surface = over(token(tokens, 'surface', '#ffffff'), bg)
    surface2 = over(token(tokens, 'surface-2', '#efefec'), bg)
    fg = over(token(tokens, 'fg', '#1a1a1a'), bg)
    muted = over(token(tokens, 'muted', '#666666'), bg)
    accent = token(tokens, 'accent', '#2d5bff')
    accent_fg = token(tokens, 'accent-fg', '#ffffff')
    border = over(token(tokens, 'border', '#d8d8d4'), bg)
    ok = token(tokens, 'ok', '#1a8f4c')
    warn = token(tokens, 'warn', '#c27a00')
    danger = token(tokens, 'danger', '#c93030')

    l_bg, c_bg, h_bg = to_oklch(bg)
    l_ac, c_ac, h_ac = to_oklch(accent)
    native = 'dark' if l_bg < .55 else 'light'
    strong_border = contrast(border, bg) >= 4.0
    shadow_native = tokens.get('shadow', 'none')

    def pack(bgc, sfc, sf2c, fgc, muc, bdc, acc, acfc, okc, wac, dac, shadow):
        return {'bg': to_hex(bgc), 'surface': to_hex(sfc), 'surface-2': to_hex(sf2c),
                'fg': to_hex(fgc), 'muted': to_hex(muc), 'border': to_hex(bdc),
                'accent': to_hex(acc), 'accent-fg': to_hex(acfc), 'ok': to_hex(okc),
                'warn': to_hex(wac), 'danger': to_hex(dac), 'shadow': shadow}

    def fix_contrast(scheme):
        """Raise failing colors to the targets. Returns the list of changed keys."""
        changed = []
        sf = parse(scheme['surface'])
        toward = +1 if luminance(sf) < .4 else -1

        def check(key, target):
            color = parse(scheme[key])
            if contrast(color, sf) < target:
                lightness, chroma, hue = to_oklch(color)
                scheme[key] = to_hex(tune(lightness, chroma, hue, sf, target, toward))
                changed.append(key)

        for key, target in (('fg', 7), ('muted', 4.5), ('ok', 4.5), ('warn', 4.5),
                            ('danger', 4.5), ('accent', 3)) + ((('error', 4.5),) if 'error' in scheme else ()):
            check(key, target)
        acc, acf = parse(scheme['accent']), parse(scheme['accent-fg'])
        if contrast(acc, acf) < 4.5:
            dark_ink = (13, 13, 18, 1)
            scheme['accent-fg'] = '#0d0d12' if contrast(acc, dark_ink) >= contrast(acc, (255, 255, 255, 1)) else '#ffffff'
            if contrast(acc, parse(scheme['accent-fg'])) < 4.5:
                changed.append('accent-fg')
        return changed

    # Native scheme: keep the style's own tokens, only fixing contrast.
    scheme_native = pack(bg, surface, surface2, fg, muted, border,
                         over(accent, bg), over(accent_fg, over(accent, bg)),
                         over(ok, bg), over(warn, bg), over(danger, bg), shadow_native)
    fixed_native = refine(scheme_native) + fix_contrast(scheme_native)

    # Derived scheme: the opposite of the native one, built in OKLCH.
    hue = h_bg if c_bg > .012 else h_ac
    accent_hue, accent_chroma = (h_ac, c_ac) if c_ac >= .03 else (h_bg if c_bg > .03 else 260, .13)
    if native == 'light':   # derive dark
        tint = min(.035, c_bg * .9) if c_bg > .012 else .006
        d_bg, d_sf, d_sf2 = from_oklch(.17, tint, hue), from_oklch(.215, tint, hue), from_oklch(.26, tint, hue)
        d_fg, d_muted = from_oklch(.95, .008, hue), from_oklch(.74, .014, hue)
        d_border = over((d_fg[0], d_fg[1], d_fg[2], .55 if strong_border else .15), d_bg)
        d_accent = from_oklch(min(.82, max(l_ac, .70)), min(accent_chroma, .17), accent_hue)
        levels = (.80, .84, .76)
    else:                   # derive light
        tint = min(.016, c_bg * .5) if c_bg > .012 else .004
        d_bg, d_sf, d_sf2 = from_oklch(.975, tint, hue), from_oklch(.995, tint * .5, hue), from_oklch(.955, tint, hue)
        d_fg, d_muted = from_oklch(.21, .012, hue), from_oklch(.46, .015, hue)
        d_border = over((d_fg[0], d_fg[1], d_fg[2], .7 if strong_border else .14), d_bg)
        d_accent = from_oklch(min(.52, l_ac), min(accent_chroma, .2), accent_hue)
        levels = (.52, .52, .52)

    def status(color, lightness):
        _, chroma, status_hue = to_oklch(color)
        return from_oklch(lightness, min(max(chroma, .08), .17), status_hue)

    d_ok = status(over(ok, bg), levels[0])
    d_warn = status(over(warn, bg), levels[1])
    d_danger = status(over(danger, bg), levels[2])
    ink = (13, 13, 18, 1)
    d_accent_fg = ink if contrast(d_accent, ink) >= contrast(d_accent, (255, 255, 255, 1)) else (255, 255, 255, 1)
    if is_hard_shadow(shadow_native):
        d_shadow = recolor_shadow(shadow_native, to_hex(d_fg))
    else:
        d_shadow = '0 1px 2px rgba(0,0,0,.45)' if native == 'light' else '0 1px 3px rgba(0,0,0,.14)'
    scheme_derived = pack(d_bg, d_sf, d_sf2, d_fg, d_muted, d_border, d_accent, d_accent_fg,
                          d_ok, d_warn, d_danger, d_shadow)
    fixed_derived = refine(scheme_derived) + fix_contrast(scheme_derived)

    other = 'dark' if native == 'light' else 'light'
    schemes = {native: scheme_native, other: scheme_derived}
    adjusted = {native: fixed_native, other: fixed_derived}

    def audit(scheme):
        s = parse(scheme['surface'])
        return {
            'fg': round(contrast(parse(scheme['fg']), s), 1),
            'muted': round(contrast(parse(scheme['muted']), s), 1),
            'accent': round(contrast(parse(scheme['accent']), s), 1),
            'accent-fg': round(contrast(parse(scheme['accent-fg']), parse(scheme['accent'])), 1),
            'ok': round(contrast(parse(scheme['ok']), s), 1),
            'warn': round(contrast(parse(scheme['warn']), s), 1),
            'danger': round(contrast(parse(scheme['danger']), s), 1),
            'error': round(contrast(parse(scheme['error']), s), 1),
        }

    imports = tokens.get('_imports') or []
    info = meta.get(slug, {'name': slug, 'group': 'Other', 'description': ''})
    return {
        'id': slug,
        'name': info['name'],
        'nativeScheme': native,
        'difficulty': 'hard' if slug in HARD else ('medium' if slug in MEDIUM else 'easy'),
        'schemes': schemes,
        'adjusted': adjusted,
        'audit': {k: audit(v) for k, v in schemes.items()},
        'fonts': {
            'body': tokens.get('font-body', 'system-ui,sans-serif'),
            'display': tokens.get('font-display', tokens.get('font-body', 'system-ui,sans-serif')),
            'mono': tokens.get('font-mono', DEFAULT_MONO),
            'googleFontsUrl': imports[0] if imports else '',
        },
        'radius': {'card': tokens.get('radius', '10px'), 'control': tokens.get('radius-sm', '6px')},
        'border': 'strong' if strong_border else 'hairline',
        'hardShadow': is_hard_shadow(shadow_native),
    }


def failures(theme):
    limits = {'fg': 7, 'muted': 4.5, 'accent': 3, 'accent-fg': 4.5, 'ok': 4.5, 'warn': 4.5, 'danger': 4.5, 'error': 4.5}
    return [(theme['id'], scheme, key, value)
            for scheme, ratios in theme['audit'].items()
            for key, value in ratios.items() if value < limits[key]]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--styles', required=True, type=pathlib.Path, help='path to a clone of estilos-visuais')
    parser.add_argument('--out', required=True, type=pathlib.Path, help='output directory for theme.json files')
    parser.add_argument('--only', type=pathlib.Path, help='text file with one style slug per line')
    args = parser.parse_args()

    styles = read_styles(args.styles)
    meta = read_registry(args.styles)
    wanted = None
    if args.only:
        wanted = [line.strip() for line in args.only.read_text(encoding='utf-8').splitlines()
                  if line.strip() and not line.startswith('#')]
        missing = [slug for slug in wanted if slug not in styles]
        if missing:
            print('error: unknown styles: ' + ', '.join(missing), file=sys.stderr)
            return 2

    themes = [build_theme(slug, styles[slug], meta) for slug in (wanted or styles)]
    args.out.mkdir(parents=True, exist_ok=True)
    for theme in themes:
        (args.out / theme['id']).mkdir(exist_ok=True)
        (args.out / theme['id'] / 'theme.json').write_text(
            json.dumps(theme, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    bad = [f for theme in themes for f in failures(theme)]
    dark = sum(1 for t in themes if t['nativeScheme'] == 'dark')
    print(f'{len(themes)} themes written to {args.out} ({dark} native dark, {len(themes) - dark} native light)')
    print(f'contrast failures after correction: {len(bad)}')
    for item in bad:
        print('  ', item)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
