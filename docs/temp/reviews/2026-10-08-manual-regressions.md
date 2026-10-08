# Manual regression findings ledger — 2026-10-08

Context: `manual-regressions-2026-10-08`. The source corrections are implemented and independently reviewed. Initial diagnosis below is retained as historical evidence. Final native acceptance and delivery are tracked in the validation record, and screenshots remain subject to human judgment.

## Inputs and status

The user supplied three screenshots and observed failures during native manual tests: the Example Credits value vibrates on expand/retract; transparency/materials show no visible effect; card insets differ between effect modes; Cyberpunk light lacks the character of its dark pair; demo footer retains an unwanted background rectangle; restore appears ineffective and account setup remains blocked. The user confirmed keyboard operation and requested explicit creation/removal of multiple connectors per available provider.

| ID | Priority | Finding / requirement | Evidence available | Status / ownership |
| --- | --- | --- | --- | --- |
| MR-01 | P1 | Credit numeric rendering vibrates while expanding/retracting | User observation, screenshot 1; System light/dark and all three effect modes named | Implemented; native shaping RED/GREEN, 80 pointer samples and four identical numeric bitmaps |
| MR-02 | P1 | Supported transparency and material selections have no perceptible effect | User observation, screenshot 2; capability/rendering path needs native inspection | Implemented; 220 current native screenshots with requested/effective material assertions |
| MR-03 | P2 | Provider card insets change with Off versus Full | User observation; identical-theme geometry comparison not yet measured | Implemented; identical first-card geometry within every five-condition theme/scheme group |
| MR-04 | P2 | Light/dark pairs do not consistently retain style identity | User explicitly singles out Cyberpunk light versus successful dark | Implemented; all 44 opaque pairs reviewed; human style acceptance pending |
| MR-05 | P2 | Demo footer still forms a rectangular background | User observation, screenshot 3 | Implemented; 220 footer alpha assertions and retained images |
| MR-06 | P1 | Restore appears ineffective and configuration remains blocked | User observation; current native settings/dialog/controller state must distinguish actual reset from connection prerequisites | Implemented; reset preserves credentials/metadata, resets appearance/tracking/onboarding; native tests |
| MR-07 | P1 | One account per provider prevents required multi-account use | Confirmed source assumptions across keyring, controllers, provider factory and scheduler | Implemented; exact account identities, four native lifecycle variants, isolated keyring/concurrency tests |
| MR-08 | P2 | Every compatible effect requires individually inspectable native screenshots | User explicit request, previous acceptance rejected | Delivered in local gallery; 220 individual native captures and 39 renderer source hashes |
| MR-09 | P2 | Preserve keyboard behavior in redesign | User manual confirmation of existing keyboard behavior | Acceptance constraint, not a current regression |

## Confirmed source facts

- `lib/services/secrets.js`: dedicated libsecret schema has `provider` and `kind` attributes only. `lookupWithoutUnlocking` selects the first matching item. Adding per-account items without changing exact lookup criteria would be ambiguous and unsafe.
- `lib/prefs/accounts.js`: one controller, focus target and provider group per registry entry; controller map is keyed by `meta.id`.
- `lib/providers/index.js`: factory, connectivity checks and OAuth keyring load/save use provider IDs. OAuth local client configuration is keyed by provider type.
- `lib/core/scheduler.js`: `_entries` is keyed by `provider.id`, duplicate IDs rejected. Two connectors of one provider cannot currently coexist in the scheduler.
- `lib/core/disconnect.js` and `lib/services/disconnectGate.js`: durable coordination validates a fixed set of available provider IDs. Credential lease/CAS and disconnect transactions need an explicit account identity decision.
- `lib/core/defaults.js`: current restore resets appearance, bar/popup and alert settings but deliberately keeps account/tracking/terms/source/first-use data. `lib/prefs/about.js` uses a dedicated delayed Gio.Settings transaction. This is current implementation policy, not proof that the user's action worked; whether “restore” should also reset onboarding/tracking must be settled and documented without accidental credential deletion.
- Read-only material diagnosis reports the current effects-Off path forces opacity regardless of transparency/material selection. This source contract plausibly explains screenshot 2's Effects Off setting; it does not establish that supported effects work under other combinations. User expectation requires discussion of whether transparency/material should be independent of motion effects.

## Design decisions requiring explicit record

1. Define supported material behavior independently from animation level, or show clear applicability feedback for combinations that intentionally disable it. The reported screenshot has Effects Off, transparency enabled and Frosted glass selected; hidden coupling is misleading.
2. Define what the restored defaults action resets and what explicit connector removal deletes. Keep clear confirmation and cancellation semantics; ensure a user can configure connectors after either operation.
3. Define connector IDs, labels, migration and independent pause/status/notifications. A provider type must remain available for fixed host allowlists and OAuth client configuration.
4. Define each theme's intended light/dark pair and material support. Cyberpunk light needs a deliberate style treatment rather than indiscriminate color inversion.

Root has selected independent labeled connector cards, with no aggregation of separate account quotas. Accounts design has reserved `../specs/2026-10-08-connectors-design.md` and proposes synthetic demo connector lifecycle with explicit simulated states. This is an implementation contract to develop and verify, not a completed fix.

## Security acceptance for multiple connectors

Exact keyring lookup/store/delete must identify one connector and kind; legacy lookups must not match newly added account items. Removing one account must preserve another account of the same provider, even with a held refresh, store, login callback or delayed keyring completion. Track changes and stale-context fences must apply to connector identity. A provider-wide coordination lock may remain conservative initially, but its effects must be stated and tested; never silently bypass the existing lease/CAS safety system.

