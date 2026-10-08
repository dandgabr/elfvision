# Manual regression correction plan — 2026-10-08

Status: implementation, independent source review, final native checks and rebuilt ZIP complete; commit/PR delivery follows. The diagnosis/ownership sections below describe the original plan, not current unresolved work.

Context identifier: `manual-regressions-2026-10-08`. The current user report supersedes the earlier v0.1 audit's visual acceptance. Automated resource checks and screenshots did not establish that materials, expansion stability, every theme pair or account configuration matched the user's expectations. The earlier results remain historical evidence, not proof that these regressions are absent.

## Objective and boundaries

Correct the reported popup and account problems, support multiple independently manageable connectors for every available provider, and deliver individual theme/material screenshots for human inspection. Keep runtime effects bounded, preserve keyboard access and credentials, and document accepted design changes. Existing available providers remain Command Code, Codex, Claude and Antigravity. Do not introduce another provider or a browser rendering dependency merely to fix native materials.

All credential tests use synthetic stores and isolated configuration. Never inspect real credential values, tokens or user configuration. The root owns the running test environment, including PID 1928932 at task assignment; workers must not restart or kill it.

## Ownership and parallel work

This is an ownership proposal, not permission for simultaneous edits. The root assigns actual implementation ownership after read-only findings and UX discussion are consolidated. A maximum of four active agents including the root applies to this session.

| Track | Exclusive responsibility | Dependencies / handoff |
| --- | --- | --- |
| Root integration/native reproduction | Private headless shell, `tools/manual-regression-probe.js`, screenshots, native fixtures and reproduction; final verification, translations and release integration | Shared harness changes are root-owned; no worker touches the user's running shell |
| Coordination | This plan and `../reviews/2026-10-08-manual-regressions.md` only | Findings, ownership reservations and acceptance ledger; no product edits |
| UI/UX/accounts diagnosis | Accounts interactions, restore semantics, connector labels, empty/error states and keyboard flows | Read-only first; implementation scope must agree with backend identity contract |
| Design/material diagnosis | Individual theme capabilities, light/dark visual pairs, transparency/material behavior, decoration and insets | Read-only first; theme source changes can be divided by theme once common rendering changes are stable |
| Backend connector implementation (queued) | New connector model/store, credential addressing, provider runtime adaptation, status/tracking identity and tests | Reserve `extension.js`, provider factory, credential services, status/settings/schema changes before dispatch |
| Frontend connector implementation (queued) | Accounts list, add/edit/remove connector dialogs, first-use integration and restore feedback | Reserve `lib/prefs/accounts.js`, controllers and first-use files after backend contract freeze; no shared-file overlap |
| Rendering implementation (queued) | Numeric allocation, material composition, invariant card geometry and footer styles | Reserve provider card/theme controller/template files; only one owner for common CSS compiler/template |
| Independent review (queued) | Security, architecture and UI/UX acceptance after implementation | Read-only review; route findings back to existing owners, never parallel edits to their files |

Teammate `v01_front_final_fix` has confirmed a read-only diagnosis document reservation at `../reviews/2026-10-08-theme-material-diagnosis.md`. No common product files are reserved by that diagnosis.

The root confirms the active ledger: root integration, coordination, `accounts_ux_design` and `v01_front_final_fix` (four slots total). Accounts design owns `../specs/2026-10-08-connectors-design.md` only. Release the coordination slot once this plan and ledger are handed off; queue the backend implementation until the Accounts design contract is available. No subagent has been spawned by the coordination worker.

## Work order and acceptance

1. Capture current reproduction before changes: expand/retract Example Credits repeatedly; switch effect modes without changing other settings; capture material toggles on a contrasting wallpaper; measure content/card allocations; check restore settings before/after.
2. Discuss account UI and design with the requested UI/UX/frontend specialists. Freeze connector identity, migration and restore semantics before frontend/backend writes. Record disagreements and the selected behavior in the findings ledger and canonical documentation.
3. Implement account/backend and rendering work in disjoint reservations. Render theme-specific revisions in parallel only after reusable material geometry is stable.
4. Validate every theme individually in both schemes, with explicit material applicability and screenshots. A contact sheet is useful navigation but cannot replace inspection of each image. Unsupported selections must explain applicability; a selected supported material must make a perceptible difference.
5. Run independent review and correct findings with original owners. Re-run meaningful tests and native screenshots on final code. Provide screenshot paths and a short manual recheck list; do not claim the user's visual acceptance before receiving it.

