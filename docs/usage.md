# Usage and settings

Reference for the installed extension. For installation and account setup, start with
[Getting started](../README.md#getting-started).

## Reading the top bar

Each item represents one connector. It shows the provider icon, the highest used
percentage among that connector's
quota windows, a window suffix (`5h`, `W` or `M`) and a small progress bar. Hover for
the state and time until reset. Color has a matching symbol:

| Mark | Meaning |
|---|---|
| `▲` | Warning: at least 80% used by default |
| `!` in a bordered pill | Critical: at least 95% used by default |
| `~` | Data is stale |
| `⚠` | Fetch or account problem |

Click the indicator to see a separate card for each connected account. The
provider name and local connector label distinguish accounts; quotas are never
combined. Each card shows the available plan,
state, usage windows, progress bars and reset times. The pacing tick marks the usage
expected at an even rate across the window; it is a guide, not a prediction.

The bar prioritizes providers that need attention. The popup lists providers that
could not fit under **Hidden from the bar**, and paused providers under **Not
tracked** with a Resume action. Use **?** for the indicator legend, **Refresh** to
request fresh data and **Preferences** to change settings.

## Settings

Open them from the popup (Preferences) or with `gnome-extensions prefs gnome-ai-quota@dandgabr.github.io`.

For a new live-data user with no accounts, Preferences opens a setup assistant once:
Welcome, Providers, Connect, Top bar, Notifications and a summary. Every provider is optional;
choosing one never connects it. Skip, Escape or closing dismisses setup. General → Set up again
reopens it. Restore defaults clears setup dismissal so setup becomes available again. Existing accounts, demo mode and a
request to show a particular account do not trigger setup. A keyring that cannot be checked does
not count as an empty account list.

When OAuth client ids are missing, setup shows and copies one command for the selected providers.
Run it yourself in a terminal; the installed package includes the helper. The assistant never runs
it, starts a sign-in or accepts terms for you. Only an explicit Connect action does that.

| Page and group | Option | What it does |
|---|---|---|
| Accounts | Add connector… | Choose a provider and a local name. Several connectors may use the same provider; creation does not sign in. |
| Accounts, each connector | Configure | Opens the editor to rename, save a Command Code key, or connect with OAuth. Check configuration again retries loading public OAuth configuration. |
| Accounts, each connector | Remove connector… | After confirmation, removes only this connector, its local credential, and its quota/alert data. Other connectors stay saved. A failure keeps the row available for retry. |
| Accounts, recovery | Recover list… | Appears when the connector list is invalid. After confirmation, rebuilds metadata from saved credential identities without reading or deleting secret values. Local names may need to be entered again. |
| Accounts, Demo connectors | Simulate connect / disconnect | Changes a fictional account's state without a provider request, browser, or keyring. Add and remove use the separate demo connector list. |
| Accounts, each connector | Track | When off, stops fetching and hides only this connector from the bar and active popup cards. Its credential stays saved. |
| Accounts, Local account data | Disconnect all accounts… | After confirmation, removes extension credentials, live quota snapshots and alert history. Settings, themes, fonts and terms stay saved. Cancel is the default; provider sessions are not revoked. |
| General, Top bar | Position | Puts the items in the left, center or right box of the panel. Default: right. |
| General, Top bar | Providers on the bar | Shows up to this many connector items, from 1 to 5, prioritizing those that need attention. Two accounts with the same provider take two slots. Default: 3. |
| General, Top bar | Compact mode | Automatic shrinks the bar only when space runs out; always compact drops the `%` and the suffix; never compact hides providers instead. |
| General, Colors and theme | Light or dark | Follows the system, or forces light or dark for the popup. The top bar is always dark. |
| General, Colors and theme | Theme | Opens the theme picker. Default: System (GNOME). |
| General, Colors and theme | Your themes | Opens the folder for your own themes. |
| General, Suggested fonts | Install suggested fonts… | Reviews four licensed Poppins, Inter, and JetBrains Mono files before an optional download. Cancel is the default; theme selection never installs fonts. |
| General, Colors and theme | Effects | Off stops motion and textures while preserving the selected material. Subtle allows short interactions; Full permits compatible ambient motion. Default: Subtle. System animation settings take precedence. |
| General, Colors and theme | Transparency | Allows transparent backgrounds. Off keeps reading surfaces and backgrounds opaque. Default: on. |
| General, Colors and theme | Material | Follows the theme or selects opaque, translucent, decorative glass, or frost for any built-in theme. Transparency must be on for a transparent material. Default: follow the theme. |
| General, Popup | Clock | Follows the GNOME clock setting, or forces 12 or 24 hours for reset times. |
| General, Popup | Time until reset | Writes the countdown as `1h 20min` or `1h20`. |
| General, Popup | Open cards that need attention | Opens cards in a warning, critical or error state on their own. A card you open or close by hand keeps that choice until its state changes. |
| General, Advanced | Data source, Demo scenario | Switches to made-up providers (`steady`, `flaky` or `drift`) so every state can be seen without an account. The popup says when the data is made up. |
| General, last group | Set up again | Reopens the optional setup assistant. Restore defaults clears setup dismissal; saved connectors remain. |
| General, last group | About | Shows the version, the license, and the links. |
| General or Accounts | Restore defaults / Restore default settings | Resets appearance, bar, popup, notifications, tracking, and setup dismissal. All connectors are tracked again. Connectors, credentials, terms, and the selected data source stay saved. |
| Notifications | Send notifications | Is the master switch. It also silences the connection alert. Off leaves the bar and the popup as they are. |
| Notifications | Send a test notification | Sends one notification that says it is a test, to check the banner and Do Not Disturb. |
| Notifications, Quotas | 5-hour, weekly, monthly, credits | Each kind has a critical threshold (default 95%) and an optional earlier warning (default 80%, off). Warning must be lower than critical. |
| Notifications, Connection | Notify about connection problems | Notifies once when an account is rejected or its data stops arriving. Never for a provider you stopped tracking. |

## Notifications

The extension sends a system notification when a quota reaches its threshold (95% by default, set
separately for the 5-hour, weekly, monthly and credit quotas) and when an account is rejected or its
data stops arriving. The rules keep it quiet:

- Each enabled warning/critical level notifies once on crossing. A jump over both sends only critical; a later critical crossing can follow a warning. Each level rearms after usage falls 3 points below its threshold or the quota resets. Existing high values, migrated records and configuration changes establish a quiet baseline. Warning notices are opt-in; existing critical thresholds and notification choices are preserved.
- At most three quota notifications are sent an hour. The rest become one "several quotas need
  attention".
- A rejected sign-in notifies after ten minutes. Missing data notifies after at least fifteen minutes
  and three poll intervals. Each problem notifies once, and never for a provider you stopped tracking
  or for a locked keyring. After the computer wakes up, the connection alert stays quiet for 90 seconds.
- The text is fixed and translated: the trusted provider name, the window, the percentage, and the time to
  reset. It omits local connector labels, account identities, plans, and errors.
  Crossing/outage state is independent per connector; a notification action opens
  that connector's account or the popup.
- Do Not Disturb holds the banner, and the notification waits in the list. The **Send a test
  notification** button on the Notifications page lets you check this.

## Lock screen and suspend

GNOME disables the extension while the screen is locked. Notifications do not arrive
then, and an unread extension notification can disappear when you unlock. A quota
that crossed its threshold while locked is checked after unlocking. The indicator
and popup continue to show the current state. Connection alerts wait 90 seconds
after resume to allow networking to recover.

## Reset preferences or remove accounts

**General → Restore defaults** or **Accounts → Restore default settings** resets
appearance, panel, popup, notifications, tracking, and setup dismissal after
confirmation. All connectors are tracked again; setup becomes available. The
connector list, credentials, terms acknowledgements, public client configuration,
custom themes, fonts, selected data source, and demo scenario stay saved. Demo
mode remains Demo.

**Remove connector…** in an editor deletes only that connector's local credential,
quota snapshots, and alert history, then removes its list entry. Other connectors, including
accounts using the same provider, stay saved. Cancel is the default.
A partial failure keeps the row and offers a retry. Retry that exact connector
before attempting another individual removal. While removal is unfinished, the
provider-wide safety block also prevents account changes for other connectors
using that provider; their credentials stay saved. An explicitly confirmed
**Disconnect all accounts…** can resolve the unfinished removal by deleting all
extension credentials. Provider access can remain valid after local deletion.

**Accounts → Disconnect all accounts…** removes credentials across both of this
extension's keyring namespaces, including entries whose connector metadata is
missing, plus quota snapshots, alert history, and account status. Settings,
connector metadata, tracking choices, terms, client configuration, themes, and
fonts stay saved. This operation does not revoke remote sessions or API keys.
Failed removals remain blocked until a retry succeeds; successfully disconnected
accounts can reconnect.

An editor's **Disconnect** or **Remove key** clears its saved credential while
keeping the connector available to configure again. OAuth disconnect may attempt
remote token revocation where supported; use the provider's own account settings
to manage access there. Turning **Track** off pauses that connector without
deleting credentials.

When the connector list is invalid, **Recover list…** asks for confirmation before
rebuilding metadata from saved credential identities. Secret values are not read
or deleted. Connector names and usernames may need to be entered again. In Demo,
recovery rebuilds only fictional connector metadata.

## Local folders

The paths below assume the default XDG directories. Custom `XDG_CONFIG_HOME` and
`XDG_DATA_HOME` values change their corresponding locations.

| Content | Default location |
|---|---|
| Public OAuth client configuration | `~/.config/gnome-ai-quota/providers.local.json` |
| Custom themes | `~/.local/share/gnome-ai-quota/themes/<id>/theme.json` |
| Installed client-ID helper | `~/.local/share/gnome-shell/extensions/gnome-ai-quota@dandgabr.github.io/tools/import-client-ids.py` |

API keys and OAuth tokens live in the desktop keyring. There is no plaintext fallback.
