# Elfvision v0.2.3 — GNOME build

Fixes suggested-font installation and verification. Preferences now show which
fonts each built-in theme can use and whether the files are visible to
Fontconfig and the running GNOME Shell. Repeating the install retries the cache
refresh and verification, and the progress messages identify which check needs
attention.

The installer covers the font families used by built-in themes, verifies the
downloaded files against pinned hashes, and includes their OFL licenses. Theme
monospace settings are applied to technical accents. Cancelling the Shell check
does not remove files that have already been installed.

Install `elfvision-gnome.shell-extension.zip` with
`gnome-extensions install --force`. Existing connectors, credentials, settings
and custom themes are preserved. Log out and back in to load the new extension
code on Wayland.
