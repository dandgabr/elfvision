# 0010. Alerts and polish (M4)

Status: accepted, being implemented in the order at the end. Decided after a review by UI, UX,
frontend and security consultants.

## Context

M0 to M3 give a working bar, popup and four providers. M4 makes it quiet and finished: system
notifications, a connection alert, a legend, a bar tooltip, a "not tracked" section, an About page,
Restore defaults and a first-use assistant. ADR 0008 asked three things to be settled first: where
an alert is raised, what the connection alert means for a paused provider, and where the
notification text is reviewed.

## Decisions

### Language

The language is the one of the GNOME Shell session. The extension uses the shell's own gettext
(`Extension.gettext`), so it follows the session locale; a language without a catalog shows the
English msgids. There is no language setting, no language step in the assistant and no process-wide
`setlocale` or `LANGUAGE` change (that would translate the shell itself). ADR 0007 is rewritten
accordingly. Catalogs: English (the msgids) and pt-BR.

### Where alerts are raised

- `lib/core/alerts.js` is a pure reducer, with no `gi://` imports:
  `evaluate({previous, next, state, settings, now}) -> {events, state}`. Events carry no text:
  `{kind: 'threshold' | 'connection', providerId, metricId, level, params}`. The notifier turns
  events into translated text, so the wording is reviewed in one place.
- The controller reports changes, not only that something changed: `subscribeChanges(({previous,
  next}) => ...)`. It seeds its previous values from the cache, so the first poll after a shell
  restart is not taken for a crossing.
- Several providers answering together cause one UI update (changes are coalesced into one idle
  callback).

### Quota notifications

- Fire only when a metric crosses from below the threshold to at or above it. Default threshold 95%
  (the critical level); per quota type (session, weekly, monthly, credits) the user can turn it off
  or change it, as decided in the bar round.
- Dedupe by provider, metric and level. Re-arm when usage falls 3 points below the threshold
  (hysteresis) or when the reset time moves forward by more than five minutes (never key on the raw
  reset time: APIs wobble by seconds).
- A state that already existed when the extension started produces no notification; the bar and the
  popup show it.
- At most one quota notification per provider per poll, and three an hour in all (connection alerts
  are not counted: they are rare and must not be lost); the rest fold into one summary.
- A paused ("Stop tracking") or never connected provider produces no event, and its state is dropped.
- Urgency is normal for a warning and high for a critical; never the critical urgency, which would
  bypass Do Not Disturb. One action, "Open", opens the popup. No snooze, no repeats, no escalation.
- Nothing is announced until the providers are known (the controller is synced with the keyring):
  a cached value of a provider that is paused or was removed must not alert.
- The alert state (`provider`, `metric`, `level`, `resetsAt`) is kept in
  `~/.cache/gnome-ai-quota/alerts.json`, written like the snapshot cache (private folder, atomic
  replace), validated on load (size in bytes, key shapes, ranges; timestamps in the future are
  dropped). A corrupt or missing file means nothing was alerted yet. What was seen about a metric
  is forgotten after an hour (or three poll intervals), so a file from before a long pause cannot
  announce a state that already existed. The alert service re-evaluates every provider once a
  minute, because a rejected sign-in produces one snapshot and is never polled again.

### Connection alert

- Reasons that alert: `auth_required` because the sign-in expired, was rejected or refused, ten
  minutes after it was first seen, with one message ("Sign in again"); and a network error, rate
  limit, unreadable reply or stale data that lasts for three poll intervals and at least fifteen
  minutes. It is measured in time, not in polls: a rejected sign-in is not polled again, so counting
  failed polls would never reach two. A provider that was never set up (`no_key`, `no_config`) is not
  an outage.
- One notification per outage; re-armed only by a success. No "connected again" notice.
- Never for a locked keyring (it clears itself; the popup says so), a paused provider or one that
  was never connected.
- Suspend and resume: a `login1` `PrepareForSleep` handler (`lib/services/power.js`) opens a
  90-second grace window after waking in which the connection alert stays quiet, and the providers
  are asked again four to eight seconds after waking. Quota crossings are not suppressed: they are still true.

### Notification content and privacy

