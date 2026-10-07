"""Stop a secret from entering the repository.

    python3 -I tools/check-secrets.py            # what is staged (the pre-commit hook)
    python3 -I tools/check-secrets.py --all      # every tracked file

It needs nothing but git and Python, and it always runs: a check that is skipped when a
tool is missing protects nobody. It looks for
  - the formats of credentials that have no business in a repository (a Google client
    secret, a JSON web token, a private key, a GitHub or API token),
  - any word whose SHA-256 is on tests/known-ids.sha256 (public client ids of the tools
    this extension signs in with: the list holds their hashes, never the ids), and
  - every client id or secret in your ~/.config/gnome-ai-quota/providers.local.json.
Nothing it finds is printed: only the file and the kind of finding.
"""
import hashlib
import json
import os
import pathlib
import re
# subprocess only ever runs git, with arguments written in this file.
import subprocess  # nosec B404
import sys

PATTERNS = {
    'a Google client secret': re.compile(r'GOCSPX-[A-Za-z0-9_-]{20,}'),
    'a JSON web token': re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
    'a private key': re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
    'an API token': re.compile(r'\b(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})\b'),
}
WORD = re.compile(r'[A-Za-z0-9_-]{20,}')


def git(*args):
    # A fixed command and no shell.
    return subprocess.run(['git', *args], capture_output=True, text=True, check=False).stdout  # nosec B603 B607


def known_hashes():
    path = pathlib.Path('tests/known-ids.sha256')
    return set(path.read_text().split()) if path.exists() else set()


def local_values():
    base = os.environ.get('XDG_CONFIG_HOME') or str(pathlib.Path.home() / '.config')
    path = pathlib.Path(base) / 'gnome-ai-quota' / 'providers.local.json'
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return set()
    return {value for entry in data.get('providers', {}).values() if isinstance(entry, dict)
            for key, value in entry.items() if key in ('clientId', 'clientSecret') and isinstance(value, str) and len(value) >= 8}


def staged_text():
    """What is being added: the text of every added line, by file."""
    out, current = {}, None
    for line in git('diff', '--cached', '-U0', '--no-color').splitlines():
        if line.startswith('+++ '):
            current = line[6:] if line.startswith('+++ b/') else None
        elif line.startswith('+') and current:
            out[current] = out.get(current, '') + line[1:] + '\n'
    return out


def tracked_text():
    out = {}
    for name in git('ls-files', '-z').split('\0'):
        if not name or re.search(r'\.(png|svg|mo|gresource|compiled)$', name):
            continue
        try:
            out[name] = pathlib.Path(name).read_text(errors='ignore')
        except OSError:
            pass
    return out


def main():
    texts = tracked_text() if '--all' in sys.argv else staged_text()
    hashes, values = known_hashes(), local_values()
    findings = []
    for name, text in texts.items():
        for kind, pattern in PATTERNS.items():
            if pattern.search(text):
                findings.append(f'{name}: looks like {kind}')
        if any(hashlib.sha256(word.encode()).hexdigest() in hashes for word in set(WORD.findall(text))):
            findings.append(f'{name}: holds a known client id')
        if any(value in text for value in values):
            findings.append(f'{name}: holds a value from your providers.local.json')
    for finding in findings:
        print(f'check-secrets: {finding}', file=sys.stderr)
    return 1 if findings else 0


sys.exit(main())
