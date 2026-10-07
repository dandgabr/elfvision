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
| M4 | Notifications with dedupe and hysteresis, the connection alert, a legend for the symbols, the bar tooltip, a section for providers that are not tracked, an About page, restoring defaults and a Notifications page (all done, ADR 0010). The language choice was dropped: the extension follows the session language. The first-use assistant and a right-to-left and longer-text pass are planned. | in progress |

Provider order: Command Code, Codex, Claude, Antigravity.

## Next

The rest of M4 is the first-use assistant and the right-to-left and longer-text pass; both are in the
"Pending" list of [ADR 0010](0010-alerts-and-polish.md), which also holds the smaller items that
were deferred. Both start with a design review (UI, UX, frontend and security), as every part of M4
did.

## Open items

- Which of the other gallery styles become installable themes.
- Whether the N3 theme effects (ADR 0006) get built, and in which order.
- Validate in a prototype: right-to-left mirroring and tabular numbers in CSS versus
  Pango.
