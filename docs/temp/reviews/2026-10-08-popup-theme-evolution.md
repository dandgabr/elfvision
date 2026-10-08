# Popup and theme evolution — final validation

Date: 2026-10-08. Target: GNOME Shell 50.5, UUID
`gnome-ai-quota@dandgabr.github.io`, candidate version `0.2.0`.
Native sessions use isolated synthetic connectors and private settings. The
desktop installation, real accounts and keyring were not modified or inspected.

## Scope and adherence

The approved plan is implemented: adjustable logical popup width/maximum height,
screen clamping, separate Live/Demo connector order and visibility, compact card
geometry, independent scrollbar clearance, individual light/dark theme research
and authored variants, and additive settings compatible with ordinary updates.
Popup visibility does not change collection, notifications or panel eligibility.

The implementation decisions and deviations are recorded in
`docs/temp/popup-evolution-plan.md`; style sources and individual acceptance
criteria are in `docs/temp/theme-evolution-research.md`.

## Measured checks

- `build/popup-evolution/check-final.log`: `575 passed, 0 failed`; lint, extension
  enablement, shellcheck, strict schemas, translation template/catalogs and
  whitespace checks also passed.
- `build/popup-evolution/generator.log`: six generator regressions passed.
- `build/popup-evolution/prefs-popup.log`: native GTK dimensions, reset,
  stale-registry visibility, order, Live/Demo isolation and cleanup passed.
- `build/popup-evolution/presentation.log`: nine native scenarios passed,
  including screen clamping, minimum/automatic/custom sizes, scale factor 2,
  work-area changes, keyboard focus, close and disable cleanup.
- `build/popup-evolution/layout.log`: twelve native cases passed across normal
  and expanded translations, large fonts, RTL and complete large currency values.
- `build/popup-evolution/close.log`: four outside-click/other-popup regression
  cases passed.
- `build/popup-evolution/quick.log`: seven effects groups passed, including
  native keyboard focus across all 44 light/dark variants.
- `build/popup-evolution/resource-matrix.log`: 22 themes × 12 combinations
  (264 checks), followed by 100 actual rebuilds, passed.
  `build/popup-evolution/lifecycle.log`: 100 cycles passed with zero sources,
  particles, blur effects or owned actors after destruction.
- `assets/popup-evolution/native-material-metrics.json`: pixel comparisons
  passed in light and dark, confirming real backdrop translucency, decorative
  glass, frost, response to a moving background window and leaf phase changes.
  Pixels outside the blur viewport were unchanged.
- `build/popup-evolution/light-all.json` and `dark-all.json`: 154 captures each,
  all 22 themes, seven distinct effect/material configurations per scheme;
  finished with no probe errors. Minimum card-to-scrollbar gap was 14 pixels
  in each scheme, leaving eight pixels beyond the six-pixel paint budget.
  Maximum measured particle count was eight and blur effect count one.
  Committed summary: `assets/popup-evolution/native-matrix-summary.json`.
- `assets/popup-evolution/mutation-results.json`: twelve boundary mutations
  killed. Additional QA reported three reading/contrast mutations killed;
  `tests/theme.test.js` exercises all 256 grey levels in the contrast regression.
- `assets/popup-evolution/native-font-reading-proof.json`: eight actual Pango
  font-resolution cases; a 61px summary and 133px footer drive dynamic protected
  reading regions rather than fixed text bands. Pending layout sources were zero.
- `assets/popup-evolution/cairo-equivalence.json`: twelve real-Cairo cases
  execute the production repaint callback and match the previous full surface
  in every RGBA channel. The source hash pins the optimized renderer; split,
  merged, measured large-reading regions and three corner radii are covered.
- `build/popup-evolution/upgrade.log`: ordinary installation, reinstall and
  code rollback preserved synthetic connector identities, settings and data.
  Both ZIP versions enabled in fresh private Shell sessions using persistent
  keyfile settings. New additive defaults and customized presentation survived.
- The candidate extension ZIP contains the required runtime modules and no
  tests, documentation, build captures or local configuration files.
- `assets/popup-evolution/frame-profile-final.json`: four isolated 60-second
  samples passed with at least 1,759 complete paint samples each. P95 paint
  durations: static 1.504ms, leaves 3.419ms, static glass 1.523ms, frost 3.340ms.
  Added p95: leaves 1.915ms, frost 1.817ms, both within the unchanged 2ms goal;
  all are below 16.67ms. Source hashes match the final rendering code.
  `frame-profile-first.json` retains the original leaves failure (2.143ms added)
  that prompted cropping the cached protection into edge surfaces. This is a
  serialized CPU submission/GPU-finish wall measurement in a private headless
  Shell with forced 34ms redraws, not pure GPU timer-query duration, normal
  cadence, end-to-end presentation latency or a 120Hz compatibility claim.
- Bandit, Semgrep and offline zizmor reported zero findings in the final scan
  logs under `build/popup-evolution`; staged secret checks passed without reading
  the user's local provider configuration.

## Review closure

The UI/UX review inspected all six refreshed technical contact sheets and
eight original font-theme captures. A final pass after the compositing
optimization reinspected the six sheets and five material/editorial originals.
It approved the resolved local fonts,
compact geometry, hierarchy and stable Off/Full layouts with no blockers.
The final security review found no blockers in font validation, reading bounds,
signal/source ownership or upgrade preservation. Final QA found no remaining
blocker after contrast interval and dynamic reading bounds corrections.
The documentation review's stale version, reading-zone and API-provider wording
was corrected; older test counts are explicitly labeled as checkpoints.

Visual evidence: `build/popup-evolution/index.html`, with all 308 original PNGs.
These local artifacts are ignored rather than added to the extension package.
Technical reviews do not replace Daniel's aesthetic approval on his desktop.

## Delivery boundary

Open the PR after verification. Wait for Daniel's confirmation of the merge,
then synchronize main, build and publish v0.2.0 from the merged commit, and
install using `gnome-extensions install --force`. Preserve schema identity,
settings, connector records and credentials; do not uninstall/reset or delete
configuration/cache/state directories. Verify installed code separately from
currently loaded Wayland modules. Never log out automatically.
