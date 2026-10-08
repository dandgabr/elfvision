# Final independent review

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Date:2026-10-07. Worktree:`gnome-ai-quota-post-mvp`. Independent read-only source/test review of dual-alert persistence and local disconnect coordination. No implementation edits, commits, child agents, graphical tests or real credential/config reads. This document is reviewer-owned; other workers continued implementation during review.

## Findings and disposition

1. **Previous valid alert pair lost after restart — resolved.** The original P2 reproduction was valid warning60/critical90 followed by an atomic external invalid warning80/critical75 edit: live behavior retained60/90 but restart used critical75 and disabled warning. `lib/services/alertService.js:64` now reads the persisted backup, `:124` normalizes and saves it immediately, and `:68` processes edits without waiting for a snapshot. `lib/core/alerts.js:97` parses a maximum2048-byte exact-four-type backup, rejects unexpected fields/types/noninteger/out-of-range/invalid enabled pairs and canonicalizes accepted values. Six restart instances and the exact atomic reproduction pass; a first high reading remains a quiet baseline. Separate non-atomic edits correctly retain the latest intermediate *valid* pair rather than an older pair. No current alert-persistence finding remains.

2. **Observed nonparticipating Shell operation fence — resolved.** The initial snapshot rejected a currently running old Shell but could not retain that observation after same-boot replacement. Final `lib/services/disconnectAll.js:42` records the observation before throwing the computer-restart message. `lib/core/disconnect.js:216` atomically persists current boot, a new epoch, all-provider blocking and a fixed failed transaction; `:132` refuses same-boot disconnection even after a new participating Shell replaces the old process. `:71` clears this marker only on a different boot, followed by explicit guarded deletion. Independent final core16/0 and all six private-bus/keyring gates pass. Arbitrary historical pre-install/unobserved operations cannot be inferred from a newly created state file; this is an explicit scope limit, not evidence that unknown requests were drained.

## Reviewed boundaries

| Boundary | Evidence/result |
|---|---|
| Pending credential operation vs disconnect | Durable issued lease before dispatch; deletion waits for settlement; stopped or crashed same-boot writers remain blocked |
| Late token/login/API-save result | Retained epoch and generation checks; rotation reset and pre-write fence; delayed configuration cannot start old login; late API save cannot announce credentials |
| Late cache/status write | Retained first-load ticket, per-store write order, mutex-held async commit; extension status publication guards epoch/controller identity |
| Teardown | Disconnect canceller propagates stop({flush:false}) to alerts/controller; drops timers/listeners/provider requests; ordinary disable retains normal flush behavior |
| Exact removal | Known provider/kind schema matching, presence-only verified absence, two exact live cache files, three status IPC keys; unrelated kinds/providers/files/settings survive |
| Backend failure | Unavailable keyring never counts as absence; partial failures retain affected providers; cache/status failures retain global blocking |
| Coordination storage | Private owned directory, atomic metadata writes,64KiB/64participant/64lease bounded validation, D-Bus mutex and canonical-directory local queue |
| Session isolation | Immutable boot-specific session pin rejects another session bus sharing the state directory; no time-based takeover |
| Human UX | Cancel-default local-only confirmation/source reviewed; actual keyboard/Orca and graphical timing belong to root/indicator gates, not this review |

The current supported ordering is coherent: file commits hold the mutex until completion, credential writes persist leases before uncancellable dispatch, new epoch prevents stale work acquiring a replacement ticket, and cancellation/acknowledgement occurs before deletion. No additional reproducible introduced late-write/cache defect was found in the inspected participating-client implementation.

## Commands and evidence

Run from the worktree root; all evidence logs are `.superpowers/sdd/2026-10-07-final-independent/`:

- `gjs -m tests/run.js -- alert`:62 passed,0 failed (`alerts.log`).
- `gjs -m tests/disconnectRun.js`:final16 passed,0 failed including observed-legacy boot fence (`disconnect-final.log`); earlier15/0 is retained separately (`disconnect-core.log`).
- `gjs -m tests/run.js -- controller`:42 passed,0 failed (`controller.log`).
- `gjs -m tests/run.js -- 'tokens:'`:14 passed,0 failed (`tokens.log`).
- `gjs -m tests/run.js -- 'cache:'`:7 passed,0 failed (`cache.log`).
- `gjs -m tests/run.js -- 'alert store:'`:2 passed,0 failed (`alert-store.log`).
- `bash tests/disconnectDisk.sh`:private-bus old-Shell preflight, killed-writer durable lease with zero deletions, second-bus pin rejection pass (`disconnect-disk-final.log` after final fence; earlier diagnostic in disconnect-disk.log).
- `bash tests/disconnectSecrets.sh`:private actual Secret Service exact deletion/idempotence/unrelated preservation, full local removal, and no-activation unavailable-service negative control pass (`disconnect-secrets-final.log`, after final fence). Only synthetic values in empty private roots/keyring were used.