No live credential store, user configuration or credential value has been read for this diagnosis. Root owns the live test environment; workers own only their assigned files.

## Deviations from previous acceptance

The user's report reopens visual and restore acceptance from the v0.1 audit. The previous native metrics checked bounds/resources/focus and several rendering samples; those metrics did not prove perceived material efficacy, absence of monetary render vibration or characteristic light/dark pair design. Corrective verification must add those direct observations, without rewriting the historical results.

Multi-account connectors extend the previous one-account-per-provider architecture (ADR 0009 and current Accounts implementation). This extension is now explicitly authorized and must update canonical account/provider/security/settings documentation after implementation. No specific migration has been approved or implemented at this read-only stage.

## Independent connector integration review — implementation stage

The root requested a new source-level review after backend and Accounts implementation. This section supersedes the initial read-only stage statement for the review scope only. Product files remain owned by their implementation workers and the root; this coordination reviewer edits only this ledger and its plan. No native process or credential store was accessed.

The implemented identity contract uses provider registry IDs for legacy/default connectors and `<provider>--<uuid>` for added connectors. New credentials use a distinct libsecret schema namespace containing exact provider, connector and kind attributes; legacy credentials remain under the old schema without a destructive migration. Provider runtime IDs and credential reads are connector-scoped, while host allowlists, public client configuration and durable exclusion remain provider-scoped. These are verified source observations; they are not a claim that all runtime races have been exercised.

| ID | Priority | Concrete defect and source evidence | Required correction / owner | Verification state |
| --- | --- | --- | --- | --- |
| MR-10 | P1 | `extension.js::_createController()` calls `store.list()` without handling malformed metadata. Startup catches this by disabling and rethrowing; a demo registry change first destroys the current indicator/controller and can then leave no replacement. Accounts disables Add on corruption, and Restore preserves the registry, leaving no in-app recovery. | Backend handles invalid registries without provider requests; root retains indicator/prefs access and displays a fixed error. Add explicit non-destructive metadata recovery that preserves stored credentials and usable default identities. | Corrected; invalid registry fails closed and exposes explicit metadata-only recovery |
| MR-11 | P2 | Scoped `clearSecret` supplies a no-op file remover and `disconnect` marks snapshots/alerts preserved. The Accounts confirmation promises removal of quota data. Controller teardown/recreation does not necessarily register the deleted connector, so no `removeProvider`/alert change callback guarantees pruning its persisted data. | Backend prunes only target snapshot/alert entries under durable exclusion, verifies absence, preserves sibling entries, and handles partial failure truthfully. | Corrected; bounded exact cache pruning and cross-process late-write regression |
| MR-12 | P1 | `lib/prefs/disconnectDialog.js::render` interprets any completed gate transaction as all local credentials and cached data removed. New scoped transactions preserve siblings. Failed scoped transactions with preserved files also produce an inaccurate cache-failure message and global retry label. | Preferences owner interprets `transaction.target`, separates global/scoped outcome text, treats preserved fields correctly and offers exact scoped retry. Global destruction must retain an explicit all-account confirmation. | Corrected; scoped/global outcome handling and confirmed exact retry |
| MR-13 | P1 | API-key `remove()` and OAuth `disconnect()` begin with `gate.capture(meta.id)`. A failed scoped deletion leaves that provider blocked. Retrying the same connector after unlocking therefore rejects before `clearSecret` can start the new scoped transaction; global disconnect is the only offered recovery. | Backend/controller owner permits explicit confirmed exact-target deletion retry without requiring a writable credential ticket first. Preserve target identity and sibling credentials; handle best-effort revoke lookup failures independently from local removal. | Corrected; same-target retry without writable capture, conflicting intent guard |

No P0 finding was established in this source review. This statement is limited to the inspected connector registry, credential namespaces, durable target deletion, controllers and integration paths, and does not substitute for native/security verification.

### Root-supplied verification progress, not independently executed here

- Four current native Accounts variants passed; root identifies `/tmp/gaq-connectors-native-output.txt` as the run log. This reviewer has not run or independently inspected those native variants.
- Two-connector alert-history behavior received root-owned RED/GREEN verification in the 40-test alerts suite; root retains those test files.
- The visual capture oracle detected 42 of 176 previous captures had invalid opaque inputs rejected by the material enum. Their labels were inaccurate and those captures were discarded. Root is generating a strict new 220-capture matrix in four batches; it remains in progress at this handoff. Earlier captures must not be treated as valid acceptance evidence for their labeled material settings.

All four findings have since been corrected and independently reviewed; this paragraph records the original handoff. Return the coordination slot now so the root can run the preferences correction in parallel with the active backend worker and exclusive visual captures.

## Final reconciliation

The [final QA report](2026-10-08-manual-regressions-final-qa.md) records corrected MR-10–MR-13 and four additional fixes: popup Add target; local-label privacy; recovery capacity; durable failed-deletion intent. Four selected independent fault mutants were killed. The [validation record](2026-10-08-manual-regressions-validation.md) owns final integrated/native/packaging results. Further final-gate discoveries: expanded-font recheck button required internal word/character wrapping, with actual click regression; resource probe needed bounded overview/allocation settlement, retaining strict zero-resource and performance thresholds. Previous invalid screenshots are excluded.
