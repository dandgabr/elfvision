# Provider expansion and account actions

Date: 2026-10-08. User authorizes autonomous implementation and parallel agents. Existing numeric jitter and material/transparency fixes are human-accepted and must not be redesigned.

## Intent and selected design

Accounts deletes all connectors of the selected data source with Cancel-default confirmation; Demo never accesses live credentials. General restores settings and preserves credentials/metadata. The monetary demo becomes an ordinary persisted demo-only connector: list, track, rename and remove, with no unconditional runtime injection. Serialized empty collections remain empty across restart/scenario changes. Connection rows show API-key/OAuth 2 icons plus accessible text; theme picker shows capability icons derived from validated built-in profiles, independent of current motion/material settings.

New live entries: OpenAI API, Anthropic API, Cursor and OpenRouter.
OpenAI/Anthropic use administrative API keys; Cursor uses a Team Admin API key
(HTTP Basic), not personal subscription OAuth; OpenRouter uses a Bearer API key.
Gemini and Z.ai are deferred by explicit user request after no public quota
endpoint via ordinary inference keys was verified. Never issue paid generation,
scrape cookies, infer dollars from token prices, or label historical costs as
balance.

## Data contract

Add pure `kind: spend` metric: `amount`, `currency`, `window` (month/none), optional positive `limit`, optional `resetsAt`; `percentUsed` is null when no known limit. This is reporting of spend, not prepaid balance. Money keeps legacy prepaid semantics and may explicitly use `basis: allowance` for a key budget, retaining period/reset and complete currency. No meter or percent/threshold alert without a known positive limit. Preserve numeric font markup and existing layout/geometry.

OpenAI reads GET organization/costs, paginated from UTC calendar month, plus optional GET organization/spend_limit (threshold cents converted to currency units). Anthropic reads paginated GET organizations/cost_report with cents decimal conversion. Cursor reads bounded POST teams/spend and aggregates overallSpendCents only; no member identities persist. OpenRouter reads GET api/v1/key; key allowance is not account balance, unlimited keys report spend. Management keys may read documented credits endpoint, explicitly distinguished. Requests are fixed HTTPS method/path/host, bounded bytes/pages, cancellable before/after key lookup and between pages; secrets never enter URL, state, cache, diagnostic errors or reports.

## About and reports

Credit Daniel G. Araujo with github.com/dandgabr link. Public bug form `.github/ISSUE_TEMPLATE/bug_report.yml`; private form `.github/VULNERABILITY_REPORT.yml`, following current GitHub schema and Security Lab report template. Private vulnerability reporting verified enabled via API. About opens fixed browser URLs by explicit user action; GitHub performs submission. No local telemetry/log/keyring harvesting and no public fallback for vulnerabilities. Add SECURITY.md explaining channel and supported-version scope.

## Required architectural compatibility

Provider registry expansion must migrate existing durable disconnect transaction credential matrices atomically without dropping blocked providers or stale-write fencing. Demo-only provider never participates in live secret namespaces, onboarding or gate providers. Legacy/default registry representation preserves original four live provider rows; new APIs are added explicitly, not auto-created. Demo has original four plus persisted Example Credits. Added live API providers require synthetic demo fixtures for actual preview. Retain the 32-connector bound, strong IDs, exact namespaces and explicit recovery.

## Verification and limits

TDD for provider parser units/currency/pagination/cancellation/errors/secret-safe data, spend contract/cache/view/alerts, global deletion Demo isolation and live metadata removal under gate, durable migration, empty-demo runtime, icons and report actions. Root alone owns serialized private Shell/GTK sessions, build/translation integration, final suite/security checks, screenshots and ZIP. Specialists review independent source/fault mutants after implementation. Real admin accounts, Gemini Cloud, unofficial Z.ai, Orca/hardware remain separate only if not actually exercised. Sources and deviations must be documented with exact URLs in docs/providers.md; no invented endpoint capability.

## Accepted scope change

The user explicitly requested that Gemini API and Z.ai be left out for now after
the reporting-API research. They are excluded from live and demo selectors in
this version; investigation is retained in `docs/providers.md` for future work.
Final live provider count is eight, with four new API reporting connectors.
