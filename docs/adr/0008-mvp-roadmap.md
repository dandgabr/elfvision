# 0008. MVP milestones and open items

Status: accepted

## Milestones

Each milestone is tried in the nested shell (`tools/nested-shell.sh`).

| Milestone | Content | Status |
|---|---|---|
| M0 | Skeleton: `metadata.json` for shell 50, panel button, bar with the pacing tick, popup with demo cards. No network. | done |
| M1 | Data layer: the `ProviderSnapshot` contract, scheduler (interval, jitter, backoff, stale), severity and pacing, disk cache, deterministic demo providers, unit tests under `gjs`. Theme loader with the 20 themes. Appearance settings and the theme picker. | done |
| M2 | Command Code: the first real provider, with an API key stored in libsecret and a minimal key field in Preferences. Closes the loop end to end. | done |
| M3 | OAuth in Preferences: a reusable loopback server and PKCE, single-flight refresh. Providers in order: Codex, Claude, Antigravity. Structure in ADR 0009. | done |
| M4 | Notifications with dedupe and hysteresis, the connection alert, a legend for the symbols, the bar tooltip, a section for providers that are not tracked, an About page, restoring defaults and a Notifications page (ADR 0010). The language choice was dropped: the extension follows the session language. The first-use assistant and the right-to-left and longer-text pass are implemented; conformance audit fixes are verified. | done |

Provider order: Command Code, Codex, Claude, Antigravity.

## Next

M0 to M4 are complete. M4 audit findings and their verified fixes are recorded in the
[original-plan conformance audit](../temp/reviews/2026-10-07-m4-plan-conformance.md).
The implemented M5 follow-ups and remaining product questions are in
[ADR 0010](0010-alerts-and-polish.md). Real-account checks and the providers'
current terms remain owner checks (ADR 0009).

## Post-MVP execution

The owner approved the [integrated execution plan](../temp/plans/2026-10-07-post-mvp-execution.md)
and its [visual design](../temp/plans/2026-10-07-post-mvp-design.md).
These extend the general roadmap without reopening M4.

| Milestone | Deliverables | Status |
|---|---|---|
| M5 | Pure bar model, redraw coalescing, keyboard tooltips, legend Escape ordering, CI lint and numeric-font validation. | implemented |
| M6 | Reusable native effects: leaves, translucency, decorative glass and real frosted glass; 22 theme profiles including Organic/Biophilic and Glassmorphism; motion/transparency/material controls and lifecycle checks. | implemented; frost hardware release gates remain open |
| M7 | Optional WebGL/preview feasibility evidence; explicit proposals for font installation, disconnect-all/local deletion and separate warning/critical thresholds. | study/proposals complete; product decisions open |

Use shared particle, texture, motion and material primitives where the visuals
actually share behavior. Theme profiles stay declarative; specialized geometry
can remain separate. Parallel theme work uses disjoint profile fragments with one
generator/catalog integrator. Every milestone requires independent review and
fresh validation; real frost remains open if its compatibility/performance gate
fails. Product proposals in M7 do not authorize account deletion or font downloads.

The [validation record](../temp/reviews/2026-10-07-post-mvp-validation.md) links
native screenshots, independent reviews, measured resources and exact acceptance
limits. GPU frame duration, fractional scaling, multiple monitors and human
keyboard/Orca/live-account checks remain unverified; implemented frost is not
fully release-certified by callback timing or a successful attachment alone.
