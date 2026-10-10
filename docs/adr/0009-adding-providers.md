# 0009. How providers are added (M3)

Status: accepted and implemented (M3). Open points are listed at the end; each needs a real
call or a decision from the owner.

## Context

M2 added the first real provider, Command Code, with an API key. M3 adds Codex,
Claude and Antigravity, which sign in with OAuth 2 and PKCE. Command Code's
Accounts page is the template the other three copy, so the structure is decided
once, here, after a review by UI, UX, frontend and security consultants.

## Decisions

### Module shape and registry

- `lib/core/providerRegistry.js` is pure JavaScript (no `gi://`), re-exported by
  `lib/providers/registry.js`, and lists every
  provider in its fixed display order: Command Code, Codex, Claude, Antigravity.
  Each entry has `id`, `name`, `auth` (`api-key` or `oauth-pkce`), the allowed hosts for
  the API, whether it is `available`, a terms notice and, for OAuth, a pure spec (authorize and token URLs, scopes, extra parameters,
  how to build the token request and read its reply). Client ids are not in the
  registry.
- A provider is a module in `lib/providers/` (shell side) plus a pure parser in `lib/core/`
  and tests; the poll interval and the icon (`icons/<id>-symbolic.svg`) belong to the module
  and to the id. Adding one needs no change to the Accounts page, which is
  generated from the registry.
- The `login()`, `refresh()`, `fetch()` and `logout()` of ADR 0002 map to: the
  sign-in flow (preferences process), the token manager (shell), the runtime
  module (shell) and a credential delete (preferences).
