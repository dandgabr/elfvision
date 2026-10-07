# 0008. MVP milestones and open items

Status: accepted

## Milestones

Each milestone is tried in the nested shell (`tools/nested-shell.sh`).

| Milestone | Content | Status |
|---|---|---|
| M0 | Skeleton: `metadata.json` for shell 50, panel button, bar with the pacing tick, popup with demo cards. No network. | done |
| M1 | Data layer: the `ProviderSnapshot` contract, scheduler (interval, jitter, backoff, stale), severity and pacing, disk cache, deterministic demo providers, unit tests under `gjs`. Theme loader with the 20 themes. Appearance settings and the theme picker. | done, in PR #1 |
| M2 | Command Code: the first real provider, with an API key stored in libsecret and a minimal key field in Preferences. Closes the loop end to end. | next |
| M3 | OAuth in Preferences: a reusable loopback server and PKCE, single-flight refresh. Providers in order: Codex, Claude, Antigravity. | planned |
| M4 | Notifications with dedupe and hysteresis, the connection alert, `auth_required` and stale states in the UI, `providers.local.json`, the gitleaks pre-commit hook, tracking controls. | planned |

Provider order: Command Code, Codex, Claude, Antigravity.

## Planned layout

Directories that exist today are described in the README. M2 to M4 add:

```
lib/providers/   command-code.js codex.js claude.js antigravity.js
lib/oauth/       pkce.js loopback.js
providers.example.json
```

## Before M2

- Add `providers.example.json` with placeholders and the gitleaks pre-commit hook
  (ADR 0003).
- Re-check each provider's terms and endpoints against primary sources before
  relying on them.

## Open items

- Which of the other gallery styles become installable themes.
- Whether the N3 theme effects (ADR 0006) get built, and in which order.
- Validate in a prototype: right-to-left mirroring and tabular numbers in CSS versus
  Pango.
