# Native theme-change allocation regression

The expanded 12-case layout gate reproduced a real native paint failure after switching from the large-font RTL scenario to Glass. Initial eight cases passed, then `StLabel` shadow painting and Cogl reported invalid allocation/zero viewport. GDB identified the nonnumeric “On the bar” heading and invalid foreground ancestors; finite cached boxes did not establish valid allocation.

## Cause and fix

`ThemeEffects` resized decoration children synchronously from background/decorative `notify::allocation`. Native BinLayout was still allocating siblings. Those child request changes invalidated the foreground inside the native allocation/paint pass.

The isolated control removed only those two allocation handlers, retained the styles, materials, redirects, currency layout and destruction handlers, and resized from an idle outside allocation. All 12 cases then passed without native criticals. The promoted fix in `lib/ui/themeEffects.js` queues a single HIGH_IDLE layout job. It captures the generation, cancels pending work before clear/close/destroy, and includes pending layout work in `inspect().sources` and `pendingLayoutSources`. Foreground measurement remains native and adaptive. No meter, money layout, shadow style, cache policy or radius change was promoted in this round.

Other isolated controls did not resolve the failure: suppressing tabular-feature writes, removing only the new card gutter, synchronous whole-menu/ancestor style resolution, cached whole-menu allocation, forcing stage relayout, and disabling menu/foreground redirects. The cache diagnostic collected bounds failures while continuing; its verifier remained RED, and its native log contained 45 criticals. A meter no-op control stopped earlier on a bounds failure, so it does not establish an independent meter fix.

## Verification on the promoted source

All runs used private demo-only Shell sessions and bounded `timeout --kill-after=5s`; no host configuration or credentials were read.

| Gate | Result | Evidence |
| --- | --- | --- |
| Expanded layout | All 12 cases passed, including Glass/Aurora dark LTR/RTL full large currency | `gaq-reading-deferred-source.log` |
| Lifecycle | 100 real alternating popup cycles; strict allocation guards; zero resources and pending layout sources after disable | `gaq-reading-deferred-100.log` |
| Native effects | All six cases passed, including optical cached painting, readable headings, material/trust and lifecycle | `gaq-reading-deferred-quick.log` |
| Numeric text | Exact Sans/Monospace digit and time widths; foreground retained across changes; 100 pending-label destroys | `gaq-reading-deferred-quick.log` |

Each helper exited 0. Each corresponding full native log had zero `CRITICAL`, `JS ERROR` or disposed-object diagnostics. Some pre-existing allocation warnings remain recorded; these are not described as a warning-free run. The matching output and native logs are archived under [assets/open-items/native-theme-layout](assets/open-items/native-theme-layout).

Commands used the current canonical probes:

```sh
env DATA_SOURCE=demo GAQ_TEST_MONITOR=800x900 LOG=/tmp/gaq-reading-deferred-source-native.log timeout --kill-after=5s 80s tools/headless-shell.sh .superpowers/sdd/2026-10-07-open-items/layout-controls/layout-reading-diagnostic-probe.js sleep:20 tools/layout-verify.js
env DATA_SOURCE=demo LOG=/tmp/gaq-reading-deferred-100-native.log timeout --kill-after=5s 85s tools/headless-shell.sh tools/effects-lifecycle-probe.js sleep:35 tools/effects-lifecycle-verify.js
env DATA_SOURCE=demo LOG=/tmp/gaq-reading-deferred-quick-native.log timeout --kill-after=5s 65s tools/headless-shell.sh tools/effects-probe.js sleep:6 tools/effects-verify.js tools/numeric-text-probe.js sleep:1 tools/numeric-text-verify.js
```

Diagnostic variants are preserved in `.superpowers/sdd/2026-10-07-open-items/layout-controls`, rather than shipping many copied diagnostic tools.

## Remaining acceptance

The independent card-shadow screenshot probe stopped before capture with “Lateral shadow samples must stay inside the scroll viewport”. Its native log was clean, but lateral shadow pixels have **not** passed that gate. Root owns that probe and its follow-up. The renderer lock was released after the verification above. Final native queue, fresh performance measurements and release checks remain root integration work; historical performance numbers do not verify this source revision.
