# Theme, material and numeric rendering diagnosis — 2026-10-08

Initial scope: read-only production inspection after the user's manual rejection of the v0.1 visual validation. The diagnosis sections and capability table below describe the rejected baseline. Root subsequently authorized a bounded material/footer/inset correction, recorded in the final section. Root exclusively owns native sessions and the manual-regression probe; no native session was started by this agent.

The intended outcome is that the selected material produces an understandable visible result, decorative settings do not move reading content, light variants retain their theme identity, and a credit reading stays visually still while its card expands. Existing resource, contrast and Pango-width gates do not establish those outcomes.

## Confirmed material behavior and the preference mismatch

`lib/core/themeEffects.js:65` returns the quiet opaque policy whenever Effects is Off. Transparency and material preferences cannot override that branch. The renderer also disallows any effects-layer rebuild when the mode is Off (`lib/ui/themeEffects.js:114`). Thus the reported Organic light + Frosted glass + Effects Off screenshot is consistent with current policy, but the controls do not explain the dependency.

Organic / Biophilic supports **only opaque**, with opacity 1 in both schemes. Even with Effects Full and Transparency On, selecting frosted glass silently resolves to its opaque profile. `effectPolicy` accepts the requested material only if `compatibleMaterials` contains it. The global Material combo in `prefs.js:236` continues to offer every option and has no theme-specific effective-result feedback. Its static subtitle says a theme must support the material, but does not identify the current unsupported selection or the Effects Off override. The same problem affects System, Cyberpunk and most shipped themes.

Six themes support a translucent/glass material. Holographic is a seventh theme with a decorative-glass profile, but its tint opacity is **1 in both schemes**: its visible glass identity comes from the pearlescent decoration, not desktop transparency. Very high light opacities of 0.94–0.96 in other profiles also make desktop transmission faint. No new raster measurement was performed for those profiles in this diagnosis.

The card surfaces stay fully opaque by CSS. The footer, legend and untracked rows are additionally made opaque while effects are active. Glass is therefore visible principally in the outer frame and gaps. Prior screenshot/image gates measure a six-pixel strip and an empty synthetic control surface. Those gates can prove native blur capability without proving that a person perceives the selected material in the complete popup.

### Current packaged capabilities

Source: each `themes/builtin/<id>/theme.json` at the rejected baseline, inspected on this date. These are historical capabilities, superseded by the authorized correction below. Listed baseline materials apply only with Effects Subtle/Full, Transparency On and builtin origin. Effects Off makes every row opaque. Transparency Off makes every material opaque while eligible decorations can continue. Unsupported selections fall back to the profile default. Frosted glass can fall back to decorative glass if the native blur cannot be attached. “Opaque” is selectable only through Follow the theme for most rows; the baseline global combo has no explicit Opaque option.

| Theme | Default material | Compatible materials | Tint opacity light/dark | Motion preset | Texture |
| --- | --- | --- | --- | --- | --- |
| ai-native-generative-ui | opaque | opaque | 1/1 | gradient | none |
| analog-newspaper-broadsheet | opaque | opaque | 1/1 | interaction | paper |
| aurora-mesh-gradient | decorative-glass | decorative-glass, frosted-glass | 0.96/0.9 | gradient | grain |
| bento-grid | opaque | opaque | 1/1 | interaction | none |
| card-based-ui | opaque | opaque | 1/1 | interaction | none |
| cyberpunk | opaque | opaque | 1/1 | interaction | chamfer |
| de-stijl | opaque | opaque | 1/1 | interaction | none |
| expressive-variable-typography | opaque | opaque | 1/1 | interaction | none |
| flat-design | opaque | opaque | 1/1 | interaction | none |
| glassmorphism | frosted-glass | translucent, decorative-glass, frosted-glass | 0.9/0.82 | interaction | none |
| hand-drawn-sketch | opaque | opaque | 1/1 | interaction | strokes |
| holographic-foil-iridescent | decorative-glass | decorative-glass | 1/1 | interaction | none |
| isometric | opaque | opaque | 1/1 | interaction | grid |
| linear-saas | translucent | opaque, translucent | 0.96/0.94 | interaction | none |
| lunarpunk | translucent | translucent, frosted-glass | 0.94/0.88 | motes | none |
| mid-century-modern | opaque | opaque | 1/1 | interaction | grain |
| nanopunk | opaque | opaque | 1/1 | pulse | grid |
| organic-biophilic | opaque | opaque | 1/1 | leaves | paper |
| sistema-gnome | opaque | opaque | 1/1 | interaction | none |
| solarpunk | opaque | opaque | 1/1 | leaves | botanical |
| terminal-tui | opaque | opaque | 1/1 | interaction | scanlines |
| web-brutalism | opaque | opaque | 1/1 | none | none |

