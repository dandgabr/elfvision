# Elfvision v0.3.1 — GNOME build

Antigravity quota parsing compatibility fix.

- Read quota fractions from the current `remaining` oneof response field.
- Continue to support older responses with top-level `remainingFraction`.
- Unknown fraction variants remain unavailable instead of appearing as exhausted quota.

Install `elfvision-gnome.shell-extension.zip` with `gnome-extensions install --force`.
Existing connectors, credentials, settings, installed fonts and custom themes are preserved.
Log out and back in to load the new extension code on Wayland.
