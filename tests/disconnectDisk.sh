#!/usr/bin/env bash
# Cross-process metadata test only: no real config, keyring, accounts or remote endpoints.
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -m 700 "$work/runtime" "$work/config" "$work/data" "$work/cache" "$work/state"
export XDG_RUNTIME_DIR="$work/runtime" XDG_CONFIG_HOME="$work/config" XDG_DATA_HOME="$work/data" XDG_CACHE_HOME="$work/cache" XDG_STATE_HOME="$work/state" GIO_USE_VFS=local
export GAQ_TEST_REPO="$repo" GAQ_TEST_WORK="$work"
dbus-run-session -- bash -euo pipefail <<'INNER'
gjs -m "$GAQ_TEST_REPO/tests/prefsDisconnectLegacy.js"
gjs -m "$GAQ_TEST_REPO/tests/prefsDisconnectDisk.js" "$GAQ_TEST_WORK/state/metadata" hold > "$GAQ_TEST_WORK/issued.log" &
writer=$!
trap 'kill "$writer" 2>/dev/null || true; wait "$writer" 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do
    if grep -q '^issued$' "$GAQ_TEST_WORK/issued.log"; then break; fi
    sleep .02
done
grep -q '^issued$' "$GAQ_TEST_WORK/issued.log"
kill -KILL "$writer"
wait "$writer" 2>/dev/null || true
gjs -m "$GAQ_TEST_REPO/tests/prefsDisconnectDisk.js" "$GAQ_TEST_WORK/state/metadata" remove > "$GAQ_TEST_WORK/result.json"
python3 - "$GAQ_TEST_WORK/result.json" "$GAQ_TEST_WORK/state/metadata/disconnect.json" <<'PY'
import json, sys
result, state = (json.load(open(path)) for path in sys.argv[1:])
assert result['phase'] == 'failed' and result['problem'] == 'orphaned-write'
assert all(value == 'pending' for values in result['credentials'].values() for value in values.values())
assert len(state['leases']) == 1
print('PASS cross-process killed writer remains blocked; zero credential deletions')
PY
INNER
# A second session sharing the same boot/directory must fail closed, not run another mutex.
if dbus-run-session -- gjs -m "$repo/tests/prefsDisconnectDisk.js" "$work/state/metadata" store > "$work/other-bus.log" 2>&1; then
    printf '%s\n' 'FAIL different session unexpectedly acquired state' >&2
    exit 1
fi
grep -q 'another session owns credential coordination' "$work/other-bus.log"
printf '%s\n' 'PASS different session bus is rejected by immutable boot pin'
