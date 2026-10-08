# Native allocation consultation — 2026-10-08

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Read-only product review of `feat/post-mvp-effects`, starting at HEAD `800465f`
with the current uncommitted changes. No native sessions, scanners, font installs,
credentials or product changes were performed by this consultant.

## Proven failure boundary

1. **P1: foreground allocation becomes invalid before currency updates.**
   `/tmp/gaq-reading-gdb-native.log:5120` records the first shadow critical;
   its stack enters `st_label_paint_node`, and the actor at line 5147 is
   `ClutterText` containing `On the bar`. Its StLabel, content, scroll view,
   popup, foreground frame, effects stack and menu item ancestors all report
   `has_allocation == false`. The currency update cannot explain this first
   failure. The enabling CSS path is
   `lib/core/theme.template.css:543`, which adds the heading text shadow.
   Removing that shadow alone would hide one failing consumer, rather than
   establish why native layout is invalid.

2. **P1: valid source geometry and allocated decoration siblings do not imply
   a valid foreground.** `/tmp/gaq-reading-geometry-native.log:467` reports a
   valid indicator and fixed anchor, a cached finite BoxPointer rectangle with
   `has_allocation == false`, valid background/decoration allocations and an
   invalid foreground frame. The installed GNOME Shell 50 BoxPointer source
   was read directly using `gresource extract /usr/lib64/gnome-shell/libshell-18.so
   /org/gnome/shell/ui/boxpointer.js`: `setPosition` queues relayout; allocation
   repositions, calls `set_allocation`, then allocates border and content bin.
   There is no evidence that a missing or zero-sized source is the current cause.
   The similarly named `/tmp/gaq-boxpointer-source.js` contains only
   `[object GIRepositoryNamespace]` and is not source evidence.

3. **P1: allocation is invalidated after a native allocation pass.**
   `/tmp/gaq-reading-events-native.log:385` records heading text/label allocation
   with their own flags valid. At line 388 onward the entire foreground is
   invalid again, and line 582 records the shadow critical, with no intervening
   heading/menu STYLE event. This narrows investigation toward layout setters
   and callbacks after or during allocation; it does not prove which setter.

## Ranked remaining causal experiments

1. **Allocation-notify effects mutation (supported by isolated native control).**
   `lib/ui/themeEffects.js:69` synchronously invokes `_layout()` from both
   decorative siblings' allocation notifications. `_layout()` queries child
   requests and can call `set_size` at line 202. Background is the first
   BinLayout sibling, foreground the third (`themeEffects.js:38`). A child
   request change during this traversal may invalidate the ancestor request
   after some children have been allocated. Distinct experiment: disconnect
   only the two allocation-notify handlers before the final Glass switch,
   retain destroy handlers, all actors, styles, shadows and redirects, and run
   `_layout` once from HIGH_IDLE outside native allocation. A positive result
   supports moving decorative request mutation outside allocation callbacks;
   a negative result rejects this boundary as sufficient cause. The renderer
   reported this isolated control passing all 12 literal cases with zero native
   criticals. The promoted implementation coalesces allocation-triggered layout
   in HIGH_IDLE, guards generation/lifecycle and includes the pending source in
   inspection totals. Fresh product-source native execution subsequently passed
   all 12 literal cases (`/tmp/gaq-reading-deferred-source.log`), strict 100-cycle
   lifecycle (`/tmp/gaq-reading-deferred-100.log`, destroyed sources and pending
   layout sources both zero), and six effects cases plus 100 numeric-label
   destructions (`/tmp/gaq-reading-deferred-quick.log`). This consultant read
   those result records and independently searched all three corresponding
   `-native.log` files: no `CRITICAL`, `JS ERROR` or `already disposed` matched.
   Existing Clutter allocation warnings remain, primarily in MeterBar/Card
   branches; the evidence closes these native criticals, not every warning.

2. **Meter allocation-notify mutation (inference, separate experiment).**
   `lib/ui/meter.js:30` synchronously invokes `_layoutChildren` on allocation.
   Lines 71–76 compare allocated `.width/.height/.x/.y` against requested
   geometry, then call `set_position` and `set_size`. The effects layout
   specifically avoids comparing rounded allocations against fractional
   requests (`themeEffects.js:197`); meters do not. Original eight-case logs
   repeatedly show invalid MeterBar/Card branches. Distinct experiment after
   restoring the preceding control: monkeypatch
   `MeterBar.prototype._layoutChildren` to no-op only after the original eight
   cases, preserve already rendered meter geometry, then repeat the Glass
   transition. Instrument parent allocation dimensions and child preferred
   requests before attributing a positive result to rounding. This is not a
   recommendation to ship frozen meters. The renderer's separate no-op control
   showed no native critical through Glass but stopped on the first suffix
   bounds guard. That incomplete result does not establish a second cause.
   No meter product change was promoted.

3. **Lifecycle phase discrimination (secondary inference).**
   `indicator.js:273` applies/rebuilds effects before `setOpen`; when transitioning
   from closed to open, `setOpen` rebuilds again. The active style class is
   added afterward at line 288. Any request measurement before that final class
   mutation can become stale. Whole-menu style/preferred-query controls have
   already failed, so simply repeating those controls has no diagnostic value.
   If both notify controls fail, trace the first setter that changes the
   foreground from valid to invalid, including pending tabular attribute jobs,
   meter setters, scroll style assignment and effect rebuild mutations.

## UI consistency observations

Every provider reading now occupies its own row while remaining inside the same
header button (`providerCard.js:155` onward). The suffix, identity and plan pill
wrap. Independent large-money LTR/RTL image review first found complete currency
but a vertically clipped quota reading. Root reproduced that failure with native
Pango height assertions, applied the separate rows to quota headers too and
obtained all 12 GREEN cases in `reading-height-green.log`. Refreshed captures
show complete visible readings and wrapped suffixes; the layout matrix passes
264 cases. These observations distinguish visible inspected cards from cards
outside the refreshed capture's scrolled viewport.

Card shadow gutters derive top/right/bottom/left independently from the theme
offset, blur and spread (`lib/core/theme.js:201`) and remain bounded at 64 px.
This preserves the theme token and allocates scroll-interior paint space.
The already failed no-gutter control rules out this new spacing as a sufficient
explanation for the current whole-foreground failure.

## Limits

The isolated effects control result above was supplied by the renderer; this
consultant did not execute native tests. Renderer owns all private native
execution and the product fix. Existing failed controls include tabular-number
removal, gutter removal, offscreen-cache changes, ancestor/subtree style and
preferred-request queries, stage/layout queuing and finite cached menu
allocation; none is being proposed again without a new discriminating variable.

Root corrected the card-shadow fixture's viewport guard before accepting its
paired native captures. Independent review of both original light/dark images
and the recorded same-geometry pixel results confirms all four lateral strips
positive: light 20.468/20.709 and dark 13.061/13.694. This establishes the recorded
Glassmorphism configuration and viewport, without certifying every scale/theme.
