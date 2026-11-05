#!/usr/bin/env bash
# Exercise setup with fake controllers; startup uses a sandboxed synthetic backend.
# Uses a separate Wayland shell and memory settings; startup/states select those checks only.
set -euo pipefail
cd "$(dirname "$0")/.."
tools/build.sh >/dev/null
root="$(pwd)"
scratch="$(mktemp -d)"
# shellcheck source=tools/private-session-cleanup.sh
source "$root/tools/private-session-cleanup.sh"
trap 'cleanup_private_session "$scratch"' EXIT
export GAQ_TEST_ROOT="$root" GAQ_TEST_SCRATCH="$scratch" GAQ_SMOKE_MODE="${1:-all}"
mkdir -m 700 "$scratch/home"
export HOME="$scratch/home"
export XDG_DATA_HOME="$scratch/data" XDG_CONFIG_HOME="$scratch/config" XDG_CACHE_HOME="$scratch/cache"
export XDG_STATE_HOME="$scratch/state" GIO_USE_VFS=local
mkdir -m 700 "$scratch/runtime"
export XDG_RUNTIME_DIR="$scratch/runtime"
export GTK_A11Y=none GSETTINGS_BACKEND=memory
# Full prefs integration imports the installed extension app’s private Shew typelib.
export GI_TYPELIB_PATH="/usr/lib64/gnome-shell/girepository-1.0${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK AT_SPI_BUS_ADDRESS
# The startup bus has no activation directories and only an in-memory secret service.
config="$root/tools/no-secrets-session.conf"
if [[ "$GAQ_SMOKE_MODE" == startup || "$GAQ_SMOKE_MODE" == all ]]; then
    config="$root/tools/synthetic-secrets-session.conf"
