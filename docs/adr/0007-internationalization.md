# 0007. Internationalization: English and pt-BR with gettext

Status: accepted. English and pt-BR catalogs exist and every string goes through
gettext. The extension follows the language of the GNOME Shell session and there is
no language setting. Developer pseudo-locale and RTL checks are implemented.

## Context

The interface has short strings with plurals, relative times, currency and clock
formats. The repository language is English (ADR 0001).

## Decision

- **Languages:** English and Brazilian Portuguese. Another language needs only
  another `.po` file.
- **Mechanism:** standard GNOME gettext (`Extension.gettext`, `ngettext`,
  `pgettext`), with `.po` compiled to `.mo`. The extension follows the language of
  the GNOME Shell session; a language without a catalog shows the English source
  strings (en_US). There is no override: forcing a language for the process would
  translate the shell itself.
- **Source strings are English** (`msgid`); pt-BR is a catalog entry.
- Rules:
  - No sentence is built by concatenation. Use placeholders (`"resets in %s"`), because word order
    changes between languages.
  - Plurals go through `ngettext`.
  - Use `pgettext` when one word has several roles ("Week" as a label and in a notification).
  - Numbers, currency, weekday and clock go through `Intl` with the active language (`US$ 12,40` in
    pt-BR, `$12.40` in English), and respect the 12 or 24-hour setting.
  - Time-unit abbreviations (`d h min`) are the same in both languages.
  - Layout does not depend on text length: names are ellipsized, buttons grow, and nothing has a fixed
    width tied to a word.
  - Provider names and theme names are not translated.
- Files:

```text
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
- `lib/core/pseudoLocale.js` inflates translated literal strings by about 40%, preserving printf
  placeholders, plural selection and contexts. It is injected only by the developer probes; it
  never changes the session locale or the text of provider names, credentials or copied commands.
- `tools/layout-check.sh` checks St popup/card actions, RTL meter and pacing geometry and a paused
  provider row in an isolated demo shell. `tools/prefs-smoke.sh` checks the assistant at 360 px in
  LTR and RTL, with normal/expanded text and enlarged fonts, then exercises its closing paths.
