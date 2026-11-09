#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/elfvision-secrets.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
mkdir -m 700 "$work/home" "$work/runtime" "$work/config" "$work/data" "$work/cache" "$work/state" "$work/keyring"
printf "test:x:%s:%s:test:/work/home:/bin/false\n" "$(id -u)" "$(id -g)" > "$work/passwd"
mkdir -p "$work/run/user/$(id -u)"
cat > "$work/no-services.conf" <<'XML'
<busconfig><type>session</type><listen>unix:tmpdir=/work/runtime</listen><auth>EXTERNAL</auth><policy context="default"><allow own="*"/><allow send_destination="*"/><allow receive_sender="*"/></policy></busconfig>
XML
# No host home, runtime, display, network or session bus is mounted into this sandbox.
bwrap --unshare-all --die-with-parent --new-session --ro-bind /usr /usr \
    --symlink usr/bin /bin --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
    --proc /proc --dev /dev --tmpfs /tmp --dir /etc \
    --ro-bind /etc/ld.so.cache /etc/ld.so.cache --ro-bind "$work/passwd" /etc/passwd \
    --bind "$work/run" /run \
    --ro-bind "$repo" /repo --bind "$work" /work --clearenv \
    --setenv PATH /usr/bin:/usr/libexec --setenv HOME /work/home \
    --setenv XDG_RUNTIME_DIR /work/runtime --setenv XDG_CONFIG_HOME /work/config \
    --setenv XDG_DATA_HOME /work/data --setenv XDG_CACHE_HOME /work/cache \
    --setenv XDG_STATE_HOME /work/state --setenv GIO_USE_VFS local \
    --setenv GAQ_TEST_BACKEND "${GAQ_TEST_BACKEND:-auto}" \
    dbus-run-session --config-file /work/no-services.conf -- bash -euo pipefail <<'INNER'
backend=$GAQ_TEST_BACKEND
if [[ $backend == auto ]]; then
    if command -v gnome-keyring-daemon >/dev/null; then backend=gnome-keyring
    elif command -v oo7-daemon >/dev/null; then backend=oo7
    else echo 'No supported Secret Service daemon available' >&2; exit 1; fi
fi
case "$backend" in
    gnome-keyring)
        command -v gnome-keyring-daemon >/dev/null || { echo 'gnome-keyring-daemon unavailable' >&2; exit 1; }
        gnome-keyring-daemon --foreground --components=secrets --control-directory /work/keyring > /work/keyring.log 2>&1 & ;;
    oo7)
        command -v oo7-daemon >/dev/null || { echo 'oo7-daemon unavailable' >&2; exit 1; }
        printf '%s\n' 'synthetic-test-password' | oo7-daemon --login > /work/keyring.log 2>&1 & ;;
    *) echo "Unsupported Secret Service backend: $backend" >&2; exit 2 ;;
esac
keyring=$!
trap 'kill "$keyring" 2>/dev/null || true; wait "$keyring" 2>/dev/null || true' EXIT
ready=false
for _ in $(seq 1 100); do
    if gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.freedesktop.secrets | grep -q true; then ready=true; break; fi
    kill -0 "$keyring" 2>/dev/null || break
    sleep .02
done
if [[ $ready != true ]]; then echo "$backend did not acquire the private bus name" >&2; cat /work/keyring.log >&2; exit 1; fi
gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets --method org.freedesktop.Secret.Service.SetAlias default /org/freedesktop/secrets/collection/session >/dev/null
echo "Secret Service backend: $backend"
timeout 15 gjs -m /repo/tests/prefsDisconnectSecrets.js
kill "$keyring"
wait "$keyring" || true
trap - EXIT
timeout 5 gjs -m /repo/tests/prefsDisconnectUnavailable.js
INNER
