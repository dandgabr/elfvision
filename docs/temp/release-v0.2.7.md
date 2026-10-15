# Elfvision v0.2.7 — GNOME build

Audit fixes.

- Setup step "Connect accounts" fits a 360 px window again.
- A momentary failure to read `providers.local.json` no longer pauses an OAuth
  provider as "client id missing"; it retries.
- Delete all connectors removes every connector credential of a provider.
- Credential coordination recovers after a failed start.
- Optional spend-limit failures keep the cost already read.
- Preferences: clearer keyring state, safer removal and focus handling.
- Hardening of the sign-in page, request addresses and keyring reads.
- Releases include `build-manifest.json` and `SHA256SUMS` again.

See `CHANGELOG.md`. Install `elfvision-gnome.shell-extension.zip` with
`gnome-extensions install --force`. Existing connectors, credentials, settings,
installed fonts and custom themes are preserved. Log out and back in to load the
new extension code on Wayland.