Three one-edit isolated temporary-copy mutants are killed: old-epoch acceptance, file-write fence bypass, and same-boot orphan lease discard. Production source was never mutated. `mutants/results.json` records each killed test. An added legacy test appeared while mutation copies were made; its then-missing implementation failure is not counted as a mutant kill: each mutant separately kills established matching old-epoch/file/orphan tests.

The initial incorrect token filter returned0 tests and was replaced with the actual `tokens:` filter; the recorded14/0 result is substantive. Injected listener/notifier failure tests intentionally log diagnostics; their success is not a claim of warning-free native runtime health. A locked actual collection, real accounts/provider token flows, storage power-loss/fsync durability and adversarial same-user tampering are not certified by these tests. Configured XDG ancestors remain user-trusted; filesystem size/type prechecks do not claim security against concurrent malicious same-user replacement.

## Brazilian Portuguese review

New font consent/progress/conflict/verification/directory/restart messages, warning/critical ordering/hysteresis descriptions, local disconnection/failure/reboot explanations and Claude unofficial-access/terms acknowledgement were read for semantic fidelity and clarity. They distinguish local removal from remote revocation, preserve truthful failed/blocked outcomes and explicit consent, and contain usable action instructions. No new untranslated English filler, material mistranslation or missing placeholder was found. Brand/license names remain proper names.

`msgfmt --check --statistics -o /dev/null po/pt_BR.po` succeeds:405 translated messages. `msgcmp po/pt_BR.po po/gnome-ai-quota.pot` succeeds. Independent xgettext extraction of current extension.js/prefs.js/lib sources into ignored scratch, followed by msgcmp against pt_BR, also succeeds (`pt-br-source-coverage.log`). No catalog/source edit was performed. These checks validate catalog compilation/completeness, not physical screen-reader Portuguese pronunciation.

Additional service positive control: `gjs -m .superpowers/sdd/2026-10-07-final-independent/late-stores.js` first creates both real temporary cache files, advances the synthetic epoch, removes both, then enqueues four saves from the old CacheStore/AlertStore. Two initial captures are retained and zero subsequent writes occur; neither deleted file is recreated (`late-stores.log`). Temporary directory is explicit and removed; no user cache was touched.

## Reopened lifecycle review

3. **P2 — Closed participant can remain alive after its last issued lease settles — resolved.** Exact independent reproduction (`closed-participant-red.log`) left2 participants and both later disconnects failed with drain-timeout. Owner now centralizes settled store/delete lease cleanup and removes the closed participant only after its last actual callback settles. Facade closure detaches synchronously and cannot clear a new singleton. The exact same independent fixture now leaves1 participant and two complete disconnects (`closed-participant-green.log`). Fresh core19/0 includes both store and deletion close paths plus immediate facade replacement. Issued leases remain durable until actual settlement.

4. **P2 — Immediate normal-disable gate closure discards in-flight rotated tokens — resolved.** Normal provider disposal previously retained renewal until the rotated refresh token could be saved. Immediate close made its context stale after the server consumed the old token. Actual pure tokenManager+gate RED issued refresh, closed gate and returned a synthetic rotated pair: outcome disconnected, one refresh call and zero credential writes (`close-rotation.js`, close-rotation.log). Final `lib/services/disconnectGate.js:38` retires by detaching immediately, retaining the old watcher/cancellation while known disposal promises settle, then closing. `lib/providers/index.js:137` returns whenIdle settlement; `lib/services/controller.js:112` collects synchronous/asynchronous disposal outcomes without delaying immediate cancellation, and extension.disable propagates settlement to retire. The independent same renewal fixture adapted only to retirement now returns access, saves exactly once and leaves zero old participants after idle (`retire-rotation.js`, retire-rotation-green.log). Fresh core22/0 includes simultaneous replacement-facade disconnect resetting a retiring rotation and preventing late storage, immediate singleton replacement and idle retirement; controller43/0 validates returned settlement; tokens14/0 remains green. All six private-bus/keyring gates were rerun green after retirement (`disconnect-disk-retire-final.log`, disconnect-secrets-retire-final.log).

