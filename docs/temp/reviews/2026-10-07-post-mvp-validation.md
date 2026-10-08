# Post-MVP execution and validation

Date: 2026-10-07. Base: `61bced1`. Implementation branch:
`feat/post-mvp-effects`, isolated worktree `gnome-ai-quota-post-mvp`.
The integrated execution plan extends M4; M4 remains closed.

The [measured environment](assets/post-mvp/environment.json) records GNOME Shell
50.5, GJS 1.88.1, Mutter 50.5, GTK 4.22.5 and libadwaita 1.9.4 from installed
commands/packages. Tests use a private Wayland Shell with a 1280 × 800 virtual
monitor, memory settings and synthetic/demo data. The machine has an Intel
i7-11800H, Intel UHD and NVIDIA RTX 3060 Mobile devices; device inventory alone
does not establish which renderer the headless compositor used.

## Delivered work and scope

M5 extracts the pure bar model, coalesces response bursts, retains keyboard focus
across card updates, exposes keyboard tooltips, orders the legend's Escape handling
and adds scoped CI lint. Numeric labels use a central Pango tabular-number helper;
native mapping/style changes must retain its attributes.

M6 defines bounded, declarative effect profiles with loader-owned origin. A user
override of a built-in slug stays untrusted. Shared native particle, texture,
material and lifecycle primitives implement the four approved appearances.
The inventory contains 22 explicitly tested slugs: 20 existing themes plus
Organic/Biophilic and Glassmorphism. Each theme's adaptations and deliberately
omitted effects are recorded in the [fidelity audit](2026-10-07-theme-fidelity.md).

M7 delivers the [isolated WebGL study](2026-10-07-webgl-feasibility.md) and
[product proposals](../plans/2026-10-07-post-mvp-product-decisions.md).
They introduce no required browser dependency, account-deletion action, font
download or second notification threshold.

## Independent review and corrections

Specialists implemented frontend behavior, tooling, theme profiles and native
graphics with disjoint ownership. Cross-review found and corrected focus loss
on card reparenting and authentication-required transitions. Native probes found
St resetting Pango attributes on mapping and C-driven sibling disposal ordering;
the owner corrected both. Clean screenshots subsequently exposed a backdrop
sampling defect that resource-count assertions had missed: BoxPointer's default
offscreen redirect made the child blur sample an intermediate texture. A scoped
redirect change for effective frost corrected the actual popup. The coordinator
and independent reviewer inspected the corrected capture: controls and text stay
sharp while exposed background gaps blur. Semantic regression checks now pass.
The review also required separate pearlescent, Aurora mesh and Isometric diamond
primitives, and visible leaf gutters. A second allocation issue left optical
children at zero size during theme replacement; using the actual background
allocation corrected it. Both-scheme semantic comparisons and the final inventory pass.
Parallel native gates exposed a shared host runtime sentinel collision in the
headless helper. It now creates a private mode-0700 `XDG_RUNTIME_DIR` for each
session, with strict native-error checks retained; affected native visual gates passed.

Existing specialist threads were reused because the harness rejected a new
thread at its concurrency limit. Reviewers did not review their own implementation.
Theme fragments ran in parallel under explicit owner authorization. Coupled
runtime and registry changes were committed together to keep commits testable.

## Measured evidence

- Baseline: 279 GJS tests passed. Final coordinator `tools/check.sh` exited 0:
  301 tests passed with zero failures, ESLint and syntax passed, extension enabled
  in a real private headless Shell, schema checks passed, and the translation
  catalog reported zero problems. Whitespace checks passed.
- Independent isolated mutation checks killed six of six selected policy mutants:
  origin, reduced motion, particle cap, material compatibility, Off and popup close.
  This measures those assertions, not native paint/teardown mutation coverage.
- Root static analysis: exit 0 with Bandit, Semgrep, ShellCheck and zizmor.
  Zizmor ran offline; gitleaks was unavailable and skipped.
