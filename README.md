# gnome-ai-quota

A GNOME Shell extension that shows how much quota is left on your AI
providers, in the top bar and in a popup. The idea is the one behind the System
Monitor extension: a glance at the bar tells you whether anything needs attention.

**Bar.** One item per provider, up to five. Each item has a provider icon, the
highest usage percentage among its windows, a window suffix (`5h`, `W`, `M`) and a
3 px bar underneath. A warning (80% and above) adds a `▲`, a critical state (95%
and above) turns the item into a bordered pill with a `!`, and stale or failing
data is marked with `~` or `⚠`, so color is never the only signal. When other
extensions leave little room, the bar drops the `%` and the suffix, then providers,
instead of being clipped.

**Popup.** Click the bar to open one collapsible card per provider. A card shows
the plan, a state pill, the worst usage as a large number and one row per window
with a progress bar, a pacing tick (where an even rate of use would be) and the
reset time. Providers that do not fit on the bar are listed under "Hidden from the
bar". The footer shows when the data was last updated, a Refresh button and a
Preferences button.

## Status

Milestones M0 to M3 are done (see [Roadmap](#roadmap)). Four providers are real: **Command
Code** (an API key pasted on the Accounts page of Preferences) and **Codex**, **Claude** and
**Antigravity** (a sign-in in the browser, started from the same page). A provider you have
not connected is not shown on the bar. An Advanced option switches to demo data (three
scenarios of made-up providers that exercise every state).

The extension is for personal use and is not published to extensions.gnome.org: the three
sign-in providers are reached with another application's OAuth client, which their terms may
not allow (see [ADR 0003](docs/adr/0003-security-model.md)).

Planned providers:

| Provider | Authentication | Milestone |
|---|---|---|
| Command Code | API key in the keyring | M2 |
| Codex | OAuth 2 with PKCE | M3, done |
| Claude | OAuth 2 with PKCE | M3, done |
| Antigravity | OAuth 2 with PKCE (Google) | M3, done (high risk: see the notice) |

Providers billed by money, such as OpenRouter, fit the same data model as a `money`
metric and come after these four.

## First use

1. Open Preferences and go to **Accounts**.
2. **Command Code:** paste an API key (the page links to where keys are created).
3. **Codex**, **Claude** and **Antigravity:** from the folder you cloned, run
   `python3 -I tools/import-client-ids.py` (add `codex`, `claude` or `antigravity` to do just one). It
   reads only the tools installed on this computer, finds the public client id each one signs in
   with and stores it in `~/.config/gnome-ai-quota/providers.local.json`, private to you. Run it
   again after installing another tool. Then press **Connect** and sign in in the browser. If the
   browser cannot return to this computer, paste the address it ended on (or the code the page shows)
   into the field the page offers.

   **Antigravity is not allowed by its terms** and Google could suspend your whole Google
   account; the page asks you to confirm before it connects.

Until an account is connected the bar shows only the extension's icon, and the popup says so and
has an **Add account** button.

## Requirements

- GNOME Shell 50 (developed on Fedora 44) and a Secret Service for the keys and sign-ins
  (GNOME Keyring or any other that provides `org.freedesktop.secrets`).
- To build: `glib-compile-schemas` and `msgfmt`
  (`sudo dnf install glib2-devel gettext`), and `python3`.
- To run the tests: `gjs`; `shellcheck` is used by `tools/check.sh` when installed.
- To try it in a window: `mutter-devkit` (`sudo dnf install mutter-devkit`).

## Install

There is no release package yet: install from a clone, as a package built from it or as a link.

```sh
git clone https://github.com/dandgabr/gnome-ai-quota.git
cd gnome-ai-quota
tools/pack.sh                                   # builds dist/gnome-ai-quota@dandgabr.github.io.shell-extension.zip
gnome-extensions install --force dist/gnome-ai-quota@dandgabr.github.io.shell-extension.zip
```

Then **log out and back in**: on Wayland the shell only finds a newly installed extension at
login. After that, `gnome-extensions enable gnome-ai-quota@dandgabr.github.io` turns it on.
Installing a new build also needs a new login.

To work on the code, link the folder instead of installing a package:

```sh
tools/build.sh                                   # compiles the schema and the translations
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/gnome-ai-quota@dandgabr.github.io
```

`tools/build.sh` must run again after changing `schemas/` or `po/`.

## Try it without touching your session

Both scripts start a throwaway GNOME Shell with its own D-Bus session, temporary
settings and a temporary data directory, and enable this checkout in it.

```sh
tools/nested-shell.sh          # a shell in a window on your desktop
tools/nested-shell.sh prefs    # the same, with the preferences window open
tools/headless-shell.sh        # no window: boot, print the extension state and shell errors
```

[docs/development.md](docs/development.md) explains what each one is for.

## Settings

Open them from the popup (Preferences) or with `gnome-extensions prefs`.

| Page and group | Option | What it does |
|---|---|---|
| Accounts, each provider | Status, key or Connect | The key field (Command Code) or Connect, Cancel and Disconnect (the others), with what the last check said. |
| Accounts, each provider | Track | Off stops fetching and hides the provider from the bar and the popup. Your credentials stay saved. |
| General, Top bar | Position | Left, center or right box of the panel. Default: right. |
| General, Top bar | Providers on the bar | Up to this many, 1 to 5, most critical first. Default: 3. |
| General, Top bar | Compact mode | Automatic (shrink only when space runs out), always compact, or never compact (hide providers instead). |
| General, Colors and theme | Light or dark | Follow the system, or force light or dark for the popup. The top bar is always dark. |
| General, Colors and theme | Theme | Opens the theme picker. Default: System (GNOME). |
| General, Colors and theme | Your themes | Opens the folder for your own themes. |
| General, Popup | Clock | Follow the GNOME clock setting, or force 12 or 24 hours for reset times. |
| General, Popup | Time until reset | `1h 20min` or `1h20`. |
| General, Popup | Open cards that need attention | Cards in warning, critical or error state open on their own. A card you open or close by hand keeps that choice until its state changes. |
| General, Advanced | Data source, Demo scenario | Demo data shows made-up providers (`steady`, `flaky` or `drift`) so every state can be seen without an account. The popup says when the data is made up. |

## Themes

The extension ships 20 themes, each with a light and a dark variant. The default,
System (GNOME), follows the shell: the popup surface, the GNOME accent color and
the light or dark preference. The others are derived from a gallery of visual
styles and are grouped in the picker (clean and functional, typography and
editorial, surface and materials, and so on).

A theme is a folder with a `theme.json`. Put your own in
`~/.local/share/gnome-ai-quota/themes/<id>/theme.json`; a theme there replaces a
built-in one with the same id. The file lists colors for a `light` and a `dark`
scheme and a few shape and font choices:

```json
{
  "id": "my-theme",
  "name": "My theme",
  "description": "One line for the picker.",
  "schemes": {
    "light": {"bg": "#fafafa", "surface": "#ffffff", "fg": "#1e1e1e", "muted": "#5e5c64",
              "border": "#d5d5da", "accent": "#3584e4", "warn": "#8f5d00", "danger": "#c01c28"},
    "dark":  {"bg": "#2a2a2e", "surface": "#36363a", "fg": "#ffffff", "muted": "#c3c3c8",
              "border": "#56565c", "accent": "#78aeed", "warn": "#f5c211", "danger": "#ff938c"}
  },
  "radius": {"card": 14, "control": 8},
  "border": "hairline",
  "fonts": {"body": "\"Inter\", sans-serif"}
}
```

Colors must be hex values. Invalid themes are listed, with the reason, at the top
of the picker. [ADR 0006](docs/adr/0006-theming.md) lists every token and the
validation rules.

## Languages

English and Brazilian Portuguese, through gettext. The extension follows the
system language. To add a language, see
[docs/development.md](docs/development.md#translations).

## Project layout

```
extension.js     entry point (enable and disable)
prefs.js         preferences window (GTK 4, libadwaita)
metadata.json    uuid, name, supported shell version
lib/core/        pure JavaScript: data contract, scheduler, cache format, errors, parsers of each
                 provider's reply, theme compiler, view models
lib/providers/   the provider registry, one module per provider and the demo providers
lib/oauth/       PKCE, the local server of the sign-in, the sign-in flow, the token manager
lib/services/    GLib, Gio and Soup glue: HTTP, keyring, timers, cache file, theme files, controller
lib/prefs/       the Accounts page and the theme picker text (GTK 4, libadwaita)
lib/ui/          St widgets: bar item, meter, provider card, indicator, tooltip
themes/builtin/  the 20 built-in themes
schemas/         GSettings schema
icons/           one symbolic icon per provider
po/              gettext template and translations
tests/           unit tests that run under gjs, with no GNOME Shell
tools/           build, package, check, translation, theme generation, client id helper, test shells
docs/            development guide and architecture decision records
```

## Development and tests

```sh
tools/check.sh      # tests, script syntax, ShellCheck, schemas and translations in one go
tools/build.sh      # compile the schema and translations
gjs -m tests/run.js # only the tests (add -- <text> to run the ones whose name contains it)
```

[docs/development.md](docs/development.md) covers the architecture rules, adding a
theme, translations and the pitfalls of writing St code. The decisions behind the
design are in [docs/adr](docs/adr/README.md).

## Roadmap

| Milestone | Content | Status |
|---|---|---|
| M0 | Skeleton: panel button, bar, popup with demo cards | done |
| M1 | Data layer (contract, scheduler, cache), themes, appearance settings | done |
| M2 | Command Code with an API key stored in libsecret | done |
| M3 | OAuth with PKCE in the preferences window: Codex, Claude, Antigravity | done |
| M4 | Notifications and connection alerts (done); Restore defaults and About (done); legend, tooltip and "not tracked" section, first-use assistant (planned) | in progress |

Details in [ADR 0008](docs/adr/0008-mvp-roadmap.md).

## Security

While it runs, the extension does not read or change files, tokens or settings of any AI tool
(Claude Code, Codex CLI and others). It keeps its own credentials. The one exception is
`tools/import-client-ids.py`, which you run yourself: it reads the installed program of a tool
only to find the public client id that tool signs in with, never a token. Secrets are stored
in the desktop keyring through libsecret, never in GSettings, files or logs, and there
is no plaintext fallback. The Command Code key is sent only to `api.commandcode.ai`
over HTTPS, without following redirects.

Credentials stay out of the repository. A check that needs only git and Python
(`tools/check-secrets.py`, run by the pre-commit hook: `git config core.hooksPath .githooks`)
refuses a commit with a credential format, a known client id or a value from your local
configuration; gitleaks runs as well when installed. GitHub Actions also scan every change
with gitleaks, CodeQL, bandit, Semgrep, ShellCheck and zizmor. `.gitignore` excludes `*.local.json`,
`providers.json`, `credentials*.json`, `auth.json`, `.env` files, `*.pem`, `*.key`
and a `secrets/` directory. The full model, including the terms-of-service risk of
the OAuth providers, is in [ADR 0003](docs/adr/0003-security-model.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).
