# gnome-ai-quota

A GNOME Shell extension that shows how much of your quota you have used on your AI
providers, in the top bar and in a popup. The idea is the one behind the System
Monitor extension: a glance at the bar tells you whether anything needs attention.

**Bar.** One item per provider, up to five. Each item has a provider icon, the
highest usage percentage among its windows, a window suffix (`5h`, `W`, `M`) and a
3 px bar underneath. A warning (80% and above) adds a `▲`, a critical state (95%
and above) turns the item into a bordered pill with a `!`, and stale or failing
data is marked with `~` or `⚠`, so color is never the only signal. When other
extensions leave little room, the bar first drops the `%` and the suffix, then whole providers,
instead of being clipped. Hovering an item shows a short sentence with its state and the time until the reset.

**Popup.** Click the bar to open one collapsible card per provider. A card shows
the plan, a state pill, the worst usage as a large number and one row per window
with a progress bar, a pacing tick (where an even rate of use would be) and the
reset time. Providers that do not fit on the bar are listed under "Hidden from the
bar", and the ones you paused under "Not tracked", each with a Resume button. The footer shows
when the data was last updated, a **?** button that explains every mark of the bar, a Refresh button
and a Preferences button.

## Status

The project is built in milestones (M0 to M4, see the [Roadmap](#roadmap)); M0 to M4 are done. The [conformance review](docs/temp/reviews/2026-10-07-m4-plan-conformance.md) records the original-plan adaptations and completed audit fixes. Four providers are real: **Command
Code** (an API key pasted on the Accounts page of Preferences) and **Codex**, **Claude** and
**Antigravity** (a sign-in through the browser, started from the same page). A provider you have
not connected is not shown on the bar. An Advanced option switches to demo data (three
scenarios of made-up providers that exercise every state).

The extension is for personal use and is not published to extensions.gnome.org: the three
sign-in providers are reached with another application's OAuth client, which their terms may
not allow (see the architecture decision record [ADR 0003](docs/adr/0003-security-model.md)).

## Providers

| Provider | Authentication |
|---|---|
| Command Code | API key in the keyring |
| Codex | OAuth 2 with Proof Key for Code Exchange (PKCE) |
| Claude | OAuth 2 with PKCE |
| Antigravity | OAuth 2 with PKCE (Google); its terms forbid this use, see First use |

Providers billed by money, such as OpenRouter, fit the same data model as a `money` metric and may
follow these four.

## First use

1. Open Preferences and go to **Accounts**.
2. **Command Code:** paste an API key (the page links to where keys are created).
3. **Codex**, **Claude** and **Antigravity:** from the folder you cloned, run
   `python3 -I tools/import-client-ids.py` (add `codex`, `claude` or `antigravity` to import one provider only). It
   reads only the tools installed on this computer, finds the public client id each one signs in
   with and stores it in `~/.config/gnome-ai-quota/providers.local.json`, private to you. Run it
   again after installing another tool. Then press **Connect** and sign in in the browser. If the
   browser cannot return to this computer, paste the address it ended on (or the code the page shows)
   into the field the page offers.

   **Antigravity's terms forbid this** and Google could suspend your whole Google
   account; the page asks you to confirm before it connects.

Until an account is connected the bar shows only the extension's icon, and the popup says that no
account is connected and has an **Add account** button. The first-use assistant walks through these steps when Preferences opens for the first time.

Notifications are on from the start (see [Notifications](#notifications)); the **Notifications**
page of Preferences changes them.

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

# The throwaway shells have an empty keyring, so no account is connected. To see the bar, the popup
# and the notifications working, start with made-up data (drift climbs toward the limits):
DATA_SOURCE=demo DEMO_SCENARIO=drift tools/nested-shell.sh
```

[docs/development.md](docs/development.md) explains what each one is for.

## Settings

Open them from the popup (Preferences) or with `gnome-extensions prefs`.

For a new live-data user with no accounts, Preferences opens a setup assistant once:
Welcome, Providers, Connect, Top bar, Notifications and a summary. Every provider is optional;
choosing one never connects it. Skip, Escape or closing dismisses setup. General → Set up again
reopens it, and Restore defaults leaves that choice alone. Existing accounts, demo mode and a
request to show a particular account do not trigger setup. A keyring that cannot be checked does
not count as an empty account list.

When OAuth client ids are missing, setup shows and copies one command for the selected providers.
Run it yourself in a terminal; the installed package includes the helper. The assistant never runs
it, starts a sign-in or accepts terms for you. Only an explicit Connect action does that.

| Page and group | Option | What it does |
|---|---|---|
| Accounts, each provider | Status, key or Connect | Shows the key field (Command Code) or Connect, Cancel and Disconnect (the others), with what the last check said. |
| Accounts, each provider | Track | When off, stops fetching and hides the provider from the bar and the popup. Your credentials stay saved. |
| General, Top bar | Position | Puts the items in the left, center or right box of the panel. Default: right. |
| General, Top bar | Providers on the bar | Shows up to this many, 1 to 5, the most critical first. Default: 3. |
| General, Top bar | Compact mode | Automatic shrinks the bar only when space runs out; always compact drops the `%` and the suffix; never compact hides providers instead. |
| General, Colors and theme | Light or dark | Follows the system, or forces light or dark for the popup. The top bar is always dark. |
| General, Colors and theme | Theme | Opens the theme picker. Default: System (GNOME). |
| General, Colors and theme | Your themes | Opens the folder for your own themes. |
| General, Popup | Clock | Follows the GNOME clock setting, or forces 12 or 24 hours for reset times. |
| General, Popup | Time until reset | Writes the countdown as `1h 20min` or `1h20`. |
| General, Popup | Open cards that need attention | Opens cards in a warning, critical or error state on their own. A card you open or close by hand keeps that choice until its state changes. |
| General, Advanced | Data source, Demo scenario | Switches to made-up providers (`steady`, `flaky` or `drift`) so every state can be seen without an account. The popup says when the data is made up. |
| General, last group | Set up again | Reopens the optional setup assistant. Its dismissal is stored in `first-use-done`, which Restore defaults keeps. |
| General, last group | About | Shows the version, the license and the links. |
| General, last group | Restore defaults | After a confirmation, puts the look, the bar, the popup, the theme, the notifications and the data source back to their defaults. Accounts, tracked providers and your terms acknowledgements are never touched. |
| Notifications | Send notifications | Is the master switch. It also silences the connection alert. Off leaves the bar and the popup as they are. |
| Notifications | Send a test notification | Sends one notification that says it is a test, to check the banner and Do Not Disturb. |
| Notifications, Quotas | 5-hour, weekly, monthly, credits | Gives each kind of quota a switch and a threshold (the usage that triggers it; default 95%). |
| Notifications, Connection | Notify about connection problems | Notifies once when an account is rejected or its data stops arriving. Never for a provider you stopped tracking. |

## Notifications

The extension sends a system notification when a quota reaches its threshold (95% by default, set
separately for the 5-hour, weekly, monthly and credit quotas) and when an account is rejected or its
data stops arriving. The rules keep it quiet:

- A quota notifies once when it crosses its threshold. It notifies again only after its usage falls
  3 points below the threshold or the quota resets. A value that was already high when the extension
  started is shown on the bar and in the popup but not announced.
- At most three quota notifications are sent an hour. The rest become one "several quotas need
  attention".
- A rejected sign-in notifies after ten minutes. Missing data notifies after at least fifteen minutes
  and three poll intervals. Each problem notifies once, and never for a provider you stopped tracking
  or for a locked keyring. After the computer wakes up, the connection alert stays quiet for 90 seconds.
- The text is fixed and translated: the provider name, the window, the percentage and the time to
  reset. It never carries an account, a plan or an error message.
- Do Not Disturb holds the banner, and the notification waits in the list. The **Send a test
  notification** button on the Notifications page lets you check this.

## Known limitations

- GNOME turns the extension off while the screen is locked, so no notification is sent then. A
  notification you did not read before locking is gone after unlocking, though the bar and the popup
  still show the state. A quota that crossed its threshold during the lock is announced on the first
  look after unlocking.
- The three sign-in providers are reached with another application's OAuth client, and their terms may
  not allow it (see [Security](#security)).
- The extension is for personal use and is not published to extensions.gnome.org.

## Themes

The extension ships 20 themes, each with a light and a dark variant; the default, System (GNOME),
follows the shell. You can add your own by putting a `theme.json` in
`~/.local/share/gnome-ai-quota/themes/<id>/`. The format, the tokens and the validation rules are in
[docs/themes.md](docs/themes.md).

## Languages

English and Brazilian Portuguese, through gettext. The extension follows the language of the
GNOME Shell session; a language without a translation shows English. There is no language setting. To add a language, see
[docs/development.md](docs/development.md#translations).

## Project layout

The code is split into `lib/core` (pure logic), `lib/providers`, `lib/oauth`, `lib/services`, `lib/prefs` and
`lib/ui`, with the entry points `extension.js` and `prefs.js`. Each directory, and the rules for what may
import what, are in the [development guide](docs/development.md#layout).

## Development and tests

```sh
tools/check.sh      # build, tests, syntax, the extension enabled in a headless shell, ShellCheck,
                    # schemas and translations in one run
tools/sast.sh       # the CI scanners (bandit, Semgrep, ShellCheck, zizmor, gitleaks), run locally
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
| M4 | Notifications and polish | done |

What each milestone holds, and which follow-up items remain, is in [ADR 0008](docs/adr/0008-mvp-roadmap.md).

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
refuses a commit that contains a credential pattern, a known client id or a value from your local
configuration; gitleaks runs as well when installed. GitHub Actions also scan every change
with gitleaks, CodeQL, bandit, Semgrep, ShellCheck and zizmor. `.gitignore` keeps credential files out. The full model, including the terms-of-service risk of
the OAuth providers, is in [ADR 0003](docs/adr/0003-security-model.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).