## Footer plate and card inset

`indicator._updated` is a wrapped `St.Label` with class `gaq-muted`. Demo mode changes its text only (`lib/ui/indicator.js:395`); it does not create a separate badge or background. The enclosing `.gaq-footer` gets `background-color: {{p:bg}}` through the effects-active rule in `lib/core/theme.template.css:554`. That full rectangular opaque fill explains the status/footer plate visible against decorative backgrounds in the archived light contact sheet. The opaque button surfaces contribute further separate rectangles.

The base footer rule has no background fill. Therefore a rectangle that persists while the popup is **open with Effects Off** is not yet causally established by this CSS rule. Root must measure the actual active class, effective backgrounds of the label/footer/ancestors and full screenshot before identifying a stale class, inherited Shell styling or another painted layer. The closing-phase class retention is intentional while the menu remains visible and should not be mistaken for an open-mode result.

The foreground frame has unconditional 12px padding. The extension leaves popup-menu-content and popup-menu-item padding inherited from the installed Shell theme. The local stock GNOME resource inspected via `gresource extract /usr/share/gnome-shell/gnome-shell-theme.gresource` supplies popup-menu-content padding 6px plus a 1px border, and popup-menu-item padding 9px 12px plus a 100ms transition. A local third-party Cyber-Dusk stylesheet supplies popup-menu-content padding 12px with `!important`; this is a host-style example, **not evidence that it is the user's active Shell theme**.

The effects-active content rule makes its background/border colors transparent and removes its shadow, while retaining border widths and inherited padding. `.gaq-cards` also reserves a theme-specific shadow gutter. There is no explicit off/full padding toggle in the extension template. A visual inset difference may come from the disappearance of an opaque outer content surface, or an actual inherited geometry change; screenshots and ancestor allocations must separate those cases. A correction should explicitly own the relevant popup/frame padding and preserve identical card origins and width in off/subtle/full, rather than hiding a difference with additional mode-specific margins.

## Credit-number vibration: unresolved mechanism

The symptom across all System effect modes points to the shared reading/layout path. System Full uses only the short decorative interaction transition; there is no System ambient numeric animation. `ProviderCard.update` rewrites the hero labels, changes body/summary visibility and destroys/rebuilds body children whenever the view/open key changes. Expansion creates a new money meter and several labels while the unchanged money reading remains in the header. The hero and money labels are wrapped text with tabular attributes.

`numericText.js` coalesces attribute application through HIGH_IDLE after style/text changes. It copies current St attributes, inserts `tnum=1`, and skips a write if that feature is already present. Equal digit widths establish font features, not stable painting: expansion can still change allocation, scroll position, style attributes or offscreen-cache sampling between frames. A possible repeated style/attribute invalidation loop needs event counts and a discriminating private control; it is not established from source alone.

`MeterBar` also changes fill position/size synchronously inside `notify::allocation`, comparing allocated floats with requested geometry. Fractional-size disagreement is another candidate for repeated relayout during expansion. Historical diagnosis of a **different native critical** found that suppressing numeric writes did not remove that critical; it does not rule out a separate current vibration defect. Do not promote a frozen-meter or removed-tabular workaround without a positive causal control.

