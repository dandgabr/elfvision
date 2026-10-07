# M4 audit fixes implementation plan

Goal: resolve every actionable finding in the original-plan conformance audit
without changing the recorded consent, manual-helper or started-write boundaries.
The user explicitly requested development-agent execution. Existing work is
preserved; this plan does not authorize a commit, merge, push or deployment.

## Constraints and review focus

- Original ADRs at 4345b85 and docs/development.md govern the implementation.
- Reproduce defects and add meaningful failing regression tests before fixes.
- No real keyring, browser sign-in or provider configuration in tests; use private
  settings/backends and injected credential/configuration operations.
- Accounts owns controllers; temporary setup views must release every subscription,
  settings/window handler and late callback.
- Pending consent and queued token responses cannot start writes after cancellation.
  Already requested writes finish exactly once without touching disposed widgets.
- Observe settings changes from an independent instance after Restore defaults.
- Snapshot reads must be retained state, not configuration disk access. Refresh
  configuration asynchronously and preserve generation ordering and login gating.
- Native GTK/St direction, typography and command integrity remain intact.

## Tasks

- [x] T1: D-01/R-02/R-05 and view recovery wiring. Update Done reactively, omit empty
  selection progress, invalidate disposed API view callbacks, and retry account
  availability on activation. Own firstUse.js/accounts.js/oauthGroup.js and GTK
  probes. Assert late save/rejection updates, cleanup, focus safety and recovery.
- [x] T2: D-02/R-04 and authentication hardening. Retain nonsecret API-save failures,
  keep OAuth configuration in retained state refreshed through asynchronous service
  I/O, dispose per-flow HTTP clients, and test both sides of the started-write
  cancellation boundary. Own controllers/localConfig service and controller/config
  tests. Add stale API-lookup and summary-keyring assertions for surviving mutants.
- [x] T3: D-03/R-03. Correct padded countdown formatting without breaking catalogs;
  isolate Restore defaults batching from the shared settings instance. Add failing
  formatting and independent-observer/post-restore write tests.
- [x] T4: V-01/V-02 coverage. Expand narrow/RTL/long-text/larger-font probes to account
  states and dialogs; replace loose action width checks with viewport/parent
  containment and check real keyboard focus where feasible. Expand St text/action
  containment and enlarged-font coverage. Recheck surviving view-focus mutant.
  Preserve explicit manual limits for live accounts and an Orca user session.
- [x] T5: Integrate, review and run tools/check.sh, tools/prefs-smoke.sh,
  tools/layout-check.sh and tools/sast.sh; rebuild/inspect package. Update audit
  disposition, ADRs, roadmap and README only after evidence is available.

## Recorded adaptations and original backlog

Horizontal command scrolling, wrapping actions, the common threshold and the
already-started write boundary remain documented adaptations. Indicator
coalescing, keyboard bar tooltips and CI linting were original deferred backlog,
not defects introduced by this change; do not expand this fix into those features.
Live authentication/current provider terms and a human assistive-technology
session remain validation limits, not executable fixes in an isolated harness.

## Verification

All tasks are delivered. tools/check.sh: 279 passed, 0 failed. Preferences:
six variants/three traversals each, closing paths, 60 account/dialog state checks
and full startup integration passed. St: eight narrow-monitor/text/font/direction
cases passed, including keyboard focus and tooltip cleanup. Four installed SAST
tools passed; gitleaks unavailable. ZIP matched 74 source files and excludes
tests/docs. Peer review found no confirmed blockers. Red/green and final logs are
linked in the original-plan conformance review's resolution section.
