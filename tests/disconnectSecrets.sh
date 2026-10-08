#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -m 700 "$work/runtime" "$work/config" "$work/data" "$work/cache" "$work/state" "$work/keyring"
export XDG_RUNTIME_DIR="$work/runtime" XDG_CONFIG_HOME="$work/config" XDG_DATA_HOME="$work/data" XDG_CACHE_HOME="$work/cache" XDG_STATE_HOME="$work/state" GIO_USE_VFS=local
unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK
export GAQ_TEST_REPO="$repo" GAQ_TEST_WORK="$work"
dbus-run-session -- bash -euo pipefail <<'INNER'
gnome-keyring-daemon --foreground --components=secrets --control-directory "$GAQ_TEST_WORK/keyring" > "$GAQ_TEST_WORK/keyring.log" 2>&1 &
keyring=$!
trap 'kill "$keyring" 2>/dev/null || true; wait "$keyring" 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do
    if gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.freedesktop.secrets | grep -q true; then break; fi
    sleep .02
done
gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets --method org.freedesktop.Secret.Service.SetAlias default /org/freedesktop/secrets/collection/session >/dev/null
timeout 15 gjs -m "$GAQ_TEST_REPO/tests/prefsDisconnectSecrets.js"
kill "$keyring"
wait "$keyring" || true
INNER
# No service directories: absent Secret Service cannot autoactivate an installed provider.
cat > "$work/no-services.conf" <<XML
<busconfig><type>session</type><listen>unix:tmpdir=$work/runtime</listen><auth>EXTERNAL</auth><policy context="default"><allow own="*"/><allow send_destination="*"/><allow receive_sender="*"/></policy></busconfig>
XML
dbus-run-session --config-file "$work/no-services.conf" -- timeout 5 gjs -m "$repo/tests/prefsDisconnectUnavailable.js"
