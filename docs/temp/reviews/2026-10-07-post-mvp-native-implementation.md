# Tasks 4–6 implementation report

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Status: native motion/material/blur renderer implemented. Final quick, semantic light/dark
visual and 44-image inventory gates pass. Final clean benchmark completed after the strict nested allocation fix; strict critical/JS/disposed checks pass. Full hardware
frame-processing acceptance remains unmeasured.
No commits made by this worker. Other workers' changes retained.

## Architecture and interfaces

`ThemeEffects({backgroundActor, decorationActor, extensionPath})` owns decorative resources.
`apply({policy, theme, scheme})`, `setOpen(boolean)`, `inspect()`, and idempotent `destroy()`
are the runtime interface. ThemeManager provides the validated detached state; renderer
never reloads raw theme JSON. The panel does not attach an ambient renderer.

The popup's controls remain in their original root inside an explicit EffectsStack: independent
background and decoration siblings are below the root. Effect changes preserve the same
cards, logical focus targets, input geometry and controller subscription. Settings and
system animation changes update the existing renderer through the manager subscription.
Session-mode lock updates suppress the decorative policy; Shell disable removes resources.

One 34 ms GLib source implements time-based ambient leaves, motes, gradient or pulse.
Leaves reuse one packaged SVG texture at one icon size with actor-scale variations;
movement uses translation and rotation, not per-tick allocation or CSS. Closed, off,
reduced-motion and destroyed states own no ambient source. Static paper, grain, scanlines,
grid, botanical, strokes and chamfer are bounded allocation-cached DrawingArea presets.
No file/JSON/CSS compilation occurs per frame. Decorative actors are nonreactive,
nonfocusable and marked ATK redundant; no provider or credential dependencies enter effects.

Background tint alone supplies alpha. Opaque cards, summary, sections, footer and controls
retain full opacity. Material preference respects validated compatibleMaterials and trusted
builtin origin. Native frost uses one Shell.BlurEffect BACKGROUND, radius 18, brightness 1;
unavailable/failing native attachment falls back to decorative glass. User themes cannot
activate the renderer even if a caller passes an ambient policy.

`tabularNumbers(label)` is shared by providerCard and barItem. It preserves themed foreground
attributes and installs Pango `tnum=1` after St style handling and text changes. AttrList.change
keeps the feature bounded under repeated updates. No unsupported CSS assertion is used.

## Test provenance

- Native RED: absent engine failed “eight leaves use one bounded source”; initial integration
  failed “actual popup owns independent effects.” Native GREEN established resource counts,
  lifecycle, actual popup integration and live manager behavior.
- Numeric RED: actual mapped hero label lost `tnum` because St replaced attributes with
  foreground attributes. Diagnostic plain-label mapping reproduced that reset. The shared
  helper now installs the feature after the style handler; fresh native widths/feature checks pass.
- Material native positive controls prove one supported blur attachment, background tint alpha,
  opaque reading zones and no control/focus replacement. Synthetic native attachment failure
  checks decorative fallback. User-origin profiles with injected ambient policy are denied.
- The native resource probe checks repeated opens, immediate system reduced motion, live
  transparency off and Effects Off. The benchmark adds all 22 style combinations and actual
  position rebuild and extension disable. Disposed-child teardown diagnostics found during
  early testing caused destroy-sibling flags/source cleanup to be added; fresh logs are checked.
- Full layout probe passed eight narrow/direction/text/font cases after initial integration;
  it is rerun on the final tree. Full check, preferences smoke and catalogs are finalized below.

## Evidence and acceptance limits

Raw PNGs/logs live in this ignored execution directory. `effects-visual-probe.js` uses only
private Shell demo data and a synthetic detailed GTK window, closes GNOME's Welcome modal,
and records actual leaves/translucent/decorative/frost popups plus an empty controlled surface.
The controlled surface compares high-frequency checker edges inside/outside and a moved
MetaWindow. The initial exploratory captures contained the Welcome modal and are superseded
by clean final captures.

`effects-benchmark-probe.js` records three separate 60-second cases, decorative callback elapsed work time,
updates, synchronous open work and owned resources. Callback interval is not frame cost;
callback elapsed work time excludes compositor/GPU processing. No p95 GPU-frame claim is made. The design's
p95 frame gate, fractional scaling, multiple-monitor origins, physical keyboard traversal,
Orca and live-account behavior remain manual/unmeasured. Native frost is implemented and
visually testable; full release acceptance remains open. See docs/temp/reviews/2026-10-07-frost-feasibility.md.

## Final verification

- Parent full check on the current graphics tree: 301 passed, 0 failed; ESLint, actual Shell
  enable, schema, catalogs and whitespace pass. It will rerun after the private-runtime helper fix.
