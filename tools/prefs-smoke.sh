#!/usr/bin/env bash
# Exercise setup with fake controllers, then full startup with an empty private keyring.
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
export XDG_DATA_HOME="$scratch/data" XDG_CONFIG_HOME="$scratch/config" XDG_CACHE_HOME="$scratch/cache"
export XDG_STATE_HOME="$scratch/state" GIO_USE_VFS=local
mkdir -m 700 "$scratch/runtime"
export XDG_RUNTIME_DIR="$scratch/runtime"
export GTK_A11Y=none GSETTINGS_BACKEND=memory
# Full prefs integration imports the installed extension app’s private Shew typelib.
export GI_TYPELIB_PATH="/usr/lib64/gnome-shell/girepository-1.0${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
unset GNOME_KEYRING_CONTROL SSH_AUTH_SOCK AT_SPI_BUS_ADDRESS
# Explicit display name ensures tests never connect to the user's desktop.
dbus-run-session -- bash -c '
    set -euo pipefail
    if [ -x /usr/libexec/at-spi-bus-launcher ]; then
        /usr/libexec/at-spi-bus-launcher --launch-immediately >"$GAQ_TEST_SCRATCH/a11y.log" 2>&1 &
    fi
    # Full startup reads only this empty, private Secret Service session collection.
    mkdir -m 700 "$GAQ_TEST_SCRATCH/keyring"
    XDG_RUNTIME_DIR="$GAQ_TEST_SCRATCH/keyring" gnome-keyring-daemon --start --components=secrets >/dev/null 2>&1
    timeout 5 gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets \
        --method org.freedesktop.Secret.Service.SetAlias default /org/freedesktop/secrets/collection/session >/dev/null
    export WAYLAND_DISPLAY="gaq-prefs-test-$$"
    gnome-shell --headless --wayland --wayland-display "$WAYLAND_DISPLAY" --virtual-monitor 1280x800 >"$GAQ_TEST_SCRATCH/shell.log" 2>&1 &
    shell_pid=$!
    trap '\''kill "$shell_pid" 2>/dev/null || true; wait "$shell_pid" 2>/dev/null || true'\'' EXIT
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
    if [ "$GAQ_SMOKE_MODE" = reports ]; then
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
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsReports.js"
        run_states
    fi
    if [ "$GAQ_SMOKE_MODE" != states ] && [ "$GAQ_SMOKE_MODE" != connectors ] && [ "$GAQ_SMOKE_MODE" != reports ]; then
        timeout 30 gjs -m "$GAQ_TEST_ROOT/tests/prefsStartup.js"
    fi
'
