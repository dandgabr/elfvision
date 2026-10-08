# Accessibility and fractional-monitor verification — 2026-10-07

Independent private-session evidence uses demo providers, memory preferences and synthetic wallpaper/windows. No real credentials or host monitor/settings changes were used. Renderer was released after the sequential runs. No long benchmark was duplicated.

## Fractional monitor and backdrop regression — fixed

Two virtual monitors were configured with private `org.gnome.Mutter.DisplayConfig.ApplyMonitorsConfig`: logical rectangles `[0,0,1024,640]` and `[1024,0,1280,720]`, scale 1.25, second monitor primary. Screenshots are 2880×900 for a 2304×720 logical stage. Cases cover light/LTR normal, light/RTL enlarged, dark/LTR enlarged and dark/RTL normal, each with translucent/frost material switching and actual stage keyboard focus retention.

RED: actual inline font inflation (the same technique used by the existing layout probe) increased Pango glyph height 61→91px. Enlarged background actors then reported a 2×2 transformed viewport, although their cached allocation box remained 404×503. Foreground controls remained visible. Ancestor diagnostics reproduced this with menu open, actors mapped and all ancestor scales equal to one; EffectsStack and popup ancestors retained full width. The exposed backdrop gutter lost blur. This was a background request/allocation invalidation defect, not entire-popup disappearance.

Correction in `lib/ui/themeEffects.js`: the overlay uses native `Clutter.BinLayout`, which measures all child requests and retains native allocation bookkeeping. The backdrop's 2px request and decoration's zero request do not dominate the foreground; all three receive the same viewport. Policy rebuilds repair invalidated background/decoration allocations using their finite positive cached viewport. Foreground dimensions are never pinned. Optical child sizing compares preferred requests with a 1/64px tolerance, avoiding an allocation-notify feedback loop. Blur radius, foreground caching and animation cadence remain unchanged.

A background-only size workaround and a custom LayoutManager were exploratory revisions, superseded by native BinLayout. The stronger 100-cycle guard also exposed foreground allocation invalidation; it accepts neither a 2px transformed surface nor a positive cached box with invalid native allocation. Earlier failures remain RED evidence.

GREEN: four cases retain 404×495 normal or 404×503 enlarged backdrops, finite matching sibling allocation and actual focus. The native quick probe also passes decoration zero preferred size, foreground-only parent measurement, optical cached paint, material/trust, lifecycle and numeric text assertions. Image controls show genuine background edge suppression in exposed gutters:

| Case | Translucent edge | Frost edge | Outside difference |
| --- | ---: | ---: | ---: |
| Light LTR normal | 0.74887 | 0.03943 | 0 |
| Light RTL enlarged | 0.74883 | 0.03869 | 0 |
| Dark LTR enlarged | 3.04562 | 0.02241 | 0 |
| Dark RTL normal | 3.04573 | 0.01954 | 0 |

The strengthened verifier rejects a collapsed transformed viewport rather than accepting only a stale positive local box. The image analyzer rejected the preserved RED capture (`-0.0 -> -0.0`).

## Foreground cache evidence

Actual rendered font layout increases 61→91px and enlarged text remains visible. A synthetic, visible quota label changed **97→73** with frost active and foreground caching unchanged. Its screenshot glyph region changed by mean RGB **27.8098**, proving the cached foreground repaints descendant text changes. This test mutates the demo actor directly; it does not independently exercise provider transport. Existing Task 1 tests separately cover controller responses. Source review confirms BACKGROUND blur attaches only to the background actor; controls retain their own cache and receive no blur.

## Cold native paint and numeric text — fixed

The exact no-await first-open/alternating-theme sequence reproduced native Cogl zero-viewport errors even while cached geometry looked positive. Fatal-critical GDB runs in the private Shell captured both `_st_create_shadow_pipeline_from_actor` from `st_label_paint_node` with invalid text allocation and `clutter_offscreen_effect_pre_paint` beneath nested St viewports. No host or user Shell was attached.

A meaningful probe-only control skipped 17,856 synchronous `tnum=1` attribute writes and completed 100 strict geometry/resource cycles with zero native CRITICALs. An initial fix deferred style/text callbacks but left the construction write synchronous; it completed the geometry assertions yet retained 68 initial Cogl CRITICALs. Deferring that initial write too produced a fresh clean 100-cycle run. Exploratory foreground-cache and opacity controls did not consistently resolve the native failure and were removed.

`numericText.js` now coalesces every feature application in one HIGH_IDLE source, checks the actual Pango font-feature attribute before writing, preserves foreground/other attributes, and cancels pending work on label destruction. The standalone native regression proves first mapping, 100 coalesced text edits, style foreground preservation and cancellation for 100 destroyed labels. The existing numeric probe confirms one feature after style/remapping and exact Sans widths 72/72 and 81/81, Monospace widths 76/76 and 95/95. Original frost foreground caching remains enabled; the matrix's visible 97→73 screenshot change confirms it still repaints values.

