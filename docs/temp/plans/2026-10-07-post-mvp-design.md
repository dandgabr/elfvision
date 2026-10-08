# Post-MVP design: visual fidelity, motion and polish

Status: proposed implementation design. The owner requested the full follow-up
plan and approved support for all four visual concepts. This document does not
claim that the effects have been implemented or performance-tested.

## Scope and sources

M4 remains closed. This work follows ADRs 0006, 0008 and 0010 rather than reopening
the MVP. Deliver native falling leaves, simple translucency, decorative glass and
real frosted glass; review every existing theme and add Organic/Biophilic and
Glassmorphism. Preserve the design identity of each style instead of assigning
every effect to every theme.

Gallery source inspected on 2026-10-07:
`dandgabr/estilos-visuais@fe5ef0cbff1f801e56aa16eedd1a5bc0f1357120`.
The installed theme inventory comes from `themes/builtin/*/theme.json`: 20 themes,
including System; `themes/v1.txt` lists the 19 generated styles.
CSS for those 19 gallery counterparts was inspected for textures, gradients,
transitions, clipping, animation and blur. The matrix below is an adaptation
proposal, not a claim that every proposed effect exists in the gallery.

The Organic/Biophilic gallery effect uses Canvas 2D, not WebGL. Glassmorphism uses
translucent surfaces and CSS backdrop blur. Browser CSS and JavaScript cannot be
copied directly into St. Domain skills govern palette, geometry, typography,
motion and materials; the renderer is chosen separately.

Verified local versions: GNOME Shell 50.5, Mutter 50.5, GJS 1.88.1, GTK 4.22.5,
libadwaita 1.9.4, WebKitGTK 2.54.1. These are this machine's versions, not new
minimum dependencies. Current online Mutter ShaderEffect docs target version 51;
they do not establish API availability on Shell 50. An initial standalone GI
probe failed to resolve Mutter's private library path and is not evidence that
the API is absent. The runtime probe must run in the nested Shell 50.

## Architecture and constraints

- GNOME Shell 50 remains the target. GJS ES modules; no required native helper,
  browser engine or product build pipeline is introduced.
- `lib/core` remains pure JavaScript with no GI or Shell imports. St stays in
  `lib/ui`, `extension.js` and the theme manager; GTK/Adwaita stay in preferences.
- Themes remain validated data. Existing files remain valid. Colors stay safe
  hex tokens; bounded numeric opacity is a separate field, never arbitrary CSS.
- Built-in effects use packaged, allowlisted assets and implementation presets.
  Theme JSON never supplies executable JS, shaders, URLs or filesystem paths.
  A user theme overriding a built-in ID does not inherit built-in trust.
- Credentials, account identifiers, network bodies and clipboard contents never
  enter a decorative renderer, preview or performance report.
- English code/docs/msgids; pt-BR in the translation catalog. Maintain both light
  and dark schemes. The panel keeps the dark scheme and has no ambient loop.

### Rendering layers

The popup contains a clipped background/material layer, a clipped non-reactive
decoration layer, and the existing accessible controls. Text and controls remain
opaque; changing the opacity of the whole popup is prohibited. Decorative actors
are absent from keyboard navigation and do not intercept pointer events.

1. **Leaves:** reuse a small packaged texture atlas, animate transforms, reuse
   actors and avoid painting a full canvas on every frame. Start with eight leaves
   and clamp to twelve. They move behind cards and never obscure values.
2. **Simple translucency:** tint the popup background with bounded alpha. Desktop
   features remain sharp. Preserve sufficiently opaque reading zones.
3. **Decorative glass:** internal gradient/light textures, specular borders and
   subtle elevation; the desktop is not sampled or blurred.
4. **Frosted glass:** a native, clipped background blur behind the popup controls.
   Blurring the popup's own text or the whole desktop is unacceptable. Use one
   backdrop surface, a fixed radius and the smallest supported sampling region;
   avoid per-card blur and animated blur radius. Establish actual Shell 50 APIs
   before selecting the implementation.

Real frost is a requested deliverable. If the prototype cannot meet compatibility,
correctness or performance criteria, record the blocker and keep it visibly open;
decorative glass is an operational fallback, not completion of real frost. Do not
add a mandatory third-party blur extension or native bridge without an ADR change.

### Motion policy and budgets

Preferences expose Effects (off/subtle/full) and Transparency (off/on), with
plain user-facing copy. Default subtle: short interaction transitions and static
decorations; full enables ambient motion in styles that benefit from it. System
animation disablement wins over the extension setting. Transparency can be disabled
independently. Restore defaults classifies all new keys.

No decoration timer, running transition or offscreen blur remains when the popup
is closed, the extension is disabled or the session is locked. Reopening resumes
cleanly. Theme changes destroy the old layer before attaching the replacement.
Resource counts are bounded; redraw coalescing and animation updates are separate.

Proposed release budgets, to measure rather than claim: ambient effects capped at
30 updates/second with time-based movement; reused textures, no per-frame JSON,
CSS compilation or file I/O; closed-popup decoration counters at zero; no retained
actor/source growth after 100 open/close and theme-switch cycles. Native interaction
transitions may follow the compositor's refresh rate. On the recorded test machine,
compare 60-second static, leaves and frost runs: p95 frame time must stay within
the monitor frame interval and increase by no more than 2 ms over the static run.
If tooling cannot measure a metric reliably, report that limitation rather than
substitute a success claim. Fall back to static/decorative material on runtime
failure; a release gate failure remains unresolved.