## Required native screenshot probes

Root should capture raw full-stage images plus unscaled popup/card crops with source hashes, resolved policy, actual ThemeNodes and capture times. Use fixed demo snapshots, one locale, stable pointer/focus and a synthetic high-contrast window behind the popup. Distinguish 1× and fractional display scale. Avoid cropping to a decorative strip as the sole acceptance image.

1. **Selected versus effective material:** Organic, System, Cyberpunk, Glassmorphism, Aurora, Lunarpunk and Holographic, both schemes. Hold geometry/content fixed and compare Off/Subtle/Full, each material choice and Transparency Off/On. Record requested material, compatible set, policy material, renderer material, tint alpha and blur attachment. For unsupported combinations the preferences must visibly explain the effective opaque result; capture that preferences state alongside the popup. For supported combinations use translated checker/letter content beneath the popup and require visible transmission/softening in a meaningful exposed region of the actual complete popup, plus unchanged text/card contrast. Include Holographic as an opaque optical surface rather than calling it translucent merely because its preset says glass.

2. **Footer rectangle:** Organic light in Off and Full, then Glassmorphism light/dark. Capture the whole footer including the Demo status and buttons. Sample `.gaq-muted` label, footer and all ancestors' background alpha; record `gaq-effects-active` on the open menu. Compare equal content/geometry images to identify the actual rectangle boundary. Acceptance should remove an unintended full-width plate or integrate it intentionally into the surface with consistent padding; human inspection remains necessary.

3. **Inset invariance:** without closing the same anchored popup, switch effects Off → Subtle → Full → Off. Record popup content, item, stack, frame, foreground, scroll, card and header allocation/transformed boxes, border widths and all four padding values. Capture each settled state and transient frames. Compare the card's left/right origin relative to a fixed frame origin and its width to within 1/64 logical pixel after settling. Pixel comparison should confirm that apparent extra space is not simply a changed surface color. Repeat with the user's actual Shell stylesheet if available; stock-only acceptance misses inherited overrides.

4. **Money expansion stability:** System light/dark, each effects mode, steady demo money reading. Capture 30–60 successive presented/after-paint frames around click expansion, then at least one second after settling. Log hero text, Pango attribute serialization, pending tabular job, logical/transformed position and size, Pango logical/ink extents, parent validity, scroll adjustment and popup source anchor. Count numeric set_attributes, style-changed and meter geometry setters. Keep the monetary text constant; compare a tracked glyph crop after compensating for any intended whole-card translation. A stable allocation does not excuse pixels changing on alternate frames. Private controls must change **one variable**: skip redundant hero text assignment; suppress only tabular reapplication after its initial successful application; suppress only repeated equal meter requests; suppress scroll easing; compare offscreen redirection separately. Restore each before the next test. Select the fix only after the relevant control removes the visible instability while preserving numeric features, meter updates and scrolling.

5. **Light theme design:** full-size side-by-side Cyberpunk light/dark screenshots plus System light, with collapsed and expanded money/percentage cards, all warning/critical/focus states. Require deliberate palette, hierarchy, geometric motifs and readable typography under actual fonts/fallbacks. A contact-sheet thumbnail or computed token contrast cannot approve the art direction.

## Coherent light-design proposal, not implemented

Keep System a restrained native reference and make Cyberpunk light a daylight instrument panel: cool light surfaces, dark graphite typography and crisp graphite structural borders, with cyan as the primary technical accent and a restrained magenta secondary detail. Replace the faint white-on-white card outline with clear card/frame geometry; place small chamfer markings at meaningful frame/header boundaries where they remain visible in both modes. Retain semantic warning/critical colors exclusively for quota state. Use display typography sparingly in titles and maintain readable body/numeric fonts when optional theme fonts are unavailable. This preserves the dark theme's technical hierarchy without attempting to reproduce luminous neon by washing it out on white.

