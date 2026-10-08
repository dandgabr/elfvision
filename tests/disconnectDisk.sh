#!/usr/bin/env bash
# Cross-process metadata test only: no real config, keyring, accounts or remote endpoints.
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -m 700 "$work/runtime" "$work/config" "$work/data" "$work/cache" "$work/state"
export XDG_RUNTIME_DIR="$work/runtime" XDG_CONFIG_HOME="$work/config" XDG_DATA_HOME="$work/data" XDG_CACHE_HOME="$work/cache" XDG_STATE_HOME="$work/state" GIO_USE_VFS=local
export GAQ_TEST_REPO="$repo" GAQ_TEST_WORK="$work"
dbus-run-session -- bash -euo pipefail <<'LEGACY'
gjs -m "$GAQ_TEST_REPO/tests/prefsDisconnectLegacy.js"
gjs -m "$GAQ_TEST_REPO/tests/prefsDisconnectDisk.js" "$GAQ_TEST_WORK/state/metadata" hold > "$GAQ_TEST_WORK/issued.log" &
writer=$!
trap 'kill "$writer" 2>/dev/null || true; wait "$writer" 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do
    if grep -q '^issued$' "$GAQ_TEST_WORK/issued.log"; then break; fi
    sleep .02
done
grep -q '^issued$' "$GAQ_TEST_WORK/issued.log"
# An old session with a live credential operation is never taken over.
if dbus-run-session -- gjs -m "$GAQ_TEST_REPO/tests/prefsDisconnectDisk.js" "$GAQ_TEST_WORK/state/metadata" store > "$GAQ_TEST_WORK/live-bus.log" 2>&1; then
    printf '%s\n' 'FAIL live legacy session was taken over' >&2
    exit 1
fi
grep -q 'another active session owns credential coordination' "$GAQ_TEST_WORK/live-bus.log"
printf '%s\n' 'PASS live legacy credential operation prevents takeover'
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
LEGACY
dbus-run-session -- gjs -m "$repo/tests/sessionCoordination.js" "$work/state/counter" increment > "$work/count-a.log" &
first=$!
dbus-run-session -- gjs -m "$repo/tests/sessionCoordination.js" "$work/state/counter" increment > "$work/count-b.log" &
second=$!
wait "$first"
wait "$second"
lock_inode=$(stat --format=%i "$work/state/counter/coordination.lock")
python3 - "$work/state/counter/disconnect.json" <<'PY'
import json, sys
assert json.load(open(sys.argv[1]))['count'] == 24
print('PASS concurrent independent session buses serialize every metadata write')
PY
dbus-run-session -- gjs -m "$repo/tests/sessionCoordination.js" "$work/state/counter" failure
# Unsafe lock files must fail without modifying their target.
mkdir -m 700 "$work/state/unsafe"
printf '%s\n' 'unchanged' > "$work/target"
ln -s "$work/target" "$work/state/unsafe/coordination.lock"
if dbus-run-session -- gjs -m "$repo/tests/sessionCoordination.js" "$work/state/unsafe" increment > "$work/unsafe.log" 2>&1; then
    printf '%s\n' 'FAIL unsafe lock file was accepted' >&2
    exit 1
fi
grep -q 'unsafe coordination lock' "$work/unsafe.log"
test "$(cat "$work/target")" = unchanged
printf '%s\n' 'PASS unsafe lock symlink rejected without changing target'
# Kernel exclusion releases on holder death, without unlinking the lock inode.
dbus-run-session -- bash -euo pipefail <<'INNER'
gjs -m "$GAQ_TEST_REPO/tests/sessionCoordination.js" "$GAQ_TEST_WORK/state/counter" hold > "$GAQ_TEST_WORK/locked.log" &
holder=$!
trap 'kill "$holder" 2>/dev/null || true; wait "$holder" 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do
    if grep -q '^locked$' "$GAQ_TEST_WORK/locked.log"; then break; fi
    sleep .02
done
grep -q '^locked$' "$GAQ_TEST_WORK/locked.log"
if dbus-run-session -- gjs -m "$GAQ_TEST_REPO/tests/sessionCoordination.js" "$GAQ_TEST_WORK/state/counter" increment > "$GAQ_TEST_WORK/timeout.log" 2>&1; then
    printf '%s\n' 'FAIL unfinished transaction lost kernel exclusion' >&2
    exit 1
fi
grep -q 'coordination mutex unavailable' "$GAQ_TEST_WORK/timeout.log"
kill -KILL "$holder"
wait "$holder" 2>/dev/null || true
INNER
dbus-run-session -- gjs -m "$repo/tests/sessionCoordination.js" "$work/state/counter" increment
printf '%s\n' 'PASS parent retains lock after helper exits; holder death releases it'
test "$lock_inode" = "$(stat --format=%i "$work/state/counter/coordination.lock")"
# A new login must recover clean coordination without deleting settings or accounts.
dbus-run-session -- gjs -m "$repo/tests/prefsDisconnectDisk.js" "$work/state/clean" store
dbus-run-session -- gjs -m "$repo/tests/prefsDisconnectDisk.js" "$work/state/clean" store
printf '%s\n' 'PASS new session resumes existing clean coordination'
# Recovery never discards an orphaned credential write or its pending deletion.
dbus-run-session -- gjs -m "$repo/tests/prefsDisconnectDisk.js" "$work/state/metadata" remove > "$work/recovered.json"
python3 - "$work/recovered.json" <<'PY'
import json, sys
result = json.load(open(sys.argv[1]))
assert result['phase'] == 'failed' and result['problem'] == 'orphaned-write'
print('PASS session recovery preserves orphaned credential fencing')
PY
dbus-run-session -- gjs -m "$repo/tests/sessionCoordination.js" "$work/state/preserve" seed
before=$(sha256sum "$work/state/preserve/disconnect.json")
dbus-run-session -- gjs -m "$repo/tests/sessionCoordination.js" "$work/state/preserve" read
test "$before" = "$(sha256sum "$work/state/preserve/disconnect.json")"
printf '%s\n' 'PASS session recovery preserves exact epoch and completed durable metadata'
for owner_kind in participant lease coordinator; do
    export GAQ_TEST_OWNER_KIND="$owner_kind"
    dbus-run-session -- bash -euo pipefail <<'OWNER'
gjs -m "$GAQ_TEST_REPO/tests/sessionCoordination.js" "$GAQ_TEST_WORK/state/$GAQ_TEST_OWNER_KIND" owner "$GAQ_TEST_OWNER_KIND" > "$GAQ_TEST_WORK/owner.log" &
owner=$!
trap 'kill "$owner" 2>/dev/null || true; wait "$owner" 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do
    if grep -q '^owner ready$' "$GAQ_TEST_WORK/owner.log"; then break; fi
    sleep .02
done
grep -q '^owner ready$' "$GAQ_TEST_WORK/owner.log"
if dbus-run-session -- gjs -m "$GAQ_TEST_REPO/tests/sessionCoordination.js" "$GAQ_TEST_WORK/state/$GAQ_TEST_OWNER_KIND" read > "$GAQ_TEST_WORK/owner-rejected.log" 2>&1; then
    printf '%s\n' "FAIL live $GAQ_TEST_OWNER_KIND alone was ignored" >&2
    exit 1
fi
grep -q 'another active session owns credential coordination' "$GAQ_TEST_WORK/owner-rejected.log"
printf '%s\n' "PASS live $GAQ_TEST_OWNER_KIND alone prevents takeover"
OWNER
done
