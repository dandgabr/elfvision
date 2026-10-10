# Elfvision v0.2.4 — GNOME build

OAuth setup can now search for the selected provider's client configuration
from Preferences. The existing manual command remains available.

Connectors with a verified local source can optionally read credentials from a
supported tool for quota checks. This mode is separate from Elfvision's own
credential management, which remains the default. Borrowed credentials are
read-only; their source tool remains responsible for renewing them. The setup
assistant and connector settings explain the consent, source and recovery path.

Install `elfvision-gnome.shell-extension.zip` with
`gnome-extensions install --force`. Existing connectors, credentials, settings
and custom themes are preserved. Log out and back in to load the new extension
code on Wayland.
