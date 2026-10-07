# 0009. How providers are added (M3)

Status: accepted for M3. Open points are listed at the end and need a real call
or a decision from the owner before the code that depends on them.

## Context

M2 added the first real provider, Command Code, with an API key. M3 adds Codex,
Claude and Antigravity, which sign in with OAuth 2 and PKCE. Command Code's
Accounts page is the template the other three copy, so the structure is decided
once, here, after a review by UI, UX, frontend and security consultants.

## Decisions

### Module shape and registry

- `lib/providers/registry.js` is pure JavaScript (no `gi://`) and lists every
  provider in its fixed display order: Command Code, Codex, Claude, Antigravity.
  Each entry has `id`, `name`, `authKinds` (`api-key` or `oauth-pkce`), the allowed
  hosts for the API and for sign-in, a terms notice, the icon, the poll interval
  and, for OAuth, a pure spec (authorize and token URLs, scopes, extra parameters,
  how to build the token request and read its reply). Client ids are not in the
  registry.
- A provider is a module (`runtime.js`, shell side only) plus a pure parser in
  `lib/core/` and tests. Adding one needs no change to the Accounts page, which is
  generated from the registry.
- The `login()`, `refresh()`, `fetch()` and `logout()` of ADR 0002 map to: the
  sign-in flow (preferences process), the token manager (shell), the runtime
  module (shell) and a credential delete (preferences).
- Import rules, checked by a test that scans the sources: `St`, `Shell`, `Clutter`
  and `resource:///org/gnome/shell` only in `lib/ui/` and `extension.js`; `Gtk` and
  `Adw` only in `prefs.js` and `lib/prefs/`; `lib/core`, the PKCE module and the
  registry import no `gi://` at all.

### Who does what

| Preferences process | Shell process |
|---|---|
| Sign-in: PKCE, loopback server, code exchange | Fetch the usage endpoints |
| Store the first token, delete it on disconnect | Refresh tokens (the only writer) |
| Read `account-status` | Write `account-status` |

### Tokens and the refresh race

- One secret per provider in the keyring, `provider` and `kind=oauth` attributes,
  JSON `{v, gen, access, refresh, expiresAt, scope}`, at most 12 KiB. The `id_token` and any
  identity claim are never stored.
- Only the shell refreshes, one refresh at a time per provider. It reads the secret,
  remembers the refresh token it used, calls the token endpoint, reads the secret
  again and writes only if the refresh token and `gen` are unchanged and the provider
  is still connected; otherwise it drops the result (the user signed in again or
  disconnected meanwhile). If the write fails the new pair stays in memory and is
  retried; without a successful write the provider needs reconnecting. The keyring
  has no compare-and-swap, so a window of milliseconds remains, and its worst case is
  one more click on Connect.
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
- Loopback server: bound to `127.0.0.1` only, on the port the client id requires,
  GET on the exact path only, `Host` checked, query at most 2 KiB, closed after the
  first valid callback, after five bad ones, on cancel, on timeout and when the
  preferences window closes. A wrong `state` gets a plain 400 and does not end the
  sign-in. The reply page is static, reflects nothing and carries `no-store`,
  `no-referrer`, `nosniff` and a strict CSP.
- The sign-in times out after 300 seconds (a browser seen for the first time, a password
  manager and a second factor take a while); this replaces the 120 seconds of ADR 0003.
- While it waits, the Accounts page also takes what the user pastes: the whole address the
  browser ended on, or only the code. This covers a browser that cannot reach the local
  server (another sandbox, a closed port, a timeout seen too late). An address carries the
  `state`, which is checked when present; a bare code has none, which is safe because the
  code is only good together with this sign-in's PKCE verifier.
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
placeholders. Without the file or the provider's entry the Connect button is off and
shows the path; the shell reports `auth_required` with the reason `no_config`.

