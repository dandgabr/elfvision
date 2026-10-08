# Popup and theme evolution — execution contract

Approved 2026-10-08. Coordinator: root. Work is isolated from the user's settings,
credentials and running desktop; native verification uses synthetic connectors.

## Decisions

- Width and whole-popup maximum height use logical pixels; zero means automatic.
  Automatic width is 420, height is 70% of the anchor monitor's usable work area.
  Keep 12 logical pixels at screen edges, clamp effective allocation without
  rewriting saved preferences, and measure footer/chrome rather than guessing.
- A single popup list follows connector IDs and explicit order. Hiding affects
  only popup presentation, never polling, notifications or panel ranking.
  Real/demo presentation settings are separate. New IDs append, stale IDs are
  ignored. All-hidden and no-connectors empty states are different.
- Match System's compact layout, preserve an 8-pixel visible scrollbar clearance,
  reserve bounded shadow painting independently of the theme's original blur.
- Review every built-in theme in light/dark with Off/Subtle/Full effects and
  materials. Authored light/dark palettes replace generic inversion as the only
  definition. Each pair retains at least two non-accent identity cues when Off.
- Research each style and typography using attributable primary references.
  Record sources, individual briefs and deviations. No automatic font downloads.
- Native Shell effects only; isolated previews may retain WebGL. Up to 12
  particles and one backdrop blur. Reduced motion and closed-popup cleanup apply.
- Updates preserve accounts, consent, credentials, settings and coordination
  state. Preserve the previous package outside dist before packaging a new build.

## Ownership and dependency order

| Owner | Exclusive responsibility |
|---|---|
| layout_and_connectors | schemas, popup core helpers/defaults, indicator, prefs.js, popup prefs, their tests |
| theme_effects_impl | theme compiler/template, themeEffects, effects primitives, their tests |
| theme_research_impl | theme generator/profile source, generated built-ins, research briefs, generator regression tests |
| root | integration, native capture/verification tools, translations, user documentation, delivery checks |

No simultaneous edits of the same file. Cross-cutting changes are requested from
the owner. Frontend and effects owners coordinate the width and scrollbar
contract. Palette source changes precede regeneration. Reviews follow integration
and assign corrections back to owners. Concurrent work never exceeds four agents.

## Gates

1. Meaningful regression tests demonstrate failures before implementation.
2. Full repository checks, schema/classification, lint, translations and package
   audit pass; fixes receive independent domain and QA/security review.
3. Actual synthetic Shell captures cover all 22 themes × two schemes × three
   effect modes plus materials, including Aurora/Holographic transparency toggles.
4. Native geometry verifies bounds, compact margins, scroll clearance, complete
   primary values and stable layout between effect modes; inspect screenshots.
5. Connector presentation, focus/expansion, reduced motion, lifecycle and update
   preservation are exercised separately. Installation in the user's desktop is
   not part of this run; never log out automatically.

Visual evidence is written to build/popup-evolution, separate from source.
Human aesthetic approval remains distinct from automated allocation checks.

## Integration decisions and corrected review findings

- Native measurement requires effective minima: width 320 and height at least
  240 or measured chrome plus 40 logical pixels of content, then screen clamping.
  Requested settings remain unchanged. This replaces unusable 1-pixel controls.
- Shadows reserve a constant six-pixel paint gutter; scrollbar clearance is
  independent. Stronger theme identity stays in typography, outlines and motifs.
- Transparent reading zones receive cached smooth full-width background veils,
  not label rectangles. Its intensity is computed conservatively for overlapping
  decoration and does not introduce timers. Allocated text regions determine the
  protected area; fonts and long translations must not outgrow fixed bands.
  The first native frame profile put leaves at 2.143ms added p95, above the 2ms
  goal. Two cached edge surfaces replace the full-height transparent-center
  quad to reduce compositing work; short/overlapping zones share one surface.
- Updated runtime gates permit at most two static material-safety actors in Effects
  Off while still forbidding textures/particles/ambient sources. Closed/disabled
  resources must return to zero. Old asynchronous gates now return a start marker
  and wait for completion instead of racing fixed sleeps or D-Bus call timeouts.
- Reviews caught and corrected stale registry captures, focus at reorder/hide
  boundaries, anonymous accessible labels, detached-card disposal, stale stored
  presentation IDs after deletion, insufficient Solarpunk background text
  contrast, and a midtone hole in endpoint-only compositing validation.
- Missing local fonts must use a compatible installed family, not silently lose
  the intended serif/monospace category. Actual St/Pango resolution is a native
  gate; preserving a syntactically valid browser-style family list is insufficient.

The release/installation sequence was explicitly authorized: open the verified
PR first; wait for Daniel's merge confirmation; synchronize main, publish v0.2.0,
and install without deleting any existing configuration or connectors.
