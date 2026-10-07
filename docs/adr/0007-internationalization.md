# 0007. Internationalization: English and pt-BR with gettext

Status: accepted

## Context

The interface has short strings with plurals, relative times, currency and clock
formats. The repository language is English (ADR 0001).

## Decision

- **Version 1 languages: English and Brazilian Portuguese (pt-BR).** More languages
  only need an extra `.po` file.
- **Mechanism: the standard GNOME gettext** (`Extension.gettext`, `ngettext`,
  `pgettext`), with `.po` compiled to `.mo`. The extension follows the system
  language and can be forced in Preferences (System, Portuguese (Brazil), English).
- **Source strings are English** (`msgid`); pt-BR is a translation catalog entry.
- Rules:
  - no sentence built by concatenation; use named placeholders
    (`"resets in %s"`), because word order changes between languages;
  - plurals through `ngettext` (`"%d hidden"` and `"%d hidden"` forms);
  - `pgettext` when one word has several roles ("Week" label versus "Week" in an alert);
  - numbers, currency, weekday and clock through `Intl` of the active language
    (`US$ 12,40` in pt-BR, `$12.40` in English), respecting the 24 or 12-hour setting;
  - time-unit abbreviations (`d h min`) are identical in both languages;
  - layout does not depend on text length: names are ellipsized, buttons grow,
    nothing has a fixed width tied to a word;
  - provider and theme names are not translated.
- Layout:

```
po/gnome-ai-quota.pot     catalog generated from the code
po/pt_BR.po               main translation
po/en.po                  English review
locale/*/LC_MESSAGES/*.mo generated (ignored by git)
tools/i18n.sh             xgettext + msgmerge + msgfmt
```

- A pseudo-locale script inflates every string by about 40% to find layout overflow.

## Consequences

- A packaging step compiles the `.mo` files.
- Every user-visible string goes through gettext from the first commit.
- The text catalog and its length differences between languages are reviewed
  whenever strings change (above +25% deserves a layout check).
