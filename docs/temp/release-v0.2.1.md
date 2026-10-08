# Elfvision v0.2.1 — GNOME build

The project is now Elfvision, with repository and reporting links at
https://github.com/dandgabr/elfvision. The GNOME extension and its About dialog
display the new product name. Documentation describes the project across Linux
desktop environments, with GNOME Shell 50 available and KDE Plasma / KWin and
other integrations planned. No KDE package is included in this release.

This GNOME build retains its installation UUID, GSettings schema, credential
namespaces and user directories. Install the new ZIP with
`gnome-extensions install --force` to preserve existing connectors, settings and
credentials, then log out and back in to load the code on Wayland.

The build ships as `elfvision-gnome.shell-extension.zip`. Its internal metadata
retains the legacy installation UUID so ordinary updates remain compatible with
existing installations, independent of the public archive's filename.

This build fixes connectors remaining blocked after a new login on the same
boot. It recovers the previous session's coordination automatically while
preserving connectors, credentials, popup order, visibility and other settings.
Incomplete credential operations remain protected rather than being discarded.
Credential coordination requires util-linux's `/usr/bin/flock`.
