# Credential races and OAuth cancellation fixes — 2026-10-08

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Implementation evidence for the two reproduced P1 issues in the independent
security/architecture review. This document is the implementer's record, not an
independent approval. Worktree: `/home/daniel/Code/gnome-ai-quota-post-mvp`.
No commit, push, native Shell session, keyring operation, disk integration harness
or scanner was run by this worker. All credential/configuration fixtures are
synthetic and effects injected. Existing feature changes were preserved.

## Changes

- `lib/core/disconnect.js:109`: a durable issued lease now excludes other
  credential mutations for its provider across clients. Acquisition and epoch
  validation occur atomically in the metadata transaction. Waiting releases that
  mutex; other providers and disconnect-all can proceed. Waits use the existing
  bounded coordination duration and return fixed `credential-busy`; closing or
  an epoch change fences the next acquisition attempt. A same-boot dead lease
  fails closed as `orphaned-write`/`orphaned-delete`, without time-based recovery.
  Only a known boot boundary permits reclaiming an old issued lease.
- `lib/services/secrets.js:31`: credential mutation policy accepts injected
  backend operations. Both sign-in storage and individual deletion acquire the
  provider lease; deletion records operation `delete`. A conditional rotation
  looks up and compares expected `gen` and original refresh inside that lease,
  then writes before release. A changed or absent credential returns false.
  Disconnect-all retains its separately issued deletion leases after drain.
- `lib/providers/index.js:124`: rotation save forwards the expected generation
  and refresh. `lib/oauth/tokenManager.js:73` passes those expectations and rejects
  a false conditional result as `disconnected`, clearing pending rotation state.
  `lib/oauth/tokenManager.js:151` also rejects the renewed access result when the
  earlier pre-save comparison lost. Pending retry retains its established reload
  behavior. No credential deletion happens on either comparison loss.
- `lib/prefs/oauthController.js:290`, `:356`, `:364`: repeat attempt/disposed
  checks after each awaited gate assertion before storage, terms acknowledgement
  and login startup. The existing exception for an already-started save remains:
  it settles once and announces once, including after cancel/dispose.

Changed source files: core/disconnect, services/secrets, oauth/tokenManager,
providers/index and prefs/oauthController. Changed existing tests: disconnect,
tokenManager and accounts. No runner/new test module or UI/schema edits.

## Regression evidence

Initial RED against the reproduced defects:

- Six cancel/dispose × terms/begin/store assertion-boundary cases: five failed
  with late storage, startup or acknowledgement. Dispose/begin already passed
  indirectly because disposal clears retained configuration; cancel/begin failed.
- Provider exclusion: failed ordering `old-start,new,other` before old lease
  release; expected only `old-start,other`.
- Three conditional credential cases plus token-manager expectation/rejection:
  four failed because the coordinated conditional backend was absent and the
  manager omitted expectations.
- Follow-up pre-save comparison tests: both login and deletion races returned
  `rotated-access` after losing the comparison. Both were RED before their fix.

GREEN on final source:

- `gjs -m tests/run.js -- 'disconnect:'`: **33 passed, 0 failed**.
- `gjs -m tests/run.js -- 'tokens:'`: **17 passed, 0 failed**.
- `gjs -m tests/run.js -- 'oauth controller:'`: **34 passed, 0 failed**.
- Aggregate `gjs -m tests/run.js`, with an empty temporary `XDG_CONFIG_HOME`:
  **388 passed, 0 failed**. This aggregate preceded the final two bounded/delete
  lease tests and the two pre-save return tests; the final focused runs above
  include all four. Root should rerun the aggregate for final publication.
- `git diff --check`: clean when checked after implementation.

Tests cover two real gate clients, other-provider progress while a credential
callback waits, login/deletion completed before old rotation lease acquisition,
new login queued behind accepted deletion, absence of resurrection, comparison
loss never returning old access, next request using the latest credential,
durable delete operation classification, same-boot orphan refusal, bounded wait,
and disconnect entering drain while a queued write rejects its stale epoch.

## Private-copy mutation evidence

Each mutant changed only one rule in a temporary copy of lib/tests; shared source
was never mutated. Existing focused assertions killed all eleven mutants:

| Removed or moved rule | Result |
| --- | --- |
| Terms post-await attempt guard | Killed: 2 failures |
| Begin post-await attempt guard | Killed: 1 failure |
| Store post-await attempt guard | Killed: 2 failures |
| Same-provider lease exclusion | Killed: 1 failure |
| Conditional gen/refresh comparison | Killed: 2 failures |
| Expected credential propagation from token manager | Killed: 1 failure |
| False conditional result rejection | Killed: 2 failures |
| Individual deletion's delete operation identity | Killed: 1 failure |
| Same-boot orphan fence | Killed: 2 failures |
| Comparison moved before lease acquisition | Killed: 2 failures |
| Renew ignoring pre-save comparison loss | Killed: 2 failures |

## Limits and follow-up

Real Secret Service/D-Bus/disk integration and independent rereview remain root's
publication gates. Native allocation/rendering remains outside this fix scope.

CAS loss throws before `lib/providers/oauthUsage.js:78` can send a usage request
with the old renewed token. Regression tests assert that no newer credential is
cleared or overwritten and the old pending pair is discarded. This worker does
not claim same-provider credential revision fences every in-flight snapshot:
`lib/core/scheduler.js:175` marks an existing attempt for rerun without advancing
its attempt counter; its superseded guards consequently protect removal/new
attempts, not that revision alone. Root was notified for scope assessment. Those
scheduler/controller/extension modules were not changed by this worker.