Treat static theme identity, background material and ambient motion as separate concepts. A material selection should either apply or visibly explain why the selected theme cannot use it. The preferred UX direction is to show current compatible material choices and the effective result, and describe precisely whether Effects Off disables only motion/decoration or also material. Decide that user-facing contract before a policy change. Avoid enabling every material indiscriminately across paper, terminal and brutalist themes: their opaque surface is part of their design.

Keep reading content and card geometry stable across all decoration modes. Give the footer a deliberate treatment shared by all modes, with local button surfaces and text readability rather than an accidental full-width patch. Evaluate complete, unscaled screenshots against the desired hierarchy after the policy/geometry and numeric issues are resolved.

## Evidence limits and next ownership boundary

The archived `assets/v01/effects-inventory-light-sheet.png` was visually inspected in this pass. It shows Full + Follow the theme only, with the full-width footer patches and a weakly differentiated Cyberpunk light treatment. It does not reproduce the user's Off/material combination or the dynamic credit symptom. Root's manual-regression captures and discriminating controls are the next evidence gate; native visual acceptance remains pending.

## Authorized material/footer/inset correction

Root explicitly authorized the coherent contract after the initial diagnosis: every builtin theme accepts an explicit known material, Follow the theme retains its original default, Effects Off stops motion and decoration while material stays live, and Transparency Off forces opacity. This changes the selective-capability proposal above to honor the user's request for working explicit material choices across all themes. User-origin themes retain the native-effects trust boundary.

Meaningful pure RED before the production change: `gjs -m tests/run.js 'off stops motion'` exited 1 with expected frosted-glass versus actual opaque, and `gjs -m tests/run.js 'explicit materials work'` exited 1 on the first theme's opaque alpha of 1. Root supplies the native rejected-baseline capture `.superpowers/sdd/2026-10-08-manual-regressions/before.json`. Root reports four programmatic money toggles with stable hero allocation/Pango attributes and zero style events: that control has **not reproduced the user's pointer-triggered pixel vibration**, so the numeric implementation is deliberately unchanged pending the actual-pointer trace.

The promoted material policy admits Off while returning zero motion/particles. The renderer keeps its background active for every open trusted builtin popup, including Off, and skips all decorative textures, optical layers and particle creation in Off. Canonical profiles and all 22 packaged theme JSONs now offer opaque, translucent, decorative-glass and frosted-glass explicitly; all retain their original Follow the theme default. Nonopaque tint alpha is 0.80 light and 0.74 dark, within the established 0.72 floor. Default opaque surfaces remain opaque. These alpha values intentionally expose more desktop content than the rejected 0.90–1.00 light profiles; visible adequacy requires the next screenshot gate.

The template owns popup content padding and border width at zero, and neutralizes padding/margin/spacing and inherited transitions only for the extension's `.gaq-popup-item`. Root owns adding that class to the actual nonreactive PopupBaseMenuItem in `indicator.js`. The foreground frame retains its single 12px inset across modes. The footer is transparent in all modes; its status text uses the theme foreground with a local background-color text outline. Card and button reading surfaces remain opaque.

Focused pure GREEN: `theme effects:` **12 passed, 0 failed**; `themes:` **25 passed, 0 failed**, including 528 explicit theme/scheme/mode/material cases, default preservation, Transparency Off priority and user-origin denial. Core/renderer syntax and whitespace checks pass. These establish policy and compilation, not visual acceptance. Root must now run the complete actual-popup screenshots, effective native material checks, footer/inset comparisons and pointer/pixel tracing described above. Cyberpunk light and the complete 44 theme/scheme pairs remain design-review work; no color or numeric-layout rewrite was promoted in this correction.

### Authorized static character adaptation and capture freeze

