# 0007. Internationalization: English and pt-BR with gettext

Status: accepted. English and pt-BR catalogs exist and every string goes through
gettext. A language override in Preferences and a pseudo-locale check are not
implemented.

## Context

The interface has short strings with plurals, relative times, currency and clock
formats. The repository language is English (ADR 0001).

## Decision

- **Languages:** English and Brazilian Portuguese. Another language needs only
  another `.po` file.
- **Mechanism:** standard GNOME gettext (`Extension.gettext`, `ngettext`,
  `pgettext`), with `.po` compiled to `.mo`. The extension follows the system
  language.
- **Source strings are English** (`msgid`); pt-BR is a catalog entry.
- Rules:
  - no sentence built by concatenation; use placeholders (`"resets in %s"`), because
    word order changes between languages;
  - plurals go through `ngettext`;
  - `pgettext` when one word has several roles ("Week" as a label and in an alert);
  - numbers, currency, weekday and clock go through `Intl` with the active language
    (`US$ 12,40` in pt-BR, `$12.40` in English), respecting the 12 or 24-hour setting;
  - time-unit abbreviations (`d h min`) are the same in both languages;
  - layout does not depend on text length: names are ellipsized, buttons grow, and
    nothing has a fixed width tied to a word;
  - provider names and theme names are not translated.
- Files:

```
po/gnome-ai-quota.pot       catalog generated from the code
po/pt_BR.po                 translation
locale/<lang>/LC_MESSAGES/  compiled .mo files (not committed)
tools/i18n.sh               xgettext, msgmerge and msgfmt
tools/po-fill.py            rebuilds pt_BR.po from the template
```

## Consequences

- The build compiles the `.mo` files (`tools/build.sh`).
- Every user-visible string goes through gettext from the start.
- When strings change, check the layout of any translation more than 25% longer than
  its source.
- Planned: an option in Preferences to force the language, and a script that inflates
  every string by about 40% to find layout overflow.
