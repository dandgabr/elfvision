# Manual regressions and connectors: validation record

Date: 2026-10-08. Status: source corrections, integrated/native gates and rebuilt local v0.1 ZIP verified. Commit/PR provenance is recorded by the delivery manifest and branch. Human visual acceptance remains separate.

This record follows the [manual regression ledger](2026-10-08-manual-regressions.md),
the [material and numeric diagnosis](2026-10-08-theme-material-diagnosis.md), and
the [connector design](../specs/2026-10-08-connectors-design.md). It records supplied
root execution evidence and read-only inspection of retained artifacts. This
documentation task ran no native session, test suite, scanner, or package build.

The working branch is `fix/manual-regressions-connectors`, with base HEAD
`db6c259d1025071c346b73b20be1de1972fea834`. Root reports that PR #14 was merged
before this branch was created from `origin/main`. The corrections are subsequent
working-tree changes; the base commit alone does not identify those changes.
The renderer gallery has its own source manifest, described below. The new PR is a subsequent correction branch. The rebuilt archive has passed byte audit and installation; final commit identity is recorded in the local delivery manifest.

## Checks recorded so far

| Check | Evidence | Result and limit |
| --- | --- | --- |
| Local integration gate | `/tmp/gaq-manual-final-check.log` | **495 passed, 0 failed**. Private disk/keyring and cross-process connector checks also report PASS; syntax, ESLint, native enable, ShellCheck, schemas, gettext, and whitespace stages finish in the supplied log. The final rerun includes the expanded-font Accounts correction and final probe/harness changes. |
| Static analysis | `/tmp/gaq-manual-final-sast.log` | Root reports success for five tools: Bandit, Semgrep, ShellCheck, zizmor, and Gitleaks. The inspected log ends with `5 tool(s) ran`. Bandit retains two `nosec` warnings; this is not a warning-free claim. |
| Native connector lifecycle | `/tmp/gaq-connectors-native-final-output.txt` | **Four variants pass**: LTR, RTL, expanded text, and RTL with expanded text. The recorded operations are add, connect, rename, cancel, remove, reset, reconfigure, and recovery. The later full preferences/font matrix also passed independently. |
| Portuguese catalog | Standard extraction, catalog checks, and compilation reported by the translation owner | **453 template entries and 453 translated entries**; missing, extra, fuzzy, and untranslated entries are all zero. Placeholder checks and `msgfmt --check` pass. |

The temporary execution logs have durable copies under [the evidence directory](assets/manual-regressions/). Private desktop startup and
shutdown warnings appear in the native logs. A passing assertion does not imply
that every desktop service started or that the journal was empty.

## Numeric continuity and pointer raster

The original native effective-layout RED is retained at
`/tmp/gaq-numeric-markup-red-output.txt`. Its eight attribute observations include
four without `tnum=1`, and the probe reports the feature-continuity assertion
failure. This exposes a shaping change that stable allocation alone did not
detect.

The replacement uses an escaped internal markup span for `tnum=1`, preserves
literal displayed text, and checks effective Pango layout attributes rather than
only the separately supplied style list. The native GREEN at
`/tmp/gaq-numeric-markup-green-output.txt` records completion with an empty probe
error, six effective attribute events retaining the numeric feature and themed
foreground, and 100 destroyed labels. It includes shutdown allocation warnings;
the helper result does not certify the entire journal.

The durable [actual-pointer record](assets/manual-regressions/numeric-pointer.json)
contains four click cycles and **80 samples**. Read-only inspection confirms
`finished: true`, an empty error, and `tnum=1` in all 80 effective attribute
records. All four recorded money-region bitmaps have the same SHA-256 digest.
The corresponding [first](assets/manual-regressions/numeric-toggle-0.png),
[second](assets/manual-regressions/numeric-toggle-1.png),
[third](assets/manual-regressions/numeric-toggle-2.png), and
[fourth](assets/manual-regressions/numeric-toggle-3.png) captures are retained.
This closes the recorded pointer-time numeric case; it is not a claim about every
font, theme, account value, or physical display.

## Materials, geometry, and light/dark pairs

The [current gallery](assets/manual-regressions/index.html) links **220 screenshots**:
22 themes × two schemes × five cases: opaque, translucent, decorative glass,
frosted glass, and frosted glass with Effects Off. The
[measurement record](assets/manual-regressions/measurements.json) contains all 220
entries, and all referenced images exist. Every recorded effective policy material
matches the recorded renderer material. The earlier rejected 176-image matrix is
excluded from acceptance because its opaque inputs did not reliably select the
labeled state.

The [renderer source manifest](assets/manual-regressions/render-source-sha256.json)
contains **39 files**. Read-only SHA-256 comparison found all 39 matching the current
files at this draft's inspection. This identifies the renderer inputs for the
gallery; it does not fingerprint the complete connector/preferences implementation
or make an older execution fresh after a future source edit.

The material reviewer records visual inspection of the 44 opaque theme/scheme
popup crops and full-stage Cyberpunk light opaque/frosted captures. The reviewed
viewport shows complete provider-name glyphs, the transparent footer, and the
revised daylight Cyberpunk framing. Source profiles permit explicit materials
for all built-ins, retain the default material under Follow the theme, and use
transparent tint alpha 0.80 light / 0.74 dark. Effects Off removes motion and
decoration while retaining material; Transparency Off forces opacity. Custom
theme origin remains outside packaged-effect permissions. These observations do
not certify hidden expanded credit rows, all physical backgrounds, or performance.

## Final integrated and native gates

