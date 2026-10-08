#!/usr/bin/env bash
# The static analysis that runs in CI (.github/workflows), run locally with the same commands:
#
#   tools/sast.sh
#
# bandit and zizmor look at the Python tools and the workflows, Semgrep at the JavaScript,
# ShellCheck at the shell scripts, gitleaks at the history. A tool that is not installed is
# skipped with a note (pipx install bandit semgrep zizmor; gitleaks and shellcheck come from your
# package manager). Exit status is 0 only when every tool that ran found nothing.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
failed=0
ran=0

scan() {
    local tool="$1"
    shift
    if ! command -v "$tool" >/dev/null 2>&1; then
        printf '== %s: not installed, skipped\n' "$tool"
        return
    fi
    printf '== %s\n' "$tool"
    ran=$((ran + 1))
    if ! "$@"; then
        printf 'FINDINGS: %s\n' "$tool" >&2
        failed=1
    fi
}

scan bandit bandit --recursive --quiet tools
scan semgrep semgrep scan --config p/javascript --config p/security-audit --config p/secrets \
    --metrics=off --error --quiet --exclude tests .
scan shellcheck shellcheck --severity=warning tools/*.sh tests/*.sh .githooks/pre-commit
scan zizmor zizmor --format=plain --quiet .github
scan gitleaks gitleaks git . --config .gitleaks.toml --redact --no-banner --log-level warn

printf '\n%d tool(s) ran\n' "$ran"
exit "$failed"
