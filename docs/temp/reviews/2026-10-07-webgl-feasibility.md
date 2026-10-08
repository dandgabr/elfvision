# Optional WebGL preview feasibility — 2026-10-07

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Recommendation: retain native/static preferences previews and native Shell rendering for the accepted four options. An optional isolated WebKit preview can render real WebGL on this host, but must remain an optional future enhancement. A one-shot synthetic browser snapshot can reach a Shell actor; this does not establish a viable animated WebGL-in-popup bridge. No WebKit dependency, browser widget or executable theme field was added to the packaged extension.

## Verified environment and boundaries

Resolved locally: WebKit namespace 6.0, library **2.54.1**; GJS **1.88.1**; GNOME Shell **50.5**. Versions are host observations, not minimum supported dependency declarations. Used GTK 4 and a private headless 800×600 Wayland compositor/session with empty XDG config/data/cache and memory settings. Every experiment ran inside `unshare -Urn`: a private user/network namespace without external interfaces. WebKit's own sandbox remained enabled. No real accounts, provider calls, clipboard content or theme-supplied code were involved.

The preview loaded only fixed synthetic HTML containing “Synthetic quota 82%” and a 360×180 canvas. Ephemeral NetworkSession avoids persistent browser data. CSP denies connections, images, frames, media, fonts and arbitrary resources; inline script permission is only for fixed developer-owned content. Navigation/new-window policy rejects anything except about:blank, and create handlers decline windows. The final probe attempts one external navigation and checks the rejection; network isolation independently prevents external access. A missing-typelib fault and disabled-WebGL mode select native fallback.

Read the Coacus 3D/WebGL domain skill and approved post-MVP design. API behavior was checked against local typelib signatures and official sources before experiment use. The optional preview evaluates a fixed synchronous script that schedules frames; `evaluate_javascript` does not itself await its returned Promise here. The first test returned “Unsupported result type” for that Promise; the corrected probe polls a fixed synthetic result rather than weakening settings or loading remote code.

## Measurements

Single runs on this host; no statistical startup comparison, GPU profiler, or 60-second complex-scene benchmark. The baseline is a small native Gtk label preview, not a full preferences window. Summed descendant VmRSS can double-count shared pages and is not PSS or GPU memory. Sampled every ~50 ms; peak short-lived processes may be missed. Native elapsed time includes an explicit 100 ms settling wait; browser ready time means document-load-finished, not first GPU-presented frame.

| Experiment | Startup/ready observation | Peak summed process-tree RSS | Rendering/disposal observation |
| --- | --- | --- | --- |
| Native static control | 1691.753 ms through the 100 ms settle callback, first run | 216728 KiB | Native widget only; exit 0; no sampled descendant remained one second after exit. |
| Forced optional absence fallback | 238.852 ms through settle callback, warmed host | 176784 KiB | Native fallback imports no WebKit; exit 0. Final strengthened control also catches a deliberately missing typelib. |
| WebKit, WebGL disabled | 455.906 ms document-ready | 528444 KiB | getContext fails, native fallback selected; snapshot 8.876 ms; browser explicitly terminated; no sampled descendant remained one second after exit. |
| WebKit, real WebGL | 435.189 ms document-ready | 534684 KiB | WebGL 2.0, 120 frames; mean rAF interval 16.689 ms, p95 17 ms; snapshot 190.841 ms; terminate+native fallback; no sampled descendant remained one second after exit. |

These figures are from `/tmp/gaq-webgl-study-snapshot.log`. The strengthened final run (`/tmp/gaq-webgl-study-evidence.log`) caught the missing typelib and blocked exactly one external navigation in each WebKit case. WebGL again produced 120 frames, p95 17 ms; ready time 460.077 ms, peak RSS 538304 KiB, snapshot 21.665 ms and no sampled surviving descendants. This 21.665–190.841 ms capture variation is a reason to require sustained representative measurements rather than extrapolate either run. rAF intervals measure callback pacing, not GPU frame execution, input responsiveness, visual fidelity or compliance with the native effects frame-time gate.

Initial launch failed before content rendering because inherited Intel `LD_LIBRARY_PATH` entries included a sandbox-rejected symlink. Retried after unsetting LD_LIBRARY_PATH/LD_PRELOAD; kept WebKit sandbox and network namespace. Private accessibility-bus startup warnings remain in the logs. No Orca certification is implied. This host-specific launch sensitivity is itself a support/dependency cost.

## Actual isolated-renderer-to-Shell transfer