- Fixed, translated templates only: provider name, window, percent used and time to reset, in the
  same words as the pills and cards ("Critical", "Warning", "5 hours", "Week"). The summary of
  folded notices says "Several quotas need attention" (they can be warnings, not only criticals).
  A sign-in problem offers a "Reconnect" action that opens Preferences on that provider; the rest
  offer "Open", which opens the popup; neither does anything while the screen is locked. Never an account or
  user name, email, plan, error or HTTP text, path or token. Numbers are checked and clamped,
  enumerations looked up in a table, so nothing provider-controlled reaches the text.
- On the lock screen the banner is generic ("A quota is almost used") unless the user turns on
  `notify-details-on-lock` (off by default). How the Shell 50 handles it is not verified and gets a
  manual test with the screen locked.
- Every string that reaches a notification is stripped of control and bidirectional-override
  characters and length-capped (`alertText.js`), and notification markup is turned off, so what is
  left is shown as typed. The tooltip gets the same treatment when it is built.
- Notifications use a source of their own (`MessageTray.Source`), created lazily and destroyed in
  `disable()`. The shell hides what a `USER`-scope notification says while the screen is locked,
  so that is the scope used unless `notify-details-on-lock` is on (then `SYSTEM`); this replaces
  the idea of a generic text for the lock screen. A new notification replaces the old one of the
  same provider and kind instead of stacking.

### Bar, popup and prefs

- **Tooltip:** the existing one, same text as the item's accessible name plus the reset time, wrapped
  at 260 px, hidden while the screen is locked. It carries nothing the bar or popup do not.
- **Legend:** a collapsed row at the foot of the popup, opened by a "?" button. Its rows are built
  from the same view-model constants as the pills and glyphs, so it cannot drift.
- **Not tracked:** a collapsed section under the hidden list; each row is the muted icon, the name
  and a Resume button, with no meter. The "Add account" line becomes its last row.
- **About:** `Adw.AboutDialog` with the version from `metadata.json`, the licence and constant
  `https://` links opened with `Gio.AppInfo.launch_default_for_uri`. No paths or user name.
- **Restore defaults:** every schema key is classified as reset or kept, and a test fails for an
  unclassified key. It resets appearance, bar, popup, notification and threshold settings
  (the theme included, which the dialog says) and keeps accounts, tracking state, terms
  acknowledgements, `account-status` and the credentials revision. Confirmation is an
  `Adw.AlertDialog` that names what changes and says accounts stay connected; Cancel is the default.
  After the reset it syncs the settings. It does not start the assistant again.
- **First-use assistant:** an `Adw.NavigationView` inside Preferences, never a window opened by the
  shell, gated by `first-run-done`, skippable and resumable: welcome, choose providers (the terms
  notice before any sign-in), connect each one (a failure does not block the next), choose the bar,
  notifications (the default and the 5-hour window offered). The popup keeps its empty state with
  "Add account". It never reads other tools' credential files or the environment, never turns on a
  provider or notifications silently and sends no test notification unprompted.

### Structure

- The bar model in `indicator.js` (654 lines) moves to `lib/core/` and the indicator diffs each
  provider's view by a cheap key, so a snapshot that changes nothing redraws nothing.
- `structure.test.js` also checks that `alerts.js` imports no `gi://`, that `MessageTray` appears
  only in `lib/ui/` and that `Gio.DBus` appears only in `lib/services/`.

## Implementation order

Each chunk is followed by the UI, UX, frontend and security reviews.

1. `core/alerts.js` with tests, `alertStore`, `subscribeChanges` and cache seeding (done).
2. The notifier and its wiring and teardown; wording review (done).
3. `power.js`, resume handling and the connection alert (done).
4. Indicator extraction, view diff and coalescing.
5. Restore defaults and About.
6. Legend, "not tracked" and the tooltip audit.
7. First-use assistant.
8. Right-to-left prototype and a longer-text pseudo-locale pass.

## Open points

- Checked in a headless Shell 50.5: `MessageTray.Source({title, iconName})`,
  `Main.messageTray.add`, `Notification({source, title, body, gicon, urgency, privacyScope})`,
  `addAction` and `source.addNotification` exist as used, and notifications arrive with the urgency,
  scope and icon set. Not yet checked: that a `USER`-scope banner is really hidden on a locked
  screen (it needs a real lock), and how banners and Do Not Disturb behave. Both need a manual test.
- Whether "Disconnect all accounts and delete local data" is wanted as a separate action.
- Whether the pt-BR text needs a reader other than the owner.
