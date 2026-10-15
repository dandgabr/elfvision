# Elfvision v0.2.5 — GNOME build

Fixes the suggested fonts flow in Preferences.

- Installed suggested fonts are now recognised: the Fontconfig inventory was
  read from the wrong output stream, so a finished installation looked
  missing and the GNOME Shell was never asked to refresh.
- Font coverage by theme shows every theme name (names containing `&` were
  blank) and the real font for each role instead of "system default".

Install `elfvision-gnome.shell-extension.zip` with
`gnome-extensions install --force`. Existing connectors, credentials, settings,
installed fonts and custom themes are preserved. Log out and back in to load the
new extension code on Wayland.
