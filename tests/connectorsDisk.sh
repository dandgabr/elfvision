#!/usr/bin/env bash
# Private coordination only. No real credentials, settings, servers or Shell process.
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -m 700 "$work/runtime" "$work/config" "$work/data" "$work/cache" "$work/state"
export XDG_RUNTIME_DIR="$work/runtime" XDG_CONFIG_HOME="$work/config" XDG_DATA_HOME="$work/data" XDG_CACHE_HOME="$work/cache" XDG_STATE_HOME="$work/state" GIO_USE_VFS=local
export GAQ_TEST_REPO="$repo" GAQ_TEST_WORK="$work"
dbus-run-session -- bash -euo pipefail <<'INNER'
timeout 15 gjs -m "$GAQ_TEST_REPO/tests/connectorsDisk.js" writer "$GAQ_TEST_WORK" > "$GAQ_TEST_WORK/writer-result" &
writer=$!
trap 'kill "$writer" 2>/dev/null || true; wait "$writer" 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do
    if [ -f "$GAQ_TEST_WORK/refresh-started" ]; then break; fi
    sleep .02
done
test -f "$GAQ_TEST_WORK/refresh-started"
timeout 15 gjs -m "$GAQ_TEST_REPO/tests/connectorsDisk.js" remover "$GAQ_TEST_WORK"
wait "$writer"
cat "$GAQ_TEST_WORK/writer-result"
INNER
