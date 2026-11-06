#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp/opencode}/elfvision-session.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
mkdir -m 700 "$work/home" "$work/runtime" "$work/config" "$work/data" "$work/cache" "$work/state"
printf "test:x:%s:%s:test:/work/home:/bin/false\n" "$(id -u)" "$(id -g)" > "$work/passwd"
mkdir -p "$work/run/user/$(id -u)"
cat > "$work/no-services.conf" <<'XML'
<busconfig><type>session</type><listen>unix:tmpdir=/work/runtime</listen><auth>EXTERNAL</auth><policy context="default"><allow own="*"/><allow send_destination="*"/><allow receive_sender="*"/></policy></busconfig>
XML
bwrap --unshare-all --die-with-parent --new-session --ro-bind /usr /usr \
    --symlink usr/bin /bin --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
    --proc /proc --dev /dev --tmpfs /tmp --dir /etc \
    --ro-bind /etc/ld.so.cache /etc/ld.so.cache --ro-bind "$work/passwd" /etc/passwd \
    --bind "$work/run" /run --ro-bind "$repo" /repo --bind "$work" /work --clearenv \
    --setenv PATH /usr/bin:/usr/libexec --setenv HOME /work/home \
    --setenv XDG_RUNTIME_DIR /work/runtime --setenv XDG_CONFIG_HOME /work/config \
    --setenv XDG_DATA_HOME /work/data --setenv XDG_CACHE_HOME /work/cache \
    --setenv XDG_STATE_HOME /work/state --setenv GIO_USE_VFS local \
    dbus-run-session --config-file /work/no-services.conf -- timeout 30 gjs -m /repo/tests/secretSessionRestart.js
