# 0003. Security model and terms-of-service risk

Status: accepted. Nothing in this record is implemented yet: the build holds no
credentials. It binds M2 to M4.

## Context

The extension will handle OAuth tokens and API keys for several providers and runs
inside the GNOME Shell process. As of October 2026, from public sources that have to
be re-checked against the providers' current terms before each provider ships:

- Anthropic restricts subscription OAuth to Claude Code and claude.ai. Official
  third-party access is a Console API key.
- Antigravity's additional terms forbid reaching the service through third-party
  software with Antigravity OAuth, with a risk of account suspension.
- OpenAI offers "Sign in with ChatGPT" to third parties with a scope for spending
  plan usage on inference. No scope for reading quota was confirmed.
- Command Code authenticates with a long-lived API key from its Studio.

## Decision

- **Personal use only. The project is not published to extensions.gnome.org.**
  The Claude, Codex and Antigravity modules authenticate with the public client id
  of the respective CLI. This carries a terms-of-service risk, including account
  suspension. Each such module is flagged `tosRisk`, is opt-in and shows a warning
  on first connection. Using another application's client id or User-Agent
  identifies the extension as that application; this is accepted for personal use
  and documented here.
- **Secrets are stored in libsecret** (`gi://Secret`) under a dedicated schema with
  the attributes `provider` and `account`. Nothing goes into GSettings, files or
  logs. If the keyring is locked or missing, the provider becomes `auth_required`
  with the reason; there is no plaintext fallback.
- **OAuth login runs in the preferences process** (`prefs.js`), not in the shell,
  through a temporary loopback `Soup.Server` bound to `127.0.0.1`: single use,
  about 120 seconds, exact path check. The extension only reads and refreshes
  tokens.
- **PKCE** uses a 32-byte verifier from `/dev/urandom` (never `Math.random`), the
  `S256` method through `GLib.Checksum`, and a validated random `state`. The redirect
  port is whatever the borrowed client id allows. A provider that offers device flow
  uses it instead.
- **Refresh** is single-flight per provider. The new refresh token is stored before
  it is used, because tokens rotate. A refresh error becomes `auth_required`, never a
  retry loop.
- **Network.** HTTPS only, a host allowlist per module, no cross-host redirects,
  timeouts and response size limits, polling at 5 minutes or slower with jitter, no
  logging of headers or bodies, token redaction in errors.
- **Parsing.** `JSON.parse` inside a try block, type and range validation, values
  clamped to 0 to 100, unknown fields ignored.
- **Secrets stay out of the repository.** Client ids, secrets and User-Agent strings
  live in `~/.config/gnome-ai-quota/providers.local.json` (mode 0600), loaded at
  runtime. The repository carries only a `providers.example.json` with placeholders.
  `.gitignore` already excludes `*.local.json`, `providers.json`,
  `credentials*.json`, `auth.json`, `.env` files, `*.pem`, `*.key` and `secrets/`.
  A gitleaks pre-commit hook and a test that fails when a known client id appears in
  source will back this up. Neither exists yet, nor does `providers.example.json`.

## Consequences

- The README states the notice and each risky module warns the user.
- Anyone forking the project makes their own decision about these terms.
- The keyring is readable by any process in the user's session. This limit is
  accepted.
