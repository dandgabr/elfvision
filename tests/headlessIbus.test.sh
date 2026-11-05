#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
SKIP_ENABLE=1 LOG="$work/shell.log" tools/headless-shell.sh sleep:3 >"$work/result" 2>&1
if grep -E 'IBUS-CRITICAL|Unable to load /var/lib/dbus/machine-id' "$work/shell.log"; then
    echo 'Private shell has a broken IBus session' >&2
    exit 1
fi
echo 'Private shell IBus baseline passed'
