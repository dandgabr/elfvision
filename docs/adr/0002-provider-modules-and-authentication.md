# 0002. Provider modules, own authentication, harness isolation

Status: accepted

## Context

The extension must show the quota of Command Code, Codex, Claude and Antigravity
(and later API providers billed by money, such as OpenRouter). The sibling project
`ai-monitory` reads each harness's own token and calls the provider API, which
breaks when a harness rotates its token.

Findings on this machine (GNOME 50.5):

- None of the four CLIs has a command that prints quota.
- Codex writes `rate_limits` into `~/.codex/sessions/**/*.jsonl`.
- Claude Code passes `rate_limits.five_hour/seven_day` to a `statusLine` command.
- Command Code and Antigravity expose nothing passively.

## Decision

1. **Total isolation from the harness.** The extension does not read, write or
   observe any harness file: no `auth.json`, no `.credentials.json`, no keyring
   entries of the CLI, no session logs, no `settings.json` edits, no `statusLine`.
   The passive log and statusLine options were therefore dropped.
2. **Each provider is an isolated module** with its own authentication, endpoint and
   response parser:
   `authKinds()`, `login()`, `refresh()`, `fetch() -> ProviderSnapshot`, `logout()`.
3. **Authentication is managed by the extension.** API key where it exists,
   otherwise OAuth 2 (PKCE) performed by the extension, producing a token
   separate from the harness, with its own refresh.

| Provider | Authentication | Query |
|---|---|---|
| Command Code | API key pasted by the user | `GET api.commandcode.ai/alpha/billing/credits` and `/alpha/billing/subscriptions` |
| Codex | OAuth 2 (PKCE) | `GET chatgpt.com/backend-api/wham/usage` |
| Claude | OAuth 2 (PKCE) | `GET api.anthropic.com/api/oauth/usage` with header `anthropic-beta: oauth-2025-04-20` |
| Antigravity | OAuth 2 (Google, PKCE) | `POST daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` (User-Agent contains `antigravity`) |

These endpoints are unofficial and may change. They are documented in the
`ai-monitory` provider descriptors.

4. **Data contract** reused from `ai-monitory` (`snapshot-contract.md`):
   `ProviderSnapshot { state, auth, source{fresh|stale}, headline, metrics[] }`.
   - `state`: `ok`, `auth_required`, `rate_limited`, `network`, `parse_error`,
     `provider_changed`, ...
   - A metric has `kind` (`percent` or `money`), `window` (`session`, `week`,
     `month`, `none`), `window_secs`, `resets_at`, `used`, `limit`, `remaining`,
     `percent_used`, `severity` and an optional `pool`.
   - A missing value is **never** zero. A snapshot is stale after twice the poll
     interval, and its values are hidden after 24 hours without a fetch.
5. **Polling** every 5 minutes with jitter, exponential backoff and a disk cache.
   All I/O is asynchronous.
6. **Money metrics** (`kind: money`) are first-class: the balance is the value, the
   bar is the share of the configured budget already spent, there is no window or
   reset, and a dollar floor can be configured.
7. **Providers the user no longer uses**: per provider, *Do not track* pauses
   collection and hides it (the account stays connected); *Remove connector*
   deletes the stored credential and hides the provider. An untracked provider never
   raises an alert or takes a bar slot.

## Scheduler and cache (amended 2026-10-06)

Implemented in `lib/core/scheduler.js`, `lib/core/contract.js` and
`lib/core/cache.js`.

- One fetch at a time per provider, 30 s timeout. A fetch receives a context with
  `isCancelled()`, true once the scheduler gave up on it (timeout, provider removed).
- Poll intervals below 5 s are raised; a missing or invalid one falls back to 5 min.
  Backoff on failure is 30 s, 1 min, 2 min, ... capped at 1 h; a server's retry hint
  is honored but never longer than the cap. Every failure snapshot records
  `nextRetryAt`, so the UI can say when the next attempt happens.
- `auth_required` pauses the provider. A manual refresh, `credentialsChanged`, or a
  successful fetch resumes the schedule; new credentials during a fetch in flight
  cause one more fetch.
- A reply whose every metric is unusable is a `parse_error` and keeps the last good
  data. Error messages are redacted (URLs, token-like strings) before they are kept.
- The cache (`~/.cache/gnome-ai-quota/snapshots.json`, mode 0600) is capped at 256 KiB,
  32 snapshots, 16 metrics each and 64 characters per text, and is only written back
  after it was read, so stopping during the load cannot wipe it.

## Consequences

- No behavior depends on a CLI renewing its token.
- The user logs in once per provider inside the extension.
- Provider modules are independent, so a broken endpoint only affects one card.
- The extension cannot show data from a provider the user has not connected.