- Final native 60-second runs: static had no ambient callbacks; leaves made 1,758
  updates (29.29983/s), using eight particles and one source, with 249,964 microseconds
  of total callback elapsed work time. Frost had no ambient callbacks and one blur effect.
  These values came from the native benchmark report, not a GPU or CPU-time profiler. The monotonic clock measures elapsed wall time inside decorative callbacks, excluding compositor/GPU processing.
- Synchronous menu-open work was 38.220/49.524/70.915 ms for static/leaves/frost.
  This measures execution, not first-painted latency.

The benchmark passed all 264 resource combinations, 100 active open/close cycles,
panel-position rebuild and disable. Closed/disabled owned sources, particles,
decoration actors and blur effects were zero. Its native runner exited 0 without
fatal/disposed-actor diagnostics. The [archived benchmark](assets/post-mvp/effects-benchmark.json)
preserves measured values and records the monotonic clock's meaning explicitly.

## Visual evidence

The native inventory captured 22 themes in each scheme: **44 images**, reviewed
by the coordinator and specialist reviewers. The separate policy/resource matrix
covers 22 × 2 schemes × 3 modes × 2 animation preferences: **264 combinations**.
These counts describe different tests; the resource matrix is not 264 visual captures.

| Metric | Light | Dark |
| --- | ---: | ---: |
| Actual exposed-gap checker edge, translucent | 0.95565 | 1.72927 |
| Same edge, frost | 0.04589 | 0.02314 |
| Decorative versus translucent mean RGB difference | 7.65184 | 11.69209 |
| Moved underlying window difference within actual frost | 8.99871 | 16.42702 |
| Outside-popup pixel difference | 0 | 0 |
| Paired leaf phase difference | 5.93644 | 5.89760 |

Values come from [light metrics](assets/post-mvp/effects-image-metrics.json) and
[dark metrics](assets/post-mvp/effects-dark-image-metrics.json), produced by
`tools/effects-image-check.py` from measured native regions. Edge values are mean
adjacent-pixel RGB differences, not frame durations or contrast ratios. Synthetic
captures use a detailed checker/stripe window and move it beneath the actual popup;
controlled empty surfaces separately verify local backdrop sampling.

| Appearance | Light capture | Dark capture |
| --- | --- | --- |
| Leaves | [Light](assets/post-mvp/effects-leaves.png) | [Dark](assets/post-mvp/effects-dark-leaves.png) |
| Translucent | [Light](assets/post-mvp/effects-translucent.png) | [Dark](assets/post-mvp/effects-dark-translucent.png) |
| Decorative glass | [Light](assets/post-mvp/effects-decorative-glass.png) | [Dark](assets/post-mvp/effects-dark-decorative-glass.png) |
| Real frost | [Light](assets/post-mvp/effects-frosted-glass.png) | [Dark](assets/post-mvp/effects-dark-frosted-glass.png) |

Nested/devkit counterparts are archived for [leaves](assets/post-mvp/effects-nested-leaves.png),
[translucency](assets/post-mvp/effects-nested-translucent.png),
[decorative glass](assets/post-mvp/effects-nested-decorative-glass.png) and
[real frost](assets/post-mvp/effects-nested-frosted-glass.png).
The [nested metrics](assets/post-mvp/effects-nested-image-metrics.json) confirm
actual backdrop movement, local blur, decorative difference and visible leaf movement,
with unchanged outside pixels. The devkit fixture uses a smaller synthetic window
so it can move rather than auto-maximize on the smaller monitor.

The [light inventory](assets/post-mvp/effects-inventory-light-sheet.png) and
[dark inventory](assets/post-mvp/effects-inventory-dark-sheet.png) combine scaled
native popup crops for inspection. The original 44 captures remain ignored;
`tools/effects-check.sh inventory` reproduces them. Archived artifacts contain
synthetic/demo content only and are excluded from the extension package.

