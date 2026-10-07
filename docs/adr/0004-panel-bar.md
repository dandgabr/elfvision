# 0004. Top-bar design (variation A)

Status: accepted

## Context

Three bar variations were compared in an interactive mockup: A (a 3 px mini bar
under the number), B (number plus glyph, no bar) and C (a ring in place of the icon).
Advice came from UI, UX, motion and frontend reviews.

## Decision

**Variation A.** Per provider, the item shows: a monochrome 16 px icon, the number
(14 px, weight 700, tabular), a subordinate `%` (11 px, 70% opacity), a window
suffix (`·5h`, `·S`, `·M`) and a 3 px bar under the item (track at 20% opacity).

- **Number shown:** the highest percentage among the provider's windows.
- **State without relying on color:**
  - warning (80% and above): weight 800 and a `▲` glyph;
  - critical (95% and above): a pill with a border and a trailing `!`;
  - stale: `~` prefix, italic, 60% opacity, no fill;
  - not signed in: `–` with a key glyph, icon at 50%;
  - network error: last value dimmed with a `⚠` glyph.
- **Count:** 1 to 5 providers, user configurable (default 3).
- **Selection:** automatic (the N worst) or manual. Automatic ranks by severity
  (critical, warning, error or not signed in, stale, normal; ties by the highest
  percentage) but draws the selected items in the **fixed provider order** so the
  bar does not jump.
- **Failures compete as "warning".** Real critical and warning states still win
  slots over failures.
- **Providers with several metrics** (for example Antigravity with a Gemini pool
  and a Claude/GPT pool, each with 5-hour and weekly windows): the bar shows the
  most critical metric. The suffix names the window and the pool (`·G S`,
  `·C/G 5h`, about 18 px wider for that item only). The tooltip lists every metric
  and highlights the displayed one.
- **Money providers:** the number is the remaining balance (`$12.40`, `$124`,
  `$1.2k`), the bar is the share of the budget spent. In headline mode, money is
  shown only when it is the worst case; a configured dollar floor counts as
  "warning" when choosing the worst.
- **Degradation:** full, then compact (no `%`), then headline with `+N`. Budget
  about 260 px. Never truncate a number with an ellipsis. Fixed item width
  (tabular digits) so the bar does not shake.
- **Notifications:** default threshold 95% (once per window, with 3 point
  hysteresis), configurable per quota kind (session, weekly, monthly, credits;
  any subset), with an optional dollar floor for credits. A separate **connection
  alert** covers not signed in, persistent errors and long-stale data.
- **Motion:** one 300 ms tween on the bar, a 150 ms cross-fade on the number, one
  pulse when crossing 80% (two at 95%), nothing looping, no timers at rest, and all
  durations zero when GNOME animations are off.

## Consequences

- One `PanelMenu.Button` holding a `St.BoxLayout` of items (one menu, one focus
  stop, one aggregated accessible name).
- The mini bar is an `St.Widget` with a filled child; `St.DrawingArea` is only
  needed for rings (not used).
- States are CSS classes (`St` has no `var()`); the panel theme already applies
  tabular numbers.
- Items wider than the available space are clipped by the panel, hence the
  compact and headline modes.
