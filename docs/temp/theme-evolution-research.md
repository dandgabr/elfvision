# Theme evolution: individual research and native handoff

Research date: 2026-10-08. This document distinguishes source observations from the authored GNOME interpretation. The gallery CSS describes a web implementation; it is not a claim that those browser effects work in St. No gallery JavaScript, external stylesheets, font downloads or executable theme fields are imported at runtime.

## Authoritative sources and regeneration

The [style gallery](https://github.com/dandgabr/estilos-visuais) and each linked stylesheet below were consulted individually. Shipped palettes are authored in `tools/gen-themes.py` (`AUTHORED_VARIANTS`, `AUTHORED_GEOMETRY`), while effects remain in `tools/theme-effect-profiles.json`. Regenerate the 21 gallery styles with:

```sh
python3 -I tools/gen-themes.py --styles ../estilos-visuais --out themes/builtin --only themes/v1.txt
python3 -I tools/test-theme-generation.py
```

The regeneration input was the clean sibling gallery checkout at commit `fe5ef0cbff1f801e56aa16eedd1a5bc0f1357120`; online style sources were consulted on the research date.

The 22nd theme, System, is maintained directly as the native GNOME manifest and keeps the system accent. Do not overwrite it with gallery defaults. The existing effect profiles are retained: scheme-aware drawing belongs to the native renderer, not duplicated per-theme scripts.

Each theme below requires two independent captures (light/dark), with effects Off for identity and Full for ambient evidence. A source-informed brief is not rendered acceptance. An installed font's presence also does not prove the actual Pango fallback: captures must identify resolved families. Typography sources record design/provenance, not permission to expand the downloader.

## Individual briefs

### System (GNOME)

Source: [GNOME design principles](https://developer.gnome.org/hig/principles.html). Native shell typography and accent; compact rounded cards and ordinary controls are the two identity cues. Light uses white surfaces, dark elevated gray overlays. Acceptance: preserve native hierarchy and no ambient texture; use this theme as the compact geometry baseline.

### Flat Design

Source: [gallery Flat CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/flat-design.css). [Nunito Sans provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/nunitosans/METADATA.pb), [Montserrat provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/METADATA.pb). Small corners, shadow-free blocks and strong display weight distinguish it. Light is cool-white, dark is teal-gray. Acceptance: geometry stays flat in both variants; active/focus cues remain distinct without simulated elevation.

### Bento Grid

Source: [gallery Bento CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/bento-grid.css), [Plus Jakarta Sans by Tokotype](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/METADATA.pb). Broad 24px corners and inset module fields distinguish this adaptation from Card-based. Light is warm ivory; dark uses warm bronze compartments with no outer elevation shadow. Acceptance: two non-accent cues persist with effects Off. Deviation: a vertical quota list retains source/focus order instead of implementing arbitrary dashboard grid spans.

### Card-based UI

Source: [gallery Card CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/card-based-ui.css), [DM Sans by Colophon Foundry](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/METADATA.pb). Restrained 8px corners, raised individual containers and conventional reading hierarchy distinguish it. Light is white on slate; dark is layered blue-slate, not Bento's warm modules. Acceptance: compare side by side with Bento including missing-font fallback and effects Off.

### Linear SaaS

Source: [gallery Linear CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/linear-saas.css), [Inter author site](https://rsms.me/inter/). Compact typographic hierarchy, hairline separation and restrained elevation; gray-violet light/dark surfaces. Acceptance: no broad shadows or expanded gutters; default translucency is independently visible when enabled.

### AI-native / Generative UI

Source: [gallery AI-native CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/ai-native-generative-ui.css), [Geist by Vercel](https://github.com/vercel/geist-font). Soft rounded modules and compact technical labels, with blue-violet gradient behind reading actors. Light is porcelain blue; dark is layered navy. Acceptance: no animated caret, numeric font-axis breathing or generated-content hiding; ambient gradient does not affect values.

### Aurora Mesh Gradient

Source: [gallery Aurora CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/aurora-mesh-gradient.css), [Sora provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/sora/METADATA.pb). Large soft corners and luminous violet layered surfaces retain identity without ambient motion. Light is pale lilac; dark is purple-black. Acceptance: mesh/grain visible in both schemes; glass/opaque switching must not change card width. Broad web glows are reduced to bounded native shadows.

### Glassmorphism

Source: [gallery Glass CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/glassmorphism.css), [Poppins provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/METADATA.pb). Rounded panels and crisp translucent rim; light icy blue, dark midnight blue. Acceptance: verify frosted backdrop separately from plain alpha; fallback without blur stays legible and geometry-identical.

### Holographic / Foil Iridescent

Source: [gallery Holographic CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/holographic-foil-iridescent.css), [Plus Jakarta Sans provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/METADATA.pb). Reflective pale rims and smooth rounded shells; light silver-blue, dark luminous steel-blue. Acceptance: decorative glass remains visible without a giant shadow gutter; no status-color shimmer is used for decoration.

### Isometric

Source: [gallery Isometric CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/isometric.css), [Rubik provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/rubik/METADATA.pb). Small corners, strong frame and offset planes, with background grid. Light blueprint paper; dark blueprint navy. Acceptance: offset depth stays bounded; reading actors are never skewed or rotated.

### Analog Newspaper / Broadsheet

Source: [gallery Newspaper CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/analog-newspaper-broadsheet.css), [Newsreader by Production Type](https://github.com/productiontype/Newsreader). Serif hierarchy, square boxes and print rules; warm newsprint light, warm charcoal paper dark. Acceptance: visible rules survive Off, grain/rules remain visible in dark Full; serif fallback survives missing Newsreader. Decoration uses foreground ink, not the warning/accent colors.

### Hand-drawn / Sketch

Source: [gallery Hand-drawn CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/hand-drawn-sketch.css), [Patrick Hand provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/METADATA.pb), [Caveat specimen](https://fonts.google.com/specimen/Caveat), [Rough.js](https://roughjs.com/) as a silhouette reference only. Strong imperfect outlines and handwritten title hierarchy; cream notebook light, chalk-on-brown dark. Acceptance: native asymmetric borders survive Off, static pencil strokes survive dark Full. Display fallback ends in the locally resolved cursive family instead of a formal serif; body fallback intentionally remains readable sans, and numeric text uses the stable native sans role. No platform-specific font file is pinned. Deviation: compound browser radii and hover rotations become bounded native geometry; text and numbers never wobble.

### Expressive Variable Typography

Source: [gallery typography CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/expressive-variable-typography.css), [Roboto Flex project](https://github.com/googlefonts/roboto-flex). Square panels and contrasting type weight; light blush paper, dark mulberry. Acceptance: strong title/label hierarchy without excessive type sizes. Deviation: preserve stable numeric widths instead of animating variable-font axes.

### De Stijl

Source: [gallery De Stijl CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/de-stijl.css), [Archivo provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/METADATA.pb). Rectilinear frame, strong orthogonal dividers and asymmetric weight; pale neutral light, charcoal dark with bright framing. Acceptance: geometry and dividers identify it without relying solely on primary colors; quota status semantics remain reserved.

### Mid-century Modern

Source: [gallery Mid-century CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/mid-century-modern.css), [Source Serif by Adobe](https://github.com/adobe-fonts/source-serif), [Josefin Sans provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/josefinsans/METADATA.pb). Serif reading with geometric display and rounded furniture-like forms; warm parchment light, walnut dark. Acceptance: warm surface layering and typographic contrast persist in dark; grain adds material without imitating alert states.

### Web Brutalism

Source: [gallery Brutalism CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/web-brutalism.css). Conventional browser serif, square high-contrast boxes and unornamented controls; white/black counterpart. Acceptance: deliberately plain construction in both modes; no shadow, translucent material or ambient animation needed for identity. Times New Roman remains a request with local serif fallback, not a bundled font.

### Terminal TUI

Source: [gallery Terminal CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/terminal-tui.css), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono). Monospace labels, square framed compartments and scanlines; pale phosphor light, near-black phosphor dark. Acceptance: scanlines visible but unobtrusive in both modes, text contrast passes independently, no blinking reading glyphs.

### Cyberpunk

Source: [gallery Cyberpunk CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/cyberpunk.css), [Rajdhani provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/rajdhani/METADATA.pb), [Orbitron provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/orbitron/METADATA.pb). Technical display, compact corners and chamfer/frame marks; light is a daylight graphite instrument panel, dark is neon-on-navy. Acceptance: light remains technical rather than a washed-out inversion; active contrast and frame geometry identify both variants with effects Off.

### Lunarpunk

Source: [gallery Lunarpunk CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/lunarpunk.css), [Sora provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/sora/METADATA.pb), [Fraunces author project](https://github.com/undercasetype/Fraunces). Serif display with rounded lunar panels; lavender paper light, violet nocturnal dark. Acceptance: four gentle motes and translucency when enabled, stable reading layout otherwise; distinct from Aurora's geometric sans/mesh.

### Nanopunk

Source: [gallery Nanopunk CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/nanopunk.css), [Space Grotesk provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/METADATA.pb). Technical compact panels and grid/pulse rather than organic rounded cards; pale lab light, dark jade laboratory. Acceptance: pulse affects decoration only; dark grid remains visible without being mistaken for warning emphasis.

### Organic / Biophilic

Source: [gallery Organic CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/organic-biophilic.css), [Nunito provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/METADATA.pb), [Fraunces author project](https://github.com/undercasetype/Fraunces). Soft organic forms and serif display; cream/sage light, forest dark. Acceptance: paper material and eight falling leaves on Full, muted organic palette and curvature on Off; leaf visibility verified in both schemes.

### Solarpunk

Source: [gallery Solarpunk CSS](https://raw.githubusercontent.com/dandgabr/estilos-visuais/main/styles/solarpunk.css), [Nunito provenance](https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/METADATA.pb), [Fraunces author project](https://github.com/undercasetype/Fraunces). Rounded communal modules with botanical framing; straw light, olive night garden dark. Acceptance: botanical texture distinguishes it from Organic paper, eight leaves visible in Full, brighter warm surfaces distinguish the static counterpart.

## Implementation evidence and remaining acceptance

The generator regression was observed failing before implementation (missing authored variants, identical Bento/Card dark reading surfaces, missing editorial/sketch geometry). All six Python regression checks now pass. The additional background-readout regression was observed failing for Solarpunk light (secondary ink 4.402:1 on the popup background), then passed after strengthening that authored secondary ink; all 21 gallery pairs now meet 4.5:1 for foreground and secondary text on the popup background as well as the existing card targets. An earlier GJS implementation checkpoint, after compiling the new settings schema, reported 559 passed and 0 failed. The [final validation](reviews/2026-10-08-popup-theme-evolution.md) records the integrated suite, native captures and review closure separately. An earlier concurrent run saw stale-schema failures; it is superseded by that complete successful run. Generation reports 21 gallery themes and zero contrast failures; text targets remain 7:1, secondary/status 4.5:1, accent 3:1, accent text 4.5:1 against card surfaces. System retains its separately authored native colors.

There are no automatic new font installations. Unsupported browser gradients, variable axes, skew, compound radii and multi-layer glow are translated into developer-owned native presets rather than raw CSS. The existing safe font installer stays unchanged. Rendered screenshot approval, real blur fallback, actual Pango-family resolution, scrolling clearance, lifecycle/performance checks and user acceptance belong to the integrated verification gate; they are not claimed by palette tests.
