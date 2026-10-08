# Final independent domain review — 2026-10-08

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Read-only source review of the current changes over `800465f` in
`/home/daniel/Code/gnome-ai-quota-post-mvp`, including new untracked feature files.
Only this report and the separately owned native consultation report were
written. No real credentials/configuration, native sessions, scanners or test
runs were performed. Proofs below are explicit manual source interleavings;
they are not reported as executed reproductions.

## Findings and dispositions

### P1 — Retry can preserve credentials created after partial disconnection

Locations: `lib/core/disconnect.js:163`, `:195`, `:227`;
`tests/disconnect.test.js:88`.

The first partial transaction unblocks providers whose credential kinds were
successfully removed. A later retry copies every prior result, including
`absent`, and its deletion step returns immediately for those results.

Exact source trace:

1. Disconnect with `command-code` deletion successful and `codex` deletion
   refused. Final phase is failed; only codex remains blocked, as the existing
   test explicitly asserts.
2. Obtain a fresh `command-code` ticket and use `withCredentialWrite` to store a
   new API key. This is admitted by `check` because that provider is unblocked.
3. Choose Retry disconnection. A new epoch is created, but the command-code
   credential results are copied as absent.
4. Make codex deletion succeed. Both command-code deletion callbacks are skipped
   and the transaction can report complete while the new API key remains.

Recommendation: every new disconnect attempt must re-establish absence for
credentials that could have changed since the previous result. Re-delete all
known exact schema entries after drain, or reset prior results for previously
unblocked providers. Preserve same-boot orphan rejection and durable deletion
leases. Add a partial-failure → reconnect → retry interleaving test, checking the
actual synthetic keyring rather than transaction status alone.

Disposition: root reproduced RED (complete reported while
`command-code:api-key` remained), then changed every new epoch to initialize all
credential, file and status outcomes as pending. This reviewer inspected the
frozen source and the new synthetic regression: it recreates the credential,
both files and published status after partial success and asserts all are gone
after retry. The previous coordinator-alive/orphan/drain fences are retained.
This reviewer read the archived `disconnect-retry-red.log` (**0 passed, 1
failed**, actual remaining command-code key) and `disconnect-retry-green.log`
(**34 passed, 0 failed**) under `.superpowers/sdd/2026-10-07-open-items`.
Root reports ESLint clean. The source fix closes this finding; aggregate final-source validation is
still a separate gate.

### P2 — A retired OAuth attempt can tear down a replacement attempt

Locations: `lib/prefs/oauthController.js:185`, `:196`, `:285`, `:301`, `:305`.

The disconnect canceller immediately releases the controller's busy/login state
and login gate, enabling a new attempt after the gate unblocks. The retired
attempt's continuation still uses mutable controller-wide `disposeHttp`, writes
`lastFailure` without checking its attempt, and always invokes `finishLogin`,
which stops the current timers and clears the current login.

Exact source trace: begin A; invoke the registered gate canceller; unblock and
begin B; resolve/reject A's deferred `started.done` after B starts. A's `then`
calls the now-B `disposeHttp` before checking generation, or its catch records
A's failure. Its unconditional finally then clears B's login/timers/busy state.
The post-await guards added for dispatch do not guard this cleanup path.

Recommendation: cleanup closures must own their attempt's HTTP/login/timer
resources. Only the current attempt may alter controller-wide state. Preserve
the accepted exception that an already-issued save settles and announces once;
that exception does not authorize shutting down a newer sign-in. Test a
gate-cancelled attempt settling after its replacement begins, for both resolved
and rejected completion.

Disposition: renderer/security implementer introduced an attempt-local HTTP
closer and login-identity checks for the finalizer, late failures and timer/browser
callbacks. Connecting catch/finally are generation-owned, including pending
replacement confirmation. This reviewer independently inspected the frozen
source and regressions for resolved/rejected old login, accepted/rejected issued
save, and a retired connecting failure while replacement capture is pending.
Each checks replacement busy/auth URL, HTTP lifetime, timer ownership and shared
login reservation. The issued-save success still announces once. Archived
OAuth RED has four failures; GREEN has **39 passed, 0 failed**. The finding is closed.

