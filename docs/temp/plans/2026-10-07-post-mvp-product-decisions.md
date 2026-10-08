# Post-MVP product decision proposals — 2026-10-07

Status: accepted and implemented after the owner's request to resolve all open items on 2026-10-07. The sections below preserve the original proposals for traceability; the [closure plan](2026-10-07-open-items-closure.md) records the final choices and the implementation reviews record evidence.

Final choices: disconnect-all preserves terms/tracking/configuration/themes/fonts and performs local deletion only, with no remote-revocation promise. The durable generation/lease gate is shared by Shell and preferences. Same-boot orphan keyring operations fail closed until a computer restart. Font installation is explicit, limited to four pinned licensed files and never initiated by selecting a theme. Warning is opt-in at 80% for both new and existing users; critical keeps its existing default 95% and custom values. Invalid pairs retain their last valid effective values across restart. Restore defaults continues to preserve accounts. No browser dependency or WebGL runtime bridge is added to Shell.

## Separate disconnect-all action

Propose an Accounts-page action named “Disconnect all accounts…” with a review dialog listing providers and local data categories. Default response and initial keyboard focus are **Cancel**; Escape closes without changes. The destructive response is “Disconnect all”. Opening the dialog performs no deletion, revocation or credential-value display. Restore defaults continues to reset appearance/behavior only.

Default deletion scope: only this extension's libsecret schema entries for known providers and `api-key`/`oauth-token` kinds; `snapshots.json` and `alerts.json` in its own cache directory; app-published account-status and cached account display metadata. Delete exact files/attributes, never recurse across the user's configuration/cache/keyring. Optional separately labelled selections may clear terms acknowledgements or reset tracking choices; leave both untouched by default. Preserve custom themes, fonts, public provider client configuration and first-use dismissal. Server-side token revocation is best effort with a bounded timeout and cannot substitute for successful local deletion; do not promise remote logout or erase another tool's login.

Required operation protocol before implementation:

1. After confirmation acquire an app-wide deletion generation/gate shared by preferences credential writers and Shell refresh/poll/cache writers. A process-local Cancel alone is insufficient. Publish “disconnecting” state and stop admitting sign-in/save/refresh/cache commits.
2. Cancel in-flight login/loopback flows and polling, and await acknowledgements from every live writer. Each writer must re-check the gate/generation immediately before a keyring or cache commit. An already executing uncancellable libsecret write must settle before deletion proceeds.
3. Delete credentials only after draining prior writes; increment credentials revision and clear pending refresh-token pairs, snapshots and alert state. Persist a nonsecret tombstone/deletion generation across process restart until completion. Disconnected providers must not resume polling before another explicit successful connection.
4. Report per-provider/category success and fixed failure messages. Do not mark everything disconnected if the keyring refused deletion. Keep the gate for affected providers and provide a retry action; never restore the previous secret as an implicit rollback. Release successful providers only after fresh lookups confirm absence, without displaying values.

Coordination remains an architectural prerequisite, not an existing guarantee: current per-controller generations and token-manager single-flight protect their own operations but are not a durable cross-process deletion transaction. Define timeout/recovery behavior for a crashed or missing Shell/preferences process; a persistent generation plus commit checks is required before shipping. The dialog must warn about partial local failure and never convert a missing acknowledgement into permission to delete while an unguarded writer remains active.

Acceptance tests: Cancel/escape performs zero writes; late OAuth exchange/API save/refresh cannot recreate deleted entries; an active cache save cannot recreate erased caches; two preference windows and Shell restart honor the same gate; keyring denial produces truthful partial results; re-enable does not resurrect sessions; exact-scope fake keyring/files prove unrelated entries survive. No test reads real credential values.

Resolved: the accepted action uses a durable shared generation/lease gate and
preserves terms/tracking. Optional clearing of those choices and remote revocation
are excluded from this iteration; the confirmation states the local-only scope.

## Optional font installation

Propose a separate explicit “Install suggested fonts…” action. Choosing a theme never authorizes installation. A review shows each font name, source host, pinned version/hash, byte count and verified license; Cancel is the default. Font fallback remains available offline and after cancellation. No installer runs while selecting/opening a theme or while the popup animates.

