# Tasks 4–6 independent QA and UI review

Final status: APPROVED for implemented native scope in verified headless and nested devkit backends; hardware/manual gates remain open. Initial findings and subsequent fixed reviews below preserve the audit trail. Read-only production review; no graphics edits or commits.

## Inputs

Read Tasks4/5/6 briefs, approved design policy/budgets, Task4–6 report draft and frost feasibility; inspected core validation/material policy, manager state/subscription, indicator stack, numericText and call sites, effects engine/leaves/glass/frost/textures, packaged leaf SVG, preferences/defaults/schema/CSS/pt-BR changes, native resource/benchmark/visual probes and verifiers. Viewed current actual-popup frost and controlled-surface frost PNGs; inspected hashes of actual popup material captures. No duplicate full/native benchmark run.

## Strengths

The pure policy separates origin, reduced motion, transparency, compatible material and popup state. Manager passes detached validated decorative data; no account/controller data reaches graphics. Renderer independently denies user origin. One bounded timer moves cached particles with monotonic elapsed time; source/transition/blur cleanup precedes replacement. Decorations are nonreactive/nonfocusable/redundant; controls remain persistent. Blur uses native BACKGROUND behind controls, fixed radius18 and explicit capability fallback. Pango tnum is applied after St style replacement, uses AttrList.change and preserves foreground; native probe checks mapped features, equal repeated-digit widths and repeated style/remapping attributes.

## Issues

**Important — actual popup materials not yet visibly established.** `lib/ui/indicator.js:248` builds the sibling stack, while `lib/ui/themeEffects.js:118` applies the native surface. Current `effects-decorative-glass.png` and `effects-frosted-glass.png` have identical SHA256 `91013b0d0bca939e386a1b51e69f9eff97cd64e4c7e12923b2b67601b19adfea`. Actual popup gaps preserve crisp checker detail even with frost attached; controlled standalone surface shows blur. Positive resource/attachment counts therefore do not establish actual popup rendering. Author is actively investigating allocation/paint behavior; retain this issue until clean actual-popup region comparisons prove effective material.

**Important — visual verifier lacks semantic positive controls.** `tools/effects-visual-verify.js:3` accepts seven captures with no result error. It does not assert material differentiation, actual exposed-gap blur, unchanged outside sharpness or moving-window backdrop response. Capture count can pass the known invisible-popup regression. Add reproducible region/pixel comparisons or a separate asserted analyzer and record inputs/thresholds; resource checks complement rather than replace visual controls.

**Open release acceptance — performance and visual matrix.** Callback CPU, update cadence and synchronous open work omit compositor/GPU frame processing. No p95 native frame budget is established; documentation correctly marks it unmeasured. All22 inventory combinations currently test resource policies, not all22 visual fidelity/readability. Complete claimed capture review in both schemes/wallpaper variants and record unsupported fractional/multimonitor/human gates explicitly. Holographic foil and Aurora need distinct visible optical identity after material rendering works; one shared gradient/specular recipe plus tokens must be judged against the approved domain adaptation.

## Independent mutation evidence

Temporary isolated copy `/tmp/gaq-effects-mutants-lihhywzh` contains copied tests/core/schema only. Shared tree was never mutated. Existing `tests/themeEffects.test.js` baseline:12 passed/0 failed. Every single-edit mutant exited1 with an assertion failure; no survivor among these six guards:

| Mutant | Exact edit | Existing killing assertion |
| --- | --- | --- |
| Trusted origin | Remove `origin !== 'builtin' ||` | user override never acquires builtin effects; compatible trusted profiles |
| Reduced motion | Replace `animationsEnabled === true` with `true` | reduced motion wins live while transparency independent |
| Particle cap | Replace `Math.min(MAX_PARTICLES, raw.particleCount)` with raw count | every bounded preset; finite bounded counts |
| Material preference allowlist | Replace compatibility membership with preference != theme | applies only to compatible trusted profiles |
| Effects Off | Replace valid-mode condition with false | off and closed popup have no motion/live material |
| Closed popup | Remove `!popupOpen ||` | off and closed popup have no motion/live material |

