# Post-MVP theme fidelity review

This records design intent and generated profile validation for all twenty-two built-in themes. Native rendering, wallpaper compositing, performance and human accessibility acceptance remain separate release gates. A validated profile does not prove its renderer visually reproduces the gallery.

## Canonical source and regeneration

The [gallery source](https://github.com/dandgabr/estilos-visuais/tree/fe5ef0cbff1f801e56aa16eedd1a5bc0f1357120/styles) checkout was verified at `fe5ef0cbff1f801e56aa16eedd1a5bc0f1357120`. The canonical shipped effect source is `tools/theme-effect-profiles.json`: twenty-two reviewed, bounded data profiles independent of gallery JavaScript. `tools/gen-themes.py` injects those profiles only after the existing token/OKLCH/contrast pipeline. `themes/v1.txt` lists twenty-one gallery styles. The System theme is manually authored and was changed separately to use opaque ordinary interactions with no ambient texture or particles.

The nineteen existing generated themes changed only by receiving their reviewed `effects` field; existing color, typography and geometry token outputs were preserved. The two new files, Organic/Biophilic and Glassmorphism, were generated from their corresponding pinned gallery CSS. No generated theme JSON was edited by hand.

```sh
python3 -I tools/gen-themes.py --styles /tmp/gaq-style-reference-fe5ef0c \
    --out themes/builtin --only themes/v1.txt
```

The default profile input is the canonical source next to the generator. `--effect-profiles` permits an explicit source for developer verification. Invalid/unknown fields, presets, material lists, non-finite/out-of-range opacity and invalid particle counts are rejected before any output is written. This stricter developer-data gate complements the runtime validator's safe fallback behavior.

## Verification evidence

Tests preceded generator/source/catalog changes: **17 passed, 4 failed** for the missing exact inventory, missing canonical source and unsupported generator profile input. After integration, targeted theme tests passed **21 / 21**, and the full GJS suite passed **301 tests, zero failures**. ESLint passed.

The tests assert the exact expected twenty-two slugs rather than a bare count; every source profile passes the real pure validator without normalization changes and matches its shipped JSON. Every theme compiles in both schemes, old token-only compatibility remains covered, and policies become opaque/static for effects off, a closed popup and user origins; system reduced motion and opaque fallback are covered. Glassmorphism's three material alternatives and opaque editorial/flat exclusions are explicit assertions. Synthetic generator controls include a valid accepting profile and invalid motion, shader field and compatible-material rejections before output creation.

A second complete generation produced **twenty-one byte-identical theme files**. An independent exact-hex contrast audit (before one-decimal report rounding) found **zero failures** across both schemes of all twenty-one generated themes for text 7:1, muted/status/accent-text 4.5:1 and accent 3:1; black/white ratio 21 anchored the formula. This certifies the opaque token pairs only, not a translucent composited wallpaper or animation frame.

The profile reviews below were performed by two AI agents using the matching canonical design-domain skills and the pinned gallery CSS/effect sources. They are not human visual or pt-BR certification. Rendering primitives retain their separate owner and verification; these data profiles do not silently mark real frost complete.

## Nature, night, technical and optical profile review

## Profile decisions

| Theme | Material and compatibility | Full motion / texture | Why this fits; deliberate divergence |
| --- | --- | --- | --- |
| solarpunk | Opaque only; light/dark alpha 1 | Eight leaves / botanical | Gallery has sun/landscape gradients, leaf-shaped marks, cream solid cards and tactile pressed controls. Domain skill stresses low-energy ecological warmth. Leaves are an approved extension beyond this CSS, not a claim the gallery supplies a solarpunk leaf renderer. Keep solid reading zones; do not copy its topbar blur into quota cards. |
| lunarpunk | Translucent; optional frost; light .94, dark .88 | Four motes / none | Gallery has static stars, moon glow, layered violet surfaces and 6px card backdrop blur; skill permits sparse fireflies. Four low-intensity motes create restrained night ambience. Motion is an adaptation of the skill rather than present in this static gallery CSS. No occult navigation, new privacy claims, purple body text, or alert-colored fireflies. |
| nanopunk | Opaque only; alpha 1 | Slow pulse / grid | Gallery has fine dot lattices, hex details and cyan technical brackets; skill cautions that the genre lacks a fixed visual canon. One cached microgrid with slow decorative luminance response translates molecular-scale quiet activity. No swarm, invented scientific measurements, or status-like pulses. Pulse is a full-mode extension; the gallery itself mainly supplies static lattice styling. |
| cyberpunk | Opaque only; alpha 1 | Interaction / chamfer | Gallery has clipped HUD corners, static CRT scanlines, hard luminous accents and short pressed response. Choose the single available texture slot for corner/HUD geometry; any static scanlines remain subordinate packaged decoration if integration supports them, never a second animated effect. Exclude text decoding, indefinite telemetry loops, flashing, continuous glitch and backdrop blur. Real controls and focus rings retain their geometry. |
| terminal-tui | Opaque only; alpha 1 | Interaction / scanlines | Gallery supplies monospace numeric alignment, cell-like frames, inverse selection, static 2.5% scanlines, a 1.06s blinking cursor and delayed typewriter title. Keep static faint scanlines and immediate real text. Do not copy the cursor or `styles/fx/terminal-tui.js` text mutation. Any interaction reveal is brief; no scan sweep or smooth ambient motion. |
| aurora-mesh-gradient | Decorative glass; optional frost; light .96, dark .90 | Slow gradient / grain | Gallery supplies three color pools drifting over an 18s loop and 16px card backdrop blur. Domain skill favors slow 10–20s drift and low-opacity grain. Use one cached internal gradient surface, faint static grain and opaque quota reading zones. Default material does not sample the desktop; optional frost remains a separate native capability. No simultaneous particle field or animated blur radius. |
| holographic-foil-iridescent | Decorative glass preset only; alpha 1 in both schemes | Interaction / none | Gallery supplies static pearlescent gradients, internal specular highlights and one .6s hover sweep, plus card blur. Domain skill distinguishes opaque reflective foil from transparent glass. Reuse the internal decorative specular material at full background opacity, with theme-specific pearlescent colors; do not make this theme translucent. No pointer tracking, continuous shimmer, 3D tilt, gradient quota text or backdrop sampling. Renderer must preserve foil identity rather than apply a generic glass tint. |
| ai-native-generative-ui | Opaque only; alpha 1 | Slow gradient / none | Gallery has violet/pink internal glow and opaque white reading cards. Its effect script introduces temporary thinking labels, skeletons and streaming text. Keep only decorative slow internal light movement in full mode, with immediate stable quota text. Do not imply generation, thinking, data loading or progress when the controller is idle. |
| organic-biophilic (new) | Opaque only; alpha 1 | Eight leaves / paper | Gallery supplies warm paper/grain, botanical line work, earthy humanist type and Canvas 2D leaves/pollen. Its effect script has 28 particles and cursor wind, with per-frame canvas painting. Native adaptation uses eight cached leaf actors (hard cap twelve), time-based transforms and no cursor wind, spores or per-frame canvas. Distinct from solarpunk: paper/tactile ground rather than its sunlit civic botanical accent. |
| glassmorphism (new) | Frosted glass preferred; selectable translucent, decorative glass and frost; light .90, dark .82 | Interaction / none | Gallery's identity is translucent surfaces, 30px fixed backdrop blur, top specular borders and short elevation. Domain skill requires a distinct focus ring, reduced-transparency fallback and opaque text backing. Use one clipped native backdrop and opaque controls/reading zones. Decorative glass may be fallback but cannot satisfy real frost by renaming it. No particles, animated blur, per-card blur or tilted controls. |

The single `texture` preset cannot express every gallery ornament. Profiles choose the strongest signature instead of adding unchecked data fields or arbitrary assets. Gradient and foil colors must remain theme-specific; `texture: none` does not authorize a generic gradient on every theme.

## New theme token guidance for integration

Organic/Biophilic: retain gallery cream/leaf/terracotta identity (`#f3ecdc`, `#fbf7ec`, `#2b3a1f`, `#3f6b34` as source intent), humanist body and warm serif display intent, generous organic geometry and solid light reading surfaces. Derive its dark loam scheme through the established contrast-correction pipeline. Do not reuse the light palette unchanged for dark mode or require downloaded fonts.

Glassmorphism: retain gallery cool violet/cyan/pink optical ambience and rounded geometry, but derive safe opaque light and dark token sets. The gallery's .08–.26 white surface alpha is not suitable for unpredictable desktop backgrounds; this handoff intentionally uses .90/.82 popup tint and fully opaque local reading zones. Numeric and secondary text remain flat opaque colors rather than transparent clipped gradients. Real focus rings remain distinct from specular edge glints.

These token values are reference intent, not final approved theme JSON or measured contrast results. The integration owner must run generation, contrast tests, wallpaper checks and actual Shell visual inspection.

## Shared runtime rules

- Subtle mode uses static ambience and short interactions: no falling leaves, motes, pulse or gradient loop. Full mode enables only the profile's one ambient preset, with eight leaves or four lunar motes. Effects off is opaque/static. System reduced motion wins live.
- Background opacity applies only to material layers, never the entire popup or controls. `compatibleMaterials` is an allowlist; opaque is always the user's operational fallback.
- Warm nature, technical HUD and terminal profiles permit opaque only. Lunarpunk and aurora may offer frost without forcing it; foil stays full-alpha reflective; Glassmorphism exposes all three accepted optical materials.
- Quota cards, status text, actions and focus rings remain on guaranteed opaque reading zones. Light/dark wallpaper compositing still requires measurement. These proposed alpha values do not certify contrast.
- Decorations are non-reactive and excluded from accessible navigation. No timer, transition, blur actor or decoration work survives close, disable, theme change or lock. No panel ambience.
- Cache packaged textures; no executable theme fields, URLs or arbitrary paths. Motion is capped at 30 updates/second, textures and actors are reused, and the performance/lifecycle budgets remain release gates rather than claims in this design handoff.

## Editorial, geometric and clean profile review

## Design matrix

All profiles have zero particles. Except Linear SaaS, all use opaque material only and light/dark opacity 1. `interaction` means brief functional state transitions in both subtle and full modes, never a continuous ambient loop.

| Theme | Motion / texture | Source principles and concrete native effect | Exclusions and adaptations |
| --- | --- | --- | --- |
| sistema-gnome | Interaction / none | Standard system surface and ordinary expansion/focus transitions. Preserve native spacing, keyboard behavior and system identity. | No decorative ambience, textures or material substitution. System reduced motion wins. |
| isometric | Interaction / grid | Gallery diamond grid, flat side-face shadows and short hover lifts; skill requires upright labels and consistent axes. Cache a quiet grid behind opaque reading surfaces; use short decorative elevation on expansion. | Do not copy the gallery floating hero loop, skewed headings/badges or projected chart bars. No tilt or offset of quota text, focus rings or hit regions. Grid alone cannot certify genuine isometric art. |
| web-brutalism | None / none | Gallery explicitly disables every transition and uses raw rectangular controls, inset/outset borders and visible rules. Skill likewise requires instantaneous states. Preserve hard edges and immediate pressed/focus changes. | Deliberately choose no motion within the design matrix's maximum allowance of a brief pressed offset. Do not confuse raw Web Brutalism with playful Neo Brutalism: no bounce, soft shadows, blur or glass. |
| analog-newspaper-broadsheet | Interaction / paper | Cached faint paper ground, opaque ink-on-paper reading zones and precise section rules. Gallery uses subtle 150ms color changes; skill favors dignified functional reveals. | No particles, glass, bouncing or parallax; no multi-column reading order in the popup. Paper texture stays behind text rather than altering glyph opacity. |
| hand-drawn-sketch | Interaction / strokes | Cached deterministic margin/outline strokes, warm paper tokens and a small pressed response. Gallery rough borders and pencil underlines establish the identity. | Single texture slot chooses strokes rather than a second paper overlay. No random reseeding, repeated jitter, rotated numbers or wobbly focus outlines. Preserve clean body text and actual target geometry. |
| expressive-variable-typography | Interaction / none | Editorial display accents remain static; brief title/container reveal supplies the interaction. Gallery and skill emphasize typographic hierarchy, neutral ink and ample whitespace. | Do not import width/weight axis animation or continuous morphing into live metrics. No giant clipped headings, gradient quota text, downloaded fonts or changing numeral widths. Display identity is a token/layout responsibility, not a new texture. |
| de-stijl | Interaction / none | Opaque primary-color planes, strong orthogonal rules and short fill transitions. Gallery uses 100ms linear background changes. | No blur, glass, gradients, particles, organic movement, rotation or grid-track reflow of data. Preserve source reading order, white reading zones and black-on-yellow control labels. A generic microgrid is not its thick architectural geometry. |
| mid-century-modern | Interaction / grain | Faint cached warm grain with gentle functional lift/fade; restrained walnut/cream, teal and geometric accents. Skill supports thin grain and calm panel-like transitions. | Grain is an approved native adaptation; gallery CSS itself chiefly supplies solid warm surfaces and geometric ornaments. No wood texture over all cards, bounce, parallax, particles or translucent reading surfaces. |
| bento-grid | Interaction / none | Opaque soft tile surfaces, common gutters/radii and short expansion. Gallery supplies restrained button lifts and card response. | No media loops, count-up quotas, parallax or ambient particles. Do not reorder focus/reading order to imitate unequal gallery spans; retain readable card sizes. Geometry and hierarchy belong to existing native layout/tokens. |
| card-based-ui | Interaction / none | Opaque elevated cards with soft edges and short expansion/hover response, matching gallery resting shadows and small lifts. | No default blur, ambient loops, flip animations, masonry reordering or skeleton loading. Do not turn cards containing actions into an ambiguous whole-card target. |
| flat-design | Interaction / none | Flat solid fills and clean outlines; brief color-state transitions match the gallery 150ms background response. | No texture, glass, particles, gradients or decorative elevation. Keep visible control signifiers and focus outlines even where the gallery removes borders; flat styling must not conceal clickability. |
| linear-saas | Interaction / none | Translucent material with light .96/dark .94 tint; compatible with opaque and translucent only. Restrained static internal light, hairline decorative dividers and short focus/expansion response preserve its calm product identity. | Gallery topbar blur and .8 alpha are adapted to stronger tint without native frost. No default ambient gradient loop, particles, backdrop blur, transparent metric glyphs or generic glass styling. Strengthen meaningful control borders and retain opaque reading zones. |

A profile selects a packaged effect, not an executable recipe. Existing theme-specific palettes, typography and geometry must retain each theme's identity. `texture: none` does not authorize a generic gradient on every theme. Proposed Linear alpha values are not measured contrast certification.

## Integration constraints

Material compatibility is an allowlist: the eleven opaque profiles reject forced glass. Linear accepts only opaque/translucent. Effects off, unsupported/user origin and closed popups use opaque static policy; reduced motion disables motion live. Opacity applies solely to material decoration, never text, controls or the whole actor tree. Decorative actors are non-reactive and excluded from keyboard/accessible navigation. No timer or texture work survives popup close, disable, theme change or lock; no panel ambience.

Cache textures and reuse actors. This group needs no ambient update loop. Preserve the shared 30Hz ceiling, lifecycle and frame-time release gates. No URLs, arbitrary paths, executable fields or controller/account data enter profiles. Final light/dark contrast, wallpaper compositing and native keyboard/RTL/large-font appearance remain integration checks rather than claims in this data handoff.

## Runtime and human verification still required

Record full inventory captures for both schemes, off/subtle/full, live reduced-motion changes and opaque fallback in the actual nested Shell. Compare detailed/bright/dark/saturated wallpapers with solid reading surfaces; inspect real keyboard focus, enlarged text, narrow monitors, RTL, scrolling and Orca independently. Keep the panel opaque with no ambience. Real frost must sample only the popup backdrop without blurring controls; a decorative fallback does not satisfy that release gate. Measure lifecycle counters and the stated frame-time budgets before claiming performance acceptance.

Final catalogs, full check, preference smoke and layout checks are tracked in the Task 7 execution report. The data review above does not replace those integration results.