Numeric Pango evidence: Sans widths 72/72 for `1111`/`8888`, 81/81 for
`09:59`/`10:00`; Monospace 76/76 and 95/95. One tabular-number attribute remains
after 100 text changes and remapping; foreground attributes are preserved.

## Remaining acceptance limits

The late nested/devkit run exposed a zero-sized decoration sibling despite a
404 × 552 background. A custom stack now measures only foreground controls and
explicitly allocates all three siblings to one viewport. Strict tests assert the
actual decoration and optical paint in both backends. The fix passed headless and
nested tests and the nested semantic screenshot gate; no platform waiver was used.

The stricter runner also caught Clutter NaN geometry missed by its earlier fatal
filter. Review traced it to the inherited popup anchor being handed to BoxPointer
before its first allocation. The finite captured anchor is now explicitly allocated
before `setPosition()`. No fixture delay or error suppression was needed. Both
backends' final strict quick and semantic runs contain no CRITICAL/JS/disposed-actor
errors. Earlier benchmark counts remain descriptive historical measurements;
the fresh critical-rejecting benchmark passed after both geometry fixes. Its wrapper exited 0 with no CRITICAL/JS/disposed errors.

The proposed GPU p95 processing gate is unmeasured. Callback elapsed work time and update
cadence do not establish frame-rendering cost. Frost's hardware performance,
fractional scaling and multiple-monitor acceptance remain open; its implementation
must not be described as fully release-certified on this evidence alone.
Physical keyboard traversal, Orca, live-provider operation and current provider
terms require owner participation. Automated tests use private demo sessions and
synthetic content; they do not inspect real credentials.

Coordinator `tools/prefs-smoke.sh` exited 0: six traversal combinations (three
runs each), lifecycle actions, six state matrices and full startup/target changes
passed. `tools/layout-check.sh` exited 0 with all eight LTR/RTL, normal/expanded
text and normal/large-font combinations. The isolated session's accessibility
service reported a permission denial; these GUI assertions do not certify Orca.

The independent [UI/frontend/QA review](2026-10-07-post-mvp-qa-ui-review.md)
approved the implemented scope. Six selected image counterexamples were rejected
(missing frost/glass, frozen leaves/backdrop, flat checker and outside alteration),
in addition to six killed policy mutations. These targeted controls do not claim
exhaustive native mutation coverage. The independent
[architecture/security/UX review](2026-10-07-post-mvp-domain-review.md) approved
the reviewed code and measured native visual specification; hardware gates remain
separate from that approval.

Coordinator `tools/effects-check.sh quick` exited 0 with actual Eval success for
leaves lifecycle, popup integration, material/trust, cached optical primitives,
live popup lifecycle and numeric text. Allocated siblings measured 404 × 552.
The final critical-rejecting run has no CRITICAL/JS/disposed-actor errors. Ordinary
Clutter allocation warnings during scripted rebuilds are distinct from those
fatal checks; this does not claim a warning-free Shell log.

The [nested helper verification](2026-10-07-post-mvp-nested-helper.md) exercised
the actual normal and `prefs` entrypoints with demo data and dummy configuration:
both exited 0, strict six-case Eval probes passed, runtime permissions were 0700,
and both temporary sessions were removed. Its source received independent security
review. The wrapper uses private D-Bus/keyring/settings/data/runtime and preserves
only the required parent display/PipeWire preview endpoints. The helper suppresses
native stderr as before, so its smoke output does not itself certify a clean native
log; the separate strict native runs supply that evidence.

`tools/pack.sh` exited 0 and produced
`dist/gnome-ai-quota@dandgabr.github.io.shell-extension.zip`. A byte comparison
checked **116 source files** (all files under `lib`, `icons` and `themes`, plus
entry points, metadata, schema source and the client-ID helper): zero missing or
different files. The package includes the new effects, leaf asset and both themes;
developer npm files, WebKit experiments, test probes, reports and screenshots are
absent. No runtime file imports WebKit. Its compiled schema/catalog are covered by
the successful build/schema/catalog checks.
