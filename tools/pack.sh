#!/usr/bin/env bash
# Build Elfvision's GNOME Shell extension package (a ZIP) in dist/:
#
#   tools/pack.sh
#
# gnome-extensions pack takes extension.js, prefs.js, metadata.json, the schema and the
# translations by itself; everything else the extension needs at run time is added here.
# Tests, development tools, docs and hooks are left out; the client-id helper is included. Install the result with
#   gnome-extensions install --force dist/elfvision-gnome.shell-extension.zip
# and then log out and in (the shell loads extensions at login on Wayland).
set -euo pipefail

cd "$(dirname "$0")/.."

uuid="$(python3 -I -c 'import json;print(json.load(open("metadata.json"))["uuid"])')"
domain="$(python3 -I -c 'import json;print(json.load(open("metadata.json"))["gettext-domain"])')"
schema="$(python3 -I -c 'import json;print(json.load(open("metadata.json"))["settings-schema"])')"

tools/build.sh >/dev/null
rm -rf dist
mkdir -p dist
gnome-extensions pack --force --quiet \
    --gettext-domain="$domain" \
    --podir=po \
    --schema="schemas/$schema.gschema.xml" \
    --extra-source=lib \
    --extra-source=icons \
    --extra-source=themes \
    --extra-source=licenses \
    --extra-source=LICENSE \
    --out-dir=dist \
    .

# GNOME names its intermediate archive after the persistent installation UUID.
# The public artifact uses the product name without changing account identity.
zip="dist/elfvision-gnome.shell-extension.zip"
mv -- "dist/$uuid.shell-extension.zip" "$zip"
# Preferences copies a command with this exact installed path. Ship only this helper,
# not the development tools; zip preserves its tools/ directory.
zip -q "$zip" tools/import-client-ids.py
# The archive must hold what the extension imports at run time and nothing from development.
listing="$(unzip -Z1 "$zip")"
missing=0
for required in metadata.json extension.js prefs.js lib/core/theme.template.css tools/import-client-ids.py \
    licenses/fonts/inter-OFL.txt locale/pt_BR/LC_MESSAGES/gnome-ai-quota.mo "schemas/${schema}.gschema.xml" LICENSE; do
    if ! grep -qxF -- "$required" <<<"$listing"; then
        echo "pack: missing from the archive: $required" >&2
        missing=1
    fi
done
if grep -E '(^|/)(tests|docs|\.git|__pycache__|node_modules)/|\.test\.js$|\.po$|\.pot$' <<<"$listing" >&2; then
    echo "pack: development files are in the archive" >&2
    missing=1
fi
[ "$missing" -eq 0 ] || exit 1
echo "built $zip"
# What is inside, in one line per folder, so a missing piece is easy to see.
unzip -Z1 "$zip" | sed 's#/[^/]*$##' | sort | uniq -c
