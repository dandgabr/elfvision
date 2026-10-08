# Open-items validation

This follow-up starts at `800465f` on `feat/post-mvp-effects`. Fetching origin
produced no remote-only commits or unmerged paths. The owner authorized resolution
of the product proposals and synthetic accounts; all credential tests use private
data/config/cache/state/runtime directories, a private D-Bus session and throwaway
keyring. No real credential values or user font/cache directories are inspected.

## Implemented product decisions

- Optional warning and critical thresholds retain existing critical settings,
  independent latches, hysteresis and quiet migration. The bounded persisted valid
  rule backup prevents an invalid external edit from changing effective values on
  restart. Warning defaults to disabled at80%; critical remains95% or the user's value.
- Disconnect-all has a Cancel-default review and deletes only extension credentials,
  exact live caches and published account status. Durable generations, issued
  keyring-operation leases and mutex-held file commits prevent stale results from
  recreating deleted data. Partial failures remain blocked and retryable. Same-boot
  orphan operations and observed uncoordinated older Shell instances require a
  computer restart. It does not revoke remote sessions.
- Suggested fonts require explicit confirmation, use four exact maintained
  Google Fonts files with pinned hashes/licenses, bounded async I/O and private
  staging, and preserve user fonts. Theme selection never initiates installation.

Implementation details, review findings and limitations are in the
[disconnect review](2026-10-07-disconnect-all.md),
[font review](2026-10-07-font-installer.md) and
[independent review](2026-10-07-final-independent-review.md).

## Native processing measurement

The probe uses installed Shell50.5 `Shell.PerfLog`, `frame-timestamps` and
`frame-finish-timestamp`. Official implementation pairs `clutter.stagePaintStart`
with `clutter.paintCompletedTimestamp`; the latter follows
`cogl_context_flush()` and `glFinish()`. This measures serialized CPU submission
plus GPU-finish wall duration, **not pure GPU timer-query time, natural frame
cadence or presentation latency**. Every condition forces the same34ms redraw
cadence and takes60seconds after warm-up. Each requires at least1000 complete
frames. Glass compares against static Glassmorphism; leaves compares against
static Solarpunk. A completed-paint timestamp after opening is reported separately
as one observation, not a p95 latency or physical display presentation measurement.

An initial uncached foreground run exceeded the added2ms target. Investigation
showed that permitting actual backdrop sampling also bypassed the usual popup
offscreen cache. The correction keeps the backdrop in the stage framebuffer and
caches only opaque foreground controls. Descendant changes invalidate that cache;
the blur radius stays18 and no browser or mandatory helper is introduced.

The initial `tools/effects-check.sh frames` exited0; each condition supplied1761–1762
complete frames. The [initial archived report](assets/open-items/frame-profile-initial.json)
includes the method, exact values, resources and relevant source hashes. These
measurements precede the later allocation repair and are historical, not final
performance certification of the current source.

| Condition | p95 processing | Added over matching static | 60Hz / added2ms gates |
|---|---:|---:|---|
| Static Solarpunk |3.937ms |0 |pass |
| Falling leaves |5.911ms |1.974ms |pass |
| Static Glassmorphism |3.650ms |0 |pass |
| Frosted glass |5.220ms |1.570ms |pass |

Completed-paint observations after opening were114.064/86.325/146.460/59.003ms
respectively; these are single observations, not latency distributions. Closing
removed owned decoration sources/actors/blur. The runner rejected native
CRITICAL/JS/disposed-actor errors; allocation warnings during scripted rebuilds
remain recorded, so this does not claim a warning-free log. The leaves result is
close to the2ms ceiling and is evidence from this recorded isolated run, not a
guarantee on all hardware.

### Reopened native health gate (2026-10-08)

Historical investigation record; the later decorative-allocation section below
records the accepted correction and current passing native health gates.

Stronger cold-opening checks exposed a bare Cogl `CRITICAL` for a zero-sized
framebuffer, missed by the earlier library-prefixed critical filter. The runner
now rejects every `CRITICAL` in both native and subprocess logs. One hundred
cycles still passed settled viewport and cleanup assertions, but that does not
pass native health. A paired synchronous cold-opening control reproduced14
Cogl criticals with the foreground cache enabled before allocation and zero with
the foreground using automatic redirect; all five control viewports and focus
assertions passed in the latter. However, the exact100-cycle automatic-redirect
control failed too, so the short control does not establish the complete cause.
An experimental cache-deferral change was rejected and removed; at that point,
processing and release gates were blocked by the first invalid paint.
The lifecycle probe now returns its start marker
immediately rather than awaiting a 25-second sequence through the default D-Bus
timeout. That harness correction does not waive rendering errors.

The later native backtrace identified painting with invalidated text allocation
in St shadow/offscreen paths. A scoped100-cycle control intercepted17856 numeric
attribute applications and passed geometry/cleanup with zero native criticals.
Coalescing only style/text reapplication still produced68 criticals; deferring
initial construction too passed a fresh production100-cycle run with zero
criticals and helper exit0. `numericText.js` now applies through HIGH_IDLE,
preserves St attributes, skips an already-present `tnum=1`, and cancels pending
work on label destruction. The original foreground cache remains enabled for
frost. Later integrated results are recorded below; those intermediate checks
did not themselves establish release acceptance.

### Decorative allocation cause and fresh focused results

