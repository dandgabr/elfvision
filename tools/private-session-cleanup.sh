#!/usr/bin/env bash
# Sourced by the isolated helpers. Private portal mounts can disappear shortly
# after their D-Bus session exits; retry cleanup without masking a persistent failure.
cleanup_private_session() {
    local path="$1" attempt
    for ((attempt = 0; attempt < 20; attempt++)); do
        if rm -rf -- "$path" 2>/dev/null; then
            return 0
        fi
        sleep 0.1
    done
    rm -rf -- "$path"
}
