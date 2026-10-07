# Development

## Layout

```
extension.js        entry point (enable and disable)
prefs.js            preferences window (GTK 4, libadwaita)
metadata.json       uuid gnome-ai-quota@dandgabr.github.io, shell 50
stylesheet.css      the default theme (sistema-gnome), classes prefixed gaq-
lib/core/           pure JavaScript: contract helpers, severity, pacing,
                    selection, fitting, formatting, view models, demo fixtures
lib/ui/             St widgets: meter, bar item, provider card, indicator
icons/              symbolic SVG icons, one per provider id
po/                 gettext template and translations
tests/              unit tests for lib/core (no GNOME Shell needed)
schemas/            GSettings schema (position, bar-count, compact-mode)
tools/              build.sh, i18n.sh, headless-shell.sh, gen-themes.py
```

`lib/core` must not import `gi://` or `resource://` modules. Everything the UI
shows is computed there (`viewmodel.js`) and painted by `lib/ui`, so the logic
stays testable under plain `gjs`.

## Build

```sh
tools/build.sh   # compile the GSettings schema and the translations
```

The extension needs `schemas/gschemas.compiled` and `locale/` to run from a
checkout. Neither is committed. Run the build after cloning and after changing
`schemas/` or `po/`.

## Tests

```sh
gjs -m tests/run.js
```

## Running the extension without touching your session

`tools/headless-shell.sh` starts a throwaway headless GNOME Shell on its own
D-Bus session, with an in-memory GSettings backend and a temporary
`XDG_DATA_HOME` that links this checkout as the only user extension. Your real
session, settings and extensions are not touched.

```sh
# Boot, enable the extension, print its state and any shell errors.
tools/headless-shell.sh

# Also evaluate JavaScript inside the shell (org.gnome.Shell.Eval, enabled by
# --unsafe-mode). Scripts run in order, one and a half seconds apart.
tools/headless-shell.sh open-popup.js screenshot.js
```

Useful snippets for the scripts: `Main.panel.statusArea[uuid].menu.open(false)`
opens the popup; a `Shell.Screenshot` call writes a PNG of the virtual monitor;
walking `get_children()` with `get_allocation_box()` and `get_preferred_width(-1)`
prints sizes. Avoid backslashes in these scripts: `gdbus` parses the argument as
a GVariant string.

Set `SKIP_ENABLE=1` to boot without enabling the extension and compare the shell
log against a clean baseline.

## Translations

```sh
tools/i18n.sh extract   # regenerate po/gnome-ai-quota.pot from the code
tools/i18n.sh update    # merge the template into every po/*.po
tools/i18n.sh compile   # build locale/<lang>/LC_MESSAGES/gnome-ai-quota.mo
```

Source strings are English. Every user-visible string goes through
`gettext`, `ngettext` or `pgettext` (see ADR 0007). The compiled `locale/`
directory is not committed.

## Pitfalls found so far

- **Signal names.** `St.BoxLayout` has `child-added` and `child-removed`, not
  `actor-added`; a wrong name makes the extension fail to load.
- **Do not destroy what you need later.** `destroy_all_children()` also destroys
  siblings you keep a reference to (the `+N` badge). Give rebuilt items their own box.
- **Skip measuring detached widgets.** Calling `get_preferred_width()` on a widget
  outside the stage logs St criticals during shell teardown.
- **Classic scrollbars.** `overlay_scrollbars: false` gives the scrollbar its own
  column, so it does not draw over the cards.
- **Negative margins break layout.** A CSS margin that makes the preferred width
  negative wraps to 2^32 in St, giving huge natural widths, allocations such as
  `-12 x 32` and Cogl viewport criticals. Group widgets in a tighter box instead.
- **Percentage widths do not exist in St.** The meter sizes its fill and pacing
  tick from the allocation (`lib/ui/meter.js`).
- **The popup must not close on inner clicks.** The popup content lives in one
  `PopupBaseMenuItem` created with `reactive: false`, `can_focus: false` and
  `activate: false`.
- **Scrolling needs a height limit.** `St.ScrollView` only scrolls when it has a
  `max-height`; it is computed from the monitor height each time the menu opens.