- `tools/effects-check.sh quick`: exit 0, six native cases, including full-size Holo/Aurora paint
  and unchanged cached repaint count across motion. Actual background and decoration 404×552.
- `tools/effects-check.sh visual`: exit 0; clean light capture and semantic pixel checks.
- `GAQ_EFFECTS_SCHEME=dark tools/effects-check.sh visual`: exit 0; clean dark capture and checks.
- `tools/effects-check.sh inventory`: exit 0;44 real native captures, 22 light and 22 dark, and
  two contact sheets. This is distinct from 264 policy/resource combinations, not 264 images.
- `tools/effects-check.sh benchmark`: exit 0, finished true/error empty, all 264 resource states,
  active 100 cycles, real position rebuild and extension disable pass. Closed actors/sources/blur 0.
  No owned disposed-actor/JS errors in the strict final native gate.

|60-second case |Synchronous open work |Updates |Callback elapsed work |Owned resources |
|---|---:|---:|---:|---|
|Static |38.220ms |0 |0µs |0 actors /0 sources /0 blur |
|Leaves |49.524ms |1758 |249964µs total /142.19µs average |9 actors /1 source /8 particles |
|Frost |70.915ms |0 |0µs |1 optical actor /0 ambient sources /1 blur |

Leaves run 29.2998 updates/second over 60.000348s, below the 30-update cap. These are callback
elapsed work and synchronous invocation measurements, not first-painted latency or GPU frame
processing. Zero frost callbacks does not mean zero GPU or total CPU cost. All physical/hardware
gates listed above remain open. The earlier resource-only/too-early benchmark is superseded by
this complete run after both visual fixes and private-runtime isolation.

The final benchmark JSON preserves raw measurements and uses the accurate elapsed-work label.
measurementClock/measurementNote explicitly identify monotonic wall-time. No counter or timing
value was edited. The earlier BoxPointer-critical benchmark is superseded by this clean rerun.

## Visual measurements and fixes

All values below use unmodified screenshots, measured allocated gutter regions and two-axis
RGB edge differences. The outside sample is unchanged between translucency and frost.

| Metric | Light | Dark |
|---|---:|---:|
| Unblurred/frosted checker-edge mean |0.95565 /0.04589 |1.72927 /0.02314 |
| Translucent/decorative mean pixel difference |7.65184 |11.69209 |
| Translucent/frost mean pixel difference |9.29802 |15.83475 |
| Moving MetaWindow changes actual frost gutter |8.99871 |16.42702 |
| Paired leaf phases change exposed gutter |5.89807 |5.90384 |
| Outside blur difference |0 |0 |

The resource-only test originally allowed false-positive actual frost: BoxPointer used
`OffscreenRedirect.ALWAYS`, so the child effect sampled its intermediate buffer. Effective
frost now uses scoped `AUTOMATIC_FOR_OPACITY`; full-opacity popup painting samples the desktop,
Shell's fade stays redirected, and non-frost/closed states restore ALWAYS. No global actor
is changed. Allocation was already correct; the real backdrop defect was offscreen routing.

The semantic gate independently caught invisible static optics. During a rebuild, decoration
width/height represented its zero natural request before the next allocation. Layout now uses
the actual background allocation box, including same-size rebuilds that produce no allocation
notification. Drawing surfaces now allocate 404×552 and paint once. Cairo-cached glass highlight,
pearlescent bands and Aurora's three pools are visible; Isometric's cached 30°/150° diamond grid
is distinct from Nanopunk's orthogonal grid. Their presets are selected only by trusted builtin
IDs and validated tokens, with no additional executable theme input.

A fixed 12px gutter stays present across modes, so changing the policy does not shift controls.
Leaf actors move in the exposed side lanes behind opaque reading zones; paired images prove
visible movement. No sprites intercept input or cover foreground text.

Concurrent test Shells exposed an inherited shared-runtime crash-sentinel collision. The common
headless helper now creates a private 0700 XDG_RUNTIME_DIR as well as private D-Bus/data/config/
cache/keyring; the strict fatal-error gate is retained. The effects runner forces demo data and
creates its ignored output directory under umask 077. It also fails on Eval false; helper exit 0
alone does not establish success. The Python pixel gate uses explicit checks that survive -O.

## Numeric native evidence

The native hero requested `Poppins,sans-serif Bold 22px`; its six-digit samples 111111,222222,
555555,888888,999999 all measure 78px. Requested Sans 24 gives 72/72px for 1111/8888 and 81/81px for
09:59/10:00. Requested Monospace 24 gives 76/76px and 95/95px respectively. These are native Pango
layout widths, not a claim that all optional theme fonts are installed. After 100 text changes,
style change and remap, one tnum attribute remains alongside the themed foreground attribute.

