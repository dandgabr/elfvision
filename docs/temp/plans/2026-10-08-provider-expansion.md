# Execution plan: provider expansion and account actions

Status: implementation and source review complete; final native/package gates recorded in the validation report. Scope includes added About/report request.

1. Root: registry/meta+factory integration, durable gate compatibility, extension/demo runtime, fixtures, theme capability picker, About/report forms, translations and documentation coordination. Reserve `lib/core/providerRegistry.js`, `lib/providers/index.js`, `lib/core/disconnect.js`, `lib/services/disconnectGate.js`, `extension.js`, `lib/core/fixtures.js`, `prefs.js`, `lib/services/themeFiles.js`, `lib/prefs/about.js`, `.github/ISSUE_TEMPLATE/*`, `.github/VULNERABILITY_REPORT.yml`, `SECURITY.md`.
2. Provider developer: new `lib/core/apiUsage.js`, `lib/providers/apiUsage.js`, `tests/apiUsage.test.js` only; shared output contract `kind: spend` or `money/basis: allowance`. No registry/factory edits.
3. Accounts developer: `lib/core/connectors.js`, `lib/services/connectorStore.js`, `lib/services/disconnectAll.js`, `lib/prefs/accounts.js`, `lib/prefs/disconnectDialog.js`, `lib/prefs/demoAccountController.js`, `lib/prefs/apiKeyGroup.js`, connector/disk/GTK tests and schema. Persist/remove demo credit identity; whole-delete selected mode; root owns actual extension integration.
4. Monetary developer: `lib/core/contract.js`, `lib/core/viewmodel.js`, `lib/core/severity.js`, `lib/ui/providerCard.js`, relevant contract/view/cache/alerts tests; spending/allowance semantics, unknown-limit meters suppressed. Preserve numeric fix and theme geometry.
5. Handoff after developer completion: independent UI/UX/security/architecture/fault-mutation review, corrections to exclusive owner, documentation review, final required checks/native fixtures, rebuilt ZIP and new PR (the earlier PR was already merged). Human accepted numeric/material cases are regression constraints, not reopened styling work.

Maximum four active agents including root. Read-only research finished before dispatching production writers. No native sessions by workers. All are told not to revert others' edits; root alone integrates shared files and registers new tests. Source commits and PR follow explicit session authorization; do not merge or publish releases.

## Ownership handoffs

- Root retained registry/factory integration, documentation, translations and native verification.
- Gate developer exclusively implemented `lib/core/disconnect.js` and `tests/disconnect.test.js`; account clearStatus uses the latest durable transaction.
- Theme/About developer exclusively implemented the theme page in `prefs.js`, theme scanning, About, report forms, security policy and theme tests.
- Integration developer owns fixtures/demo/runtime and first-use/registry expectation updates after the earlier writers completed.
- Read-only review does not acquire source ownership. Native sessions are serialized by root.

## Added About and reporting acceptance

About names Daniel G. Araujo and links to github.com/dandgabr. A public bug form
and a private vulnerability form open for user review and submission, never with
automatically collected diagnostics. Official GitHub schema and Security Lab
report examples were researched. Private reporting is already enabled remotely;
custom form availability requires these files to reach the default branch.

## Accepted scope change

The user explicitly requested that Gemini API and Z.ai be left out for now after
the reporting-API research. They are excluded from live and demo selectors in
this version; investigation is retained in `docs/providers.md` for future work.
Final live provider count is eight, with four new API reporting connectors.

## Delivery

The final changes also hide percentage meters for uncapped spending, package
symbolic icons for all four new providers, and show a usable empty Demo state
with Add account after deleting every connector. Native evidence covers collapsed
and expanded monetary cards. See
[validation](../reviews/2026-10-08-provider-expansion-validation.md) and
[manual checks](../reviews/2026-10-08-provider-expansion-manual.md).
