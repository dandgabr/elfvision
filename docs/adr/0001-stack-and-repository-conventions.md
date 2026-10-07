# 0001. Stack (GJS only) and repository conventions

Status: accepted

## Context

The goal is a GNOME Shell panel extension that shows AI quota, in the spirit of the
*System Monitor* extension. Rust with GTK 4 was considered first.

- Extensions run inside the `gnome-shell` process, written in GJS, and draw with
  St/Clutter. GTK 4 cannot draw in the panel; it only appears in the preferences
  window, which runs in a separate process.
- Native libraries loaded into the shell are discouraged and a crash takes the
  whole session down.

## Decision

- **GJS only**, as ES modules, with no build step and no Rust. A Rust daemon over
  D-Bus remains possible later because providers sit behind a data contract
  (see ADR 0002), but it is out of scope.
- Preferences use GTK 4 and libadwaita (`prefs.js`).
- Plain JavaScript with optional JSDoc types (and `@girs` types for the editor).
  TypeScript was rejected for v1 to avoid a build step.
- Target: GNOME Shell 50 (developed on Fedora 44, GNOME Shell 50.5).
- **English everywhere** in the repository: code, identifiers, comments,
  documentation, commit messages, issue and pull request text and the source
  strings (gettext `msgid`) of the interface. Brazilian Portuguese exists only in
  `po/pt_BR.po`. Chat with maintainers may use any language.
- License: AGPL-3.0 (already in the repository).

## Consequences

- No packaging complexity: installing is copying the folder (or a zip).
- The `msgid` strings in code are English; translations are catalog entries.
- Reload cycles use a nested shell (`dbus-run-session gnome-shell --devkit --wayland`).
- The project will not be published to extensions.gnome.org (see ADR 0003), so
  the review rules of that site do not constrain it, though the rules are still
  followed as good practice (clean up in `disable()`, no synchronous I/O).