Baseline12/0; mutant counts respectively10/2,11/1,10/2,11/1,11/1,11/1. Results retained in isolated `results.json`. This demonstrates sensitivity to selected pure guards; it does not mutate native teardown/paint or establish complete mutation coverage. Initial isolated runner used an unnecessary blocking MainLoop and was stopped; corrected runner mirrors existing top-level-await harness. No production changes resulted.

## Recommendations and verdicts

Fix actual popup paint/allocation first, then assert visual positive controls and inspect clean native captures. Preserve current sharp opaque reading zones and persistent focus actors. Record exactly which schema/material/scheme combinations have resource versus visual evidence. Keep GPU frame acceptance separate from callback metrics.

Spec compliance: **CHANGES REQUIRED / pending final evidence**. Quality: **CHANGES REQUIRED** for actual popup material visibility and visual regression detection. Security/policy boundary review: **PASS** for reviewed guard paths and selected mutants. No Critical finding. Final verdict will be amended after author evidence and fixes.

## Targeted fixed re-review — first round

Author replaced zero-preferred-size St background with an allocated St.Widget and made decoration a fill-aligned plain Clutter.Actor. Actual BoxPointer ALWAYS offscreen redirection was the second cause: child BACKGROUND blur sampled its intermediate buffer. Indicator now uses AUTOMATIC_FOR_OPACITY only for effective frost; nonfrost and close restore ALWAYS. Viewed refreshed actual frost capture: exposed header/gaps smooth, reading-card text and desktop checker outside sharp. The original actual-material visibility finding is resolved for this captured native configuration, pending semantic regression assertions. No GPU performance inference.

Cached optical presets now distinguish Holographic pearlescent multicolor diagonal bands from Aurora radial mesh lobes; Isometric grid uses +/-30-degree geometry. Native numeric probe adds both Sans and Monospace at24 with exact1111/8888 and09:59/10:00 width pairs. These source changes address earlier identity/font coverage concerns; final captures and probe outcomes remain pending.

Still open: screenshot-count-only verifier, bounded transformed leaf movement/visible exposed-decoration positive, final policy versus44capture evidence and lifecycle logs. No repeated native benchmark or production edit by reviewer.

## Final fixed review and verdict

**Spec compliance: APPROVED for the implemented native scope, with explicit open hardware/manual release gates. Quality/security: APPROVED.** Earlier Important material visibility and screenshot-only regression issues are resolved by the integrated paint fix and asserted pixel analyzer. No remaining Critical/Important implementation finding from this review. GPU frame-processing acceptance is still unmeasured, not silently passed.

Reviewed final light and dark inventory sheets containing44 actual popup crops (22 styles each): readable opaque card values, bounded scrolling, visible distinct Aurora mesh, Holographic diagonal pearlescent bands, Isometric diamonds and organic exposed leaves. Inventory captures show one chosen mode/material per scheme;264 benchmark combinations separately establish resource/policy behavior, not264 screenshot comparisons. Fixed12px gutter is present in all modes to avoid settings-triggered geometry shifts; final native layout log covers eight LTR/RTL normal/expanded and normal/large-font combinations.

Final semantic metrics use a measured actual6px-wide exposed gutter, avoiding reading cards. Light checker edge0.95565 falls to0.04589 under frost; dark1.72927 falls to0.02314. Decorative differences7.65184/11.69209, actual moved-window differences8.99871/16.42702, paired leaf differences5.89807/5.90384; outside region difference0 in both schemes. Positive unblurred edge must exceed0.1, preventing a blank/flat baseline from passing. This is local bounded-region evidence, not exhaustive every-pixel/hardware coverage. Source uses clamped gutter-lane positions with rectangular actor clipping, and paired leaf phases change visible exposed geometry.

Independent semantic sensitivity replay used only `/tmp/gaq-image-counterexamples-bnpi2vri`: copied analyzer, metadata and captures, no shared edits. Baseline exited0. Six deliberate counterexamples each exited1: substitute translucent for frost; substitute translucent for decorative; identical leaf phases; identical before/after backdrop; flat unblurred checker ROI; alter outside desktop ROI. Thus invisible materials, frozen motion and over-broad changes cannot pass these specific final assertions. Results retained in temp `results.json`. Together with earlier six policy mutants, **6/6 policy guards killed and6/6 image counterexamples rejected**.

