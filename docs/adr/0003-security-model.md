# 0003. Security model and terms-of-service risk

Status: accepted

## Context

The extension handles OAuth tokens and API keys for several providers, and runs
inside the GNOME Shell process. Research (web search results, to be re-checked
against primary sources) found:

- Anthropic restricts subscription OAuth to Claude Code and claude.ai; use in other
  products is not permitted. Official third-party access is the Console API key.
- Antigravity's additional terms forbid reaching the service through third-party
  software with Antigravity OAuth, with a risk of account suspension.
- OpenAI announced "Sign in with ChatGPT" for third parties, with a scope for spending
  plan usage on inference; no scope for reading quota was confirmed.
- Command Code authenticates with a long-lived API key from its Studio.

## Decision

- **Personal use only. The project is not published to extensions.gnome.org.**
  The Claude, Codex and Antigravity modules authenticate with the public client id
  of the respective CLI (the same technique used by 9router and omnirouter). This
  carries a terms-of-service risk, including account suspension. Each such module is
  flagged `tosRisk`, is opt-in and shows a warning on first connection.
- **Secrets are stored in libsecret** (`gi://Secret`) with a dedicated schema
  (attributes `provider`, `account`). Nothing goes into GSettings, files or logs.
  If the keyring is locked or missing, the provider becomes `auth_required` with
  the reason; there is never a plaintext fallback.
- **OAuth login runs in the preferences process** (`prefs.js`), not in the shell:
  a temporary loopback `Soup.Server` bound to `127.0.0.1`, single use, about 120
  seconds, exact path check. The extension only reads and refreshes tokens.
- **PKCE** with a 32-byte verifier from `/dev/urandom` (never `Math.random`),
  `S256` through `GLib.Checksum`, and a validated random `state`. The redirect
  port is whatever the borrowed client id allows. Device flow is preferred if a
  provider offers it.
- **Refresh** is single-flight per provider. The new refresh token is stored before
  use (rotating tokens). A refresh error becomes `auth_required`, never a retry loop.
- **Network**: HTTPS only, a host allowlist per module, no cross-host redirects,
  timeouts and response size limits, polling at 5 minutes or slower with jitter,
  no logging of headers or bodies, token redaction in errors.
- **Parsing**: `JSON.parse` in a try block, type and range validation, clamp to
  0 to 100, ignore unknown fields.
- **Secrets stay out of the repository.** `client_id` values, secrets and
  User-Agent strings live in `~/.config/gnome-ai-quota/providers.local.json`
  (mode 0600), loaded at runtime. The repository contains only
  `providers.example.json` with placeholders. A gitleaks (or trufflehog) pre-commit
  hook and a test that fails when a known client id appears in source guard this.
- Spoofing a CLI's client id or User-Agent identifies the extension as another
  application. This is accepted for personal use and documented.

## Consequences

- The README carries a notice and the modules warn the user.
- Anyone forking the project must make their own decision about these terms.
- The local keyring is readable by any process in the user's session; this limit is
  accepted.
