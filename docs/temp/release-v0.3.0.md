# Elfvision v0.3.0 — GNOME build

Structured diagnostic logging.

- The extension writes diagnostic lines to the systemd journal: every HTTP request, provider
  fetch and failure, keyring failure, sign-in failure and extension lifecycle step. Lines come
  from a closed catalog of typed fields and never hold credentials, addresses, file paths, error
  messages or account names.
- Read them with `journalctl --user GLIB_DOMAIN=Elfvision --since -1h -o cat` or filter by
  `ELFVISION_EVENT`. See `docs/logging.md`.
- New `log-level` setting (default `warn`; `gsettings set
  org.gnome.shell.extensions.gnome-ai-quota log-level debug`). It is kept by Restore configuration.
- The same failure repeats at most once a minute, then is counted.

Install `elfvision-gnome.shell-extension.zip` with `gnome-extensions install --force`.
Existing connectors, credentials, settings, installed fonts and custom themes are preserved.
Log out and back in to load the new extension code on Wayland.
