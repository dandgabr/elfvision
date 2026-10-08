# 0004. Top-bar design

Status: accepted. The bar, its states, selection and adaptive layout are
implemented, except motion (see "Not implemented").

## Context

The bar competes for space with other extensions and must be readable at a glance.
Three variations were drawn in an interactive mockup: a 3 px mini bar under the
number, a number with a glyph and no bar, and a ring in place of the icon. The first
won: it shows level and number at once and needs no custom drawing.

## Decision

Per connector the item shows a monochrome 16 px icon, the number (14 px, weight 700,
tabular), a subordinate `%` (11 px, 70% opacity), a window suffix (`5h`, `W`, `M`;
`W` reads `S` in Portuguese) and a 3 px bar under the item (track at 20% opacity).

- **Number shown:** the highest percentage among the provider's windows.
- **State without relying on color:**
  - warning (80% and above): weight 800 and a `▲` glyph;
  - critical (95% and above): a pill with a border and a trailing `!`;
  - stale: `~` prefix, italic, 60% opacity, the last fill kept;
  - not signed in: `–` with a password icon, provider icon at 50%;
  - failing (network, rate limit, bad reply): the last value with a `~` prefix and a
    warning icon.
- **Count:** 1 to 5 connector items, setting `bar-count`, default 3. Separate
  accounts using the same provider occupy separate slots and retain independent quotas.
- **Selection:** automatic (the N worst connectors) or manual. `lib/core/selection.js` supports
  both, but no setting exposes manual selection yet. Automatic ranks by severity
  (critical, warning, error or not signed in, stale, normal; ties by the highest
  percentage) but draws the selected items in the fixed provider order, so the bar
  does not jump. Failures compete as "warning": real critical and warning states
  still win slots over failures.
- **Providers with several metrics** (Antigravity has a Gemini pool and a
  Claude/GPT pool, each with 5-hour and weekly windows): the bar shows the most
  critical metric. The suffix names the window and the pool (`G S`, `C/G 5h` in
  Portuguese; `G W` in English, the window letter being translated), about 18 px wider
  for that item. The accessible name and the popup card name the pool in full. The
  tooltip of each item (ADR 0010) shows the displayed metric and when it resets; a tooltip that
  lists every metric is not implemented.
- **Money providers:** the number is the remaining balance (`$12.40`, `$124`,
  `$1.2K`) and the bar is the share of the budget spent. In headline mode, money
  shows only when it is the worst case.
- **Adaptive layout.** The bar measures the room the panel leaves it and picks the
  richest layout that fits the measured space. Candidates, in order:
  full; compact with N providers; compact with N-1 down to 2; headline (the worst
  provider plus `+N`); one compact provider. The room is the side width the shell
  allocates, `(panel width - center natural width + work area offset) / 2`, minus
  what the other items of the same panel box need. It is re-evaluated, debounced,
  when children are added or removed in a panel box, when an allocation changes and
  when monitors change. A number is never truncated with an ellipsis, and item
  widths are fixed (tabular digits) so the bar does not shake. The popup lists as
  "Hidden from the bar" whatever the bar does not show.
- **Steady layout.** A neighbor that changes width every second, such as a system
  monitor, would make the layout flip and the popup shake. The layout in use is
  therefore sticky: it is kept while it fits, and a richer one is adopted only with
  32 px to spare. Widths from the last full pass are reused when only the panel
  changes. The bar does not re-fit while the popup is open; the pending fit runs on
  close. While open, the popup is anchored to an invisible copy of the button's box,
  so it stays put when neighbors resize.
- **Settings:** `position` (`left`, `center`, `right`; default right), `bar-count`
  and `compact-mode` (`auto`, `always`, `never`). `never` keeps the `%` and the
  suffix and only drops providers. The button goes after the Activities button in
  the left box and first in the right box.

Notifications and the connection alert are decided in [ADR 0010](0010-alerts-and-polish.md).

Not implemented:

- **A dollar floor** for credits that would count as a warning in the choice of the worst item.
- **Motion.** One 300 ms tween on the bar, a 150 ms cross-fade on the number, one
  pulse when crossing 80% (two at 95%), nothing looping, no timers at rest, and all
  durations zero when GNOME animations are off.

## Consequences

- One `PanelMenu.Button` holds a `St.BoxLayout` of items: one menu, one focus stop,
  one aggregated accessible name.
- The mini bar is an `St.Widget` with a filled child. No `St.DrawingArea` is needed.
- States are CSS classes, because St has no `var()`.
- Items wider than the available space are clipped by the panel, hence the compact
  and headline layouts.
