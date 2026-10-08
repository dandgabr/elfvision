# Elfvision

Elfvision monitors AI provider quotas, reset times and API spending from your
Linux desktop. Keep separate connectors for personal and work accounts, check
usage and balances, and receive alerts without opening each provider's website.

The current build integrates with **GNOME Shell 50** through a native extension.
Elfvision is expanding to other desktop environments and window managers,
including **KDE Plasma**. The OAuth integrations are unofficial and carry account risks;
read [Provider access and consent](#provider-access-and-consent) before connecting.

## Table of contents

- [How it works](#how-it-works)
- [Desktop integrations](#desktop-integrations)
- [Getting started](#getting-started)
- [Providers](#providers)
- [Features](#features)
- [Configuration](#configuration)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Desktop integrations

| Environment | Status | Package |
|---|---|---|
| GNOME Shell 50 | Available | GNOME Shell extension ZIP |
| KDE Plasma / KWin | Planned | Integration and package not released yet |
| Other desktop environments and window managers | Planned | Integration and compatibility to be defined |

The instructions and screenshots below describe the GNOME integration.
Features and installation steps for additional integrations will be documented
when their builds are available.

## How it works

Add a connector for each account you want to monitor in Preferences. You can
connect several accounts from the same provider. Each connector has its own
quota card and status; usage and balances are never combined. The top bar shows
the highest quota usage or a monetary amount for each connector. Progress bars
appear only when a limit is known; quota windows carry a short label. Warning, critical, stale and error states have symbols as well as
colors. Hover for the state and time until reset.

Click the indicator to open the popup. Provider cards show usage windows, reset
times, available plan information and a pacing marker for steady usage. The footer
offers a legend, Refresh and Preferences. Providers that cannot fit on the bar stay
accessible in the popup. Local connector names distinguish accounts in the cards.
You can pause one connector without removing its account. Choose the popup's
connector order and visibility separately: hiding a card keeps its polling,
notifications and top-bar eligibility active.

The extension starts without connectors in both Live and Demo mode. The popup's
**Add connector** action opens **Accounts**, without selecting a provider. Preferences opens
an optional setup assistant that guides you through providers, panel display and
notifications. Every provider is optional; selecting one does not sign you in.

## Getting started

### GNOME build requirements

- GNOME Shell **50**; other versions are not declared compatible.
- A desktop Secret Service, such as GNOME Keyring, for API keys and sign-ins.
- `flock` from util-linux (at `/usr/bin/flock`) for safe coordination across login sessions.
- Python 3 for the optional OAuth client-ID helper.
- To build from source: `gnome-extensions`, `glib-compile-schemas`, `msgfmt`, Python
  3 and the `zip`/`unzip` commands. On Fedora, the schema and translation tools are
  provided by `glib2-devel` and `gettext`.

### Install the GNOME release ZIP

The installable file is named
`elfvision-gnome.shell-extension.zip`. Download it and
`SHA256SUMS` from the [releases page](https://github.com/dandgabr/elfvision/releases).
The release also includes a build manifest identifying the source commit.
There is no extensions.gnome.org listing. From the download folder, verify and
install the archive:

```sh
sha256sum --check SHA256SUMS
gnome-extensions install --force elfvision-gnome.shell-extension.zip
```

The GNOME integration retains its original installation ID despite the rename
to Elfvision, so updates reuse existing connectors, credentials and settings.

**Log out and log back in**, then enable the extension:

```sh
gnome-extensions enable gnome-ai-quota@dandgabr.github.io
gnome-extensions prefs gnome-ai-quota@dandgabr.github.io
```

A new login also loads an updated build. On Wayland, the running shell does not
reload newly installed extension code.

### Update without losing accounts

Install the new release ZIP with the same `gnome-extensions install --force`
command, then log out and back in to load its code. Ordinary updates replace the
extension files and preserve connectors, keyring credentials, preferences,
custom themes and public client configuration. Do not uninstall or delete the
extension's configuration directories to update it. Restore configuration and
Delete all connectors are separate, explicitly confirmed actions.

### Build the GNOME extension from source

From a checkout containing the revision you want to install:

```sh
tools/pack.sh
gnome-extensions install --force dist/elfvision-gnome.shell-extension.zip
```

The pack script compiles schemas and translations, then creates the standard GNOME
extension ZIP in `dist/`. Log out and back in, and run the enable command above.
The default repository branch may differ from the published release;
check the checkout's `metadata.json` for its declared version and shell support.

### Connect accounts

Open **Preferences → Accounts → Add connector…**, choose a provider, and give
the connector a name such as “Codex work”. Creating a connector does not sign you
in. Its editor lets you rename it, configure access, and control tracking. Add
another connector for another account, including an account from the same provider.

For **Command Code**, enter your account name to open the key-management link,
then paste your API key into the key field and save it. The extension stores the
key in the desktop keyring.

For **Codex**, **Claude** or **Antigravity**, first install the corresponding
official client on this computer. Run the packaged helper yourself in a terminal
to import public client configuration from those installed programs:

```sh
python3 -I "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/gnome-ai-quota@dandgabr.github.io/tools/import-client-ids.py"
```

Add `codex`, `claude` or `antigravity` to import one provider only. From a source
checkout, use `python3 -I tools/import-client-ids.py` instead. Run it again after
installing another client. It reads public OAuth client configuration, never the
client's saved account tokens, and writes the extension's own local configuration.

Return to the connector editor, press **Check configuration again** if needed,
then **Connect**, review the provider notice, and sign in
through your browser. If the browser cannot return to this computer, paste the
final callback address or displayed code into the field offered by Preferences.
The setup assistant can copy the helper command; you run it yourself.

## Providers

Available data depends on the provider and account permissions. Subscription
quotas, organization spending and key allowances are separate measurements.
Missing limits never become a made-up percentage or balance.

| Provider | Connection | Data and requirements |
|---|---|---|
| **Command Code** | API key | Five-hour and weekly usage; remaining monthly credits in USD |
| **Codex** | OAuth 2 with PKCE | Subscription rate-limit windows, reset times and plan |
| **Claude** | OAuth 2 with PKCE | Subscription five-hour and seven-day usage |
| **Antigravity** | Google OAuth 2 with PKCE | Gemini and shared Claude/GPT subscription pools |
| **OpenAI API** | Organization Admin API key | Current UTC-month organization costs; configured monthly spending limit when available |
| **Anthropic API** | Organization Admin API key | Current UTC-month organization costs; no assumed balance or limit |
| **Cursor** | Team Admin API key | Team aggregate spending; hourly polling, no personal subscription quota |
| **OpenRouter** | API key | Remaining key allowance, or account credits with a management key; unlimited keys show spending |

The provider selector identifies API keys and OAuth 2 with icons and text.
Gemini and Z.ai are deferred to future versions.
OpenAI and Anthropic administrative keys require organization permissions; ordinary
inference keys cannot access these reports. Cursor requires a team administrator.
See [provider endpoints and limitations](docs/providers.md) for exact APIs and
primary sources. Synthetic tests cover all supported reporting contracts; no
successful real-account round trip has been recorded for these additions.

PKCE means Proof Key for Code Exchange. The subscription integrations create their
own sign-in and do not reuse the official clients' saved sessions.

### Provider access and consent

This is a personal-use project. The three OAuth integrations use another
application's public client configuration and unofficial quota endpoints. A
successful sign-in does not mean the provider permits this access. Preferences
requires an explicit acknowledgement before an OAuth connection starts.

- **Codex:** access may conflict with [OpenAI's Terms of Use](https://openai.com/policies/terms-of-use/),
  including restrictions on automated extraction and bypassing limits. Provider
  permission for this extension is not established.
- **Claude:** [Anthropic's credential-use rules](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)
  prohibit third-party Claude.ai sign-in and collecting or storing subscription
  session tokens. This integration uses that unofficial access; an account may be
  limited or suspended. Acknowledgement does not grant permission.
- **Antigravity:** [its additional terms](https://antigravity.google/terms) prohibit
  third-party tools accessing the service and identify account suspension or
  termination as possible consequences. The extension also warns about risk to
  your wider Google account and requests the Google Cloud scope. Connect only if
  you accept the notice.
- **Command Code:** API-key authentication appears in the [official Provider API
  documentation](https://commandcode.ai/docs/provider). That documentation does
  not certify this extension's quota endpoint.

## Features

- **Panel and popup:** choose left, center or right placement, show one to five
  connector items, and use automatic, always, or never compact mode. Connector cards can
  open automatically when they need attention. Set popup width and maximum
  height in logical pixels, or use automatic sizing; the current monitor limits
  its displayed size. Choose which cards appear and arrange them with accessible
  up/down controls independently of the bar's priority order.
- **Reset times:** follow GNOME's clock setting or choose 12/24-hour time; display
  countdowns as `1h 20min` or `1h20`.
- **Notifications:** critical quota notices are enabled at **95%** by default.
  Earlier warning notices are opt-in, initially **80%**. Configure five-hour,
  weekly, monthly and credit rules separately, with warnings below critical.
  Connection notices and a test notification have their own controls.
- **Themes:** 22 built-in themes, each with light and dark variants. Follow the
  system scheme or choose one explicitly; add your own theme files.
- **Native materials and effects:** every built-in theme lets you choose
  translucency, decorative glass, or frost. Effects Off stops motion
  and textures while preserving the selected material. Turn Transparency off for
  an opaque background. Subtle and Full control motion, with system animation
  settings taking precedence; ambient work stops when the popup closes.
- **Optional fonts:** review an explicit download of four Poppins, Inter and
  JetBrains Mono files. Sources and SHA-256 hashes are pinned, with OFL-1.1 licenses
  included. Choosing a theme never downloads fonts; missing fonts use fallbacks.
- **Demo mode:** try `steady`, `flaky`, and `drift` with fictional quotas. Accounts
  provides a separate demo connector list with simulated connect, disconnect,
  and remove actions. These actions use no browser, keyring, or provider request.
- **Languages:** English and Brazilian Portuguese follow the GNOME session
  language. Other languages fall back to English.

The built-in theme catalog contains System (GNOME), AI-native / Generative UI,
Broadsheet Newspaper, Aurora / Mesh Gradient, Bento Grid, Card-based UI, Cyberpunk
& Tactical HUD, De Stijl, Variable Type & Anti-Hero, Flat Design, Glassmorphism &
Spatial UI, Hand-drawn / Sketch, Holographic Foil, Isometric, Linear SaaS,
Lunarpunk, Mid-century Modern, Nanopunk, Organic / Biophilic, Solarpunk & Biomorphic,
Terminal / TUI and Web Brutalism & Data-Dense.

## Configuration

Open Preferences from the popup or run:

```sh
gnome-extensions prefs gnome-ai-quota@dandgabr.github.io
```

**Accounts** creates, configures, disconnects, and pauses connectors. **General** controls the
panel, popup, themes, fonts and demo data. **Notifications** controls thresholds,
connection notices and the test notification. The [settings
reference](docs/usage.md#settings) describes the available controls;
[local configuration locations](docs/usage.md#local-folders) explains where
preferences, public OAuth client configuration and credentials are stored.

The GNOME UUID, settings schema and local folders retain the `gnome-ai-quota`
name so Elfvision reuses existing settings and accounts. Use the command above
and the documented legacy paths when configuring this GNOME build.

Adding a connector saves its configuration; use **Connect** in its editor to
authenticate (or **Simulate connect** in Demo). If the popup has a saved
connector awaiting connection, open **Accounts** and choose its editor.
Its quota card appears automatically after connecting.

**General → Restore configuration** resets appearance, notifications, tracking, and setup
dismissal. All connectors are tracked again and setup becomes available. Saved
connectors, credentials, terms acknowledgements, client configuration, and the
selected live/demo data source stay saved. Popup dimensions, order and visibility
return to their defaults; ordinary upgrades preserve those choices.

**Remove connector…** removes only the selected connector, its local credential,
and its quota and alert data after confirmation. Other accounts stay saved.
**Accounts → Delete all connectors…** removes every connector in the current
Live or Demo mode after confirmation. Demo deletion includes **Example Credits**
and never accesses live credentials. Live deletion removes this extension's
credentials, quota snapshots and alert history, including orphaned credential
entries. Appearance, themes, fonts and client configuration stay saved. Local
deletion does not revoke an API key on the provider's site. Failed deletions remain
blocked with a retry rather than reporting success.

If the connector list is invalid, **Recover list…** rebuilds it from saved
credential identities after confirmation. Secret values are not read or deleted;
connector names and usernames may need to be entered again.

For custom themes, open **General → Your themes**. The [theme
reference](docs/themes.md) describes the file format.

## Privacy

API keys and OAuth tokens are stored through libsecret in the desktop keyring,
with no plaintext fallback. The extension keeps its own credentials and does not
read or change the official AI clients' sessions. The manually run client-ID
helper reads public OAuth configuration from installed program files. For Codex,
it can also fetch the public source when local discovery fails; for Antigravity,
it checks candidate client pairs with Google's token endpoint using a made-up
authorization code. It never reads the clients' saved account tokens.

Quota requests go to the configured provider hosts over HTTPS. Choosing a theme
does not contact a font server; optional font downloads require a separate action.
Notification text includes the trusted provider name, quota window, percentage,
and reset time; it excludes local connector labels, account identities, plans,
and raw errors.

## Troubleshooting

| Problem | What to check |
|---|---|
| Extension is missing after installation | Confirm GNOME Shell 50, log out and back in, then run the enable command. |
| Only the extension icon appears | Add and connect an account in Accounts. In Demo, use Simulate connect for a fictional connector. |
| Connect asks for client configuration | Install the official client and run the packaged helper, then choose Check configuration again in the connector editor. |
| The browser cannot complete the return | Use the callback address/code field in Preferences. Never put tokens or callback URLs in an issue. |
| Keyring is locked or unavailable | Unlock the desktop keyring and retry. The extension cannot store secrets in ordinary files. |
| Usage is stale or an account is rejected | Refresh; check connectivity and account status in Accounts. Reconnect explicitly if requested. |
| Some providers disappear from the bar | Increase the provider count or use compact mode; open the popup to see hidden providers. |
| Notification banners do not appear | Check the master switch and GNOME Do Not Disturb, then send a test notification. Warnings are opt-in. |
| Motion or transparency is absent | Effects Off stops motion and textures. Select a material and turn Transparency on for glass or translucency; check the system animation setting for motion. |
| A quota field disappears after a provider update | Unofficial endpoints can change. Report the provider and fixed error category without credentials or response bodies. |

GNOME disables extensions while the screen is locked. Quota notices resume after
unlocking; an earlier unread extension notification may disappear. See
[lock screen and suspend](docs/usage.md#lock-screen-and-suspend).

## Contributing

Use the [bug form](https://github.com/dandgabr/elfvision/issues/new?template=bug_report.yml)
for public bug reports and the [private security form](https://github.com/dandgabr/elfvision/security/advisories/new)
for vulnerabilities. Both are accessible in Preferences → General. Review anything
you share; no diagnostics or credentials are attached automatically. See
[SECURITY.md](SECURITY.md) for vulnerability disclosure.

Created by [Daniel G. Araujo](https://github.com/dandgabr). Pull requests are welcome.

The [development guide](docs/development.md#contributing) covers local setup,
checks, isolated shells, themes and translations. The [documentation
index](docs/README.md) links the reference guides.

## License

AGPL-3.0. See [LICENSE](LICENSE). Optional font files retain their bundled
OFL-1.1 licenses.