### WebGL

The clarified requirement is similarity to the gallery, not WebGL in every popup.
Use native graphics for the four accepted options. Keep a bounded investigation
of genuine WebGL for complex future styles and animated preference previews.
An optional isolated WebKit preview must use only packaged content, synthetic
data and no network or account access. It must not become a required dependency.
WebGL-in-popup remains a separate architectural decision requiring measured
integration evidence; native shaders are never labelled WebGL.

## Existing-theme review and proposed profiles

| Theme | Proposed effect/material | Motion | Important restriction |
| --- | --- | --- | --- |
| sistema-gnome | Standard GNOME surface | System interaction transitions | No decorative ambience by default |
| isometric | Cached grid and shallow offset layers | Short expansion/elevation | No moving or tilted text; preserve hit geometry |
| web-brutalism | Hard shadows and strong edges | Brief pressed offset | No blur or soft glass |
| ai-native-generative-ui | Controlled glow and internal gradient | Slow gradient in full mode | No indefinite loading metaphor |
| analog-newspaper-broadsheet | Cached paper/grain texture | Discrete reveal | No floating particles or glass; clear reading zones |
| hand-drawn-sketch | Cached strokes and paper | Small interaction response | No repeated jitter of numbers or focus |
| expressive-variable-typography | Display accents, static clipping | Short title reveal | Numeric metrics stay stable; no continuous text morph |
| de-stijl | Primary-color geometry | Short block transitions | No blur, particles or organic motion |
| mid-century-modern | Warm grain and geometric decoration | Gentle interaction lift | Restrained movement, opaque reading surfaces |
| terminal-tui | Cached scanline texture | Brief terminal-like reveal | No blinking caret, flashing or animated scan sweep |
| cyberpunk | Chamfered decoration, scanlines, glow | Brief controlled highlight | No continuous glitch or flashing quota text |
| lunarpunk | Moonlit gradients, translucent material | Sparse slow motes in full mode | Frost optional; avoid low-contrast purple text |
| nanopunk | Cached microgrid and technical edges | Subtle non-semantic pulse | No state-like alert colors in decoration |
| solarpunk | Botanical texture and falling leaves | Eight leaves in full mode | Warm solid reading zones; no mandatory blur |
| aurora-mesh-gradient | Internal aurora and glass | Slow background movement in full mode | Frost optional; cap simultaneous effects |
| holographic-foil-iridescent | Cached iridescent material and edges | Bounded highlight response | No continuous pointer tracking or per-frame texture rebuild |
| bento-grid | Soft surfaces and card geometry | Short card expansion | No ambient particles; retain card sizes and focus |
| card-based-ui | Elevation and soft edges | Short expansion/hover | Avoid blur and ambient loops by default |
| flat-design | Flat surfaces and clean outlines | Color/state transitions | No glass, particles or decorative texture |
| linear-saas | Restrained gradient and subtle translucency | Short focus/expansion | No ambient motion by default |

New first-wave themes: **organic-biophilic** (leaves/paper/nature) and
**glassmorphism** (simple translucency, decorative glass and real frost material
choices). The effects engine supports all four options; themes declare compatible
materials. A global override must not force glass onto Newspaper or De Stijl.
Every new theme requires its own domain-skill review and this same matrix entry.

## Accessibility and visual validation

Keep the existing contrast targets: primary text 7:1, secondary/status and text on
accent 4.5:1, accent 3:1. Hex-token contrast checks alone cannot certify translucent
surfaces. Test light, dark, saturated and detailed wallpapers; use an opaque local
surface behind reading zones whenever the target cannot be guaranteed. Test focus
rings, RTL, enlarged text, narrow monitors, clipping and scroll bounds. Respect
reduced motion live; expose an explicit opaque fallback. Test actual keyboard and
Orca interaction separately from synthetic probes.

## Other post-MVP work

Deliver pure indicator modelling, coalesced redraws, keyboard bar tooltips,
Escape-before-popup-close for the legend, CI ESLint and tabular-number validation.
Review pt-BR with a second reader and preserve human/live-provider validation limits.
Separate decisions cover disconnect-all/local deletion, optional font installation
and independent warning/critical thresholds. They are not silently bundled into
theme rendering or Restore defaults. Each receives a defined proposal in the plan.

## References

- [Gallery](https://github.com/dandgabr/estilos-visuais/tree/fe5ef0cbff1f801e56aa16eedd1a5bc0f1357120)
- [Leaves implementation](https://github.com/dandgabr/estilos-visuais/blob/fe5ef0cbff1f801e56aa16eedd1a5bc0f1357120/styles/fx/organic-biophilic.js)
- [Glass implementation](https://github.com/dandgabr/estilos-visuais/blob/fe5ef0cbff1f801e56aa16eedd1a5bc0f1357120/styles/glassmorphism.css)
- [Shell architecture](https://gjs.guide/extensions/overview/architecture.html)
- [Current Mutter shader docs: version 51, not the project target](https://gnome.pages.gitlab.gnome.org/mutter/clutter/class.ShaderEffect.html)
- Domain skills consulted: `ui-style-organic-biophilic`, `ui-style-glassmorphism`.
  Existing-theme implementation also reads the matching domain skill before
  interpreting each gallery profile.