Final verdict: approved for alert-rule persistence, observed-legacy fencing, disconnect race/cache boundaries, facade/participant teardown, preserved normal-disable rotation and pt-BR translations. All four concrete findings recorded here are resolved with independent evidence; no remaining current introduced defect was reproduced in this scope. Native accessibility, graphics/GPU and real-account checks remain separate evidence owned by their respective validators.


## Final non-graphical security validation

Final commands were run from the post-MVP worktree with the verified temporary tool path, no real configuration access and no native/rendered tests. `go version -m /tmp/gaq-open-items-bin/gitleaks` identifies module github.com/zricethezav/gitleaks/v8 v8.30.1 (gitleaks-provenance.log). The binary path was supplied by root, not installed into a user environment by this reviewer.

- `PATH=/tmp/gaq-open-items-bin:$PATH tools/sast.sh`:exit0, all five installed scanners ran (sast-default.log). Zizmor explicitly warned that it selected offline mode by default; this is not an authenticated online pass.
- `PATH=/tmp/gaq-open-items-bin:$PATH ZIZMOR_OFFLINE=1 tools/sast.sh`:exit1 solely because the installed zizmor CLI rejects literal1 for --offline and accepts true/false (sast-explicit-offline-final.log). This was a CLI compatibility failure, not a source finding.
- `PATH=/tmp/gaq-open-items-bin:$PATH ZIZMOR_OFFLINE=true tools/sast.sh`:exit0, all five scanners ran (sast-explicit-offline-true-final.log). Bandit, Semgrep, ShellCheck, offline zizmor and gitleaks reported no findings. Bandit emits existing unused-nosec diagnostic warnings for the two fixed a11y subprocess sites; no new suppression was introduced.
- `/tmp/gaq-open-items-bin/gitleaks git . --log-opts=--all --config .gitleaks.toml --redact --no-banner --log-level warn`:exit0, all-reference Git history (gitleaks-all-history.log).
- `/tmp/gaq-open-items-bin/gitleaks dir . --config .gitleaks.toml --redact --no-banner --log-level warn`:exit0, current directory including new source (gitleaks-current-tree.log). Symlink targets outside the tree are not followed.
- `XDG_CONFIG_HOME=<explicit empty temporary directory> python3 -I tools/check-secrets.py --all`:exit0 (check-secrets-all-empty-config.log). Python TemporaryDirectory created and removed the empty directory; the real providers.local.json was never read. This built-in --all gate covers currently tracked files. Root will stage new files and run its final integrated gate; the complete directory scan above separately includes untracked source.

