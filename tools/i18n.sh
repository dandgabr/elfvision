#!/usr/bin/env bash
# Translation workflow (docs/adr/0007-internationalization.md).
#
#   tools/i18n.sh extract   regenerate po/gnome-ai-quota.pot from the code
#   tools/i18n.sh update    merge the template into every po/*.po
#   tools/i18n.sh compile   build locale/<lang>/LC_MESSAGES/gnome-ai-quota.mo
#   tools/i18n.sh all       extract, update and compile
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN=gnome-ai-quota
POT="po/${DOMAIN}.pot"

extract() {
    local sources
    mapfile -t sources < <(find extension.js prefs.js lib -name '*.js' | sort)
    xgettext --from-code=UTF-8 --language=JavaScript \
        --keyword=gettext --keyword=ngettext:1,2 --keyword=pgettext:1c,2 \
        --add-comments=TRANSLATORS --sort-by-file \
        --package-name="$DOMAIN" --msgid-bugs-address="https://github.com/dandgabr/gnome-ai-quota/issues" \
        -o "$POT" "${sources[@]}"
    echo "wrote $POT"
}

update() {
    local po
    for po in po/*.po; do
        msgmerge --update --backup=none --quiet "$po" "$POT"
        echo "updated $po"
    done
}

compile() {
    local po lang
    for po in po/*.po; do
        lang=$(basename "$po" .po)
        mkdir -p "locale/${lang}/LC_MESSAGES"
        msgfmt --check -o "locale/${lang}/LC_MESSAGES/${DOMAIN}.mo" "$po"
        echo "compiled locale/${lang}/LC_MESSAGES/${DOMAIN}.mo"
    done
}

case "${1:-all}" in
    extract) extract ;;
    update) update ;;
    compile) compile ;;
    all) extract; update; compile ;;
    *) echo "usage: $0 [extract|update|compile|all]" >&2; exit 2 ;;
esac
