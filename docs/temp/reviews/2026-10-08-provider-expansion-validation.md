# Provider expansion validation — 2026-10-08

Scope: eight live providers (four existing subscription connectors plus OpenAI
API, Anthropic API, Cursor and OpenRouter), persisted Example Credits in Demo,
separate deletion/restoration, connection/capability icons, About credit and
public/private report forms. Gemini and Z.ai are explicitly deferred by the user;
research remains in `docs/providers.md`.

## Coordination and review

Exclusive owners implemented account actions, monetary contract, API adapters,
durable-gate expansion, theme/About/report UI and integration fixtures. Root
serialized native sessions and integrated shared registry/factory files.

The UI/UX reviewer found four concrete issues: a disposed deletion view re-enabled
new controls, unsupported cards lacked a route to Preferences, dashboard-only
metadata had an API-key label, and Demo failure copy referenced real keyrings.
These were corrected; the unavailable-provider UI is not exposed after the
user's Gemini/Z.ai deferral. Root security/architecture review checked fixed
hosts, auth units, pagination, normalized cache data, durable fencing, and
mode-scoped deletion. Security research used primary provider/GitHub sources,
without account credentials or paid generation requests.

Adapter, monetary and capability fault controls were exercised by their owners;
selected intentional billing, cap and source-origin mutations were detected. The
integration test also observes actual controller cache filtering across deletion,
restart and scenario changes; new API sibling-key tests fence delayed lookups
before any HTTP dispatch.

## Automated evidence

- `/tmp/gaq-expanded-units.log`: final pure suite; **546 passed, 0 failed**.
- `/tmp/gaq-expanded-check.log`: full unit, cross-process/private-keyring deletion,
  syntax, ESLint, Shell load, ShellCheck, schema, gettext and whitespace gate.
- `/tmp/gaq-expanded-sast.log`: Bandit, Semgrep, ShellCheck, Zizmor and Gitleaks.
- `/tmp/gaq-expanded-prefs-all.log`: six LTR/RTL, text-expansion/font traversals,
  lifecycle, state matrix, full startup, native theme capability icons, About and
  report-launch tests. Report URIs are intercepted; nothing is submitted.
- `/tmp/gaq-expanded-prefs-connectors.log`: four real GTK variations covering add,
  connect, rename, Cancel, remove, delete-all, restart, recovery and mode isolation.
- `/tmp/gaq-expanded-layout.log`: twelve actual Shell layout scenarios, including
  large-currency cards in LTR/RTL.
- `/tmp/gaq-expanded-effects-quick.log`, `effects-matrix.log`, `effects-frames.log`:
  native effects, 264 resource combinations, 100 rebuilds and four frame profiles passed.

The repository's private reporting state was measured with GitHub's API:
`{"enabled":true}`. Custom form YAML was checked against the current official
[private reporting schema](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
and [issue form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema).
The Security Lab [report example](https://github.com/github/securitylab/blob/main/docs/report-template.md)
informed the vulnerability questions. Custom forms reach GitHub users after
merge to the default branch; no report submission was performed.

## Limits and accepted changes

No real administrative account round trip, human Orca session, physical GPU/monitor
validation or actual lock/suspend was performed for this change. Existing numeric
jitter and transparency/materials were accepted by the user; styling and effect
implementations remain unchanged. The expanded gate preserves old blocks/leases;
older processes fail closed and can require restart/boot recovery.

[Manual checks](2026-10-08-provider-expansion-manual.md) distinguish these human
checks from synthetic evidence. No merge, GitHub Release or extension-store upload
is part of this delivery.

The new real-Shell reporting probe first failed on Anthropic's uncapped top-bar
meter. The bar now hides meters without a finite percentage; the native regression
checks both bar and popup behavior for all four new reporting providers.

## Native monetary captures

The four [captures](assets/provider-expansion/) were inspected individually:
[OpenAI API](assets/provider-expansion/openai-api.png),
[Anthropic API](assets/provider-expansion/anthropic-api.png),
[Cursor](assets/provider-expansion/cursor.png) and
[OpenRouter](assets/provider-expansion/openrouter.png). Amounts are complete,
provider icons are packaged, uncapped spend has no meter, and key allowance is
explicitly named. `/tmp/gaq-expanded-reporting.log` records
`GAQ_PROVIDER_REPORTS_OK` for all four and an empty Demo after deletion/scenario
change. The probe follows the current indicator after each rebuild instead of
reading a disposed instance.

[Frame measurements](assets/provider-expansion/frame-profile.json) record the
actual sampled profiles and source hashes. All p95 frame budgets and added-time
limits passed in the private compositor. This measures the tested environment,
not all physical GPU or monitor combinations.

Expanded views were also inspected individually; the four corresponding
`*-expanded.png` files are retained alongside the collapsed captures. The empty
Demo state offers Add account and contains no cards or stale quota values. A
paused identity belonging to another source does not turn the empty-state copy
into an inapplicable Resume instruction.

## Final package gate

The full check and five static scanners passed on final source. The standard
GNOME extension ZIP was rebuilt, byte-audited against every packaged file, and
loaded from its actual installed directory in a new private Shell.
`/tmp/gaq-expanded-installed.log` records `PACKAGE_INSTALL_GREEN` for v0.1 with
five initial demo cards. [Package audit](assets/provider-expansion/package-audit.json)
records 141 packaged files, the archive SHA-256 and metadata. All fourteen recorded
frame-source hashes were checked against the final source.
