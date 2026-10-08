# v0.1 release validation

This record accompanies the first local v0.1 extension build. The audit began at
`58a6388` on `feat/post-mvp-effects`. During validation PR #13 was found merged;
`origin/main` was fetched at `a3ffd6f`, whose tree exactly matched the starting
revision. Work moved to `release/v0.1-audit` without changing reviewed contents.
The final build manifest records the accompanying source commit and ZIP checksum.

## Independent review and corrections

The [coordinated audit](2026-10-08-v01-audit.md),
[UI/design review](2026-10-08-v01-ui-design.md) and
[final QA review](2026-10-08-v01-qa-final.md) distinguish findings, corrections,
actual reproductions, private mutations and participation limits. File ownership
kept runtime, frontend, documentation and integration edits separate.

Corrected credential revision fencing, bounded asynchronous configuration reads,
retry-floor/cap jitter, keyring notification suppression, late cancelled HTTP
dispatch, custom System-theme provenance and atomic setup threshold validation.
The ZIP now includes the main AGPL license alongside all three font licenses.
About/setup text and its translation correctly describe used quota. All four
focus borders use a derived contrast color without changing normal accents or
meter fills. The main README is a consumer guide titled **Gnome AI Quota**, with
providers, features and installation; architecture and phasing remain in internal
reference documents. Historical records retain their original observations under
explicit snapshot notices.

## Final-source gates

- `tools/check.sh`: **465 passed, 0 failed**, plus private disk/keyring integration,
  JavaScript/script syntax, ESLint, native enable, ShellCheck, schema and gettext
  checks. Evidence: [check-release.txt](assets/v01/check-release.txt).
- Actual preferences traversal/state/lifecycle/startup passed in the private GTK
  runner, including all six traversal and six state variants. The invalid setup
  pair has an actual-widget RED, followed by preservation, atomic batch and shared
  settings assertions. [Preferences evidence](assets/v01/prefs-final.txt).
- Focus: pure tests check **60 palette combinations**, including all System
  accents. Actual native inspection covers **88 widget observations** across
  **44 theme/scheme cases**, Not tracked and the footer. Minimum measured adjacent
  contrast is **3.628:1**, with native focus and stable preferred geometry.
  [Native RED](assets/v01/all-theme-focus-red.txt),
  [native GREEN](assets/v01/all-theme-focus-green.txt),
  [measured colors](assets/v01/focus-metrics.json).
- Layout: **12 native cases** pass, including RTL, expanded text, large fonts and
  long monetary readings. [Layout evidence](assets/v01/layout-release.txt).

- Resource matrix: **264 combinations** and teardown checks pass after bounded
  completion waiting. [Final matrix](assets/v01/matrix-release.txt).
- Lifecycle: **100 actual open/close cycles**, position rebuild and disable leave
  zero owned sources, particles, blur effects or decorative actors.
  [Final lifecycle](assets/v01/lifecycle-release.txt).
- All **five scanners** ran and passed. All-reference history and current-tree
  redacted Gitleaks scans also exited 0. Built-in and staged checks use an empty
  configuration directory. [Scanner evidence](assets/v01/sast-release.txt).
- Inventory produced **44 current native captures** and reviewed light/dark sheets;
  the sheets and metadata are archived, while individual captures remain in the
  ignored developer evidence directory. [Light sheet](assets/v01/effects-inventory-light-sheet.png),
  [dark sheet](assets/v01/effects-inventory-dark-sheet.png).
- Actual pointer closure passes **four cases**; paired shadows pass light/dark
  lateral strips, and **four fractional-scale virtual-monitor cases** pass texture,
  outside-region and cached-value repaint controls. These predate only the final
  focus-color derivation; no reading, viewport, material or closure code changed.
  [Pointer](assets/v01/close-final.txt), [shadow](assets/v01/shadow-green-pixels.txt),
  [virtual-monitor pixels](assets/v01/monitor-final-pixels.txt).

## Final-source performance

`tools/effects-check.sh frames` exits 0. The measured environment reports GNOME
Shell **50.5** and GJS **1.88.1**. Four 60-second conditions have
1,760 / 1,760 / 1,759 / 1,759 completed samples; all **14 source hashes** match the
final renderer/compiler/template files. The unchanged 16.667 ms total and 2 ms
added-p95 gates pass. [Raw profile](assets/v01/frame-profile.json),
[verifier](assets/v01/frames-release.txt).

| Condition | p95 processing wall time | Difference from paired static condition |
| --- | --- | --- |
| Static Solar | 4.161 ms | 0 |
| Leaves | 4.023 ms | -0.138 ms |
| Static Glass | 1.568 ms | 0 |
| Frost | 3.117 ms | 1.549 ms |

This is serialized CPU submission plus GPU-finish wall time under forced redraw,
not pure GPU timing or presentation latency. The negative leaves difference is
an observed sample difference, **not evidence that effects speed up rendering**.
Sequential baseline variation is visible; these runs do not establish causal or
statistically significant performance gains, or hardware-wide guarantees. The
preceding valid profile before the final focus change remains under
`assets/v01/frame-profiles/before-all-theme-focus.json`; older failed measurements
remain in their original historical evidence. No threshold was relaxed.

## Native fixture corrections

The first resource-matrix verifier raced its final asynchronous rebuild: all
22×12 combinations and closed resource assertions had run, but `finished` was
still false. A bounded completion poll precedes the unchanged strict verifier.
The first nested quoting implementation also failed after passing lifecycle
assertions; the corrected outer invocation and failure cleanup were independently
tested with mocks, and the real 100-cycle gate then passed. These failures remain
archived; they are not represented as initial passes.

The shadow fixture initially chose an offscreen identity-map entry, instead of
the first displayed card. Selecting the first display-container child preserves
every containment and pixel criterion. Actual light/dark paired shadow controls
then pass on both lateral strips. There is no search for a favorable pixel region.

## Packaging and standard

Metadata declares `version-name: 0.1`, Shell `50` and the existing UUID. Numeric
`version` remains website-owned, following the official
[GNOME extension anatomy](https://gjs.guide/extensions/overview/anatomy.html).
The native `gnome-extensions pack` ZIP contains root metadata/entry points,
preferences, schema XML, compiled translation, runtime data/source, the packaged
client-ID helper and license texts. Archive paths, duplicate entries, CRC and
development-payload exclusion are checked. All **130 files** match current
runtime/source/generated bytes.

`gnome-extensions install --force --print-uuid` installed the archive under five
fresh XDG directories on a private D-Bus. The directory was a real installation,
not a checkout symlink; the installer produced the compiled schema. The private
Shell loaded v0.1 from that directory, displayed five demo cards and reported
state 1 with empty error. [Installed archive evidence](assets/v01/installed-release.txt).
No user's extension, keyring, settings or font directory was changed.

The local delivery is assembled from the tested ZIP after committing its source;
all packaged tracked files are compared against that commit. Its location is `dist/v0.1/`, with the standard extension ZIP,
`SHA256SUMS` and `build-manifest.json`. Building does not publish a GitHub Release
or extensions.gnome.org listing. The manifest pins the accompanying source commit.

## Participation limits

Real provider accounts, human Orca announcements, physical GPU/monitor variants
and actual lock/suspend sessions remain unverified. Synthetic fixtures and virtual
input cannot certify these environments. Scripted Clutter allocation and GTK
viewport warnings are recorded; passes do not mean warning-free runs or general
WCAG certification. Provider access is unofficial and its policy limitations stay
visible in the consumer documentation. Deliberately deferred popup options remain
in ADR 0005; WebGL feasibility was adapted to native Shell effects as recorded in
the accepted execution plan.
