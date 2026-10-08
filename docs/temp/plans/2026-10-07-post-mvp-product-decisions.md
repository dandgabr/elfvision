# Post-MVP product decision proposals — 2026-10-07

Status: proposals for explicit product acceptance. This document delivers the decision work, not disconnect-all, font downloads or two-threshold notifications. Current Restore defaults preserves accounts, current themes use installed-font fallbacks, and notifications retain the existing single threshold. ADRs 0006/0008/0010 remain unchanged until the respective decision is accepted.

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

Open decision: accept action and default scope, select cross-process gate ownership, and decide whether optional terms/tracking clearing belongs in this first iteration.

## Optional font installation

Propose a separate explicit “Install suggested fonts…” action. Choosing a theme never authorizes installation. A review shows each font name, source host, pinned version/hash, byte count and verified license; Cancel is the default. Font fallback remains available offline and after cancellation. No installer runs while selecting/opening a theme or while the popup animates.

Only a maintained developer-owned manifest may identify licensed font files and HTTPS hosts. Theme JSON cannot provide downloads, archives, URLs or executable installers. Proposed ceilings: 5 MiB/file, 20 MiB/action, at most four files; a counted streaming read enforces the bound even without Content-Length. Reject off-allowlist redirects and hash mismatches. Prefer individual TTF/OTF files to archives; no arbitrary extraction or font build commands. Verify license terms for the exact revision before listing it; this proposal grants no download consent and names no presumed licensed font bundle.

Use cancellable async download to a private staging directory; cancellation/close invalidates the generation and removes partial files. Validate expected file type and digest, then install atomically under an app-owned subdirectory of the user's font directory. Never overwrite a user file; existing identical files count as installed, conflicts are reported. Font discovery/update must be async and bounded, with a stable installed-font fallback until ready. Do not parse or install untrusted theme-supplied fonts in Shell. Uninstall, if later accepted, removes only manifest-owned files after explicit confirmation, never all user fonts.

Acceptance tests: theme selection performs zero network/filesystem installation; denied consent and cancellation leave no installed/partial file; offline rendering stays readable; size/hash/redirect controls fail safely; existing user fonts survive; stale completion cannot install after cancellation; large text, RTL and missing glyph fallback remain usable.

Open decision: whether downloads are worth the dependency/support cost, supported licensed sources and revocation/update policy. Current font behavior is unchanged.

## Independent warning and critical thresholds

Propose per-window-type warning/critical controls for session/week/month/credits, stored as used percentages with `1 <= warning < critical <= 100`. Explain credits using consumed allowance consistently with today's model. Proposed new-install values are 80/95, subject to acceptance; warn when the edited pair becomes invalid and keep the previous valid pair rather than silently swapping values. Disabled notification categories stay disabled.

Each provider/metric/quota-window maintains two firing latches. A warning crossing emits warning, then a later critical crossing emits critical. A single update crossing both emits only critical and marks both announced. Rearm each latch only after usage falls at least the existing three-point hysteresis below its own threshold or the quota enters a new reset window; preserve reset-time jitter handling. Data that is stale, malformed or an initial baseline must not emit a new crossing solely because the extension starts, settings are edited or a cache is migrated.

Dedupe keys include provider, metric ID, quota reset epoch and level; preserve the current global cap/coalescing and fixed translated notification texts. Several crossings in one provider update become one highest-severity notification with the same summary policy. Critical escalation can notify once after warning, but settings changes must seed current levels without sending a backlog. Connection alerts remain independent.

Migration proposal: bump alert-state version and explicitly migrate the old latch. Existing single-threshold settings remain effective until acceptance. If accepted, migrate the existing user threshold to critical and leave warning notifications disabled for existing users until they enable them. Preserve notification-disable flags and sent/cap state; migrate known current-window latches, seed missing/new records from the next fresh baseline and emit no startup notification. Do not simply discard the old cache and assume an empty state is a valid crossing history.

Acceptance tests: invalid ordering, exact boundary/hysteresis, reset jitter, stale data, one jump over both thresholds, warning→critical escalation, rapid oscillation, restart dedupe, migration from enabled/disabled/custom thresholds, configuration edits and several providers crossing together. Keep cache bounded and data-only.

Open decision: warning opt-in/migration, default pair, minimum separation and whether independent per-level disabling is needed. Today's single threshold remains delivered behavior.

## Human/account validation still open

Synthetic tools do not certify these checks: complete keyboard traversal in a real nested Shell/preferences window (Tab/Shift-Tab/arrows/Enter/Space/two Escapes, focus after regroup/update/authentication); Orca labels/state changes/tooltips/dialog defaults and announcements; actual reduced-motion/contrast behavior and large-font/RTL readability on varied wallpapers; real provider login, refresh-token rotation, expired/rejected credentials, account reconnection, provider terms acknowledgement and locked-keyring recovery. Perform live checks only with an explicitly participating account owner; never inspect or copy credential values. Provider terms/current quota behavior need official re-verification before a provider ships.

These checks remain open participation requirements; the earlier isolated synthetic probes are useful evidence, not claims that a human or real account performed them.