The larger theme-switch layout sequence subsequently identified the nonnumeric
“On the bar” heading with invalid foreground ancestor allocations before any
currency update. Indicator/source anchor geometry remained valid. Background
allocation notification synchronously resized decoration children while native
BinLayout still allocated its later foreground sibling, invalidating that pass.
Disconnecting only those allocation callbacks was a passing causal control;
production now coalesces their layout requests in HIGH_IDLE, cancels pending
work on rebuild/close/destroy and counts that source in inspection totals.

Fresh production records in [the native-layout archive](assets/open-items/native-theme-layout/)
include the complete 12 layout cases, strict 100-cycle lifecycle and six effects
cases plus 100 numeric-label destructions, all without native critical/JS/disposed
matches. Root's later final 12-case runner also exits 0. These are focused health
and layout results; the final processing profile is recorded separately below.
Existing scripted MeterBar/Card allocation warnings remain recorded.

Fresh publish-source Glassmorphism lateral-shadow comparisons preserve full card geometry and a
1280×800 stage/capture. Light-left/right deltas are **20.468/20.709**; dark-left/right
are **13.061/13.694**. The four positive values compare each original token with
shadow disabled in adjacent scroll-interior strips. Independent image review
confirms legible opaque card/control surfaces and material visible behind
headings; see [paired captures](assets/open-items/card-shadow/).

Independent large-money LTR/RTL review confirms the complete
`US$ 1.234.567,89` and separate availability suffix. An earlier capture exposed
an enlarged quota-header defect: Codex displayed only 8 of 82 despite passing
width/ellipsis checks. Root reproduced the vertical overflow with native Pango
height assertions, then moved every primary reading and suffix below the
identity within the same header button. `reading-height-green.log` passes all
12 cases; refreshed LTR/RTL captures show complete visible readings and wrapped
suffixes. The layout matrix also exits 0 for all 264 cases.

The [final domain review](2026-10-08-final-domain-review.md) records closed security
findings with independently read retry/scheduler/token/OAuth RED/GREEN evidence
and eight continuation/ownership mutants killed. Root reports the final
`final-check-publish.log` exit 0 with 415 passed/0 failed, the five-scanner SAST
gate and full-history/current-tree Gitleaks gates exit 0, and all 127 packaged
runtime/license/helper files byte-identical with all three OFL licenses and no
development payload. Full preferences exit 0 for all six variants and full
startup. Fresh quick, visual, 44-case inventory and 100-cycle lifecycle gates
pass. The [final inventory sheets](assets/open-items/final-inventory/) were
independently inspected: complete visible readings use the final separate rows
in all recorded themes. Final monitor native and pixel gates pass. The fresh
publish shadow gate passes all four strips with its geometry guards. The final
renderer processing profile also passes as recorded below.

The first final monitor actor probe passed four cases, but its pixel control
failed: the left gutter overlapped the synthetic scene's flat central stripe
in dark cases. Read-only pixel diagnosis found left texture 0 versus right
2.539 before blur, and right 0.043 after blur. The fixture now uses a fixed right
gutter, records scene/stripe/sample geometry and guards against stripe overlap
or sampling outside the textured scene. Original blur, focus, cache, glyph-height
and outside-region thresholds are retained. Root's fresh native and pixel reruns
exit 0. Independently read metrics are light 1.682→0.044 in both cases, dark
3.044→0.0228 and 1.353→0.0233; outside differences are zero, and cached 74→73
repaint differs by 1.925. Native logs have no critical/JS/disposed matches.
[Fresh captures and geometry](assets/open-items/final-monitor/) preserve the
eight material images, cached-value pair and both JSON records.

The first final frame-processing profile fails the added-p95 leaf budget:
3.569−1.538 = 2.031ms, compared with the 2ms limit. Frost passes at 1.577ms added.
[The RED profile](assets/open-items/frame-profile-leaves-red.json) preserves the original source hashes and raw
measurements. Device-pixel coordinate and half-degree rotation caching were
independently reviewed to preserve trajectories, eight particles and the update
cadence. The subsequent full profile exits 0 and closes the recorded budget gate.

### Final publish-source processing profile

[The final profile](assets/open-items/frame-profile.json) records four 60-second
conditions with **1,759 complete frames each**. Independent hash comparison
matches all 14 recorded files to the current source. The strict native log has
no critical/JS/disposed matches, and closing has zero decoration sources,
pending layout sources, particles, blur effects and actors.

| Condition | p95 processing | Added over matching static | Budget |
|---|---:|---:|---|
| Static Solarpunk | 1.578ms | 0 | pass |
| Eight falling leaves | 3.576ms | 1.998ms | pass |
| Static Glassmorphism | 1.575ms | 0 | pass |
| Frosted glass | 3.140ms | 1.565ms | pass |

The leaf result is near the 2ms ceiling. This one isolated run establishes its
recorded gate result, without proving statistical improvement over the retained
RED run or guaranteeing physical hardware. The method remains CPU submission
plus GPU-finish wall duration, not a pure GPU timer or presentation latency.

## Participation limits

Virtual monitors, synthetic provider fixtures and virtual keyboard events do not
certify physical monitor hardware, Orca announcements or real provider accounts.
The [provider validation record](2026-10-07-provider-validation.md) links official
terms rechecked on2026-10-07 and the optional owner checklist. In particular,
accepting an unofficial-access warning does not grant provider permission.
The implementation uses fixed translated messages and keeps these limits explicit.
