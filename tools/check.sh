#!/usr/bin/env bash
# Everything that can be checked without a graphical session, in one command:
#
#   tools/check.sh
#
# It runs the unit tests, the syntax of every script, the schemas, the translation catalogs
# (compiles, placeholders agree, the template is in step with the code) and whitespace.
# The shell scripts are linted when ShellCheck is installed. Exit status is 0 only when every step passed.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
failed=0
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

step() {
    local name="$1"
    shift
    printf '== %s\n' "$name"
    if ! "$@"; then
        printf 'FAILED: %s\n' "$name" >&2
        failed=1
    fi
}

syntax() {
    local file
    for file in tools/*.sh .githooks/pre-commit; do
        bash -n "$file" || return 1
    done
    for file in tools/*.py; do
        python3 -I -c "import ast, sys; ast.parse(open(sys.argv[1]).read())" "$file" || return 1
    done
}

lint() {
    if ! command -v shellcheck >/dev/null 2>&1; then
        echo "(shellcheck is not installed: skipped)"
        return 0
    fi
    shellcheck -S warning tools/*.sh .githooks/pre-commit
}

template_in_step() {
    local sources
    mapfile -t sources < <(find extension.js prefs.js lib -name '*.js' | sort)
    xgettext --from-code=UTF-8 --language=JavaScript \
        --keyword=gettext --keyword=ngettext:1,2 --keyword=pgettext:1c,2 \
        --sort-by-file -o "$scratch/check.pot" "${sources[@]}" 2>/dev/null || return 1
    diff <(grep -E '^msg(id|ctxt|id_plural)' po/gnome-ai-quota.pot) \
         <(grep -E '^msg(id|ctxt|id_plural)' "$scratch/check.pot") >/dev/null \
        || { echo "po/gnome-ai-quota.pot is out of date: run tools/i18n.sh extract"; return 1; }
}

catalogs() {
    local po
    for po in po/*.po; do
        msgfmt --check -o /dev/null "$po" || return 1
    done
    python3 -I tools/check-po.py po/*.po
}

# Some tests read the compiled schema and the catalogs, which are not in the repository: build them first,
# so a new setting is not tested against an old file.
# The interface modules need the shell to be imported, so the unit tests never load them: a syntax
# error in one (a name declared twice) would only show when the extension fails to enable.
js_syntax() {
    command -v node >/dev/null 2>&1 || { echo "node is not installed; skipping"; return 0; }
    local file status=0
    while IFS= read -r file; do
        node --input-type=module --check < "$file" 2>&1 | sed "s|^|$file: |" | head -3
        [ "${PIPESTATUS[0]}" -eq 0 ] || status=1
    done < <(find extension.js prefs.js lib -name '*.js' | sort)
    return "$status"
}

step "build" tools/build.sh
step "unit tests" gjs -m tests/run.js
step "script syntax" syntax
step "javascript syntax" js_syntax
step "shellcheck" lint
step "schemas" glib-compile-schemas --strict --dry-run schemas
step "translation template" template_in_step
step "translation catalogs" catalogs
step "whitespace" git diff --check HEAD

exit "$failed"
