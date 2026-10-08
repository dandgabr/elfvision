#!/usr/bin/env bash
# Reproducible private native effects gates; screenshots contain demo/synthetic content only.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p .superpowers/sdd/2026-10-07-post-mvp-execution
mkdir -p .superpowers/sdd/2026-10-07-open-items
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
unset GAQ_RESOURCE_MATRIX_ONLY
case "${1:-quick}" in
    quick) probe=effects-probe; verify=effects-verify; seconds=5; limit=90; marker=GAQ_EFFECTS_OK ;;
    visual) probe=effects-visual-probe; verify=effects-visual-verify; seconds=12; limit=90; marker='"finished' ;;
    inventory) probe=effects-inventory-probe; verify=effects-inventory-verify; seconds=35; limit=100; marker=GAQ_EFFECTS_INVENTORY_OK ;;
    benchmark) probe=effects-benchmark-probe; verify=effects-benchmark-verify; seconds=240; limit=300; marker='"finished' ;;
    matrix) probe=effects-benchmark-probe; verify=effects-benchmark-verify; seconds=20; limit=90; marker='"finished'; export GAQ_RESOURCE_MATRIX_ONLY=1 ;;
    frames) probe=effects-frame-probe; verify=effects-frame-verify; seconds=260; limit=320; marker=GAQ_FRAME_PROFILE_OK ;;
    lifecycle) probe=effects-lifecycle-probe; verify=effects-lifecycle-verify; seconds=40; limit=100; marker=GAQ_EFFECTS_LIFECYCLE_OK ;;
    *) echo 'Usage: tools/effects-check.sh [quick|visual|inventory|benchmark|matrix|frames|lifecycle]' >&2; exit 2 ;;
esac
if ! DATA_SOURCE=demo SKIP_ENABLE='' LOG="$scratch/shell.log" GAQ_TEST_MONITOR=1280x800 timeout --kill-after=5s "$limit" tools/headless-shell.sh "tools/$probe.js" "sleep:$seconds" "tools/$verify.js" > "$scratch/result" 2>&1; then
    cat "$scratch/result"; exit 1
fi
cat "$scratch/result"
if grep -q '(false,' "$scratch/result" || ! grep -q "$marker" "$scratch/result"; then exit 1; fi
if grep -Eq 'already disposed|JS ERROR|CRITICAL|Extension.*Error' "$scratch/shell.log" "$scratch/result"; then
    echo 'Native Shell error in effects gate' >&2; exit 1
fi
if [[ ${1:-quick} == visual ]]; then python3 tools/effects-image-check.py; fi
if [[ ${1:-quick} == inventory ]]; then python3 tools/effects-contact-sheet.py; fi