Captured a **420×250** WebKit view through `get_snapshot`, saved its returned Gdk texture to a **4677-byte PNG**, then loaded that developer-owned file in a separate, extension-disabled private Shell through St.Icon/Gio.FileIcon. The verifier observed `mapped=true` and non-null loaded image content, then destroyed the actor. PNG decode took **1.6 ms**; verification was at an intentional 250 ms delay (252.987 ms overall), so that delay is not an upload-latency measurement. The decoded RGBA image contained **420000 bytes**. Logs: `/tmp/gaq-webgl-transfer-final.log` and `/tmp/gaq-webgl-transfer-shell-final.log`; actual Eval results were true, rather than relying on wrapper exit alone.

An initial attempted Clutter.Image route failed because that constructor is unavailable in this Shell. The supported St file-icon route works for static transfer. This exposes an ABI/API assumption that a proposed native bridge must resolve; no browser texture is shared directly with St, no zero-copy mechanism or continuously synchronized stream was demonstrated, and a still image is not WebGL executing in Shell.

At 30 full RGBA frames/s, this size alone implies **12.6 MB/s** raw payload before serialization, PNG encoding/decoding, copies and uploads. That is arithmetic, not measured bandwidth. One observed WebGL snapshot (~191 ms) missed a 33.3 ms per-frame target; the later ~21.7 ms capture fit that interval before additional decode/transport/upload costs. These sparse observations do not prove sustained feasibility. A future bridge needs an independently reviewed protocol/process, explicit bounded IPC/backpressure, frame dropping, scale/color-space handling, crash/context-loss recovery, and close/disable/theme-change cancellation. Shared-buffer/GPU-handle approaches would introduce platform/ABI and lifetime complexity not resolved by this study.

## Native previews and architectural decision

Existing native theme picker swatches preserve token identity without an embedded browser. They cannot demonstrate actual desktop backdrop frost, but neither can an isolated WebKit surface faithfully sample the Shell popup backdrop. For the accepted leaves, simple translucency, decorative glass and real frost, native Shell effects plus native/static previews suffice architecturally; final runtime screenshot/performance evidence belongs to those native tasks. Organic/Biophilic's reference is Canvas 2D and Glassmorphism's reference is CSS; neither requires WebGL. Do not rename native shaders “WebGL”.

An optional animated preferences preview would add WebKit/JavaScriptCore and child processes, GI/API availability detection, sandbox/platform support, accessibility fallbacks and packaging documentation. It should lazy-import only after explicit preview activation, run packaged synthetic content, recover from process/context failure to native preview, and never receive account/controller data. Theme JSON may select an allowlisted packaged scene identifier only if a later ADR accepts that representation; arbitrary shaders/code/links remain rejected.

ADR proposal for a future genuinely WebGL-dependent style: decide separately between optional preferences-only preview, prerendered packaged static assets, or a dedicated isolated renderer-to-St bridge. Require measured representative-scene memory/startup/capture and teardown budgets, API compatibility and security review before choosing the bridge. No such architectural decision is accepted here; WebGL-in-popup is outside this release.

## Reproduction and evidence limits

Scratch scripts: `.superpowers/sdd/2026-10-07-post-mvp-execution/webgl-study.js`, `webgl-study-run.py`, `webgl-study-isolated.sh`, `webgl-transfer-probe.js` and `webgl-transfer-verify.js`. Run the isolated wrapper with `unshare -Urn dbus-run-session -- bash <wrapper>`; it launches only a private compositor and fixed synthetic preview. Transfer uses `SKIP_ENABLE=1` and the existing private headless helper. These artifacts are excluded from packaging; synthetic PNG and raw logs are evidence only.

Absence is fault-injected on an installed-WebKit host, not verified on a separate distribution without WebKit. Failure is deliberately disabling WebGL, not a full GPU driver/context-loss test. Four small runs and one static capture do not establish sustained memory/performance safety. No human visual review, keyboard/Orca browser-preview certification, actual network packet trace, continuous transfer, reusable buffer bridge or native effects performance result is claimed.

Official references: [WebKit network session implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/glib/WebKitNetworkSession.cpp), [JavaScript evaluation API](https://webkitgtk.org/reference/webkit2gtk/stable/method.WebView.evaluate_javascript.html), [policy decisions](https://webkitgtk.org/reference/webkit2gtk/stable/signal.WebView.decide-policy.html), [snapshot API](https://webkitgtk.org/reference/webkit2gtk/stable/method.WebView.get_snapshot.html), [GNOME extension architecture](https://gjs.guide/extensions/overview/architecture.html). The published WebKit2 manual pages describe related API semantics; this experiment's actual namespace 6.0 snapshot return is confirmed locally as Gdk texture, not inferred from older Cairo signatures.