### P2 — Token reload recovery bypasses the post-await cancellation check

Locations: `lib/oauth/tokenManager.js:115`, `:119`, `:142`, `:148`, `:151`;
`lib/providers/index.js:115`; `lib/services/http.js:133`.

The normal access-token reload checks its context after await. Both renewal
recovery reloads can return a changed credential's access token directly without
the same check. The injected production load validates the ticket before
keyring lookup, leaving lookup settlement as a distinct boundary.

Exact source input: an old renewal reaches one of those reloads; pause lookup
after the prelookup ticket assertion; reset the manager and invalidate its epoch;
resolve lookup with a fresh credential whose refresh differs from the original.
The direct fresh-access branch returns despite the reset. The usage HTTP client
tests scheduler cancellation on a one-second watcher, so the snapshot revision
fence alone does not establish that initial network dispatch cannot happen.

Recommendation: check the captured context immediately after each successful
recovery reload, before deciding to return access or renew the replacement.
Exercise reset and stale-ticket changes while each reload is awaiting, including
the rejected-refresh recovery branch.

Disposition: both recovery reloads now check their context after successful or
failed await. Pending load/store error paths also check, and disconnect clears
only the pending pair owned by that context. Frozen source and tests were
independently reviewed. Value/error × reset/stale-ticket coverage additionally
asserts a subsequent fresh context uses the new credential. A separate CAS test
rejects changed generation with an identical refresh string. Archived token RED
has twelve failures; GREEN has **30 passed, 0 failed**. The finding is closed.
The reviewer read `final-qa/security-mutants.json`: all eight private-copy
mutants were killed, including both recovery checks, pending/store-error checks,
generation comparison, HTTP/finalizer ownership and connecting-finally ownership.

## Previously reported fixes reviewed

Provider leases now serialize store/delete for the same provider, release the
global metadata mutex during keyring work and retain issued-operation identity.
The conditional generation/refresh comparison occurs inside that lease in
`services/secrets.js`, and provider wiring forwards both expected fields.
Comparison loss discards the old pending rotation and rejects its access result.
The added OAuth dispatch checks occur after awaited assertions before terms,
login startup and secret storage. These address the earlier two P1 reports;
the new findings above concern different subsequent boundaries.

Scheduler entry credential revision is captured in every attempt and included
in its shared superseded predicate. Both success publication and failure
publication invoke that predicate before modifying the snapshot, and a queued
rerun starts after the old in-flight attempt settles. This is a coherent fix for
same-entry stale snapshot publication. It does not itself cancel every network
dispatch or certify token-manager continuation semantics.
Archived scheduler RED contains two obsolete-context failures; focused GREEN
contains **26 passed, 0 failed**. Both records were read independently.

Disconnect-all still names exact provider/kind schema entries and the two exact
live cache files. The destructive dialog defaults/closes to Cancel and preserves
tracking, terms, user configuration, fonts and themes. Orphaned issued operations
do not become safe merely through elapsed time; prior-boot recovery remains
separate. Errors shown to users are fixed categories without backend secrets.

## UI, font and alert alignment

The current monetary hero/suffix occupy a separate vertical row inside the same
header button. Quota percentages retain their header row. Both hero labels and
monetary body sentences wrap without ellipsis, preserving long currency and
translation text. Per-side shadow gutter derives from each validated theme
token and is bounded at 64 px. Extremely large custom shadows may still clip at
that documented bound. Headings expose effects while card reading zones remain
opaque.

The effects allocation callback now coalesces sizing outside native allocation,
with cancellation/generation checks and pending-source accounting. The actual
archived native records were inspected in the consultation: all 12 layout cases,
100 lifecycle cycles and six effects cases plus 100 numeric-label destructions
passed with no critical/JS/disposed matches. Existing MeterBar/Card allocation
warnings remain. Root subsequently supplied the successful paired card-shadow
capture. This reviewer viewed both current `card-shadow-light-original.png`
and `card-shadow-dark-original.png` and read `card-shadow.json`: both stages are
1280×800, complete sampled card rectangles are inside that viewport, and both
side strips are adjacent to their recorded cards. Light and dark cards retain
readable opaque text/control surfaces, visible rounded borders and lateral
shadow paint; headings expose the material and footer controls remain legible.
The numeric paired oracle record was subsequently read: light left/right
20.468/20.709 and dark left/right 13.061/13.694. Independent review also inspected
fresh long-money LTR/RTL enlarged-text images, confirmed the full currency and
found vertical quota clipping. Root reproduced that defect with Pango height
assertions, moved all readings/suffixes below the identity inside one button
and obtained 12 GREEN cases. Refreshed images and the final 44-theme native
contact sheets show complete visible primary readings and the current separate
row layout. The [final inventory](assets/open-items/final-inventory/) preserves
the two sheets and capture manifest; natural scroll clipping of lower cards is
not evidence about content outside the viewport.