fi
# Explicit display name ensures tests never connect to the user's desktop.
export ROOT_FOR_BUS="$root"
command -v bwrap >/dev/null || { echo 'bwrap is required for graphical isolation' >&2; exit 1; }
bwrap --die-with-parent --unshare-all --ro-bind /usr /usr \
    --symlink usr/lib64 /lib64 --symlink usr/lib /lib --symlink usr/bin /bin \
    --proc /proc --dev /dev --tmpfs /tmp --tmpfs /run \
    --ro-bind /etc/passwd /etc/passwd --ro-bind /etc/group /etc/group \
    --ro-bind /etc/fonts /etc/fonts \
    --ro-bind "$root" "$root" --bind "$scratch" "$scratch" --chdir "$root" \
    env -i PATH=/usr/bin:/bin HOME="$HOME" XDG_DATA_HOME="$XDG_DATA_HOME" \
    XDG_CONFIG_HOME="$XDG_CONFIG_HOME" XDG_CACHE_HOME="$XDG_CACHE_HOME" \
    XDG_STATE_HOME="$XDG_STATE_HOME" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
    GIO_USE_VFS=local GSETTINGS_BACKEND=memory GTK_A11Y=none \
    GI_TYPELIB_PATH="$GI_TYPELIB_PATH" GAQ_TEST_ROOT="$root" GAQ_TEST_SCRATCH="$scratch" \
    GAQ_SMOKE_MODE="$GAQ_SMOKE_MODE" ROOT_FOR_BUS="$root" \
    __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json \
    dbus-run-session --config-file="$config" -- bash -c '
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
    gjs -m "$ROOT_FOR_BUS/tools/headless-login-stub.js" >"$XDG_RUNTIME_DIR/login-stub.log" 2>&1 &
    for _ in $(seq 1 100); do
        gdbus call --system --dest org.freedesktop.login1 --object-path /org/freedesktop/login1 --method org.freedesktop.login1.Manager.GetUser "$(id -u)" >/dev/null 2>&1 && break
        sleep 0.02
    done
    gdbus call --system --dest org.freedesktop.login1 --object-path /org/freedesktop/login1 --method org.freedesktop.login1.Manager.GetUser "$(id -u)" >/dev/null || { cat "$XDG_RUNTIME_DIR/login-stub.log" >&2; exit 1; }
    export WAYLAND_DISPLAY="gaq-prefs-test-$$"
    gnome-shell --headless --wayland --wayland-display "$WAYLAND_DISPLAY" --virtual-monitor 1280x800 >"$GAQ_TEST_SCRATCH/shell.log" 2>&1 &
    shell_pid=$!
    trap '\''jobs -pr | xargs -r kill 2>/dev/null || true; wait 2>/dev/null || true'\'' EXIT
    for _ in $(seq 1 100); do
        test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" && break
        sleep 0.1
    done
    run_states() {
        for variant in "" "rtl" "expanded" "rtl expanded" "expanded large-font" "rtl expanded large-font"; do
            read -r -a args <<< "$variant"
            timeout 40 gjs -m "$GAQ_TEST_ROOT/tests/prefsStates.js" "${args[@]}"
        done
    }
    if [ "$GAQ_SMOKE_MODE" = popup ]; then
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsPopup.js"
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsPopup.js" live
    elif [ "$GAQ_SMOKE_MODE" = reports ]; then
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsReports.js"
    elif [ "$GAQ_SMOKE_MODE" = connectors ]; then
        for variant in "" "rtl" "expanded" "rtl expanded"; do
            read -r -a args <<< "$variant"
            timeout 40 gjs -m "$GAQ_TEST_ROOT/tests/prefsConnectors.js" "${args[@]}"
        done
    elif [ "$GAQ_SMOKE_MODE" = states ]; then
        run_states
    elif [ "$GAQ_SMOKE_MODE" != startup ]; then
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsSmoke.js"
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsSmoke.js" rtl
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsSmoke.js" expanded
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsSmoke.js" rtl expanded
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsSmoke.js" expanded large-font
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsSmoke.js" rtl expanded large-font
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsLifecycle.js"
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsPopup.js"
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsPopup.js" live
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsReports.js"
        run_states
    fi
    if [ "$GAQ_SMOKE_MODE" != states ] && [ "$GAQ_SMOKE_MODE" != connectors ] && [ "$GAQ_SMOKE_MODE" != reports ] && [ "$GAQ_SMOKE_MODE" != popup ]; then
    if [ "$GAQ_SMOKE_MODE" = startup ] || [ "$GAQ_SMOKE_MODE" = all ]; then
        bus_path=${DBUS_SESSION_BUS_ADDRESS#unix:path=}
        bus_path=${bus_path%%,*}
        [[ "$bus_path" = /* && -S "$bus_path" ]] || { echo "private D-Bus socket unavailable" >&2; exit 1; }
        bwrap --die-with-parent --unshare-all --ro-bind /usr /usr \
            --symlink usr/lib64 /lib64 --symlink usr/lib /lib --proc /proc --dev /dev \
            --tmpfs /tmp --tmpfs /run --ro-bind "$bus_path" /run/bus \
            --ro-bind "$GAQ_TEST_ROOT/tests/syntheticSecrets.js" /service.js \
            --setenv DBUS_SESSION_BUS_ADDRESS unix:path=/run/bus --setenv HOME /tmp \
            --setenv XDG_RUNTIME_DIR /tmp --setenv XDG_DATA_HOME /tmp/data \
            --setenv XDG_CONFIG_HOME /tmp/config --setenv XDG_CACHE_HOME /tmp/cache \
            --setenv XDG_STATE_HOME /tmp/state --unsetenv DBUS_SYSTEM_BUS_ADDRESS \
            /usr/bin/gjs -m /service.js >"$GAQ_TEST_SCRATCH/secrets.log" 2>&1 &
        secret_pid=$!
        for _ in $(seq 1 100); do
            grep -q READY "$GAQ_TEST_SCRATCH/secrets.log" && break
            kill -0 "$secret_pid" || { cat "$GAQ_TEST_SCRATCH/secrets.log" >&2; exit 1; }
            sleep 0.1
        done
        grep -q READY "$GAQ_TEST_SCRATCH/secrets.log" || { echo "synthetic Secret Service failed to start" >&2; exit 1; }
    fi
        timeout 60 gjs -m "$GAQ_TEST_ROOT/tests/prefsStartup.js"
    fi
'
