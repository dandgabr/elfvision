# 0010. Alerts and polish (M4)

Status: accepted. Implemented, except the first-use assistant and the right-to-left and longer-text
pass (see "Pending" at the end). Decided after a review by UI, UX, frontend and security
consultants, and every part was reviewed again when it was built.

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
- Coalescing the updates of several providers that answer together into one redraw was planned and
  is not done; what was done instead is that a bar item or a card whose view did not change is
  not redrawn (see "Pending").

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
  bypass Do Not Disturb. One action: "Open" opens the popup, and a sign-in problem offers "Reconnect"
  instead, which opens Preferences on that provider. No snooze, no repeats, no escalation.
- Nothing is announced until the providers are known (the controller is synced with the keyring):
  a cached value of a provider that is paused or was removed must not alert.
- The alert state (`provider`, `metric`, `level`, `resetsAt`) is kept in
  `~/.cache/gnome-ai-quota/alerts.json`, written like the snapshot cache (private folder, atomic
  replace), validated on load (size in bytes, key shapes, ranges; timestamps in the future are
  dropped). A corrupt or missing file means nothing was alerted yet. What was seen about a metric
  is forgotten after 24 hours (or three poll intervals), so a file from before a long pause cannot
  announce a state that already existed; a shorter pause (a lock, a night) still catches a crossing. The alert service re-evaluates every provider once a
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
- The extension declares no `unlock-dialog` session mode, so the shell switches it off while the
  screen is locked (checked in a Shell 50.5: `disable()` runs on lock and the notifier is gone).
  Nothing of the extension can therefore be on a lock screen: its notification source is destroyed
  with it and no alert is raised while locked. There is no lock-screen setting. The notifications
  still use the `USER` privacy scope, which the shell hides on a locked screen, as a second layer.
  The cost: a notification that was not read when the screen locked is gone after unlocking
  (the bar and popup still show the state), and a quota that crossed its threshold during the lock
  is announced on the first look after unlocking, because what was last seen is remembered for 24
  hours.
- Every string that reaches a notification is stripped of control and bidirectional-override
  characters and length-capped (`alertText.js`), and notification markup is turned off, so what is
  left is shown as typed. The tooltip gets the same cleaning (`lib/core/text.js`, shared with the
  notifications) when it is shown.
- Notifications use a source of their own (`MessageTray.Source`), created lazily and destroyed in
  `disable()`. A new notification replaces the old one of the same provider and kind instead of
  stacking. With Do Not Disturb on, banners are held and the notifications wait in the list.

### Bar, popup and prefs

- **Tooltip:** the existing one, now on each item of the bar, written for the eye ("Codex · 5 hours ·
  82% used (warning)") with the countdown made when it is shown, wrapped at 260 px. It carries nothing the bar or popup do not (no plan, no account), and
  the click still reaches the button. (The extension is off while the screen is locked.)
- **Legend:** hidden until a "?" button in the footer (a toggle with a tooltip) opens it at the end of
  the popup and scrolls it into view. Its rows are
  built from the same table of marks (`SYMBOLS`) as the bar and the pills, so it cannot drift, and a
  test checks that every mark a bar item can show is in it.
- **Not tracked:** a collapsed section under the hidden list, "Not tracked (N)"; each row is the
  muted icon, the name and a Resume button, with no meter (resume writes the `untracked-providers`
  setting, which the extension already follows). The "Add account" line stays separate and quiet below
  it: it means "never connected", which is not the same as paused. The section opens by itself when
  nothing else is on the popup, until the user opens or closes it by hand.
- **About:** `Adw.AboutDialog` with the version from `metadata.json`, the licence, constant
  `https://` links and an own application icon in `icons/hicolor`. No paths or user name.
- **Restore defaults:** every schema key is classified as reset or kept, and a test fails for an
  unclassified key. It resets appearance, bar, popup, notification and threshold settings, the theme
  and the data source (someone stuck in demo data would take a restore that leaves it for a bug), and
  keeps accounts, tracking state, terms acknowledgements, `account-status`, the credentials revision,
  the demo scenario and the messages between the two processes. The dialog says "your accounts are
  not changed" (not "stay connected": a rejected account stays rejected) and names what changes;
  Cancel is the default. The reset is one batch (`delay` and `apply`), so the shell reacts once, and a
  toast confirms it. It does not start the assistant again.
- **Notifications page:** the master switch (it also silences the connection alert), a test button
  (the preferences window raises the `test-notification` number and the shell shows one notification;
  the assistant never sends one on its own), and for each kind of quota a switch and a threshold
  shown in the row ("Notifies at 95% used" or "Off"). With the master switch off the rows are dimmed,
  not blocked.
- **First-use assistant:** an `Adw.NavigationView` inside Preferences, never a window opened by the
  shell, gated by `first-run-done`, skippable and resumable: welcome, choose providers (the terms
  notice before any sign-in), connect each one (a failure does not block the next), choose the bar,
  notifications (the default and the 5-hour window offered). The popup keeps its empty state with
  "Add account". It never reads other tools' credential files or the environment, never turns on a
  provider or notifications silently and sends no test notification unprompted.

### Structure and checks

- A bar item or a card whose view did not change is not redrawn, and one whose draw failed is drawn
  again. The indicator's own logic (654 lines) stays in `lib/ui` for now.
- `structure.test.js` also checks that `alerts.js` imports no `gi://`, that `MessageTray` appears
  only in `lib/ui/` and that `Gio.DBus` appears only in `lib/services/`.

## How it was built

Each part was reviewed (UI, UX, frontend, security, QA as it applied) before it was merged.

1. The alert reducer, its stored state and the controller's change reports (PR 8).
2. The notifier and its wiring, with the settings in the schema and the pt-BR texts (PR 8).
3. Suspend and resume, and the connection alert (PR 8).
4. The Notifications page, Restore defaults and About (PR 9).
5. The legend, the bar tooltip and the "not tracked" list (PR 10).

Checks added on the way, because the unit tests cannot import the interface modules:
`tools/check.sh` builds first, checks the syntax of every JavaScript module and enables the
extension in a headless shell and reads its state (it fails on a name declared twice or not defined).
The verification that notifications work was done in a Shell 50.5: `MessageTray.Source`, `Notification`,
`addAction` and `source.addNotification` behave as used, and with Do Not Disturb on neither a normal nor
a high-urgency notification shows a banner while both stay in the list.

## Pending

Work that was decided here and is not done:

- **First-use assistant** (above). It needs a design pass of its own with the UI and UX consultants
  when it is built.
- **Right-to-left and longer text:** mirror the layout in St (`:rtl`), the chevrons are already chosen
  by direction; and a script that inflates every string by about 40% to find overflow
  (ADR 0007).
- **Indicator:** move its bar model to `lib/core` and coalesce the redraws of providers that answer
  together.
- **Bar items on the keyboard:** the tooltip on the bar shows on hover only; Escape closes the popup
  before the legend.
- **ESLint** (`no-undef` and the like) in CI: today the shell step of `tools/check.sh` covers it
  locally, and CI does not run the shell.

Known limits and open questions:

- The extension is off while the screen is locked (no `unlock-dialog` mode): no alert is raised
  then, and a notification that was not read before locking is gone after unlocking.
- Whether "Disconnect all accounts and delete local data" is wanted as a separate action.
- Whether the pt-BR text needs a reader other than the owner.
- A warning and a critical level share one threshold per kind of quota; the text says which level was
  reached, but a second threshold is not offered.