Root subsequently authorized built-in theme classes, static character adjustments and a reproducible Cyberpunk light palette correction. The local gallery source `/home/daniel/Code/estilos-visuais/styles` was inspected for the actual card, heading and numeric signatures. Both archived contact sheets were inspected, covering all 22 light/dark pairs in their rejected baseline. The following adaptations address the generic framing/type hierarchy visible there without copying gallery animation, remote assets, invented telemetry or labels.

| Theme pair | Static adaptation / retained identifying feature |
| --- | --- |
| System | Retain native reference typography/card proportions; material/inset/footer correction only. |
| Flat | Explicitly shadowless compact rounding and plain section typography. |
| Card-based | More deliberate modular card padding and section rule/title hierarchy. |
| Bento | Larger tile reading, generous rounded tile framing and stronger section hierarchy; popup remains a usable vertical quota list, not a fabricated dashboard grid. |
| AI-native | Softer medium-weight heading/reading hierarchy; no fake thinking/streaming states. |
| Linear SaaS | Compact low-depth cards and light numeric/section weights. |
| Newspaper | Top/bottom ink framing and serif display titles bounded by print rules. |
| Expressive typography | Larger 34px display readings, 18px titles and bold section rule, without animating font width/weight. |
| Hand-drawn | Display-title emphasis and ink underline; retain curved cards and static drawing texture. |
| Organic | Warm display titles/readings and paper/leaf identity; no new cursor-responsive effects. |
| Solarpunk | Distinct sunlit palette/botanical framing with stronger display titles/readings. |
| Mid-century | Display-title hierarchy and measured section rules; retain earthy palette. |
| Lunarpunk | Display titles/readings and letter-spaced lunar headings; retain restrained motes. |
| Terminal | Installed monospace fallback for titles/readings/pills and ruled sections; no typing/cursor animation. |
| Nanopunk | Fine monospace technical headings and header hairline; retain microgrid/pulse profile. |
| Web brutalism | Stronger square framing, raw section rule and larger readings, shadowless. |
| De Stijl | Heavy section rules/primary-color edge and square framed cards, shadowless. |
| Isometric | Asymmetric bottom/right card framing and technical section edge; retain diamond background grid. |
| Cyberpunk | Technical display-title hierarchy, strong left edge and accent header/section rules. Light becomes a cool daylight instrument panel; dark neon palette remains intact. |
| Aurora | Quiet optical-surface hierarchy and brighter top card edge; retain its mesh identity. |
| Glass | Quiet optical-surface hierarchy and top card edge; real native material remains independent of decoration. |
| Holographic | Quiet optical-surface hierarchy and top card edge; retain pearlescent optical decoration. |

Root owns setting/removing the builtin-only `gaq-theme-<id>` and scheme classes on the popup; user-origin overrides receive no builtin signature classes. Every style signature uses the same static card/type geometry in Off/Subtle/Full. Padding/font size can differ **between themes**, so previous large-money, font-scale and shadow-space checks require fresh native evidence.

Cyberpunk light now uses a blue-gray canvas (`#e8eef6`), white-blue reading surface (`#f9fbff`), graphite text (`#142033`), structural graphite-blue border (`#63738f`) and cyan accent (`#006f91`). `tools/gen-themes.py` owns that deliberate daylight override before refinement/contrast audit; the packaged light palette, adjustment list and audit were updated from the generator. The dark palette is unchanged. A meaningful structural-outline test failed against the rejected pale border, then passed after correction. Final focused `themes:` result is **26 passed, 0 failed**; `theme effects:` remains **12 passed, 0 failed**. Generator light token audit reports primary text 15.8:1, secondary 7.3:1 and accent 5.5:1 against the reading surface; these numbers support token readability and do not substitute for actual screenshots.

The quick native oracle now expects an open live material with zero decorative actors/sources in Off. Its focus compositor starts from the actual material sibling ThemeNode when visible, rather than incorrectly requiring an opaque ancestor after popup content becomes transparent. Resource matrix expectations preserve material in Off. Frame-profile static references explicitly disable Transparency; Off alone no longer establishes an opaque baseline. Existing resource/performance/contrast thresholds were not reduced.