## Reproduce and evidence locations

Run from the checkout root:

```sh
tools/effects-check.sh quick
tools/effects-check.sh visual
GAQ_EFFECTS_SCHEME=dark tools/effects-check.sh visual
tools/effects-check.sh inventory
tools/effects-check.sh benchmark
```

The private runner has 90/100/300-second timeouts and tears down its throwaway Shell. It requires
installed Shell/GJS/GI/Cairo; image analysis/contact figures additionally require developer
Python Pillow. No new runtime dependency is added. The optional contact-sheet font falls back
to Pillow's default when DejaVuSans is absent.

Scratch output directory: `.superpowers/sdd/2026-10-07-post-mvp-execution/`. Logs are
`task-4-6-{green,visual,visual-dark,inventory,benchmark}.log`. Raw four material captures are
`effects-{leaves,translucent,decorative-glass,frosted-glass}.png` and corresponding `effects-dark-*`.
Paired phases, real moving-window and controlled-surface captures are preserved alongside them.
Semantic metrics: `effects-image-metrics.json`, `effects-dark-image-metrics.json`.
Inventory contact figures: `effects-inventory-light-sheet.png`, `effects-inventory-dark-sheet.png`.
All 44 raw `inventory-{scheme}-{id}.png` remain ignored and reproducible. Parent archives selected
nonsecret images/metrics to `docs/temp/reviews/assets/post-mvp/` for the durable review.


## Final nested allocation regression

The original headless-only positive check was insufficient: devkit reported background
404×552 but decoration natural width/height0×0, and optical paint failed. EffectsStack now
measures only the unchanged foreground controls and explicitly allocates all three siblings
to the same finite viewport. Decoration contributes zero preferred size. Geometry is read
from actual allocated boxes, not transient natural size; nonfinite initial boxes are rejected.
A first implementation using the default St.Widget allocator before explicit allocation
failed the cached-paint assertion, so the final custom allocator calls set_allocation directly.

The stricter runner rejects every *-CRITICAL. This exposed an inherited _pinPopup race:
its new invisible Clutter.Actor anchor was given to BoxPointer before its first allocation.
Named native BoxPointer border/bin and _reposition diagnostics showed a finite input
[0,0,442,590] becoming NaN because the anchor's box/extents were all NaN. The fixed anchor
receives its finite captured button allocation before setPosition. No fixture-only delay
or critical-log exception is used. An extension-disabled idle baseline did not reproduce
the critical and was not used to waive the failure.

Final targeted evidence: task-6-allocation-headless.log and task-6-nested[-native].log.
Both strict six-case/100-cycle checks pass without critical, disposed-actor or JS errors.
Background, decoration and foreground match404×552, preferred decoration size is0×0,
optical surfaces paint404×552 exactly once and remain cached. Light/dark headless semantic
gates also pass: task-6-allocation-visual[-dark].log. Earlier benchmark logs contained the
now-fixed BoxPointer critical; their timings are historical diagnostics, not a clean gate.

Nested visual evidence also passes after the fix: effects-nested-{leaves,translucent,
decorative-glass,frosted-glass}.png, effects-nested-visual.json and
effects-nested-image-metrics.json; task-6-nested-visual[-native].log contains no critical,
disposed-actor or JS errors. Decorative difference7.65184; checker edge0.95565→0.04589;
actual moving MetaWindow difference8.99871; visible leaf phase5.95680; outside difference0.
The devkit's smaller initial monitor auto-maximized the original1000×700 test window,
so the nested-only scratch fixture uses800×600 to ensure its real MetaWindow moves.
The production renderer and headless fixture are identical; this is a test-scene correction.
Nested session configuration/runtime/data/cache/keyring are private; demo data is forced,
no real provider config is copied. The devkit viewer uses the inherited compositor socket
and PipeWire runtime only to display its own synthetic nested session. No host screenshot,
provider, credential or account read occurs. Scratch reproduction runs
python3 .superpowers/sdd/2026-10-07-post-mvp-execution/task-6-nested-launch.py and
python3 .superpowers/sdd/2026-10-07-post-mvp-execution/task-6-nested-visual-launch.py,
then the sibling task-6-nested-image-check.py. Each wrapper has110-second timeout and
Python TemporaryDirectory cleanup. The public interactive equivalent remains
DATA_SOURCE=demo tools/nested-shell.sh; headless automated reproducible commands above
are available from a clean checkout.

Final post-fix benchmark wrapper exit0, task-6-final-benchmark.log; finished true/error empty, no critical, disposed-actor or JS errors. All264 resource combinations and100 cycles/rebuild/disable pass. All worker source/report edits are complete.
