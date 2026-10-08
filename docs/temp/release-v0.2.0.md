# Gnome AI Quota v0.2.0

Configure popup width and maximum height, choose which connector cards appear,
and arrange them independently of the top bar. Hiding a card keeps its polling,
notifications and top-bar eligibility active. Real and demonstration accounts have
separate presentation settings.

All built-in theme pairs have reviewed light/dark palettes and style references.
Aurora and Holographic no longer reserve large lateral spaces for card shadows.
The scrollbar has independent clearance. Newspaper and Hand-drawn have stronger
native decoration, with safe local font fallback chains.

Updates preserve connectors, keyring credentials, appearance, presentation and
notification preferences. Install the extension ZIP with `gnome-extensions
install --force`, then log out and back in to load the new code on Wayland.
Do not clear configuration directories or delete connectors to upgrade.

The package targets GNOME Shell 50. Missing fonts use installed fallbacks; font
downloads remain optional and require explicit consent. The Shell renders effects
natively and does not embed a browser or WebGL renderer.

## Delivery sequence

Prepare and verify the package, commit and open the PR. Await Daniel's explicit
confirmation that the PR was merged. Then synchronize main with the remote,
rebuild from the merged commit, publish v0.2.0 with ZIP/checksum/build provenance,
and install that package without clearing account/configuration/state directories.
Verify the installed files separately from the modules loaded in the current
Shell session. Never log out automatically.
