#!/usr/bin/env bash
# Try the extension in a nested GNOME Shell window on your desktop, without
# touching your real session, settings or top bar. Needs the mutter-devkit
# package (sudo dnf install mutter-devkit).
#
#   tools/nested-shell.sh [prefs]
#   DATA_SOURCE=demo DEMO_SCENARIO=drift tools/nested-shell.sh   # made-up data that climbs to the limits
#
# The window is a throwaway session with in-memory settings. The extension is
# enabled for you; with "prefs" the preferences window opens too. Close the
# window (or press Ctrl+C here) to end it.
set -euo pipefail

if [[ ${DATA_SOURCE:-demo} != demo ]]; then
    echo "DATA_SOURCE must be demo in graphical test sessions" >&2
    exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
[ -x /usr/libexec/mutter-devkit ] || { echo "mutter-devkit is missing: sudo dnf install mutter-devkit" >&2; exit 1; }
"$root/tools/build.sh" >/dev/null
uuid="$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
# Preserve only the parent compositor socket before isolating runtime sockets.
parent_runtime="${XDG_RUNTIME_DIR:-}"
parent_wayland="${WAYLAND_DISPLAY:-}"
if [ -n "$parent_wayland" ] && [[ "$parent_wayland" != /* ]]; then
    [ -n "$parent_runtime" ] || { echo "Relative WAYLAND_DISPLAY requires XDG_RUNTIME_DIR" >&2; exit 1; }
    parent_wayland="$parent_runtime/$parent_wayland"
fi
[ -n "$parent_wayland" ] && [ -S "$parent_wayland" ] || { echo 'WAYLAND_DISPLAY must identify a Wayland socket' >&2; exit 1; }
command -v bwrap >/dev/null || { echo 'bwrap is required for graphical isolation' >&2; exit 1; }
work="$(mktemp -d)"
# Removed on every way out, a signal included: the folder can hold a copy of the client ids.
# shellcheck source=tools/private-session-cleanup.sh
source "$root/tools/private-session-cleanup.sh"
trap 'cleanup_private_session "$work"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$work/data/gnome-shell/extensions"
ln -s "$root" "$work/data/gnome-shell/extensions/$uuid"

mkdir -m 700 "$work/runtime"
export XDG_RUNTIME_DIR="$work/runtime"
# The parent socket is mounted at a fixed path inside the sandbox.
mkdir -m 700 "$work/home"
export HOME="$work/home"
export XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache"
export XDG_STATE_HOME="$work/state" GIO_USE_VFS=local
# A file backend, not "memory": the preferences window is another process and
# must share the settings with the shell.
# DATA_SOURCE=demo starts with made-up data instead of the real providers, and DEMO_SCENARIO
# (steady, flaky or drift) says what that data does: drift climbs toward the limits every ten
# seconds, which is how the notifications are seen without any account.
for pair in "data-source:demo" "demo-scenario:${DEMO_SCENARIO:-}"; do
    if [ -n "${pair#*:}" ]; then
        GSETTINGS_BACKEND=keyfile GSETTINGS_SCHEMA_DIR="$root/schemas" \
            gsettings set org.gnome.shell.extensions.gnome-ai-quota "${pair%%:*}" "${pair#*:}"
    fi
done
export WORK="$work" GSETTINGS_BACKEND=keyfile GTK_A11Y=none UUID="$uuid" OPEN_PREFS="${1:-}"

# This UI-only session blocks Secret Service; do not test sign-in here.
unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK AT_SPI_BUS_ADDRESS
export ROOT_FOR_BUS="$root"
bwrap --die-with-parent --unshare-all --ro-bind /usr /usr \
    --symlink usr/lib64 /lib64 --symlink usr/lib /lib --symlink usr/bin /bin \
    --proc /proc --dev /dev --tmpfs /tmp --tmpfs /run \
    --ro-bind /etc/passwd /etc/passwd --ro-bind /etc/group /etc/group \
    --ro-bind "$root" "$root" --bind "$work" "$work" \
    --ro-bind "$parent_wayland" /run/parent-wayland --chdir "$root" \
    env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_DATA_HOME="$XDG_DATA_HOME" \
    XDG_CONFIG_HOME="$XDG_CONFIG_HOME" XDG_CACHE_HOME="$XDG_CACHE_HOME" \
    XDG_STATE_HOME="$XDG_STATE_HOME" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
    WAYLAND_DISPLAY=/run/parent-wayland GIO_USE_VFS=local GSETTINGS_BACKEND=keyfile \
    GTK_A11Y=none WORK="$WORK" UUID="$UUID" OPEN_PREFS="$OPEN_PREFS" ROOT_FOR_BUS="$ROOT_FOR_BUS" \
    __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json \
    dbus-run-session --config-file="$root/tools/no-secrets-session.conf" -- bash -c '
    set -euo pipefail
    # Use a separate bus with no activation directories, never the host system bus.
    export DBUS_SYSTEM_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/system-bus"
    dbus-daemon --nofork --config-file="$ROOT_FOR_BUS/tools/no-secrets-session.conf" \
        --address="$DBUS_SYSTEM_BUS_ADDRESS" >"$XDG_RUNTIME_DIR/system-bus.log" 2>&1 &
    system_bus=$!
    trap '\''jobs -pr | xargs -r kill 2>/dev/null || true; wait 2>/dev/null || true'\'' EXIT
    for _ in $(seq 1 100); do
        [ -S "$XDG_RUNTIME_DIR/system-bus" ] && break
        kill -0 "$system_bus" 2>/dev/null || { cat "$XDG_RUNTIME_DIR/system-bus.log" >&2; exit 1; }
        sleep 0.02
    done
    [ -S "$XDG_RUNTIME_DIR/system-bus" ] || { echo "private system bus unavailable" >&2; exit 1; }
    trap '\''jobs -pr | xargs -r kill 2>/dev/null || true; wait 2>/dev/null || true'\'' EXIT
    gnome-shell --devkit --wayland --unsafe-mode >/dev/null 2>&1 &
    shell=$!
    for _ in $(seq 1 60); do
        sleep 0.5
        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Extensions.ListExtensions >/dev/null 2>&1 && break
    done
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Extensions.EnableExtension "$UUID" >/dev/null
    if [ "$OPEN_PREFS" = prefs ]; then
        sleep 2
        gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
            --method org.gnome.Shell.Extensions.OpenExtensionPrefs "$UUID" "" "{}" >/dev/null
    fi
    wait "$shell"
'