Where the ids come from: a helper the user runs once looks for the client id each
local AI tool uses (the id only, never a token or any credential file's contents) and
writes it to this file; when none is found, the public id of that tool's open-source
client is used; and the file can always be edited to use another. The extension itself
never reads those tools' files while it runs (ADR 0002). The helper arrives with the
OAuth step of each provider.

Keeping client ids out of the repository: a local test searches the repository for
every value of the local file; the gitleaks hook gets rules for the known formats;
and a list of SHA-256 hashes of the known public ids lets a test flag one without the
id being in the repository.

### Accounts page

- One page, a group per provider in the fixed order, no sub-page. Every group has the
  same skeleton: a status row (provider icon, name and plan, the status chip, last
  check), a credential row (key field, or the Connect, Cancel and Disconnect buttons)
  and a "Track in the bar" switch. Command Code keeps its username field and key link.
- States, each with an icon and text, never color alone: not connected, connecting
  (spinner, countdown, Cancel, Copy link), connected, sign-in expired (Reconnect),
  refused or rejected, keyring unavailable (a banner for the whole page).
- Only the plan is shown for a connected account, and for now only in the popup card. The
  "connecting" state lives in the preferences process, so the popup cannot show it. An email, even masked, is not read
  from the token, stored or shown.
- Terms notice: a permanent line in the group description for the three OAuth
  providers, and a confirmation dialog before the first sign-in of each one (Cancel is
  the default; the acknowledgement is stored per provider).
- Two actions per account: **Stop tracking** (pauses collection, hides the provider,
  keeps the credential, reversible, no confirmation) and **Disconnect** or **Remove
  key** (deletes the credential, with a confirmation). The separate "Remove connector"
  of ADR 0002 is the same as Disconnect and is dropped.

### Bar and popup

- (Confirmed by the owner.) A provider that was never connected is not on the bar or in the popup. With nothing
  connected the bar shows the extension icon and the popup an empty state with an
  Add account button; with providers, a quiet "Add account" line ends the list until
  all are connected.
- A card in a credential state offers a button named for the state (Connect,
  Reconnect, Replace key) that opens the Accounts page on that provider, through a
  `prefs-target` setting written before the window opens. The popup never starts a
  sign-in.
- Credential states in the popup: not connected, connecting, sign-in expired,
  refused or rejected, keyring locked.

### Shell side

- The controller keeps its providers in a map and can add and remove them while
  running; the extension decides the set from the registry, the stored credentials
  and an `untracked-providers` setting, and reacts to `credentials-revision` and to
  a `credentials-touched` setting that names the provider that changed.
- The nested and headless shells use a throwaway keyring (and never talk to the real
  keyring daemon), so a sign-in made there is lost with the window.
- Until the extension has asked the keyring which accounts are connected, an empty list
  means "not known yet": the empty state is not shown, and the cache keeps the values it had.

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

- **Antigravity** (read from the installed program): a Google desktop-app client. Authorize at
  `accounts.google.com/o/oauth2/auth` with `access_type=offline` and `prompt=consent` (without
  them Google gives no refresh token), token and revoke at `oauth2.googleapis.com`, a form
  exchange that carries the client secret Google's desktop clients need (not confidential, and
  kept out of the repository like the id), return address `http://127.0.0.1:<free port>/oauth-callback`,
  only the `cloud-platform` scope. The quota endpoint is a POST of `{}` to
  `daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` with a User-Agent
  that contains `antigravity` (the endpoint checks only that); the extension sends
  `antigravity/1.0 gnome-ai-quota`, or the one in the local file. The reply has two pools, Gemini
  (`gemini-` buckets) and Claude and GPT (`3p-` buckets), each with a five-hour and a weekly
  window. Its terms forbid this use outright and Google may act on the whole Google account, so
  the notice is stronger than the others. The helper picks the id and secret by asking Google's
  token address with a made-up code: `invalid_grant` means they belong together.

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

- Redirect host, port and path each client id accepts.
- Authorization, token and revocation endpoints, scopes, whether a client secret is
  needed, whether the refresh token rotates on every use, the unit of `expires_in`.
- Whether Claude's token endpoint needs the `anthropic-beta` header or a specific
  User-Agent, and whether Antigravity's usage call needs scopes beyond sign-in.
- The current terms of each provider (ADR 0003).
- Whether libsoup limits the request size before the handler runs (to be tested).