All renderer/theme/profile/generator/probe changes were frozen for Root's fresh native captures. `numericText.js` and `providerCard.js` remain untouched. New 44 theme/scheme screenshots, explicit material/opacity comparisons, geometry and pointer-triggered pixel stability remain pending acceptance; this static review is not an “all themes look correct” verdict.

### First fresh capture rejection and name-ink correction

Root's first new capture matrix completed 176 images. This agent inspected actual full-size Cyberpunk light, Organic light and Expressive light captures. The Cyberpunk framing is stronger, the Organic/footer surface is coherent and the expressive reading hierarchy is visible. The matrix is nevertheless **excluded from material acceptance**: 42 “opaque” labels recorded an effective glass material, because the schema did not accept `effect-material='opaque'` and retained the previous preference. Cyberpunk's opaque/frost images therefore appeared identical for an input-oracle reason. Actual metadata, not filename/image count, revealed the false input. Root owns correcting the opaque case through Transparency Off plus Follow the theme and asserting every requested/effective material before recapturing.

The fresh Cyberpunk image also exposed clipped final glyphs in the provider names (“Code-” and “Claud-”). Root authorized the bounded follow-up: remove the custom 0.5px name letter spacing and reserve a 3px right ink gutter on card-name labels across all styles. This keeps display-font ink overhang inside the title allocation without changing monetary text or animated behavior. Pure `themes:` remains 26/0 and whitespace checks pass; actual native ink bounds/full-glyph screenshot GREEN remains required. Renderer source was frozen again immediately afterward. No acceptance of the failed capture matrix or unmeasured name correction is claimed.

### Strict recapture and all-pair visual review

Root's corrected matrix comprises 220 native screenshots: 22 themes × light/dark × opaque/translucent/decorative-glass/frosted-glass/frosted-glass-with-Effects-Off. Each recorded input is checked against effective policy. The four batches in `.superpowers/sdd/2026-10-08-manual-regressions/captures/{light-0,light-11,dark-0,dark-11}.json` finish without error; the failed initial 176-image matrix remains excluded.

This agent inspected all 44 actual opaque theme/scheme popup crops at their original pixel scale, together with full-stage Cyberpunk light opaque/frosted captures. Provider names show complete Codex/Claude glyphs in the reviewed viewport. The transparent footer has no former full-width plate. Light/dark reading hierarchy and static print, ink, organic, terminal, brutalist, isometric and technical identities are visible; the AI/card/bento/linear family deliberately remains a quieter vertical quota-list adaptation. Cyberpunk light has the intended daylight technical framing. Its opaque uniform canvas and frosted blue-gray backdrop transmission differ visibly. These screenshots cover the visible popup, not hidden expanded credit rows or pointer-time raster behavior.

The two reset expectations in `tests/themeEffects.test.js` now follow Root's user-reset contract: first-use completion resets, while terms acceptance remains retained. The focused suite passes 12/0. Source geometry and visual styles remain frozen after the name-ink correction; further numeric investigation is separately bounded below.

### Actual pointer numeric diagnosis

Root's corrected pointer probe picks the actual mapped credit toggle while the menu remains open. Four click cycles alternate expanded state with the hero fixed at position `[822,424]`. Immediate native attribute events show the same foreground alternating between foreground-only and foreground plus `tnum=1` on press/release; style events replace the attribute list and the helper's idle restores features later. Stable allocation does not demonstrate stable glyph shaping. This is a discriminating failure of feature continuity; a claim that the user's visible vibration is fixed still requires effective-layout events and sequential actual-pointer images.