Fonts retain a distinct explicit consent action with pinned source/revision,
exact byte/hash/license information, Cancel default, bounded installer I/O,
private staging, no-overwrite publication and offline fallbacks. Theme selection
does not call the installer. No real font installation or font-directory access
was performed by this reviewer.

Warning controls remain opt-in at 80%, critical defaults remain 95%, pair updates
reject warning >= critical and preserve the existing saved pair. Disabled
warning values remain visible; invalid external changes have feedback. Rule
migration/configuration changes use quiet baselines while retaining appropriate
critical latches. Restore classification preserves the source, accounts,
tracking, terms and first-use choice, and resets appearance/notification keys.
This matches the accepted closure decisions. Native preferences, human Orca,
physical monitor/GPU and real-account validation are not independently certified
by this source pass.

## Verdict

All three independent security findings are closed by reviewed frozen-source
fixes and read RED/GREEN evidence. No security source blocker remains within
this pass's scope. The reviewed prior fixes and product alignment have no
additional source blocker.

Subsequent P2 gate-ownership finding is also closed by independent source
rereview. OAuth saves now forward the provider's captured gate with their ticket
and expected credential. The secret mutator chooses that explicit gate before
an injected gate or lazy singleton accessor; retaining a retiring facade no
longer initializes a replacement participant. Conditional comparisons and
deletes stay inside the selected provider lease. This reviewer read
`final-qa/captured-gate-red.log` (0/2), `captured-gate-green.log` (2/0) and
`captured-gate-mutant.log`: dropping the override creates two participants and
misroutes explicit delete/default mutations, killing both tests. The tests
exercise the mutator and facade; provider-to-save forwarding was reviewed in
production source, without an executed provider integration or real keyring I/O.

Root reports final aggregate checks 415/0, all five scanners and full-history/
current-tree Gitleaks exit 0, with package contents byte-identical. This reviewer
read the earlier final check/SAST log tails and the complete preferences matrix's final
variant result: all six variants and full startup pass according to root's exit
record. The final monitor native/pixel rerun passes four cases; its exact texture/
outside/cache metrics and geometry were independently read and archived. The
fresh shadow native/pixel gate also passes, with all four sampled strips positive.
The first profile exceeded the 2ms
added-p95 leaf budget by 0.031ms; the 8-leaf record is preserved in the
[RED profile](assets/open-items/frame-profile-leaves-red.json). Frost added p95 is 1.577ms.
These are CPU-submission plus GPU-finish wall durations, not pure GPU timer
measurements. The subsequent [final profile](assets/open-items/frame-profile.json)
passes: 1,759 frames in each 60-second condition, leaf added p95 1.998ms and
frost added p95 1.565ms. This reviewer compared all 14 source hashes with current
files; every hash matches. Closing has zero sources, pending layout sources,
particles, blur effects and actors; the strict native log has no critical/JS/
disposed matches. The near-limit leaf result is one isolated run, without a
statistical-improvement claim or physical-hardware guarantee. No automatic gate
or source blocker remains within this reviewed scope.
Publication is not approved by this report alone.

The reviewer subsequently became the implementer for
`lib/prefs/notifications.js` and `tests/prefsStates.js` after native preferences
RED showed invalid-edit rollback losing its error feedback. Its saved-value
notification guard and positive/repeated critical-edit tests are therefore not
independently approved by this reviewer. Root owns native GREEN execution and
the renderer/security agent owns the independent UI rereview. Root reports the
full preferences suite exit 0 and that independent UI review approved the source.
