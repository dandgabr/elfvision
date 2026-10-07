# 0008. MVP milestones and open items

Status: accepted

## Milestones

Each milestone is tried in the nested shell (`tools/nested-shell.sh`).

| Milestone | Content | Status |
|---|---|---|
| M0 | Skeleton: `metadata.json` for shell 50, panel button, bar with the pacing tick, popup with demo cards. No network. | done |
| M1 | Data layer: the `ProviderSnapshot` contract, scheduler (interval, jitter, backoff, stale), severity and pacing, disk cache, deterministic demo providers, unit tests under `gjs`. Theme loader with the 20 themes. Appearance settings and the theme picker. | done |
| M2 | Command Code: the first real provider, with an API key stored in libsecret and a minimal key field in Preferences. Closes the loop end to end. | done |
| M3 | OAuth in Preferences: a reusable loopback server and PKCE, single-flight refresh. Providers in order: Codex, Claude, Antigravity. Structure in ADR 0009. | done |
| M4 | Notifications with dedupe and hysteresis, the connection alert, a legend for the symbols, the bar tooltip, a section for providers that are not tracked, an About page, restoring defaults and a Notifications page (ADR 0010). The language choice was dropped: the extension follows the session language. The first-use assistant and the right-to-left and longer-text pass are implemented; conformance audit fixes are verified. | done |

Provider order: Command Code, Codex, Claude, Antigravity.

## Next

M0 to M4 are complete. M4 audit findings and their verified fixes are recorded in the
[original-plan conformance audit](../temp/reviews/2026-10-07-m4-plan-conformance.md).
Follow-up work that is outside the MVP is in the "Pending" list of
[ADR 0010](0010-alerts-and-polish.md), including indicator redraw coalescing, keyboard tooltips and
CI linting. Real-account checks and the providers' current terms remain owner checks (ADR 0009).

## Open items

- Which of the other gallery styles become installable themes.
- Whether the N3 theme effects (ADR 0006) get built, and in which order.
- Validate tabular numbers in CSS versus Pango.