Final strict lifecycle log: `gaq-numeric-all-idle-100.log`, native counterpart: `gaq-numeric-all-idle-100-native.log`; runner exit 0, cycles 100, disable resources zero, no CRITICAL in either log. Earlier successful matrix/quick assertions encountered a private document-portal cleanup directory error in the helper. After the helper owner fixed cleanup, a fresh quick/numeric run exited 0 with no native CRITICAL.

## Popup closing transition — fixed

`indicator.js` stops decorative work immediately when closing, but retains the fixed anchor, popup surface class and offscreen redirect policy until the menu actor actually becomes hidden. The hidden notification then releases the anchor and restores the closed rendering policy. Cleanup also releases it unconditionally.

Actual virtual pointer input passed four native scenarios: Bento and frost, each closed by an outside click and by clicking the date menu. Every visible fade sample retained a finite positive viewport and horizontal center 1001px, stable anchor and rendering policy; resources stopped immediately and the anchor was released after hiding. Shell's normal scale animation changes the left edge while preserving the center. The date-menu test records two clicks when its modal grab consumes the first outside click; it verifies the other popup opens after that second real input. Warm close-test preparation waits for a mapped, allocated panel source before clicking; the no-await cold regression remains separate and unchanged.

`gaq-close-allocated-final.log` and its native counterpart both have no CRITICAL; runner exit 0. A probe-only immediate-anchor-release mutation was rejected, but before the actual closing scenario's assertions (the popup was already hidden with no anchor). This is not presented as a proven kill of the fade-specific guard; its failed output is retained for independent follow-up. No further renderer sessions were started after the explicit handoff to root.

## Accessibility — partial evidence, open manual acceptance

Actual virtual Shell Space opened the legend; first Escape hid it while retaining the popup, second Escape closed it. The first Accounts-page GTK diagnostic traversed ten named targets using real virtual Tab, with active-window/key-count evidence archived separately.

The final General-page diagnostic exposes actual accessible Effects/Material combo boxes, Transparency switches and the Install suggested fonts row as FOCUSABLE. The deeper AT-SPI tree still reports ENABLED false and no FOCUSED states; Shell controls are absent. Attempting font Review focus returned `atspi_error`, so its accessible consent/cancel path was **not independently passed**. The final diagnostic deliberately remains RED rather than treating available names as full certification. Root's real GTK injected `prefsStates` review/cancel and dual-threshold tests are separate evidence. No physical keyboard, Orca, screen-reader announcements, complete new-UI traversal or human accessibility pass is claimed.

The private AT-SPI registry required explicit startup because automatic activation was denied. Allocation-related Clutter warnings occur during style changes. A historical combined monitor/native-quick log contained a test-scene GTK CRITICAL for private Registry autoactivation (`NameHasNoOwner`), despite native Eval assertions passing; it is not claimed globally clean. The final monitor and numeric quick native logs contain no CRITICALs; the AT-SPI diagnostic itself remains partial.

## Reproduction and artifacts

```
DATA_SOURCE=demo GAQ_TEST_MONITORS=1280x800,1600x900 LOG=/tmp/gaq-monitor-native.log timeout --kill-after=5s 55s tools/headless-shell.sh tools/effects-monitor-probe.js sleep:2 tools/effects-monitor-verify.js
python3 tools/effects-monitor-image-check.py
LOG=/tmp/gaq-a11y-native.log tools/headless-shell.sh tools/a11y-probe.js sleep:18 tools/a11y-verify.js
```

Python tools compile. Targeted Bandit exits zero: fixed absolute executables, shell-free trusted argv, constant virtual-key allowlist and narrow B404/B603 annotations. Bandit emits two internal unused-annotation warnings for Popen but reports B603 when those annotations are removed.

Selected durable evidence is in [assets/open-items](assets/open-items/): `red-monitor-effects.json`, RED/green enlarged screenshots, final `monitor-effects.json`, `monitor-image-metrics.json`, cached-value pair, `gaq-monitor-diagnostic.log`, `gaq-monitor-fixed.log`, Accounts and final General `a11y-evidence` JSON, and final a11y log. Full eight matrix screenshots remain in `.superpowers/sdd/2026-10-07-open-items`. JSON temporary-extension paths identify the private captured session; archived image basenames are durable artifacts.

Final selected evidence additionally includes `close-effects.json`, the clean quick/numeric log pair, the strict 100-cycle log pair, numeric control output and private fatal-critical GDB traces. Physical accessibility acceptance and root's final exclusive frame measurements remain separate gates; this review does not certify either.

Scope update: later user reports of truncated money heroes and clipped Glass card shadows are assigned to root/providerCard and UX/CSS. The successful runs above describe the tested source revision before those follow-up edits; they do not close those new issues or certify the complete release pipeline. Renderer ownership was explicitly released, and no further native sessions were started.
