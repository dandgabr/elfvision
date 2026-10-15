# Full audit, 2026-10-15 (0.2.6 → 0.2.7)

Scope: `lib/` (core, services, providers, oauth, prefs, ui), `extension.js`, `prefs.js`,
`schemas/`, `themes/`, `tools/`, `tests/`, CI, documentation. Six read-only tracks ran in
parallel (core, security, UI, bug classes, documentation, tests and build); every finding
marked fixed below was read in the code first and the changes carry regression tests where
the behaviour is testable. Static review does not replace use with real accounts.

## Baseline (before changes, `main` at 0.2.6)

| Check | Result |
|---|---|
| `tools/check.sh` | pass |
| `tools/prefs-smoke.sh` | **fail**: stale checks (a command label removed in 0.2.4) and a real 360 px overflow |
| `tools/layout-check.sh` | **fail**: the probe wrote screenshots to a folder nothing created |
| `tools/effects-check.sh lifecycle` | pass (100 cycles) |
| `tools/sast.sh`, theme generation, `npm audit --omit=dev` | pass, 0 vulnerabilities |

After the changes every one of these passes (see the pull request for the final run).

## Fixed

### Bugs
| Finding | Where | Fix |
|---|---|---|
| Setup step "Connect accounts" needed 378 px in a 360 px window: the "Find configuration automatically" button could not wrap (real regression of 0.2.4) | `lib/prefs/oauthGroup.js` | all discovery buttons wrap |
| A transient read failure of `providers.local.json` was cached for 60 s as "no client id", which paused the OAuth provider until a manual refresh | `lib/services/localConfig.js`, `lib/providers/index.js` | the failure is reported as `network`, retried after 5 s |
| Disconnect-all removed only one connector item per provider (libsecret clears one match per call), ending in `deletion-incomplete` with several connectors | `lib/services/secrets.js` | clears until none is left (bounded) |
| A failed first start of credential coordination was memoised for the whole session | `lib/services/disconnectGate.js`, `lib/core/disconnect.js` | a failed start is retried; the half-started delegate is closed |
| Client-configuration discovery relied on another module promisifying `Gio.Subprocess` | `lib/prefs/clientConfigDiscovery.js` | promisified locally |
| An optional spend-limit failure discarded the cost already read; a missing credential in harness mode surfaced as a keyring failure | `lib/providers/apiUsage.js`, `lib/providers/index.js` | limit is optional; `missing` is "no key" |
| Disconnect-all failed on a corrupt connector registry after deleting credentials | `lib/services/disconnectAll.js` | corrupt registry is treated as empty |
| The cache could be written larger than the size it is read back with (then silently dropped) | `lib/core/cache.js` | leading snapshots that fit are kept |
| `_onDisconnectState` could throw into the Shell and leave no indicator | `extension.js` | guarded, retries on the next change |
| Unknown keyring state read "No key yet"; failed removal left the button disabled; bar switches lost keyboard focus; folder path used as markup; open-folder errors silent; adding with an invalid registry threw; popup switch diverged from the stored state on failure | `lib/prefs/*`, `prefs.js` | fixed individually |
| `formatDuration(59600)` read "60s"; tooltip crashed without a monitor; empty name in "Not tracked" | `lib/core/format.js`, `lib/ui/tooltip.js`, `lib/ui/indicator.js` | fixed |

### Security hardening (no P0/P1 found)
Loopback page escapes text; request addresses with credentials are refused; keyring item size is
bounded before parsing; own-property lookup for client configuration; the pre-commit secret check
no longer skips added files with quoted names; error logs of the cache writers carry the reason.

### Tests, build, documentation
Stale smoke checks corrected; real `fc-list`/`fc-cache` subprocess test; metadata/schema/template
consistency test; `tools/pack.sh` verifies the archive; `tools/check.sh` reports skipped steps and fails
them with `GAQ_REQUIRE_ALL=1`; `layout-check.sh` creates its evidence folder; `tools/release-assets.sh`
writes the manifest and checksums the README promised (0.2.5 and 0.2.6 were published without them);
`CHANGELOG.md`; README (wrong credential-mode name, release files), usage (local folders, uninstall,
fonts, main metric), themes, ADR statuses and counts, development setup/tools, pitfalls headings,
schema descriptions (connectors, not providers), security policy.

## Not changed, with the reason

| Finding | Reason |
|---|---|
| Harness-mode consent is stored in GSettings (any session process can change it) | Inside the accepted trust boundary of ADR 0003; the destination stays the provider's own host. Documented here. |
| `connectorStore.recover()` rebuilds only from keyring items (loses harness-mode connectors and labels) | Needs a design decision on merging; recovery is explicit and user-confirmed. |
| Scheduler maps gate errors (`stale`, `blocked`, `disconnected`) to `network` | Behaviour change to alerts; needs its own change and test matrix. |
| Harness-mode provider stays paused after the tool renews the token | Needs file watching or a policy change; today a manual refresh resumes it. |
| `flock` is `/usr/bin/flock` | Declared in the README requirements; resolving by PATH weakens the lock source. |
| No test job in CI (`gjs -m tests/run.js`) | Needs a GNOME container image that is not validated from here; run `tools/check.sh` locally. |
| `docs/temp/` is a mixed archive | Renaming moves many links; not done without your decision. |
| Eleven unreferenced probe/verify scripts in `tools/` | Possibly used manually; remove or wire them in a separate change. |
| `assertEqual` compares by JSON | Tightening it affects many tests; separate change. |
| Accessibility naming of repeated card buttons, expanded state of cards, selected theme label | Larger UI pass; no functional impact. |
| `redact()` heuristics, `import-client-ids.py` limits, D-Bus lock name, loopback IPv6 bind, dependabot for npm and hash-locked pip | Defence in depth; no demonstrated exploit. |
