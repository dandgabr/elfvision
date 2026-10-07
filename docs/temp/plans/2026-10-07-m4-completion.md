# M4 completion implementation plan

**Goal:** Finish the accepted first-use assistant and the RTL/long-text pass.
**Spec:** docs/adr/0010-alerts-and-polish.md and docs/adr/0007-internationalization.md.
**Architecture:** Preserve the account controllers already written by Claude. Pure first-use decisions live in core; a disposable preferences subpage shares the Accounts views and controllers.

## Global constraints
- GJS ES modules, English source, pt-BR catalog, GTK only in preferences.
- Consent through the existing terms dialog only; no automatic credential action or helper execution.
- One sign-in at a time; navigation and closure cancel pending consent and sign-in.
- Existing user state, tracking choices and defaults remain classified by defaults.js.
- Work stays on feat/m4-first-use; review and checks precede completion.

## Tasks
- [x] Verify inherited controller split and fix lifecycle regressions with failing tests.
- [x] Add tested pure first-use policy, selection, summary, and cancellation coordination.
- [x] Add disposable assistant views, startup policy, About entry, empty-popup routing and kept schema key.
- [x] Add RTL meter geometry and developer pseudo-locale with behavioral tests; inspect layouts in isolated runtime.
- [x] Translate new strings, update milestone documentation, run tools/check.sh, static analysis, package and independent UI/UX/frontend/security and QA reviews.

## Review focus
- Browser round-trip must not close the assistant; pending consent cannot start login after navigation.
- Keyring failure cannot falsely mark an existing account absent.
- Reopening setup must not accumulate settings/window handlers or leak entries.
- Missing client ids show a selectable one-line command and never execute it.
- Narrow layouts with enlarged strings and RTL preserve readable actions and meter direction.

## Progress
- Baseline: tests/run.js reports 246 passed, 0 failed. No AGENTS.md or CLAUDE.md found in repository or checked ancestors. ADRs and development.md govern.
- Resume: Claude stopped after the account controller split and its tests; no assistant files existed.

- Verification: tools/check.sh -> 260 passed, 0 failed; syntax, shell load, schemas, translations and whitespace passed.
- Reviews: independent UI/UX/frontend and QA/security reviews found packaging and narrow-layout defects; both fixed. Added tests for cross-provider gating, shell quoting/newlines and per-run handler counts to cover the surviving review mutants.
- Setup traversal: 360 px, LTR/RTL, normal/40% longer text, larger fonts, three runs each; measured handler and subscription cleanup. Skip, Escape, header back, window close and summary account routing passed.
- Full prefs.js startup: fresh, targeted account, demo, previously dismissed and incoming account target passed with an empty private keyring.
- St runtime layout: LTR/RTL with normal/expanded text passed, including whole-rectangle meter/tick mirroring. Screenshot inspected at /tmp/gaq-rtl-expanded-popup.png.
- Static analysis: bandit, Semgrep, ShellCheck and zizmor passed. Gitleaks is not installed; the repository secret checks ran in tests/run.js.
- Package: built ZIP includes the assistant, pure core and only tools/import-client-ids.py from tools; docs and tests excluded.
- Ruling: a selectable single-line command scrolls horizontally at narrow widths, and action buttons wrap — preserves the accepted command/primary-action semantics without forcing a wider window.
- Ruling: cancellation prevents a pending confirmation or queued token reply from initiating a save; an already initiated asynchronous keyring write completes and announces the account — avoids rolling back a save the user explicitly requested or deleting older credentials.
- Deferred scope: existing ADR 0010 follow-ups (indicator coalescing, keyboard tooltips, CI linting) remain outside M4. Live-provider authentication remains an owner check.
- Delivery: retained feat/m4-first-use and the working tree. No merge, push or deployment.
- Subsequent original-plan audit: UI, UX, frontend, security and architecture lenses
  are consolidated in [the conformance review](../reviews/2026-10-07-m4-plan-conformance.md).
  All task boxes describe delivered implementation work, not an unqualified
  conformance sign-off. That audit found countdown formatting, summary defects and
  inherited post-restore buffering. The subsequent [audit-fix plan](2026-10-07-m4-audit-fixes.md)
  resolved all actionable implementation findings with regression tests; the review
  retains adaptations, original findings and human/live validation limits.