- Import rules, checked by a test that scans the sources: `St`, `Shell`, `Clutter`
  and `resource:///org/gnome/shell` only in `lib/ui/`, `extension.js` and the theme manager
  (`lib/services/themeManager.js`, which loads a stylesheet into the shell's theme); `Gtk` and
  `Adw` only in `prefs.js` and `lib/prefs/`; `lib/core`, the PKCE module and the
  registry import no `gi://` at all.

### Who does what

| Preferences process | Shell process |
|---|---|
| Sign-in: PKCE, loopback server, code exchange | Fetch the usage endpoints |
| Store the first token, delete it on disconnect | Refresh tokens (the only writer) |
| Read `account-status` | Write `account-status` |

### Tokens and the refresh race

- One secret per connector in the keyring. Legacy default IDs use the original
  schema with `provider` and `kind=oauth-token` attributes; additional connectors
  use a separate schema with `provider`, `connector`, and `kind=oauth-token`.
  JSON `{v, gen, access, refresh, expiresAt, scope}`, at most 12 KiB. The `id_token` and any
  identity claim are never stored.
- Only the shell refreshes, one refresh at a time per connector. It reads the secret,
  remembers the refresh token it used, calls the token endpoint, reads the secret
  again and writes only if the refresh token and `gen` are unchanged and the provider
  is still connected; otherwise it drops the result (the user signed in again or
  disconnected meanwhile). If the write fails the new pair stays in memory and is
  retried; without a successful write the connector needs reconnecting. The keyring
  has no native compare-and-swap; the durable provider lease serializes credential
  mutation, and replacement checks the exact connector generation and refresh
  token inside that lease.
- A usage endpoint that refuses even a freshly renewed token (a 401 twice) is not asked to renew
  again at every poll for half an hour: renewing spends a refresh token, and some providers
  rotate them.
- A refresh error may come as `{"error": "..."}` or `{"error": {"code": "..."}}`; Codex adds
  `refresh_token_expired`, `refresh_token_reused` and `refresh_token_invalidated`.
- `invalid_grant`, those codes or a 401 from the refresh become `auth_required` with the reason
  `expired`; there is no retry loop. A network error or a 5xx follows the normal
  backoff and never marks the sign-in as lost. A 403 from the usage endpoint is
  `refused`.
- Disconnect order: read the refresh token, delete the secret, raise the revision, then
  ask the server to revoke it when an endpoint exists (5 s, best effort, never blocking).
  The delete comes first so a late refresh in the shell cannot write the token back: the
  token manager writes a renewed pair only if the keyring still holds the sign-in it started
  from. A renewed pair that cannot be written yet is kept in memory, and dropped if the
  sign-in changed or was deleted meanwhile.

### Sign-in flow

- PKCE: 32 random bytes from `/dev/urandom` (a short read fails the sign-in), a
  43-character verifier, `S256` through `GLib.Checksum`, and a separate 43-character
  `state`, used once. The module is tested with the RFC 7636 appendix B vector.
- Loopback server: bound to `127.0.0.1` and, when the machine has it, `::1` on the same port (a
  `localhost` return address may resolve to either), on the port the client id requires,
  GET on the exact path only, `Host` checked, query at most 2 KiB, closed after the
  first valid callback, after five bad ones, on cancel, on timeout and when the
  preferences window closes. A wrong `state` gets a plain 400 and does not end the
  sign-in. The reply page is static, reflects nothing and carries `no-store`,
  `no-referrer`, `nosniff` and a strict CSP.
- The sign-in times out after 300 seconds (a browser seen for the first time, a password
  manager and a second factor can take a minute or two); this replaces the 120 seconds of ADR 0003.
- While it waits, the Accounts page also takes what the user pastes: the whole address the
  browser ended on, or only the code. This covers a browser that cannot reach the local
  server (another sandbox, a closed port, a timeout seen too late). An address carries the
  `state` (the `code#state` some pages show works too), which is required and checked; a bare
  code has none, which is safe because the code is only good together with this sign-in's PKCE
  verifier. The field appears after twenty seconds, or at once when the browser cannot be opened,
  so it does not confuse a sign-in that is going to finish by itself.
- The browser opens through `Gio.AppInfo.launch_default_for_uri` on a URL built from
  constants. If it does not open, the page offers a Copy link button.
- Token requests need a POST: the HTTP client grows a `request()` next to `get()`,
  with the same limits (allowed hosts, default port, no redirects, size limit, total
  deadline), a 64 KiB reply limit for token endpoints and fixed error texts.

### Local configuration

`~/.config/gnome-ai-quota/providers.local.json`, directory 0700 and file 0600
(refused otherwise, or above 16 KiB), holds per provider the `clientId`, the redirect
port and host, and optionally a `clientSecret` and a `userAgent`. Fields are
validated (printable ASCII, no CR or LF, port 1024 to 65535). Endpoints are in the
code, never in this file. `providers.example.json` in the repository has
placeholders. Shell and preferences read this configuration asynchronously, with
a 16 KiB streaming limit and cancellation after at most 5 seconds for metadata,
open, and read operations. Stream closure is awaited afterward; the 5-second
limit is not a hard deadline for the complete promise. Shell callers share the
read and cache its result for one minute. Without the file or the provider's entry the Connect button is off and
shows the path; the shell reports `auth_required` with the reason `no_config`.

Where the ids come from: the connector's **Find configuration automatically** button
runs the provider-scoped helper, which looks for public client configuration in the
installed program and verified official sources. It never reads a token or account
credential file. The copy-command fallback and manual editing remain available. The
separate opt-in harness mode is governed by the read-only source allowlist in ADR 0002.
The helper is `tools/import-client-ids.py`.

Keeping client ids out of the repository: a local test searches the repository for
every value of the local file; the gitleaks hook gets rules for the known formats;
and a list of SHA-256 hashes of the known public ids lets a test flag one without the
id being in the repository.

### Connector identity and Accounts

The original M3 singleton layout was replaced on 2026-10-08 by the
[accepted connector design](../temp/specs/2026-10-08-connectors-design.md).
Accounts lists connectors grouped by provider and provides **Add connector…**.
The user selects a provider and local label, then configures the new connector in
an editor. Creation does not start authentication. Several connectors can use
the same provider; each has independent credentials, tracking, status, and quotas.

- The nonsecret versioned registry holds `{id, providerId, label, username}`,
  bounded to 32 connectors and 16 KiB. Existing singleton IDs remain provider IDs;
  new IDs use `providerId--UUID`. Labels and usernames are bounded and validated;
  rename keeps the immutable ID. An initialized empty list stays empty.
- Controllers are keyed by connector ID. Setup reuses an existing connector for
  a selected provider or creates one when needed. Public OAuth configuration and
  terms acknowledgements remain provider-scoped. Consent is explicit.
- The editor supports rename, tracking, API-key or OAuth connection, a visible
  **Check configuration again** action, and **Remove connector…**. Removal confirms
  the local account label, deletes only its credential and quota/alert state, then
  removes metadata after success. Failures keep the row available for retry;
  siblings remain. Local deletion does not promise remote logout.
- An invalid registry fails closed. **Recover list…** asks before reconstructing
  metadata from extension credential identities without loading or deleting secret
  values. Labels and usernames may need to be entered again.
- Demo has a separate registry and simulated connect/disconnect/remove controller,
  with explicit fictional-account text. It uses no browser, keyring, provider
  configuration, or network authentication. Live credentials remain separate.
- Disconnect-all clears both extension credential namespaces, including orphan
  connector items missing from the registry, before reporting absence. Metadata,
  client configuration, consent, themes, and fonts remain saved.

### Bar and popup

Each connected connector has its own card, trusted provider name, and sanitized
local label. Quotas and balances are never aggregated across accounts. Order is
provider registry order followed by connector order. The bar still has at most
five items; two accounts using the same provider take two slots. Paused connectors
remain in Not tracked with an exact Resume action.

Add account opens Add connector even when every provider already has an account.
Credential actions write the exact connector ID to `prefs-target` before opening
Preferences; `add` routes to connector creation. The popup never starts sign-in.
Notifications and tooltips keep fixed trusted provider names without local labels;
alert state and notification actions retain the exact connector identity.

### Shell side

The controller map, scheduler, cache, account status, and revision targets use
connector IDs. Provider factories and endpoint/configuration lookup use provider
IDs. Runtime adapters set the connector ID on success and error snapshots.
`untracked-providers` retains its schema name but contains connector IDs.
Credential mutations serialize under the existing provider-wide gate while
addressing only the selected connector. Conditional renewal checks that exact
connector's generation and refresh token.

Until credential discovery completes, an empty live list means unknown rather
than disconnected. Demo constructs fictional runtime providers only for simulated
connected connectors. The nested and headless helpers use private keyrings and
settings; authentication there does not modify the user's normal session.

## Providers added so far

- **Codex** (open-source client): authorize and token on `auth.openai.com`, form code exchange,
  JSON refresh, return address `http://127.0.0.1:1455/auth/callback` (1457 as a fallback), usage
  at `chatgpt.com/backend-api/wham/usage`. A plan without a five-hour window reports only the
  weekly one.
- **Claude** (read from the installed Claude Code program): authorize at
  `claude.com/cai/oauth/authorize`, token at `platform.claude.com/v1/oauth/token` with JSON
  for both the exchange (which also carries the `state`) and the refresh, return address
  `http://localhost:<free port>/callback`, usage at `api.anthropic.com/api/oauth/usage` with the
  header `anthropic-beta: oauth-2025-04-20`. Only the `user:profile` scope is asked; the program
  itself asks more, to run the model.

- **Antigravity** (read from the installed program): a Google desktop-app client. Its `cloud-platform` scope is broad (the refresh token reaches
  the account's Google Cloud data), which the confirmation says. Authorize at
  `accounts.google.com/o/oauth2/auth` with `access_type=offline` and `prompt=consent` (without
  them Google gives no refresh token), token and revoke at `oauth2.googleapis.com`, a form
  exchange that carries the client secret Google's desktop clients need (not confidential, and
  kept out of the repository like the id), return address `http://127.0.0.1:<free port>/oauth-callback`,
  only the `cloud-platform` scope. The quota endpoint is a POST of `{}` to
  `daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` with a User-Agent
  that contains `antigravity` (the endpoint checks only that; the HTTP client sets the User-Agent
  per request, because a session-wide one would override it); the extension sends
  `antigravity/1.0 gnome-ai-quota`, or the one in the local file. The reply has two pools, Gemini
  (`gemini-` buckets) and Claude and GPT (`3p-` buckets), each with a five-hour and a weekly
  window. Its terms forbid this use outright and Google may act on the whole Google account, so
  the notice is stronger than the others. The helper picks the id and secret by asking Google's
  token address with a made-up code: `invalid_grant` means they belong together. Only a single
  such pair is accepted; several would be other Google clients inside the program.

## Implementation order

1. Registry and metadata for Command Code, and the Accounts page generated from it.
2. PKCE, the callback parser and the crypto helpers, with tests.
3. Loopback server, `request()` in the HTTP client and the sign-in flow, with tests.
4. Token manager with a fake clock.
5. Local configuration loader and `providers.example.json`.
6. Dynamic controller, `untracked-providers`, `credentials-touched` and the new reasons.
7. Codex: parser, runtime, sign-in UI.
8. Claude.
9. Antigravity.

## Open points

Only a real call or a primary source settles these, and none is guessed in code:

- Whether Antigravity's quota call works with a smaller scope than `cloud-platform`.
- The revocation request of each provider: the format is the standard one (RFC 7009) and the
  call is best effort.
- The current terms of each provider (ADR 0003).
- Whether libsoup limits the size of a request before the sign-in's local server sees it.

## Amendment: API reporting and deletion actions (2026-10-08)

The live registry now includes OpenAI API, Anthropic API, Cursor and OpenRouter
in addition to the four subscription providers. Exact endpoints, credential
permissions, billing units and limitations have one canonical reference in
[Provider data](../providers.md). Gemini and Z.ai are deferred by explicit user
choice after research did not verify ordinary-key quota/balance endpoints.

Monetary metrics distinguish `kind: spend` with `amount` and optional `limit` from
prepaid `kind: money`. Key allowance uses `basis: allowance` and may have a
day/week/month reset. A missing cap produces no percentage or meter; normalized
cache entries discard arbitrary response fields. Organization costs never imply
subscription quota or prepaid balance.

Accounts now offers Delete all connectors for the current data source. Demo
includes a persistent, removable Example Credits connector; empty lists stay
empty across restarts. Live metadata clears only after credential/cache deletion
succeeds under the durable gate. General alone offers Restore configuration,
preserving connectors and credentials. About adds Daniel G. Araujo's credit/link
and separate public bug and private vulnerability reporting paths.
