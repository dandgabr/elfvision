# 0005. Popup design and defaults

Status: accepted

## Context

The popup follows the visual language of the *System Monitor* extension (dark rounded
cards, an icon and a highlighted value in each title, thick bars, label and value
rows, a footer with Refresh and Preferences). Layout, density, content and
formatting were compared in an interactive mockup.

## Decision

Defaults (every one of them is changeable in Preferences, Appearance):

| Option | Default | Alternative |
|---|---|---|
| Layout | one column, collapsible cards (360 to 400 px) | two columns (440 to 520 px) |
| Density | comfortable (hero 22 px, card padding 14 by 16) | compact (hero 18 px, padding 10 by 12) |
| Warning and critical cards | open on their own; the user's "closed" holds until the state changes | always respect the user's choice |
| Relative reset | `resets in 1h 20min` | `1h20` |
| Clock | 24-hour | 12-hour |
| Money providers | balance only | balance plus an estimated "lasts until" |
| Providers on the bar | 3 (1 to 5) | |
| "Hidden from the bar" section | only shown when something is hidden | |

Structure:

- Order: providers on the bar first (in bar order), then **Hidden from the bar**
  (with a critical `!` pill in the header if any is critical), then **Not tracked**
  (a grey line with a Track button). Cards never jump by severity.
- Card: icon, name, plan, state pill, hero value (highest percentage, or the money
  balance) and a `⋯` menu. One row per window: label, percentage, a thin bar with a
  **pacing tick** (a straight 2 px line that protrudes 3 px above and below the bar),
  and the reset in two forms (relative, absolute). Pool sub-headings for providers
  with pools. A single pacing line is shown only when the deviation is relevant.
- Recovery actions live in the card body: **Connect**, **Try again**, **Track**.
  Secondary and destructive actions live in `⋯`: Refresh this one, Do not track,
  Remove connector (confirmed inline, no modal).
- Stale and error states keep the last known value with its age visible.
- Footer: "Updated N min ago", Refresh, Preferences. Maximum height is 70% of the
  monitor with the scroll in the body only and the footer fixed.
- Keyboard: Tab and arrows move between headers and buttons, Enter expands, Esc
  closes. Color is never the only channel (glyphs, pills, italics, dashed borders).

## Consequences

- Implementation: one non-reactive `PopupBaseMenuItem` (`reactive: false`,
  `can_focus: false`) holding the whole UI so inner buttons do not close the menu;
  `Clutter.GridLayout` for columns; `St.ScrollView` with a JS-computed `max-height`;
  the bar is an `St.Widget` with a fill and a tick; the tooltip is an `St.Label` in
  `uiGroup`; refresh updates text, width and CSS class per card from a
  `Map<providerId, CardView>`, never rebuilding the open menu.
- To validate in a prototype: `max-height` of the `ScrollView` inside the popup,
  right-to-left mirroring, and tabular numbers in CSS versus Pango.
