# Gnome AI Quota v0.1 audit and release plan

Status: final global source freeze confirmed after expanded focus QA approval; root remaining release gates pending. Context identifier: `v01-audit-release`. Initial baseline: `58a6388a8cf689fd2bd9365d1ece23bcf65a6888`, branch `feat/post-mvp-effects`, PR #13. Root subsequently confirmed PR #13 merged, fetched `origin/main` at `a3ffd6f` with tree identical to `58a6388`, and moved delivery work to `release/v0.1-audit` for a new final PR. Root retains the owner's earlier authorization to commit and create the PR; workers may not commit, merge, release or publish.

## Acceptance contract

- Independently review security, architecture, frontend, UI, UX and design against the implemented provider and product contracts. Report exact source locations, concrete failure conditions, severity and verification limits.
- Correct actionable findings through explicitly assigned development ownership; independently rereview corrections and rerun affected gates on the final source.
- Refresh documentation against the final implementation. Rewrite the README with the title **Gnome AI Quota**, an accessible product introduction inspired by the organization of `obra/superpowers`, supported providers, features and complete installation instructions. Remove README architecture and milestone/phasing sections; retain engineering detail in its established documentation.
- Build the first v0.1 extension archive and verify its version, UUID, contents, schemas, translations, helper and license/runtime bytes against the final source. The resulting local artifact must be concrete and reviewable.
- Record unresolved participation limits honestly. Current-source test evidence is required; old passing records are historical evidence only.

Constraints: GJS ES modules and GNOME Shell 50; pure core and established Shell/GTK/service boundaries; English repository prose and msgids, Portuguese in its catalog. No real credentials, provider configuration, keyring contents or account operations. Tests use synthetic/private data. Native and performance runs belong exclusively to the root agent's execution lock. No worker commits or reverts another worker's edits.

## Priority and review waves

| Priority | Scope | Acceptance focus |
| --- | --- | --- |
| P0/P1 | Credentials, OAuth, networking, disconnect coordination | Own authentication; PKCE/state/loopback validation; host/size/time limits; no secret exposure; provider lease/CAS; retry recreated data; obsolete contexts; consent/cancellation semantics |
| P1/P2 | Shell frontend and renderer | No stale actor use or allocation critical; complete values; stable focus/controls; teardown; reduced motion; theme changes; popup anchoring; native material/shadow acceptance |
| P1/P2 | UX, design and preferences | Empty/error/stale/paused states; explicit account actions; accessible names; keyboard, large text, narrow layouts, RTL; truthful consent/partial failures; restore preserves account choices |
| P2 | Architecture and provider/product contracts | Pure core boundaries; scheduler freshness/backoff; parser failures; alert quiet migration/dedupe; untrusted theme origin; bounded font manifest installation |
| P2 | Documentation and release artifact | Accurate supported-provider scope; metadata and About version; first-install/update instructions; package byte parity; licenses/helper; documentation cross-links and current limitations |

The root dispatches bounded reviewer waves and owns the global slot ledger. Maximum concurrency is four total agents in this harness. Reviewers remain read-only until the root assigns exact correction files. Each finding must distinguish executed reproduction, source trace, supplied evidence and unverified expectation.

## Ownership ledger

