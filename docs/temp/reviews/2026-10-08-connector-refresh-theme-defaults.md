# Connector refresh and theme default indicators

## Scope and synchronization

PR #16 was verified merged. Local `main` and `origin/main` were fast-forward
synchronized to `356ac390420ceaa7e64673a8f8ce5f689716c84b`. Corrections are isolated
on `fix/connector-refresh-theme-defaults`.

## Findings and decisions

Adding a connector creates metadata but does not authenticate it. The user
confirmed they had only added it. The popup previously offered Add account even
when a configured disconnected connector existed. It now explains that connection
is needed and opens that existing editor via Open Preferences. Connecting updates
the popup automatically. Authentication is never started without a user action.

Demo registries and identifiers also needed the Demo decoding option: an Example
Credits row could invalidate the decoded list, lose its label or hide its provider
icon. The popup now handles those identities correctly, including pause/resume.

Theme indicators describe default material and actual background decoration,
independently of current preference overrides. Compatible alternatives and
interaction transitions alone do not qualify. Tooltips name the material and
background presets, and explain the mode needed for animations or decoration.
Zero-particle presets do not claim visible particles. User overrides cannot
claim trusted built-in effects.

UI/UX review found that static optical backgrounds were selected by native
renderer logic outside the effect profile. A shared pure `opticalPreset()` now
keeps the renderer and descriptions consistent for glass highlights, pearlescent
sheen and mesh gradients. Rendering behavior is preserved. The reviewer accepted
the final descriptions and PT-BR translations; no blocking findings remain.

## Verification

- `/tmp/gaq-refresh-final-check.log`: 547 tests, zero failures; syntax, ESLint,
  private keyring, cross-process deletion, Shell load, schemas and translations
  passed. The initial schema failures in the first experiment were resolved by
  building the newly synchronized checkout's generated schema before testing.
- `/tmp/gaq-refresh-final-sast.log`: all five static scanners passed.
- `/tmp/gaq-refresh-final-prefs.log`: native startup and theme picker tooltip/icon
  checks passed in an isolated compositor.
- `/tmp/gaq-refresh-final-effects.log`: native effects quick gate passed after
  extracting the shared optical preset selection.
- `/tmp/gaq-connector-refresh-final.log`: `GAQ_CONNECTOR_REFRESH_OK` for Demo
  Codex, Demo Example Credits and live OAuth with an intentionally invalid
  synthetic token, preventing provider HTTP. Covers delete, add, disconnected
  editor navigation, connect, label/icon and pause/resume transitions.
- Independent QA in a private snapshot: baseline 547 tests passed and five of
  five mutations were killed (supported material mistaken for default,
  interaction mistaken for background, zero particles, generic tooltip, omitted
  optical decoration). Logs: `/tmp/gaq-theme-review-xdlbvyd2/final-*.log`.

The native regression scripts require the headless harness's private memory
settings and XDG directories before any destructive test action. No real account,
credential store or provider request was used. Real provider authentication and
human screen-reader validation are outside this synthetic check.

```sh
tools/headless-shell.sh tools/connector-refresh-probe.js \
  'wait-for:global.gaqConnectorRefresh?.finished' tools/connector-refresh-verify.js
tools/prefs-smoke.sh startup
```

The Shell Eval output must contain a true `GAQ_CONNECTOR_REFRESH_OK` result;
the harness process exit code alone does not prove the assertions passed.