- [Integration](assets/manual-regressions/integration-check.txt): **495 passed, 0 failed**, build, cross-process removal, private keyring, syntax, ESLint, native enable, ShellCheck, schema/gettext and whitespace all pass after the final source changes.
- [Preferences](assets/manual-regressions/preferences-all.txt): six traversal variants and six state variants pass, including LTR/RTL, expanded translations and Sans 22. Native startup and lifecycle pass. The real recheck button invokes configuration recovery; internal Pango word/character wrapping fixes the originally measured 550px minimum at a 360px viewport without relaxing containment assertions.
- [Connector lifecycle](assets/manual-regressions/connectors-native.txt): four native add/connect/rename/cancel/remove/reset/reconfigure/corrupt-metadata recovery variants pass.
- [Resource matrix](assets/manual-regressions/native-resources.txt): **264 combinations across 22 themes** pass. Bounded overview/allocation settlement fixes the fixture timing race, preserving strict zero-resource and existing ceilings. [Lifecycle](assets/manual-regressions/native-lifecycle.txt): **100 cycles**, zero retained effects resources after disable/destroy.
- [Layout](assets/manual-regressions/native-layout.txt): **12 cases** pass, including complete large monetary values in LTR/RTL and shadow gutters.
- [Frame profile](assets/manual-regressions/frame-profile.json): static 1,760 samples/p95 3.344ms; leaves 2,615/p95 5.055ms; static glass 1,763/p95 3.871ms; frost 1,761/p95 4.500ms. Leaves add 1.711ms and frost 0.629ms. All samples satisfy the unchanged p95 16.667ms total and 2ms added budgets. The measurement is serialized CPU submission plus GPU-finish wall duration in a synthetic headless session, not pure GPU timer time or physical presentation latency.
- [Numeric matrix](assets/manual-regressions/numeric-matrix.json): six System light/dark × Off/Subtle/Full cases, **24 actual pointer clicks and 480 effective feature samples**. Each case retains `tnum=1` and alternating expansion state; four settled numeric rasters are identical within each case. These images extend the original 80-sample report; transient-paint and physical-display acceptance remains limited to the recorded sampling.

## Remaining participation and delivery

Real-provider sign-ins, human Orca announcements, physical GPU/monitor variants and actual lock/suspend are not certified by these fixtures. Human style/material acceptance remains open until the supplied individual captures and corrected nested environment are reviewed. The rebuilt v0.1 archive supersedes the earlier local archive after passing byte audit and isolated installation. Root owns commit, a new PR and local checksum/source provenance; no GitHub Release, extensions.gnome.org publication or merge is authorized by these checks.


## Test-harness integrity

The pointer harness now explicitly selects a System scheme/motion mode, verifies each actual expansion state and every effective-feature sample, and waits at most five seconds for the asynchronous indicator before use. One native startup otherwise exposed an undefined-indicator fixture race without an extension error. Missing required probe files now exit the private shell harness nonzero rather than silently evaluating an empty script. A positive missing-file test and the ordinary valid-probe runs verify both sides. The final six-case logs use the real verifier file; an earlier incorrectly passed verifier string is excluded from final verifier evidence. No failing run is presented as a passing verifier.


## Final packaging and additional regression results

- [Package audit](assets/manual-regressions/package-audit.json) verifies all ZIP members against current source/generated catalogs, unique safe paths, CRC, runtime sources, AGPL/OFL licenses, GNOME Shell 50 declaration and version-name 0.1. Tests/docs/gallery/development tools are excluded; the installed client-ID helper is included.
- [Actual installation](assets/manual-regressions/installed-package.txt) installs this exact ZIP into private XDG roots via `gnome-extensions install --force --print-uuid`, loads its installed path in a separate GNOME Shell, and renders five synthetic cards. This is an archive installation test, not a symlink-source smoke test.
- [Close regression](assets/manual-regressions/native-close.txt): actual outside clicks and another panel popup preserve the closing origin and release owned resources in Bento Grid/Glassmorphism. The fixture moves a newly created virtual pointer away from its default hot corner before the scenario, preventing Overview from consuming the opening action.
- [Shadow regression](assets/manual-regressions/native-shadow.txt) plus pixel comparison: light left/right shadow delta 19.910/20.041; dark left/right 14.753/15.420. Both sides retain visible shadow gutters.
- [Missing-probe guard](assets/manual-regressions/missing-probe-guard.txt): an unreadable required probe exits nonzero; final valid-pointer logs use the explicit verifier and succeed. The integration gate and five scanners were repeated after these final harness changes and passed.

All retained images use made-up data. Real credentials and provider configuration were not inspected. The archive remains local: no public release, extensions.gnome.org upload or merge was performed.


## Delivery closure

[PR #15](https://github.com/dandgabr/gnome-ai-quota/pull/15) contains the committed corrections and evidence. The first implementation commit is `0d86b5c5bd03646d01e44e08d93c60b265254a1f`; this delivery-note update changes documentation only. Its ten remote checks passed before this note. Local `dist/v0.1/build-manifest.json` records the final clean source commit and all 135 ZIP member hashes, with `SHA256SUMS` alongside the exact privately installed archive. Archive SHA-256 is `f4b1fd3147fb7ac6bf3883e0685bfe90d61a798d810491c2589a32ac33d1842e`.

The corrected nested demo and local screenshot gallery were opened for the user. Read-only private extension state reports enabled `true`, state `1.0`, error empty. The working tree was clean after the implementation commit and push. No merge or public release was performed. The initial Open rows in diagnosis are reconciled above; remaining acceptance is human visual judgment and the explicit real-account/Orca/physical-device limits, not unresolved source defects found by these reviews.
