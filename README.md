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

Milestones M0, M1 and M2 are done and M3 is under way (see [Roadmap](#roadmap)).
**Command Code** (an API key pasted on the Accounts page of Preferences) and **Codex**
(a sign-in in the browser, started from the same page) are the real providers; Claude
and Antigravity follow. A provider you have not connected is not shown on the bar. An Advanced option switches to demo data (three scenarios of made-up
providers that exercise every state). The extension is for personal use and is not published to
extensions.gnome.org, because three of the planned providers authenticate with
another application's OAuth client, which those providers' terms may not allow (see
[ADR 0003](docs/adr/0003-security-model.md)).

Planned providers:

| Provider | Authentication | Milestone |
|---|---|---|
| Command Code | API key in the keyring | M2 |
| Codex | OAuth 2 with PKCE | M3, available |
| Claude | OAuth 2 with PKCE | M3, available |
| Antigravity | OAuth 2 with PKCE (Google) | M3, available (high risk: see the notice) |

Providers billed by money, such as OpenRouter, fit the same data model as a `money`
metric and come after these four.

## First use

1. Open Preferences and go to **Accounts**.
2. **Command Code:** paste an API key (the page links to where keys are created).
3. **Codex**, **Claude** and **Antigravity:** run `python3 -I tools/import-client-ids.py` once (it finds the public
   client id of each installed tool and stores it in `~/.config/gnome-ai-quota/providers.local.json`, private
   to you), then press **Connect** and sign in in the browser.

Nothing appears on the bar until an account is connected.

## Requirements

- GNOME Shell 50 (developed on Fedora 44).
- To build: `glib-compile-schemas` (glib2 development tools) and `msgfmt` (gettext).
- To run the tests: `gjs`.
- To try it in a window: `mutter-devkit` (`sudo dnf install mutter-devkit`).
- `python3`, used by the helper scripts.

## Install from a clone

```sh
git clone https://github.com/dandgabr/gnome-ai-quota.git
cd gnome-ai-quota
tools/build.sh
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/gnome-ai-quota@dandgabr.github.io
gnome-extensions enable gnome-ai-quota@dandgabr.github.io
```

`tools/build.sh` compiles the GSettings schema and the translations; run it again
after changing `schemas/` or `po/`. On Wayland, a newly linked extension is only
found after you log out and back in. After that, `gnome-extensions enable` works
without a new login, and code changes need one.

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

| Section | Option | What it does |
|---|---|---|
| Top bar | Position | Left, center or right box of the panel. Default: right. |
| Top bar | Providers on the bar | The most providers shown, 1 to 5. Default: 3. |
| Top bar | Compact mode | Automatic (shrink only when space runs out), always compact, or never compact (drop providers, keep `%` and suffix). |
| Appearance | Light or dark | Follow the system, or force light or dark for the popup. The top bar is always dark. |
| Appearance | Theme | Opens the theme picker. Default: System (GNOME). |
| Appearance | Your themes | Opens the folder for your own themes. |
| Popup | Clock | Follow the GNOME clock setting, or force 12 or 24 hours for reset times. |
| Popup | Time until reset | `1h 20min` or `1h20`. |
| Popup | Open cards that need attention | Cards in warning, critical or error state open on their own. A card you open or close by hand keeps that choice until its state changes. |

The `demo-scenario` key has no page in Preferences. Set it with `gsettings`:

```sh
gsettings --schemadir schemas set org.gnome.shell.extensions.gnome-ai-quota demo-scenario flaky
```

`steady` keeps everything healthy, `flaky` cycles through a network error, a rate
limit, a signed-out provider and a bad reply every 15 seconds, and `drift` raises
usage toward the limits every 10 seconds.

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
lib/core/        pure JavaScript: data contract, scheduler, cache format, theme compiler, view models
lib/services/    GLib and Gio glue: timers, cache file, theme files, the quota controller
lib/ui/          St widgets: bar item, meter, provider card, indicator, tooltip
lib/providers/   provider errors and the demo providers
themes/builtin/  the 20 built-in themes
schemas/         GSettings schema
icons/           one symbolic icon per provider
po/              gettext template and translations
tests/           unit tests for lib/core and the theme compiler
tools/           build, translation, theme generation and test-shell scripts
docs/            development guide and architecture decision records
```

## Development and tests

```sh
tools/build.sh
gjs -m tests/run.js
```

[docs/development.md](docs/development.md) covers the architecture rules, adding a
theme, translations and the pitfalls of writing St code. The decisions behind the
design are in [docs/adr](docs/adr/README.md).

## Roadmap

| Milestone | Content | Status |
|---|---|---|
| M0 | Skeleton: panel button, bar, popup with demo cards | done |
| M1 | Data layer (contract, scheduler, cache), themes, appearance settings | done, in PR #1 |
| M2 | Command Code with an API key stored in libsecret | done |
| M3 | OAuth with PKCE in the preferences window: Codex, Claude, Antigravity | done, pending review |
| M4 | Notifications, connection alerts, polish | planned |

Details in [ADR 0008](docs/adr/0008-mvp-roadmap.md).

## Security

The extension does not read or change files, tokens or settings of any AI tool
(Claude Code, Codex CLI and others). It keeps its own credentials. Secrets are stored
in the desktop keyring through libsecret, never in GSettings, files or logs, and there
is no plaintext fallback. The Command Code key is sent only to `api.commandcode.ai`
over HTTPS, without following redirects.

Credentials stay out of the repository: `.gitignore` excludes `*.local.json`,
`providers.json`, `credentials*.json`, `auth.json`, `.env` files, `*.pem`, `*.key`
and a `secrets/` directory. The full model, including the terms-of-service risk of
the OAuth providers, is in [ADR 0003](docs/adr/0003-security-model.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).
