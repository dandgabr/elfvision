# Logging and diagnostics

Elfvision writes structured diagnostic lines to the systemd journal. They say **where** and
**why** something failed without recording anything that identifies an account. The design is in
[ADR 0011](adr/0011-logging.md).

## What is never written

Credentials, tokens, authorization codes, addresses (with or without a query), file paths, header
or body contents, error messages from libraries, plan names, connector ids, labels and user names.
A line has an event name and a few typed fields, nothing else.

## Reading the log

```sh
# Everything the extension wrote in the last hour
journalctl --user GLIB_DOMAIN=Elfvision --since -1h -o cat

# One kind of event, with its fields
journalctl --user ELFVISION_EVENT=provider.fetch_failed -o json-pretty -n 20

# Only the preferences window or only the Shell
journalctl --user GLIB_DOMAIN=Elfvision ELFVISION_PROCESS=prefs
```

Each field is a journal field named `ELFVISION_<FIELD>` (`durationMs` is `ELFVISION_DURATION_MS`),
so a query can filter on it, for example `ELFVISION_PROVIDER=codex ELFVISION_CODE=network`.

## Changing the level

```sh
gsettings set org.gnome.shell.extensions.gnome-ai-quota log-level debug   # off|error|warn|info|debug
```

The default is `warn`. `debug` adds every request (host, status, duration, size) and every fetch.
Restoring the configuration keeps this setting. For development the environment variable
`ELFVISION_LOG=debug` overrides it in a process you start yourself (it does not reach a running
Shell).

## Volume

The same failure of the same provider is written once, then counted: the next line after a quiet
minute carries `suppressed`, the number of repeats held back. The systemd journal applies its own
rate limit and retention; deleting connectors does not remove lines already in it, which is why they
hold no account data.

## Events

<!-- events:start -->
| Event | Level | Fields | Meaning |
|---|---|---|---|
| `http.completed` | debug | `host`, `method`, `status`, `durationMs`, `bytes` | An HTTPS request completed |
| `http.failed` | warn | `host`, `method`, `cause`, `durationMs` | An HTTPS request failed before a reply was read |
| `http.rejected` | error | `cause` | A request was refused before it was sent (address or header not allowed) |
| `http.redirect_refused` | warn | `host`, `status` | A redirect was refused |
| `provider.fetch_started` | debug | `provider`, `attempt`, `trigger` | A provider fetch started |
| `provider.fetch_succeeded` | debug | `provider`, `durationMs`, `count` | A provider fetch succeeded |
| `provider.fetch_failed` | warn | `provider`, `code`, `reason`, `failures`, `durationMs`, `delayMs` | A provider fetch failed |
| `provider.paused` | warn | `provider`, `reason` | Polling paused until the user acts |
| `provider.superseded` | debug | `provider` | A fetch result was discarded as out of date |
| `provider.problem` | warn | `provider`, `count` | A provider returned data that was partly unusable |
| `scheduler.unexpected` | error | `provider`, `errorName` | The scheduler hit an unexpected error |
| `scheduler.listener_failed` | error | `errorName` | A snapshot listener threw |
| `keyring.failed` | warn | `op`, `cause` | A keyring operation failed |
| `oauth.refresh_failed` | warn | `provider`, `cause` | A token renewal failed |
| `oauth.loopback_failed` | warn | `cause` | The local sign-in listener failed |
| `oauth.browser_failed` | warn | `provider` | The browser could not be opened |
| `ext.enabled` | info | `count` | The extension was enabled |
| `ext.disabled` | info | – | The extension was disabled |
| `ext.start_failed` | error | `phase`, `errorName` | A part of the extension could not start |
| `ext.rebuild_failed` | error | `phase`, `errorName` | A part of the extension could not be rebuilt |
| `ext.registry_unavailable` | warn | – | The connector registry could not be read |
| `listener.failed` | error | `phase`, `errorName` | A change listener threw |
| `file.failed` | warn | `phase`, `cause` | A local file could not be read or written |
| `theme.rejected` | warn | `cause` | A theme was not usable |
| `fonts.failed` | warn | `step` | A font step failed |
| `alert.failed` | error | `phase`, `errorName` | An alert could not be raised |
| `power.failed` | warn | `phase`, `errorName` | Suspend and resume could not be observed |
| `ui.draw_failed` | error | `phase`, `errorName` | An item could not be drawn |
<!-- events:end -->
