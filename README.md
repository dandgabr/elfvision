# gnome-ai-quota

A GNOME Shell extension that shows the remaining quota of your AI providers
in the top bar and in a popup, in the spirit of the *System Monitor* extension.

> **Status:** milestone M0 (skeleton). The bar and the popup render demo data
> only; no provider is connected yet. The decisions are recorded in
> [`docs/`](docs/README.md) and the workflow in [`docs/development.md`](docs/development.md).

## What it does

- Top-bar items with a mini progress bar for up to five providers, chosen by you
  or picked automatically (the worst cases).
- A collapsible popup with one card per provider: usage windows (5 hours,
  week, month), reset times, pacing, and money-based balances (for example
  prepaid API credit).
- Configurable notifications (default at 95%) per quota kind: session,
  weekly, monthly, credits.
- 20 visual themes, each with a light and a dark variant that follows the
  system. The default theme follows GNOME.
- English and Brazilian Portuguese, through gettext.

## Providers

| Provider | Authentication managed by the extension | Quota shape |
|---|---|---|
| Command Code | API key | 5-hour and weekly windows, monthly credits |
| Codex | OAuth 2 (PKCE) | primary and secondary windows, credits |
| Claude | OAuth 2 (PKCE) | 5-hour and weekly windows |
| Antigravity | OAuth 2 (Google, PKCE) | pools (Gemini, Claude and GPT) with 5-hour and weekly windows |

Each provider is an isolated module with its own authentication and response
parsing. Money-based providers (for example OpenRouter) are supported by the
data model as a `money` metric.

The extension never reads or modifies the files, tokens or settings of any AI
harness (Claude Code, Codex CLI and others). Credentials live in the extension's
own login, stored in the desktop keyring (libsecret).

## Important notice

Some providers restrict the use of their subscription OAuth clients to their
own products. The Claude, Codex and Antigravity modules authenticate with the
public client id of the respective CLI and may violate those terms. This project is
for **personal use** and is **not published to extensions.gnome.org**. Read
[`docs/adr/0003-security-model.md`](docs/adr/0003-security-model.md) before using it.

## Stack

- GJS (ES modules), St/Clutter for the panel and popup, GTK 4 and libadwaita
  only for the preferences window.
- No build step, no Rust. Tested target: GNOME Shell 50.

## Repository conventions

- **English everywhere** in the repository: code, identifiers, comments,
  documentation, commit messages, issue and pull request text, and the source
  strings (gettext `msgid`) of the user interface. Brazilian Portuguese lives only
  in `po/pt_BR.po`.
- Never commit secrets. See [`.gitignore`](.gitignore) and
  [`docs/adr/0003-security-model.md`](docs/adr/0003-security-model.md).

## Documentation

See [`docs/README.md`](docs/README.md) for the architecture decision records.

## License

AGPL-3.0, see [`LICENSE`](LICENSE).