`tools/sast.sh` previously omitted tests/*.sh from ShellCheck. This reviewer made the sole authorized tooling change: include those security harness scripts in the existing ShellCheck invocation. An independent direct `shellcheck --severity=warning tests/*.sh` passed before the edit, and final integrated SAST passed afterward. No production/producer files, catalogs, scanner exceptions, commits or index changes were made.

Final removed-provider retirement review is also green. `QuotaController._disposeProvider` retains promise settlement in _disposing even after removeProvider deletes the provider from the running map; stop includes this set, prevents early old-gate closure, and returns allSettled. Both resolution and rejection remove the retained promise. Fresh `gjs -m tests/run.js -- controller`:44 passed,0 failed (controller-removed-final.log), including removed-provider pending rotation; `gjs -m tests/disconnectRun.js`:22 passed,0 failed (disconnect-removed-final.log). No additional concrete defect was found in this final narrow change.

Security verdict: no scanner finding or current reproducible reviewed defect remains. Online-only zizmor rules, real account/provider behavior and graphical/GPU/accessibility checks are not certified here. Scanners are supporting evidence, not a proof that arbitrary vulnerabilities are absent.


## Additional graphics-cache/viewport source review (no renders)

Root requested a final narrow source review while the native owner stabilizes the popup geometry. The new indicator foreground offscreen policy selects ALWAYS only for frost and restores AUTOMATIC_FOR_OPACITY otherwise; background remains eligible for direct stage sampling. It adds one bounded owned foreground cache, preserves hit geometry and relies on normal descendant invalidation for updated text/styles. Existing indicator cleanup unsubscribes theme changes and destroys effects before actor destruction. No new account-data access, IO, executable theme input or timer source was introduced.

Historical static review of the first workaround: EffectsStack measured only foreground controls and guarded background set_size by allocated viewport dimensions. That source review did not establish native validity. Root subsequently measured a strict lifecycle failure even after250ms: background height460 versus foreground552. The dimension-pin workaround and Actor allocation override are superseded; prior static approval must not be interpreted as successful native geometry or valid performance evidence for that workaround.

Two validation gaps were sent to root before approval: effects-check.sh creates the post-mvp-execution output directory while frame-profile finally writes to a different ignored open-items directory, so a fresh checkout without that parent can fail; and lifecycle100 resource counts alone permit invisible2×2 effects. Requested corrections are an exact output-parent contract and actual allocated/transformed viewport positive controls per lifecycle/profile sample, including zero decoration preferred size. The frames wrapper forces demo and invokes the private headless helper, so the supported runner does not use live accounts. Performance samples must be visibly rendered before their processing budgets count.

Both probe gaps are resolved in final source: effects-check.sh:7 creates the exact frame-profile output parent under umask077; lifecycle checks mapped and >200×100 transformed sibling viewports, equality on every one of100 active openings, and zero decoration natural width; frames validates mapped visible foreground for static and background/foreground for enabled effects before each processing sample. This prevents a cheap invisible2×2 surface being accepted as the active measured scene. Resource teardown assertions remain in place.

The manually started accessibility bus/registry use fixed executable paths and argv, inside the private D-Bus/XDG runtime/state. Two bounded-startup/isolation points raised during this scoped review were repaired: headless-shell.sh:44 clears inherited AT_SPI_BUS_ADDRESS before any private launch, and :53 bounds each GetAddress call to1second inside its50-iteration polling loop. Parsing uses ast.literal_eval on the private service response, not code evaluation; no secret/config values enter the command. Monitor inputs remain a validated maximum-three numeric dimension list passed as argv, not evaluated command text. bash -n on both changed shell helpers succeeds. No subprocess/native test or benchmark was launched by this review while root owns the exclusive GPU run.

Disposition for this additional graphics scope: source/probe/helper corrections approved. No remaining concrete source-level defect was found in these scoped final changes. Native owner geometry/lifecycle/screenshots and the final root processing measurements remain the evidence for actual rendered behavior and budgets; this static approval does not fabricate those results. Earlier security/alert/disconnect approvals are unchanged.


## Historical owned-layout-manager revision (superseded)

Independent read-only review of the stable replacement in lib/ui/themeEffects.js:32–68. EffectsLayout extends Clutter.LayoutManager, measures only foreground controls and allocates background, zero-natural-request decoration and foreground to the same finite local viewport. EffectsStack now uses the manager through St.Widget native allocation; it no longer overrides the actor allocation vfunc, directly calls set_allocation or pins requested width/height. This preserves native St allocation/dirty-layout bookkeeping and removes the feedback between a decorative natural size and the current viewport.

There is one owned manager per stack; it introduces no new IO, timer, asynchronous callback, executable input or account-data access. Child ownership and the existing destroy-time field clearing are unchanged. Foreground null guards and finite coordinate checks remain; preferred-size fallbacks after destruction remain zero. ThemeEffects generation/source/actor disposal paths and the foreground offscreen cache policy are unchanged by this revision. No new concrete static architecture, stale-actor or cleanup defect was found. git diff --check for this source succeeds.

Historical disposition: the owned-manager revision received static source approval, not proof of native geometry. It was subsequently replaced by native BinLayout and targeted decorative reallocation; this paragraph does not describe the effective shipped implementation or certify the superseded manager's native results. Previous alert/disconnect/security/translation conclusions remain independent of this geometry history.


## Effective native BinLayout revision (2026-10-08)

Independent read-only review of final lib/ui/themeEffects.js and lib/ui/indicator.js while root measures the scene. EffectsStack now uses native Clutter.BinLayout without custom measurement/allocation vfuncs or requested-dimension pins. The manager queries native pending requests for every sibling. The styled backdrop has its bounded border-sized natural request and EffectsLayer explicitly returns zero; the real foreground controls dominate popup size. The implementation therefore no longer claims that a custom manager exclusively measures foreground.

At the end of policy/theme reconstruction, ThemeEffects checks only its two owned decorative actors. If has_allocation is false and the retained box has finite coordinates and positive extents, it refreshes preferred requests and reallocates the retained viewport. It does not allocate the foreground, override native container bookkeeping, add an idle retry or run this repair inside the animation timer. Initial zero/no-valid-box cases are left to native allocation. Existing _layout sizes only changed decorative child dimensions, avoiding repeated invalidation for unchanged extents.

The repair is bounded to two actors per reconstruction. It introduces no new IO, asynchronous callback, timer, origin trust or input execution. Existing synchronous generation invalidation, source removal, actor-destroy flags, transitions/blur removal and idempotent cleanup remain. The foreground's frost-only offscreen cache and native live text/style invalidation are unchanged; controls and hit geometry remain on native allocation. No reproducible new static risk, stale-actor or cleanup defect was found in this scoped effective revision.

Scoped static observations for effective BinLayout plus targeted decorative reallocation remain conditional on clean strict native evidence; final renderer approval is reopened. Actual equal-visible viewport, dynamic foreground updates,100-cycle cleanup, screenshots and processing budgets depend on the native owner's fresh evidence for this version. Earlier workaround/custom-manager static reviews are preserved as history and cannot substitute for that evidence. No render, scanner or CPU-heavy test was launched here during exclusive GPU measurement. Final scanners/secret checks will be rerun only after root releases the measurement session, with an explicitly empty temporary XDG_CONFIG_HOME and the verified gitleaks binary.


Follow-up source review: _layout now compares each nonparticle child's preferred requested width/height against the finite viewport, using1/64 only to suppress redundant set_size feedback from pixel-rounded allocated dimensions. Particle transforms remain excluded. This is a bounded internal mutation guard, not a relaxation of the strict sibling-visible-viewport verification or performance acceptance. No additional resource/IO/lifecycle path was introduced; static resource boundaries remain unchanged, but final renderer approval is conditional while strict native validation continues. Scanners remain paused until root explicitly releases them.


Native-health reopening: root reported that100 visible-sibling/resource assertions passed while a bare CRITICAL for a zero-width Cogl framebuffer was missed by the wrapper's [A-Za-z]+-CRITICAL pattern. This is a real health failure, not a clean100-cycle pass. Root is broadening the detector to generic CRITICAL and the native owner is investigating cold-open/reentrant synchronous decorative allocation. Final graphics source approval is withheld until the correction is stable and the strict native health/geometry gates are clean. This reviewer did not reproduce or suppress the native failure and continues to avoid scans/renders during exclusive profiling.


## Released security rerun (2026-10-08)

Root explicitly released non-graphical scanners while the native owner ran causal controls without temporal profiling. No GI/native/render test was launched by this reviewer. Fresh commands below all exited0; logs are under .superpowers/sdd/2026-10-07-final-independent/:

- PATH=/tmp/gaq-open-items-bin:$PATH ZIZMOR_OFFLINE=true tools/sast.sh:all five scanners ran, no findings (sast-2026-10-08-release.log). Existing two unused-nosec Bandit diagnostic warnings remain unchanged. Online-only zizmor audits remain outside evidence.
- /tmp/gaq-open-items-bin/gitleaks git . --log-opts=--all --config .gitleaks.toml --redact --no-banner --log-level warn:all-reference history clean (gitleaks-allrefs-2026-10-08-release.log).
- /tmp/gaq-open-items-bin/gitleaks dir . --config .gitleaks.toml --redact --no-banner --log-level warn:current directory clean (gitleaks-tree-2026-10-08-release.log).
- XDG_CONFIG_HOME=<empty Python TemporaryDirectory> python3 -I tools/check-secrets.py --all:tracked source clean, no real local configuration read (check-secrets-2026-10-08-release.log).

These findings certify this source snapshot's scanner results, not the still-open zero-framebuffer native issue. If the native correction changes JavaScript/source after this release, root will request a final scanner rerun; graphics approval remains conditional until its corrected strict gates pass.


## User-reported opaque heading strips (2026-10-08)

Implementation ownership explicitly assigned to this reviewer after the read-only audit: lib/core/theme.template.css and focused pure compiled-CSS tests. Other agents own renderer/indicator; neither was edited and no native test was run. User evidence: /tmp/codex-clipboard-dzyeB9.png shows solid full-width strips behind the quota summary and "Na barra" heading.

Cause: the effects-active selector grouped .gaq-summary and .gaq-section with footer/legend/row reading surfaces and applied the opaque popup bg token. A meaningful compiled-CSS regression first failed for ai-native-generative-ui/light: expected transparent header, actual#fbfaff. This was a CSS surface classification error independent of native material sampling. The selected ai-native theme in the image deliberately has an opaque default profile; that single example is not evidence that every compatible material/theme fails translucency.

Fix: split summary/section into explicit transparent background, primary fg text and a local2px bg-colored text shadow/outline. Full-width heading strips no longer cover the material. Quota cards and actual control surfaces retain their opaque colors and contrast protection; no whole-popup/text opacity reduction was introduced. This narrows the previous implementation interpretation of "opaque reading zones": the current explicit user requirement keeps header gutters transparent with locally readable text, while primary quota reading/control surfaces stay opaque. It does not rewrite the original plan or falsely claim that it expressly demanded opaque full-width headers.

Focused TDD: .superpowers/sdd/2026-10-08-heading-transparency/red.log records21 passed,1 failed before the source correction; green.log records22 passed,0 failed after. The regression compiles all22 builtin themes in both schemes and verifies transparent effect headings, primary text/local contrast outline, plus positive preservation of opaque quota card and control backgrounds. npm run lint exits0 (lint.log); git diff --check for the two edited files exits0.

Changed implementation files: lib/core/theme.template.css and tests/theme.test.js. No generated theme JSON was hand-edited; CSS is compiled through the original compileTheme path from the shared template, so the theme generator/data needed no change. Native appearance, wallpaper contrast and material visibility remain root's serialized screenshot/renderer verification; pure CSS success is not substituted for native visual evidence. This bounded CSS fix is DONE and ready for that integration gate.


### 2026-10-08 card-shadow clipping correction (scoped CSS ownership)

The user screenshot `/tmp/codex-clipboard-GCVGzf.png` shows Glassmorphism card shadows clipped at both horizontal edges. `.gaq-cards` had spacing but no internal padding, so cards occupied the ScrollView's full clipped width. Popup-frame padding outside the ScrollView could not reserve the shadow's paint footprint within that clip. This is a visual-fidelity defect, rather than an intentional material adaptation.

The compiler now derives `shadow-gutter` from the validated scheme's single shadow and the template applies it as card-container padding. Native `st_shadow_get_box` expands each edge by blur plus spread and translates by the signed offsets ([official GNOME Shell 50.5 source](https://github.com/GNOME/gnome-shell/blob/50.5/src/st/st-shadow.c#L140)). Insets and rejected shadows reserve no external space; each edge rounds outward and is bounded to 64 pixels. Existing shadows, opaque reading surfaces, transparent headings, viewport width and clipping policy remain intact. No generated assets were edited. Custom themes requesting extreme shadows beyond this bounded reserve can still have their deliberately oversized shadow clipped; the cap prevents such theme geometry consuming the entire popup.

Glassmorphism dark reserves top/right/bottom/left `24/32/40/32px`, leaving 316 pixels for a card within the 380px viewport; Aurora dark reserves `30/40/50/40px`, leaving 300px. The maximum bounded custom reserve leaves 252px. The root owns responsive value/header verification under those reduced widths.

The focused regression was RED before implementation: 22 passed, one failure (compiled `.gaq-cards` had no padding). GREEN verifies all 22 built-ins in both schemes, preserving the original shadow declaration; additional controls cover signed offsets, positive/negative spread, fractional lengths, inset, hostile 999px blur and CSS-injection rejection. Logs: `.superpowers/sdd/2026-10-08-shadow-gutter/{red,green,lint}.log`. Native comparison is intentionally pending the serialized renderer gate: pure CSS checks establish reserved geometry, not visible-pixel or full-value acceptance. The final native capture must show continuous lateral shadow falloff without an abrupt cutoff in the same viewport and retain readable complete quota values.

Independent cross-review caught a valid case-insensitive shadow parsing edge case: uppercase `INSET`/`PX` were accepted by validation but the new geometry parser threw. The regression reproduced that failure (`case-red.log`); matching now uses the same case-insensitive contract while preserving the original shadow text. The final focused rerun is 23/0.
