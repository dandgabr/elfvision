# Elfvision v0.2.6 — GNOME build

Completes the suggested fonts flow in Preferences.

- The Suggested fonts row now reports what is already installed for the
  current user when Preferences opens, and offers "Check again".
- Font coverage by theme labels fonts that are not part of the suggested set
  (for example Times New Roman) as system fonts with their generic fallback,
  instead of "missing".

Install `elfvision-gnome.shell-extension.zip` with
`gnome-extensions install --force`. Existing connectors, credentials, settings,
installed fonts and custom themes are preserved. Log out and back in to load the
new extension code on Wayland.
