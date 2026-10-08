# Retry after partial disconnection

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Independent security review found that a completed provider could reconnect while
another provider's deletion remained partial. A retry copied the previous
`absent` journal entries, skipping credentials and cache files recreated since
that entry was recorded.

Each new disconnection epoch now starts all credential, snapshot, alert and status
steps pending. Provider leases, drain fencing and orphan handling remain in force.
A Set-backed regression recreates a credential through the normal gated writer,
plus snapshots and alerts, between partial failure and retry. Its RED produced a
false completed transaction with the recreated credential still present; GREEN
removes all recreated data and reports completion truthfully.

Focused result: 34 passed, 0 failed in `disconnect-retry-green.log`; RED is
`disconnect-retry-red.log`, both archived beside this report. These tests use
synthetic credentials, not a real account or credential store.