The [GNOME 50.5 Clutter source](https://gitlab.gnome.org/GNOME/mutter/-/blob/50.5/clutter/clutter/pango/clutter-text.c) maintains independent `markup_attrs`, merges them with style attributes into effective layout attributes, and leaves them intact when `set_attributes` replaces the style list. [St.Label 50.5](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/50.5/src/st/st-label.c) installs plain text through Clutter and emits label text notification afterward. Pango supports [font features in span markup](https://docs.gtk.org/Pango/pango_markup.html). A bounded proposed helper therefore puts only `tnum=1` in escaped internal markup and refreshes it on plain label text updates, avoiding style-time writes and idle sources. Native proof must inspect `get_layout().get_attributes()`; `get_attributes()` reports only the separately supplied style list and is no longer the complete numeric oracle. No numeric implementation change has been accepted at this diagnosis stage.

The standalone native effective-layout RED is archived by Root at `/tmp/gaq-numeric-markup-red-output.txt`: the probe finished with `Every native style/attribute event preserves effective numeric features`, eight attribute observations, four missing `tnum=1` and four containing it. The actual pointer trace independently shows the same loss/reapply sequence.

The authorized replacement is now installed in `numericText.js`: escaped `tnum=1` span markup, a guarded synchronous St.Label text notification callback, and no style-change callback or idle source. `providerCard.js` remains unchanged. Both numeric attribute reads in the quick effects probe now inspect the effective layout. The standalone probe additionally checks foreground/feature composition, plain-text `<b>123 & 456</b>` input, Unicode, empty strings, synchronous numeric features after text updates, and 100 create/update/destroy cycles.

Fresh post-change verification: full pure suite **489 passed, 0 failed**; ESLint on owned core/UI/test/probe files with `--max-warnings=0` exited 0; numeric/probe syntax and scoped whitespace checks exited 0. Production source is frozen for Root's native GREEN, pointer sequence and final integration gates. Native effective-layout continuity and visible pointer-time raster acceptance remain pending; pure tests do not import this host-only helper.

Root's standalone native GREEN output `/tmp/gaq-numeric-markup-green-output.txt` was read directly: `finished: true`, empty error, 100 destroyed labels and six effective attribute events, each containing `tnum=1` alongside the themed foreground. This completes the literal/plain-text, Unicode/empty, style continuity and destruction checks. The file also contains stage-view allocation warnings around shutdown; this helper pass does not declare the entire native journal clean. Actual pointer screenshot/raster acceptance remains Root's next gate.

### Final resource-matrix synchronization correction

The final quick native gate passed, but the matrix's first System Off case failed. A diagnostic-only rerun recorded an open active builtin popup with the requested opaque material, zero decorative actors/particles/updates, and one source consisting entirely of `pendingLayoutSources: 1`; the overview was still visible while hiding. This distinguishes a transient owned layout callback from a motion/decorative leak. The 20ms unconditional sampling delay was insufficient to establish a settled allocation.

The bounded harness correction in `tools/effects-benchmark-probe.js` waits for the actual overview visibility to become false before opening (up to 1s), then waits for pending layout callbacks to drain before each sample (up to 500ms, at 20ms intervals). Both timeouts fail explicitly. Off still requires zero sources, zero actors and exact material agreement; resource/particle/blur limits remain unchanged. Production renderer/core files are untouched by this correction, so the final screenshots' source geometry remains applicable. Scoped ESLint, syntax and whitespace checks exited 0; Root's fresh native matrix GREEN is the remaining verification for this harness change.

Root also reports final actual-pointer continuity over 80 frames and four identical SHA hashes for cropped monetary glyph pixels. That closes the previous pointer gate in Root's evidence set; this agent did not originate that native run or independently compare those crops.

Fresh native matrix GREEN was read directly from `/tmp/gaq-manual-native-matrix.log`: verifier returned true; result finished with empty error; all 22 themes completed 12 combinations each (**264 combinations**). Final closed resources show zero sources, pending layout sources, particles, blur effects and decoration actors. No `CRITICAL` or `JS ERROR` occurs in that log. The stricter settled-sample oracle therefore passes without reducing any motion/resource/lifecycle limit. Source freeze remains in force.
