# 0001. Stack (GJS only) and repository conventions

Status: accepted

## Context

A GNOME Shell panel extension runs inside the `gnome-shell` process, is written in
GJS and draws with St and Clutter. GTK 4 cannot draw in the panel; it appears only
in the preferences window, which runs in a separate process. A native library loaded
into the shell is discouraged, and a crash in it takes the whole session down.

## Decision

- **GJS only**, as ES modules, with no JavaScript compilation step.
  `tools/build.sh` compiles schemas and translation catalogs.
- Preferences use GTK 4 and libadwaita (`prefs.js`).
- Plain JavaScript with JSDoc types where they help.
- Target: GNOME Shell 50, developed on Fedora 44.
- **English everywhere** in the repository: code, identifiers, comments,
  documentation, commit messages, issue and pull request text, and the source
  strings (gettext `msgid`) of the interface. Brazilian Portuguese lives only in
  `po/pt_BR.po`.
- CSS classes start with `gaq-`. The extension uuid is
  `gnome-ai-quota@dandgabr.github.io` and user directories use `gnome-ai-quota`.
- License: [AGPL-3.0](../../LICENSE).

## Consequences

- Installing is linking or copying the folder after `tools/build.sh`, which
  compiles the schema and the translations.
- The `msgid` strings in code are English; translations are catalog entries.
- Reload cycles use the nested shell (`tools/nested-shell.sh`).
- The project is not published to extensions.gnome.org (ADR 0003), so the review
  rules of that site do not bind it. They are still followed as good practice:
  clean up in `disable()` and avoid synchronous I/O.
