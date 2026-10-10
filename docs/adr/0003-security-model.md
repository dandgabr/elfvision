# 0003. Security model and terms-of-service risk

Status: accepted and implemented (M2 and M3). The notifications and alerts of M4 follow the
same rules (ADR 0010): fixed translated notification templates and a private state
file. Popup cards may show bounded, validated provider plan names; notifications
exclude plans and other provider-supplied text. CI repeats the secret scan and adds static analysis (see the development guide).

## Context

The extension handles OAuth tokens and API keys for several providers and runs
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
  of each provider's CLI. This carries a terms-of-service risk, including account
  suspension. Each such module is flagged `tosRisk`, is opt-in and shows a warning
  on first connection. Using another application's client id or User-Agent
  identifies the extension as that application; this is accepted for personal use
  and documented here.
- **Secrets are stored in libsecret** (`gi://Secret`) under a dedicated schema with
  the attributes `provider` and `kind` (`api-key` or `oauth-token`) for legacy
  default connectors. Additional connectors use a separate schema with exact
  `provider`, `connector`, and `kind` attributes (ADR 0009). Secret values never go into
  GSettings, files or logs. The shell never asks the user to unlock the keyring: a locked or
  missing one is a failure with the reason `keyring`, reported as a network-type state so that
  polling resumes by itself once the keyring is unlocked. There is no plaintext fallback.
- **OAuth login runs in the preferences process** (`prefs.js`), not in the shell,
  through a temporary loopback `Soup.Server` bound to `127.0.0.1`: single use,
  about 300 seconds, exact path check. The extension only reads and refreshes
  tokens.
- **PKCE** uses a 32-byte verifier from `/dev/urandom` (never `Math.random`), the
  `S256` method through `GLib.Checksum`, and a validated random `state`. The redirect
  port is whatever the borrowed client id allows. A provider that offers device flow
  uses it instead.
- **Refresh** is single-flight per connector. The new refresh token is stored before
  it is used, because tokens rotate. Terminal credential refusals become
  `auth_required`; transient network failures use bounded backoff.
- **Network.** Requests use HTTPS only, with a host allowlist per module, no cross-host redirects, timeouts
  and response size limits. Polling runs at 5 minutes or slower, with jitter. Headers and bodies are
  never logged, and tokens are redacted in errors.
- **Parsing.** `JSON.parse` runs inside a try block, types and ranges are validated, values are clamped
  to 0 to 100 and unknown fields are ignored.
- **Secrets stay out of the repository.** Client ids, secrets and User-Agent strings
  live in `~/.config/gnome-ai-quota/providers.local.json` (mode 0600), loaded at
  runtime. The repository carries only a `providers.example.json` with placeholders.
  `.gitignore` excludes `*.local.json`, `providers.json`,
  `credentials*.json`, `auth.json`, `.env` files, `*.pem`, `*.key` and `secrets/`.
  A pre-commit hook runs `tools/check-secrets.py` (credential formats, the hashes of known
  client ids in `tests/known-ids.sha256`, every value of the local file), which needs only git
  and Python and always runs, and gitleaks too when it is installed (`.gitleaks.toml`). Tests
  plant secrets and check that the pre-commit hook and gitleaks both find them. CI repeats the secret
  scan over the whole history and adds static analysis (CodeQL, bandit, Semgrep, ShellCheck, zizmor).

## Consequences

- The README states the notice and each risky module warns the user.
- Anyone forking the project makes their own decision about these terms.
- The keyring is readable by any process in the user's session. This limit is
  accepted.

## Amendment: consented harness credential reads (2026-10-10)

The default still uses extension-owned credentials. A separate per-connector
choice permits read-only use of an exact local-tool source listed in ADR 0002.
Before switching, Preferences names the source and destination provider host and
explains that the credential is borrowed transiently and the owning tool must
renew it. There is no directory scan, environment scan or keyring enumeration.
The extension never writes, rotates, revokes or deletes an external credential.
Missing, locked, ambiguous or rejected sources do not fall back to a different
credential mode. API requests continue to use the provider's existing HTTPS host
allowlist and redaction rules.
