# 0005. Popup design and defaults

Status: accepted. The one-column popup, failure states, empty states and the settings below are
implemented, except what is marked planned.

## Context

The popup follows the visual language of the System Monitor extension: rounded
cards, an icon and a highlighted value in each title, thick bars, label and value
rows, and a footer with Refresh and Preferences.

## Decision

Defaults:

| Option | Default | Setting |
|---|---|---|
| Layout | one column of collapsible cards, 360 to 400 px | none |
| Cards in warning, critical or error | open on their own; a card the user opens or closes by hand keeps that choice until its state changes | `auto-open` |
| Relative reset | `resets in 1h 20min` (or `1h20`) | `reset-format` |
| Clock | follow GNOME (12 or 24 hours) | `clock-format` |
| Money providers | balance only | none |
| Providers on the bar | 3 | `bar-count` |
| "Hidden from the bar" section | shown only when something is hidden | none |

A two-column layout (440 to 520 px), a compact density and a "lasts until" estimate
for money balances are planned as options, not implemented.

### Structure

- **Order.** Providers on the bar first, in bar order, then "Hidden from the bar"
  (with a critical `!` pill in its header if any hidden provider is critical). Cards
  never jump by severity. A collapsed "Not tracked (N)" section lists the providers the
  user paused, each with a Resume button; it opens by itself when nothing else is on the popup.
- **Card.** Icon, name, plan, state pill, and a hero value (the highest percentage,
  or the money balance) with the window it belongs to (`97 % · week`). The whole
  header is the toggle button, so Enter and Space work on the focused header. Each
  window is a row: label, percentage, a thin bar with a **pacing tick** (a straight
  2 px line that protrudes 3 px above and below the bar) and the reset in two forms,
  relative and absolute. Providers with pools get a sub-heading per pool. A single
  pacing line shows only when the deviation is relevant.
- **Actions.** *Try again* lives in the card body of a provider that can recover by
  retrying. A button named for the state (Connect, Reconnect, Replace key) opens Preferences on
  that account, and resuming a paused provider is the Resume button of "Not tracked". Planned and not
  built: a `⋯` menu with Refresh this one, Do not track and Remove connector (confirmed inline, no modal).
- **Footer.** "Updated N min ago", with the number of providers in trouble next to
  it, then a "?" toggle that opens the legend of the marks on the bar, Refresh and Preferences (the status has
  a line of its own). The popup is at most 70% of the monitor height;
  only the body scrolls and the footer stays fixed.
- **Keyboard.** Tab and arrows move between headers and buttons, Enter expands and
  Esc closes. Color is never the only channel: glyphs, pills, italics and borders
  carry the same information.

### Failure states

Each snapshot state has its own pill, message and retry line, never a generic
"connection problem": *No connection*, *Rate limited*, *Unexpected reply*, *Service
changed* and *Signed out*.

- A failing provider keeps its last value, marked `~` in italic and muted, with
  neutral meters, an orange border and the age of the value in the message. The
  retry line says when the next attempt happens.
- A provider that can recover by retrying gets a **Try again** button. A
  rate-limited one does not. A signed-out one has an inert header and no value.
- The summary line tells signed-out providers apart from failing ones.
- A card that needs a credential says why (no key, key rejected, sign-in expired, access
  refused, setup needed, keyring locked) and has a button named for the state that opens
  the Accounts page on that provider. With nothing connected, the popup has an empty state
  and an Add account button; a provider that was never connected has no card.

## Consequences

- One non-reactive `PopupBaseMenuItem` (`reactive: false`, `can_focus: false`) holds
  the whole UI, so inner buttons do not close the menu.
- The scroll area is an `St.ScrollView` whose `max-height` is computed in JavaScript
  each time the menu opens.
- The meter is an `St.Widget` with a fill and a tick placed from its allocation. The
  tooltip is an `St.Label` in `uiGroup`.
- A refresh updates text, width and CSS class per card from a
  `Map<providerId, CardView>`. It never rebuilds an open menu.
