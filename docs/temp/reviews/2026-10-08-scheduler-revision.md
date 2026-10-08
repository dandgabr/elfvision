# Credential revisions and scheduler results

The independent security review identified an in-flight polling gap:
`credentialsChanged()` scheduled another fetch but did not invalidate the old
fetch's context or suppress its result. A response or authentication failure
from the previous account could therefore reach snapshot listeners before the
replacement fetch. Those listeners also drive cache and published status.

Root owned only `lib/core/scheduler.js` and `tests/scheduler.test.js` for this fix;
credential storage and renderer changes remained with their separate owners.

Each scheduler entry now has a credential revision. Credential changes advance
it immediately; attempts capture it and treat a mismatch as cancellation. This
also suppresses obsolete failures. The independent attempt counter still governs
attempt/removal lifecycle, and the existing finally path drains old work and
starts one replacement fetch. Manual and periodic refresh behavior is preserved.

Two synthetic deferred-fetch regressions cover old success and old failure,
immediate context cancellation, absence of old snapshot/status emissions and
successful publication of the replacement result. RED was **0 passed, 2 failed**;
the complete focused scheduler suite is **26 passed, 0 failed**. Logs:
`.superpowers/sdd/2026-10-07-open-items/scheduler-revision-{red,green}.log`.

Two single-edit mutants ran in disposable copies: removing the revision fence
and removing the revision advance. Both failed both old-emission assertions
(exit2 each), with no shared source mutation. The matching `scheduler-mutant-*`
logs record those results. Final whole-project checks and independent review
remain separate release gates.
