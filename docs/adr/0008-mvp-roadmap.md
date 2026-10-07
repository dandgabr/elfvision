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
| M4 | Notifications with dedupe and hysteresis, the connection alert, a legend for the symbols, the bar tooltip, a section for providers that are not tracked, an About page and restoring defaults, a language choice, a first-use assistant. | planned |

Provider order: Command Code, Codex, Claude, Antigravity.

## Next: M4

Three things come first, because they decide the shape of the rest: where an alert is raised (the
controller should report the previous and the new snapshot of a provider, so an alert service can
keep its own state and dedupe by provider, metric and reset time), what the connection alert
means for a provider that is paused, and where the notification text is reviewed for the same
terms the rest of the interface uses. As with the provider structure (ADR 0009), a design review
(UI, UX and frontend) comes before the code.

## Open items

- Which of the other gallery styles become installable themes.
- Whether the N3 theme effects (ADR 0006) get built, and in which order.
- Validate in a prototype: right-to-left mirroring and tabular numbers in CSS versus
  Pango.