| Role | State | Exclusive writes / responsibilities |
| --- | --- | --- |
| Root | ACTIVE | Integration, dispatch, release/packaging investigation, fresh gates; exclusive native/performance lock |
| `v01_orchestrator` | DONE / available | Final correction/QA evidence consolidated in this plan and audit; no runtime edits/tests/scans during coordination; releases slot for root's exclusive final gates |
| `v01_security_review` | DONE | Security review and backend corrections frozen; coordinator independent backend source/test review passes; independently approved scheduler correction |
| `closure_orchestrator` | DONE | UX/design/frontend review and both assigned corrections frozen; coordinator source rereview passes; root native acceptance pending |
| Independent backend correction review | DONE / root pending | Coordinator reviewed frozen source and independently ran config 19/0 plus signal 4/0; root final integration remains pending |
| Architecture review | ACTIVE | Coordinator reads provider/scheduler/alerts/service boundaries; source findings referred for independent confirmation |
| Scheduler correction | DONE | Source frozen after focused GREEN and three private-copy mutation checks; independent backend rereview and fresh 42/0 pass; integrated root gates pending |
| Keyring alert correction | DONE | Frozen `lib/core/alerts.js` and `tests/alerts.test.js`; RED 12/2, GREEN 39/0, guard mutant killed; root independent source review passes; full integration pending |
| `v01_readme_writer` | DONE | `README.md`, `docs/README.md` and new `docs/usage.md` frozen; coordinator source/prose review passes after partial-disconnect wording correction |
| `v01_docs_language` | DONE | Canonical documentation and historical snapshot reconciliation complete; all assigned files frozen |
| `v01_ui_design_final` | DONE | Independent review identified native focus candidate and P3 used/remaining copy mismatch; report frozen |
| `v01_front_final_fix` | DONE | Expanded actual native RED then frozen correction; 60 pure conditions and 88 native observations GREEN (minimum3.628:1); independent QA approved |
| Final QA | DONE | All reviewed corrections approved, including expanded focus with four independent mutants killed and 60-condition pure/native evidence decoded; remaining release gates belong to root |
| `v01_http_cancel_fix` | DONE | Four owned files frozen; actual Soup-loopback RED/GREEN, four private branch mutants and independent QA approval complete |

This ledger reflects the observed initial dispatch, not a claim that queued work has executed. Root messages update its disposition as agents finish.

## Integration gates

- [x] Consolidate completed specialist findings, de-duplicate them and assign dispositions; root native focus candidate remains explicitly pending.
- [x] Close expanded all-theme focus P2 with derived focus, 60 pure palette conditions, actual 44-theme/88-control RED/GREEN and independent QA with four mutants killed. Final global source freeze is confirmed; no reviewed source finding remains open.
- [x] Run fresh relevant synthetic tests, full checks and security gates on final source.
- [x] Run affected native layout/preferences/material/lifecycle gates under the root lock.
- [x] Rerun performance acceptance after compiler/template changes; preserve earlier observations and unchanged budgets.
- [x] Refresh user/developer/theme/ADR documentation; identify historical records as historical rather than silently rewriting their past evidence.
- [x] Align final metadata and About version with v0.1, build the archive, and verify contents/byte parity.
- [x] Record artifact path, actual command exits, scope limits and final review verdict; the generated delivery manifest pins the accompanying source commit and ZIP hash.

Root's current post-correction `check-release` evidence is **465/0**, and `layout-release` passes all **12** cases. Remaining matrix/lifecycle/static-scanner/performance/package pipeline gates are queued or running under the root lock and remain unchecked here. The root-owned [v0.1 release validation](../reviews/2026-10-08-v01-release-validation.md) records provisional evidence and will carry their final results.

## Deviations and historical evidence

Historical closure records cover 415 synthetic assertions, private integration, scanner gates, a 264-case native resource matrix, 44 theme captures, 12 native layout cases, 100 lifecycle cycles, virtual monitor/pixel acceptance and four-condition processing profiles. These counts belong to those reports' source; none is a fresh v0.1 result.

The existing physical-account, human Orca, physical monitor/GPU and lock/suspend limits remain participation gaps. Virtual monitor coverage and CPU-submission plus GPU-finish processing time must not be described as physical certification, pure GPU time or end-to-end presentation latency. The previous accepted leaves increment was 1.998 ms against a 2 ms budget, so any renderer change warrants special attention rather than a historical pass claim.

Known document reconciliation items are recorded in the [audit](../reviews/2026-10-08-v01-audit.md). Product scope remains the four implemented providers; a money-compatible model does not establish OpenRouter support.

## Final integration disposition

See the [final release validation](../reviews/2026-10-08-v01-release-validation.md):
465/0, five scanners, final layout/resource/lifecycle gates, all-theme native focus,
actual installed ZIP and the unchanged performance budgets pass. All fourteen
final frame-profile source hashes match. Earlier source-gate statuses above
record the audit progression; the current disposition is automated acceptance.
The supplied ZIP is assembled under dist/v0.1 with checksum/build manifest after
committing its validated source; no GitHub Release or GNOME website publication
is authorized by this delivery. Real-account/human/physical participation limits
remain explicit and are not inferred from synthetic results.