Only a maintained developer-owned manifest may identify licensed font files and HTTPS hosts. Theme JSON cannot provide downloads, archives, URLs or executable installers. Proposed ceilings: 5 MiB/file, 20 MiB/action, at most four files; a counted streaming read enforces the bound even without Content-Length. Reject off-allowlist redirects and hash mismatches. Prefer individual TTF/OTF files to archives; no arbitrary extraction or font build commands. Verify license terms for the exact revision before listing it; this proposal grants no download consent and names no presumed licensed font bundle.

Use cancellable async download to a private staging directory; cancellation/close invalidates the generation and removes partial files. Validate expected file type and digest, then install atomically under an app-owned subdirectory of the user's font directory. Never overwrite a user file; existing identical files count as installed, conflicts are reported. Font discovery/update must be async and bounded, with a stable installed-font fallback until ready. Do not parse or install untrusted theme-supplied fonts in Shell. Uninstall, if later accepted, removes only manifest-owned files after explicit confirmation, never all user fonts.

Acceptance tests: theme selection performs zero network/filesystem installation; denied consent and cancellation leave no installed/partial file; offline rendering stays readable; size/hash/redirect controls fail safely; existing user fonts survive; stale completion cannot install after cancellation; large text, RTL and missing glyph fallback remain usable.

Resolved: explicit installation uses four licensed Google Fonts files pinned to a
reviewed revision. Updating the manifest requires developer source/license/hash
review; no automatic replacement or broad removal is offered. Existing themes
keep installed-font fallbacks.

## Independent warning and critical thresholds

Propose per-window-type warning/critical controls for session/week/month/credits, stored as used percentages with `1 <= warning < critical <= 100`. Explain credits using consumed allowance consistently with today's model. Proposed new-install values are 80/95, subject to acceptance; warn when the edited pair becomes invalid and keep the previous valid pair rather than silently swapping values. Disabled notification categories stay disabled.

Each provider/metric/quota-window maintains two firing latches. A warning crossing emits warning, then a later critical crossing emits critical. A single update crossing both emits only critical and marks both announced. Rearm each latch only after usage falls at least the existing three-point hysteresis below its own threshold or the quota enters a new reset window; preserve reset-time jitter handling. Data that is stale, malformed or an initial baseline must not emit a new crossing solely because the extension starts, settings are edited or a cache is migrated.

Dedupe keys include provider, metric ID, quota reset epoch and level; preserve the current global cap/coalescing and fixed translated notification texts. Several crossings in one provider update become one highest-severity notification with the same summary policy. Critical escalation can notify once after warning, but settings changes must seed current levels without sending a backlog. Connection alerts remain independent.

Migration proposal: bump alert-state version and explicitly migrate the old latch. Existing single-threshold settings remain effective until acceptance. If accepted, migrate the existing user threshold to critical and leave warning notifications disabled for existing users until they enable them. Preserve notification-disable flags and sent/cap state; migrate known current-window latches, seed missing/new records from the next fresh baseline and emit no startup notification. Do not simply discard the old cache and assume an empty state is a valid crossing history.

Acceptance tests: invalid ordering, exact boundary/hysteresis, reset jitter, stale data, one jump over both thresholds, warning→critical escalation, rapid oscillation, restart dedupe, migration from enabled/disabled/custom thresholds, configuration edits and several providers crossing together. Keep cache bounded and data-only.

Resolved: warning is opt-in for every installation, default80%, below existing
critical95% or its custom value by at least one point. Warning has its own switch;
the existing category switch still disables the category. The last valid pair is
persisted so external invalid edits cannot change behavior after restart.

## Human/account validation still open

Synthetic tools do not certify these checks: complete keyboard traversal in a real nested Shell/preferences window (Tab/Shift-Tab/arrows/Enter/Space/two Escapes, focus after regroup/update/authentication); Orca labels/state changes/tooltips/dialog defaults and announcements; actual reduced-motion/contrast behavior and large-font/RTL readability on varied wallpapers; real provider login, refresh-token rotation, expired/rejected credentials, account reconnection, provider terms acknowledgement and locked-keyring recovery. Perform live checks only with an explicitly participating account owner; never inspect or copy credential values. Provider terms/current quota behavior need official re-verification before a provider ships.

These checks remain open participation requirements; the earlier isolated synthetic probes are useful evidence, not claims that a human or real account performed them.
