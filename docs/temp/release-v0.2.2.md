# Elfvision v0.2.2 — GNOME build

Fix the arrow buttons in Preferences → General → Popup → Connector order and
visibility. Changing order now immediately updates the displayed rows and saved
popup order, including repeated moves and reopening the page. Visibility changes
and connector additions remain synchronized while the page is open.

The page no longer disconnects its settings listeners during GTK's initial
presentation. It releases them when leaving the page or closing Preferences.

Install `elfvision-gnome.shell-extension.zip` with
`gnome-extensions install --force`. Existing connectors, credentials, order,
visibility and settings are preserved. Close and reopen Preferences to load its
updated code; log out and back in to load the whole extension build on Wayland.
