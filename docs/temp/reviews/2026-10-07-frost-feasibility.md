# Native frost feasibility — GNOME Shell 50

The renderer implements a native backdrop surface beneath the existing popup controls.
It uses the installed GNOME Shell 50.5 / Mutter 50.5 API, GI namespaces Shell 18 and
Clutter 18: `new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND, radius: 18,
brightness: 1})`, attached with `actor.add_effect_with_name()` and removed with
`actor.remove_effect_by_name()`. Radius is fixed. No wallpaper snapshot, desktop clone,
per-card blur, browser renderer, helper extension or native bridge is required.
The local API exposes `radius`; newer online documentation must not be used to infer
an installed `sigma` property or Clutter 51 shader/snippet APIs.

The surface and decoration siblings clip to the popup allocation. Cards, summary,
section headings and footer retain opaque reading backgrounds, full actor opacity,
and the same controls and key-focus targets. Background tint opacity is validated
separately from hex colors and bounded to 0.72–1. Blur affects the background sibling
rather than the text or control subtree. A missing/failing native capability falls
back to decorative glass; that fallback is not evidence of real frost completion.

`tools/effects-visual-probe.js` captures a private native Wayland Shell with demo data
and a synthetic checkerboard window. It closes GNOME's Welcome dialog, then captures
leaves, translucency, decorative glass, real frost and a controlled empty surface.
The controlled surface separates blur from opaque reading zones. Moving the actual
MetaWindow behind that surface checks that the backdrop changes rather than freezing
a wallpaper image. Desktop pixels outside the surface are compared separately.
Raw captures and reproducible logs are in the ignored execution scratch directory;
no account or real application content is captured.

`tools/effects-probe.js` checks supported frost and a deliberately failing native
attachment, user-origin denial, opaque reading zones, live transparency/reduced-motion
changes, focus/control identity and repeated lifecycle cleanup. The engine removes
sources and transitions before releasing actors, and marks a sibling destroyed from
C before touching other live siblings. `tools/effects-benchmark-probe.js` also checks
all 22 built-in styles in both schemes, three modes and both animation preferences,
then records separate 60-second static, leaves and frost runs and cleanup/rebuild/disable.

The benchmark reports synchronous popup-open work and decorative callback elapsed work time,
update count and owned resources. These are not compositor/GPU frame durations.
The proposed p95 frame-processing gate (within monitor budget and at most +2 ms over
static) remains unmeasured because this harness does not expose a dependable GPU frame
duration measurement. A 34 ms ambient callback interval is an update-rate choice,
not the cost of rendering a frame. Real hardware performance acceptance, fractional
scaling, multiple-monitor origins, physical keyboard traversal and Orca remain open
manual gates. Native frost is implemented and testable; its full release acceptance
is not certified by this feasibility result.

The clean actual-popup visual gate passes in both schemes. Light checker-edge mean falls
from 0.95565 to 0.04589; dark falls from 1.72927 to 0.02314. Moving the actual window changes
the frosted gutter while pixels outside stay identical. An earlier attachment-only test
missed BoxPointer's ALWAYS offscreen redirect; the owned popup now permits direct full-opacity
painting only for effective frost, restoring the original redirect for other/closed states.
The visual gate also checks actual decorative-glass differences and visible paired leaf motion.
All 22 profiles have actual light/dark native inventory captures, independent of the resource
matrix. Selected evidence is archived in `assets/post-mvp/` by the final validation owner.

The final 3×60-second native benchmark and strict resource gate pass: static/leaves/frost
synchronous open work is 38.220/49.524/70.915ms. Leaves produce 1758 updates in 60.000348s
(29.2998/s), 249964µs accumulated callback elapsed work, 8 particles/one source. Frost has
one blur and no ambient source. 100 active cycles, position rebuild and extension disable
leave no owned actors/sources/blur. The measured clock is GLib monotonic wall-time; it
is not CPU utilization or compositor/GPU duration. Existing allocation warnings are
reported separately from fatal/disposed-actor errors, which the gate rejects.

The strict devkit check subsequently exposed a zero-sized decoration parent and an
inherited invisible-popup-anchor allocation race. The final EffectsStack measures
foreground controls alone and explicitly allocates all three siblings identically;
finite captured anchor geometry is allocated before BoxPointer uses it. Native headless
and devkit six-case/100-cycle checks now pass with404×552 sibling/optical surfaces and
no critical/disposed/JS errors. Devkit actual material screenshots and two-axis semantic
checks pass: checker0.95565→0.04589, decorative difference7.65184, actual moving-window
difference8.99871, leaf phase5.95680, outside0. Earlier benchmark output included the
now-fixed BoxPointer critical and is historical diagnostic evidence; the final strict
3×60-second benchmark completed after this geometry correction (wrapper exit0 with no critical/disposed/JS errors). Hardware frame
processing remains unmeasured.