Final native quick log returns actual Eval true with404x552 independent layers, optical primitives, live reduced motion/transparency,100 lifecycle cycles, focus/control identity and numeric checks. Pango mapped six-digit widths78px; Sans1111/8888=72/72 and09:59/10:00=81/81; Monospace76/76 and95/95. One tnum attribute remains alongside foreground after100 text changes/style/remap. Benchmark actual Eval true includes22x12 combinations, separate60-second static/leaves/frost runs,1755 leaf callbacks (~29.25/s), zero closed sources/actors/blur, and position rebuild/disable assertions.192153 microseconds is summed monotonic elapsed callback work, not CPU or GPU frame duration; synchronous opens32.034/41.191/59.677ms are not time-to-present. No benchmark repeated by reviewer.

Runner creates the ignored output directory under umask077; common headless helper isolates0700 runtime. Eval false/fatal errors fail the gate. Python Pillow is documented developer-only, no runtime dependency. Analyzer uses explicit conditions, not optimized-away Python asserts. Remaining fractional scale/multimonitor origins, human keyboard/Orca and hardware frame duration gates are disclosed. Selected durable evidence is archived under `docs/temp/reviews/assets/post-mvp/`.

## Reopened native nested-workflow blocker

Prior final approval is **superseded**: author reported strict nested devkit failure with background404x552 but decoration0x0. Headless-only positive evidence did not establish the requested nested workflow. Decoration allocation/paint is an Important implementation blocker, not a manual waiver. Spec/quality verdict now CHANGES REQUIRED until robust sibling allocation and fresh nested strict probe plus screenshot prove actual optical geometry. Author owns the fix; reviewer remains read-only.

## Nested allocation fix targeted re-review

EffectsStack now measures only foreground controls and uses set_allocation plus one identical local viewport allocation for background, decoration and foreground. It does not invoke St's default child allocation twice. Allocation/initial geometry finite guards prevent NaN/zero optical surfaces; allocation is layout-driven rather than a per-frame stage mutation. _pinPopup now rejects nonfinite/empty captured geometry and allocates its fixed anchor before BoxPointer.setPosition, removing the inherited early-unallocated-anchor NaN path.

Inspected fresh `task-6-allocation-headless.log` and actual `task-6-nested.log`/`task-6-nested-native.log`: actual Eval true, both404x552, optical404x552 with one cached paint, exact numeric checks; no CRITICAL/JS ERROR/disposed diagnostics in those native logs. Strict assertions now compare all three viewport boxes, positive decoration allocation, zero decoration preferred size and foreground-only stack width. Viewed actual `effects-nested-frosted-glass.png`: exposed gutter is smooth, cards/text and outside checker sharp. Nested visual metadata reports decorative/frost child404x552, mapped, one paint. This resolves the zero-decoration allocation blocker for the tested nested/light configuration. Final fresh semantic analyzer and benchmark health evidence remain pending; prior benchmark statistics are superseded where logs had NaN criticals.

## Final two-backend verdict after allocation/anchor correction

**Spec compliance: APPROVED for implemented native scope on verified headless and nested devkit backends, with disclosed hardware/manual release gates. Quality/security: APPROVED. No remaining code blocker identified.** This supersedes the reopened allocation verdict above.

Final actual nested light semantic metrics (`effects-nested-image-metrics.json`) confirm checker edge0.95565→0.04589, decorative7.65184, moving backdrop8.99871, paired leaves5.95680 and outside0. Strict nested visual native log contains no CRITICAL/JS ERROR/disposed diagnostics. Actual nested screenshots and positive404x552 cached optical geometry support the fix, independently of prior headless attachment counts. Parent/author additionally report final post-fix critical-rejecting headless semantic gates green in both schemes; no reviewer native rerun was performed.

The earlier policy/image counterexample sensitivity evidence remains applicable:6/6 selected pure guards and6/6 image counterexamples rejected. Source changes retain clipping, foreground-only measurement, stable gutter and finite initial anchor geometry without fixture-delay workarounds. Final fresh three60-second benchmark is being rerun to supersede unhealthy earlier NaN logs; its numerical results are not asserted here. GPU p95, fractional scale/multiple monitors and human keyboard/Orca remain explicit open release gates, not code waivers or inferred passes. Root owns final whole-tree/layout/package checks.
