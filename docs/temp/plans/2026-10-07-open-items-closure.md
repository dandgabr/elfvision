# Post-MVP open-items closure

**Scope accepted:** the owner requested resolution of all conflicts and open items on 2026-10-07. This extends the previously approved post-MVP execution to the three product proposals. Real credentials and destructive actions still require their own explicit UI consent.

**Baseline:** `800465f` on `feat/post-mvp-effects`. After fetching origin, the branch is five commits ahead of `origin/main` with no remote-only commits and no unmerged paths.

## Decisions

- Disconnect all accounts is separate from Restore defaults. Delete only extension credentials and exact live snapshot/alert files; preserve themes, fonts, public client configuration, terms, tracking and first-use choice. Cancel is the default. Durable cross-process exclusion and stale-operation rejection are prerequisites; partial failure remains blocked and retryable.
- Font installation is optional, explicit and limited to a maintained manifest of exact licensed individual font files. Keep fallback fonts offline. Never download from theme JSON or overwrite user fonts; use bounded asynchronous I/O, verified hashes and private staging.
- Warning thresholds are independently opt-in at 80%; existing critical keys/defaults remain 95% and user values remain intact. Valid pairs have at least one percentage point separation. Preserve old notification latches/cap state during migration and suppress configuration/startup backlogs.
- The accepted four visual options continue to use native Shell rendering. The optional WebGL study does not introduce a browser dependency or a renderer bridge into this release.

## Implementation and verification

- [x] Implement and test warning/critical rules, v1 state migration and preference controls. The final native preference matrix remains part of the release gate below.
- [x] Implement and test a durable disconnect gate, guarded credential/cache commits and the confirmation/retry flow.
- [x] Implement and test the licensed font manifest, bounded installer and consent/cancellation UI. Synthetic service tests never install into the owner's font directory.
- [x] Integrate settings, lifecycle cleanup, English source text and pt-BR translations without overlapping file ownership.
- [x] Exercise synthetic refresh/rotation/rejection/reconnection and keyring failure paths; prepare the separate owner-assisted live-account checklist.
- [x] Probe exact installed Shell profiling APIs and capture valid frame-processing evidence. CPU-submission plus GPU-finish wall duration is recorded separately from pure GPU duration and presentation latency.
- [x] Exercise virtual monitor origins/fractional scaling where supported, varied wallpapers, RTL and large text, and accessible names/keyboard navigation in isolated sessions. Human Orca and physical hardware remain unverified.
- [x] Run the full local release gates and full-history secret scanner, including seeded detection proof. Root reports the final release check and scanner executions passing; native graphics/preferences/profile gates remain separate below.
- [x] Obtain independent architecture/security and UI/UX/frontend reviews; fix findings, update ADRs and record remaining participation limits.

### Current evidence — 2026-10-08

The final-source 12-case layout runner exits 0 without native criticals. The
card header deliberately uses a separate value/suffix row inside one button;
independent LTR/RTL large-text captures show the complete long currency. Visual
review of those same captures reopened quota-header acceptance: Codex's primary
82 reading showed only 8 at the narrow enlarged-text width. Root reproduced
text height exceeding actor height, applied the separate reading row to quota
cards too and obtained 12 native GREEN cases with a width/height oracle. Fresh
captures show complete primary/suffix text in fully visible cards. The 264-case
theme/effect matrix exits 0. Full preferences subsequently pass all six state/
traversal/lifecycle variants and full startup. Final native and frame-processing
gates also pass on the recorded isolated source.

The Glassmorphism paired shadow capture passes all four side pixel comparisons,
with card/stage geometry guards retained. The native allocation critical was
traced to decorative request mutation inside `notify::allocation`; coalesced
HIGH_IDLE layout avoids mutating siblings during native allocation. Its fresh
12-case layout, strict 100-cycle lifecycle and quick/numeric-destruction records
pass. Independent security rereview closes durable provider-lease/CAS, retry
recreated-data, OAuth attempt ownership and token continuation findings; scheduler
credential revisions reject obsolete success and failure snapshots.

Native preferences found rollback feedback losing its error through a secondary
same-value notification. The focused saved-value guard and stronger positive/
repeated-edit assertions pass in the first three native state variants. That
run stopped on an unrelated expanded-locale retry-label oracle; the oracle now
compares the exact translated label and requires an enabled action. The
implementer does not self-certify that UI change. Root reports final release
checks passing 415/0, all five SAST scanners and full-history/current-tree
Gitleaks passing, including isolated seeded detection. Package verification
finds 127 runtime/license/helper files byte-identical, all three OFL licenses
present and no development payload. Fresh native quick, visual, 44-case inventory
and 100-cycle lifecycle gates pass with strict native-critical rejection.
The full preferences suite exits 0 with independent source approval of the
notification guard. The final monitor native/pixel rerun passes all four cases,
including 1.25 scale/nonzero origin, RTL/large text, focus and cached repaint.
The fresh publish shadow gate also passes all four lateral strips with geometry
guards. Final frame-processing acceptance passes in the recorded isolated run.
The first monitor pixel run failed because the fixed left sample overlapped
the synthetic scene's flat central stripe in dark cases; actor checks passed.
The corrected fixed right sample records scene/stripe bounds and rejects any
overlap, without changing blur thresholds. Fresh texture edges exceed 1.35 before
blur and fall below 0.044 after blur; outside-region differences remain zero.
The first full profile is RED: leaves add p95 2.031ms against the 2ms budget,
while frost adds 1.577ms. Its JSON is preserved before replacement. Root's
device-pixel coordinate and half-degree rotation caching preserves eight leaves,
time-based trajectories and the 34ms update source. The fresh full profile exits
0 with 1,759 frames per condition: leaves add p95 1.998ms and frost 1.565ms.
All 14 recorded source hashes match the current files, and closing leaves zero
owned sources, pending layout sources, particles, blur effects and actors.
The leaf result is very near the 2ms limit; one isolated run does not establish
statistical improvement or physical-hardware performance guarantees.
Credentials and font installs remain synthetic-only; physical
monitor/GPU and human Orca participation are unverified.

## Safety and ownership

Synthetic tests use private data/config/cache/runtime and an empty throwaway keyring. No test inspects real credentials. Root integrates `prefs.js`, schema/default classification and translations; each worker owns its separate feature modules/tests. Workers do not commit or revert others' changes. Root prepares coherent commits only after independent review and fresh checks.

Any physical/human or account check that cannot be performed by automation stays explicitly unverified with its exact next action. A clean test suite alone does not certify those checks.
