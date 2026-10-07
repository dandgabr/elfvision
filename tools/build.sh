#!/usr/bin/env bash
# Build the generated files the shell needs: the compiled GSettings schema and
# the translation catalogs. Run it after changing schemas/ or po/.
# Neither output is committed (see .gitignore).
set -euo pipefail

cd "$(dirname "$0")/.."

glib-compile-schemas --strict schemas
echo "compiled schemas/gschemas.compiled"
tools/i18n.sh compile