| Report / requirement | Required evidence |
| --- | --- |
| Numeric value vibrates during expansion | Current numeric text stays stable across repeated expand/retract with system light/dark and Off/Subtle/Full; timed native allocation/render captures, not only equal strings |
| Materials/transparency have no visible effect | Each theme pair has an explicit capability record and individual native screenshots of relevant Off/on/material selections over the same contrasting background; rendered pixel difference is attributable to backdrop/material, not a moved window |
| Card inset varies with effect mode | Native allocations show invariant content/card inset for Off/Subtle/Full in the same theme/scheme and expansion state; decoration/shadow bounds remain intentional |
| Uncharacteristic theme pairs | Design review of each light/dark pair, especially Cyberpunk light; preserve style identity rather than only invert luminance |
| Demo footer rectangle | Individual screenshots show footer text integrated into theme background with readable contrast and without an unintended solid block |
| Restore does nothing / blocks configuration | Real isolated GTK interaction changes nondefault settings to schema defaults and publishes updates; cancellation changes nothing; actions remain available after restore; exact preservation/deletion policy is visible before confirmation |
| Multiple accounts per provider | Two synthetic connectors of the same provider coexist, have independent credentials/status/pause/notifications, and can be edited/reconnected/deleted independently; deleting one cannot damage the other |
| Keyboard already functional | Retain visible focus, Tab order, Enter/Space activation and Escape cancellation through redesigned Accounts and dialogs |

## Connector identity and migration gates

The existing model is one account per provider: keyring attributes are `{provider, kind}`, scheduler/provider IDs are registry IDs, and status/tracking/alerts are provider-keyed. Supporting two accounts requires a connector identity distinct from the provider type; adding another Accounts row alone would overwrite credentials.

Use a stable, nonsecret connector ID and a provider type field. Store display labels as bounded plain text; they are user labels, not trusted provider-returned identity claims. No credential, authorization response or raw provider account detail belongs in GSettings, snapshots, logs or labels. Local OAuth client configuration remains provider-type configuration, not a user's account credential.

Confirmed root scope: each connector receives its own labeled popup card and runtime; do not sum independent account quotas, windows or currencies into a provider aggregate. Demo account actions must create/remove independent synthetic connectors and report simulated status explicitly, without invoking real keyring or OAuth actions.

Before writing a migration, choose and test: legacy account representation; keyring lookup addressing that cannot match another account; non-destructive restart-safe migration; absence/locked/unavailable keyring distinctions; stale callback fencing; revision routing; removing one connector versus disconnecting all; tracking/status/snapshot/alert keys; and OAuth refresh lease/CAS isolation. The existing durable gate validates only the four registry IDs and may conservatively retain provider-wide exclusion while individual writes use connector-specific attributes. Changing the gate to connector IDs is a separate coordinated schema/migration task and must not happen implicitly.

Do not erase a legacy credential until a verified new item and usable connector metadata are durable, or retain the legacy item as the default connector. Avoid matching only `{provider,kind}` after multiple account items exist. Migration failure must leave the original account usable and explain a recoverable state without exposing its secret.

A separate connector-specific libsecret schema namespace is a viable way to prevent the old two-attribute schema query from selecting arbitrary new items. The backend owner must verify the concrete schema/query behavior and recovery tests before choosing it; merely adding an attribute while keeping broad old lookups is insufficient.

## Completion boundary

Source, documentation, native verification, individual screenshot evidence and independent reviews must agree before a new completion claim. Live provider authorization, Orca and physical hardware behavior remain separate measured/manual limits unless actually tested with user participation. Retain earlier audit artifacts with their original dates and add corrective evidence; never replace failures with claims of past success.

## Implementation-stage correction handoff

An independent source review identified MR-10–MR-13 in the findings ledger: malformed registry disables the extension/no safe recovery, scoped deletion does not remove promised target quota/history, global disconnect UI misreports scoped outcomes, and pre-deletion writable-ticket capture prevents retry of a blocked failed target. Root has assigned registry recovery and exact cache pruning to the active backend worker; root owns indicator recovery/error display. Preferences outcome handling and controller retry fixes must return to their original owners with explicit file reservations. No reviewer edits those product files in parallel.

After those fixes, add direct tests for malformed live/demo registries, deletion with sibling cache/history, scoped failure followed by same-target retry and truthful global/scoped labels. Preserve the existing sibling credential namespace and stale-write tests. The root's visual oracle rejected 42 mislabeled captures of an earlier 176-capture batch; replacement captures require valid enum inputs and attribution to current source. Do not count discarded captures toward theme/material acceptance.

## Current implementation disposition

All MR-01–MR-13 corrections and four additional independent QA findings have implemented source and focused regressions. Backend, Accounts and rendering were assigned disjoint files; root serialized all native sessions and integrated shared boundaries. See the [final QA](../reviews/2026-10-08-manual-regressions-final-qa.md) and [validation record](../reviews/2026-10-08-manual-regressions-validation.md). The new branch is `fix/manual-regressions-connectors` from merged `origin/main` (`db6c259`). Prior PR #14 is historical. Native final gates and installed rebuilt ZIP passed; commit and a new PR are the final delivery steps; human visual acceptance, real accounts, Orca and physical hardware are not claimed.
