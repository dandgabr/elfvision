# Final release validation

> Historical snapshot: this document preserves the findings and test results
> recorded on its date. Counts, source references, open items, and performance
> observations describe that snapshot. See the [v0.1 audit](2026-10-08-v01-audit.md)
> for current dispositions and release verification.

Target: `feat/post-mvp-effects`, based on `800465f`. This review follows the
owner's reported popup, heading, transparency, reset, value and shadow regressions.
Work was coordinated by file ownership; corrective implementations received an
independent rereview. No real account, keyring or font directory was used.

## Current source gates

- Full `tools/check.sh`: 415 passed, 0 failed, plus private disk/keyring integration,
  syntax, ESLint, native enable, ShellCheck, schemas and translation catalogs.
- Preferences: all six traversal/state variants, lifecycle and startup passed.
  Same-value notification rollback preserves error feedback; retry assertions use
  the actual translated label and retain the sensitive-state check.
- Native layout: twelve cases passed. The strengthened height oracle first
  reproduced a 60px suffix in a 40px actor; separate reading rows fixed it. Long
  currency, suffixes and quota values must fit their full Pango width and height.
- Native effects: 264 resource combinations, 44 theme captures, quick checks,
  100 lifecycle cycles, light/dark visuals and four actual pointer close scenarios
  passed strict native critical/error rejection. Scripted allocation warnings are
  recorded and are not claimed absent.
- Five static scanners passed. All-reference history, current-tree Gitleaks and
  isolated built-in secret checks passed. Final staged checks run before commit.
- Packaged runtime/helper/license byte comparison: 127 files match current source,
  three font licenses included, no development payload.

Fractional-scale native and pixel acceptance passed all four cases. The fixed
right-hand sample is guarded inside the textured scene and outside its smooth
stripe; the original left-hand region overlapped that stripe in dark cases.
Translucent-to-frost texture metrics fell from 1.682/1.682/3.044/1.353 to
0.044/0.044/0.023/0.023, with outside difference zero. Cached readings repainted.

The first final-source processing profile failed the leaves added-cost gate:
3.569ms minus static 1.538ms = 2.031ms, above the unchanged 2ms limit. Its complete
report is retained at `assets/open-items/frame-profiles/pre-optimization.json`.
The correction keeps eight leaves and the 34ms elapsed-time update source, rounds
positions to device pixels and rotation to half degrees, and skips unchanged
transform writes. Independent reviewers found no geometry/lifecycle blocker.
Fresh quick, 264-combination and 100-cycle native gates passed. The second full
processing profile exited 0, with 1759 completed frames per 60-second condition.
Its fourteen source hashes match the frozen source. Static/leaves p95 is
1.578/3.576ms (added 1.998ms); static Glass/frost is 1.575/3.140ms (added 1.565ms).
Both remain below 16.667ms total and the unchanged 2ms added-cost limit. This
serialized CPU-submission/GPU-finish wall-duration observation is not pure GPU
time or presentation latency. Leaves are very close to the limit; the two runs
alone do not establish a statistically significant improvement or a guarantee
on other hardware. The failed first result remains archived. Final evidence is
`assets/open-items/frame-profile.json`.

## Review and participation limits

Security corrections fence obsolete scheduler results, retry recreated data,
serialize provider credential writes and compare rotation generations, retain the captured retiring gate during accepted rotation saves, and bind
OAuth cleanup and token continuation checks to their own attempts. See the
[domain rereview](2026-10-08-final-domain-review.md) and
[QA rereview](2026-10-08-final-qa.md) for reproduced failures and mutation evidence.

Human Orca, physical GPU/monitor combinations, lock/suspend and actual provider
accounts remain unverified. Synthetic tests cannot certify those environments;
provider participation steps remain in the provider-validation checklist.

## Publication checks

Staging exposed upstream trailing spaces in line 21 of the Inter and Poppins OFL
licenses. Their bytes are deliberately preserved: all three license SHA256 hashes
match the pinned `fontInstaller` values and passed local installation tests. The
`.gitattributes` exception disables end-of-line-space checks for those two exact
vendor files only. Source whitespace checks remain active; staged diff checks
pass. This preserves provenance rather than rewriting the upstream licenses.
