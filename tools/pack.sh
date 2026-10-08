#!/usr/bin/env bash
# Build the installable package (a zip) in dist/:
#
#   tools/pack.sh
#
# gnome-extensions pack takes extension.js, prefs.js, metadata.json, the schema and the
# translations by itself; everything else the extension needs at run time is added here.
# Tests, development tools, docs and hooks are left out; the client-id helper is included. Install the result with
#   gnome-extensions install --force dist/<uuid>.shell-extension.zip
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
    --out-dir=dist \
    .

zip="dist/$uuid.shell-extension.zip"
# Preferences copies a command with this exact installed path. Ship only this helper,
# not the development tools; zip preserves its tools/ directory.
zip -q "$zip" tools/import-client-ids.py
echo "built $zip"
# What is inside, in one line per folder, so a missing piece is easy to see.
unzip -Z1 "$zip" | sed 's#/[^/]*$##' | sort | uniq -c
