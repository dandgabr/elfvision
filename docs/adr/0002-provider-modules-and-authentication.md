# 0002. Provider modules, own authentication, harness isolation

Status: accepted and implemented. All four providers are real (Command Code in M2, Codex,
Claude and Antigravity in M3); the registry, the sign-in and the token handling are in ADR 0009.

## Context

The extension shows the quota of Command Code, Codex, Claude and Antigravity, and
later of API providers billed by money, such as OpenRouter. Reading a token that
another tool owns breaks whenever that tool rotates it, and none of the four tools
has a command that prints quota. The extension therefore needs its own access.

## Decision

1. **Total isolation from the AI tools.** The extension does not read, write or
   observe any of their files: no `auth.json` or `.credentials.json`, no keyring
   entries, no session logs, no `settings.json` edits, no `statusLine` hook.
2. **Each provider is an isolated module** with its own endpoint and response parser,
   listed in the registry (`lib/providers/registry.js`) with its kind of access. The shell
   side is `{id, name, plan, intervalMs, fetch(context), dispose()}` and returns a raw
   snapshot that the contract cleans; signing in, renewing and disconnecting are done by the
   sign-in flow, the token manager and the Accounts page (ADR 0009). The demo providers in
   `lib/providers/demo.js` follow the same shape.
3. **The extension manages authentication.** An API key where the provider has one,
   otherwise OAuth 2 with PKCE performed by the extension, producing a token that is
   separate from the other tools' tokens and has its own refresh.

| Provider | Authentication | Query |
|---|---|---|
| Command Code | API key pasted by the user | `GET api.commandcode.ai/alpha/billing/credits` and `/alpha/billing/subscriptions` |
| Codex | OAuth 2 (PKCE) | `GET chatgpt.com/backend-api/wham/usage` |
| Claude | OAuth 2 (PKCE) | `GET api.anthropic.com/api/oauth/usage` with header `anthropic-beta: oauth-2025-04-20` |
| Antigravity | OAuth 2 (Google, PKCE) | `POST daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` (User-Agent contains `antigravity`) |

These endpoints are unofficial and may change without notice.

4. **Data contract** (`lib/core/contract.js`):
   `ProviderSnapshot { state, auth, source{fresh|stale}, headline, metrics[] }`.
   - `state` is one of `ok`, `auth_required`, `rate_limited`, `network`,
     `parse_error` or `provider_changed`.
   - A percent metric has `id`, `kind: percent`, `window` (`session`, `week`,
     `month` or `none`), `windowSecs`, `percentUsed`, an optional `resetsAt` and an
     optional `pool` (`id`, `name`, `short`). A money metric has `kind: money`,
     `balance`, `budget`, `currency` and an optional `dailySpend`. Severity is
     derived from the percentage in `lib/core/severity.js`, not carried by the
     provider.
   - A missing value is never zero. A snapshot is stale after twice the poll
     interval, and its values are hidden after 24 hours without a successful fetch.
5. **Money metrics** (`kind: money`) are first-class: the balance is the value, the
   bar is the share of the configured budget already spent, there is no window or
   reset. A dollar floor for the alerts is not implemented.
6. **Connector tracking and removal.** *Track* off pauses only that connector and
   hides its active card while its credential stays saved. *Disconnect* or *Remove
   key* deletes its credential while retaining metadata. *Remove connector…* also
   prunes its quota/alert state and list entry after confirmed deletion. Other
   connectors remain. Each account, including same-provider accounts, has its own
   runtime and snapshot identity (ADR 0009). Unconnected connectors have no live
   quota card; paused connectors appear under Not tracked.

## Connector identity

Provider modules remain reusable per provider type. Each account now has its own
connector ID for the scheduler, normalized snapshots, disk cache, status,
tracking, and preference targets. Provider IDs continue to select client
configuration and endpoint allowlists. Legacy default IDs preserve existing
credential locations; added accounts use a separate keyring namespace. See
[ADR 0009](0009-adding-providers.md#connector-identity-and-accounts).

## Scheduler and cache

Implemented in `lib/core/scheduler.js`, `lib/core/contract.js` and
`lib/core/cache.js`.

- Polling every 5 minutes with jitter, all I/O asynchronous. One fetch at a time per
  provider, with a 30 s timeout. A fetch receives a context with `isCancelled()`,
  true once the scheduler gave up on it (timeout, provider removed).
- An interval below 5 s is raised; a missing or invalid one falls back to 5 min.
- Backoff on failure doubles from 30 s (30 s, 1 min, 2 min, and so on), capped at 1 h.
  Ordinary backoff has ±10% jitter. A finite server retry hint is bounded to
  0–1 h and acts as a floor after jitter; jitter never exceeds the 1 h cap.
  Every failure snapshot records
  `nextRetryAt`, so the UI can say when the next attempt happens.
- `auth_required` pauses the provider. A manual refresh, `credentialsChanged` or a
  successful fetch resumes it; new credentials during a fetch in flight cause one
  more fetch.
- A reply whose every metric is unusable is a `parse_error` and keeps the last good
  data. Error messages are redacted (URLs, token-like strings) before they are kept.
- The cache (`~/.cache/gnome-ai-quota/snapshots.json`, mode 0600) is capped at
  256 KiB, 32 snapshots, 16 metrics each and 64 characters per text. It is written
  back only after it was read, so stopping during the load cannot wipe it.

## Consequences

- No behavior depends on another tool renewing its token.
- The user logs in once per provider inside the extension.
- Provider modules are independent, so a broken endpoint affects one card.
- The extension cannot show data for a provider the user has not connected.
