"""Write the OAuth client ids the extension needs to your local configuration.

    python3 -I tools/import-client-ids.py [--force] [codex ...]

For each provider this looks first for the client id the AI tool installed on this
computer uses (a public identifier embedded in its program; no token or credential
file is read), then in that tool's open-source code, and writes the result to
~/.config/gnome-ai-quota/providers.local.json (directory 0700, file 0600).

The ids are never printed, never go into the repository and are not read by the
extension from the AI tools while it runs (docs/adr/0002, 0009). To use another id,
edit the file by hand. An existing id is kept unless --force is given.
"""
import argparse
import json
import os
import pathlib
import re
import shutil
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request

CONFIG = pathlib.Path(os.environ.get('XDG_CONFIG_HOME', pathlib.Path.home() / '.config')) / 'gnome-ai-quota' / 'providers.local.json'

# For each provider: the command of the local tool, the pattern of its client id in the
# program, and where its open-source code defines it (a raw file and a pattern).
PROVIDERS = {
    'codex': {
        'command': 'codex',
        'binary_pattern': rb'app_[A-Za-z0-9]{24}',
        'public_url': 'https://raw.githubusercontent.com/openai/codex/main/codex-rs/login/src/auth/manager.rs',
        'public_pattern': r'CLIENT_ID:\s*&str\s*=\s*"([^"]+)"',
        'id_pattern': r'^app_[A-Za-z0-9]{24}$',
    },
    'antigravity': {
        'command': 'agy',
        # A Google desktop-app client: an id and a secret, both in the program. Several ids and
        # secrets are in there, so a pair is only accepted after Google itself says it is one.
        'custom': 'google_pair',
    },
    'claude': {
        'command': 'claude',
        # Claude Code is not open source: the id sits next to the token address in its program.
        'binary_pattern': rb'TOKEN_URL:"https://platform\.claude\.com/v1/oauth/token".{0,900}?CLIENT_ID:"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"',
        'id_pattern': r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    },
}


def candidate_binaries(command):
    """The tool's program files: the command itself and, for a script, the large
    executables of the package it belongs to."""
    path = shutil.which(command)
    if not path:
        return []
    real = pathlib.Path(path).resolve()
    found = [real]
    # Only inside the tool's own package (the folder with its package.json), never a wide
    # folder such as /usr or the home directory.
    home = pathlib.Path.home()
    package = next((folder for folder in real.parents if folder != home and (folder / 'package.json').is_file()), None)
    if package is None:
        return found
    for root, _dirs, files in os.walk(package):
        for name in files:
            file = pathlib.Path(root) / name
            try:
                if file.is_file() and file.stat().st_size > 1_000_000 and os.access(file, os.X_OK):
                    found.append(file)
            except OSError:
                pass
    return found


def looks_like_an_id(text):
    """A client id mixes upper case, lower case and digits; plain words that happen to
    start the same way do not."""
    body = text[4:]
    return bool(re.search(r'[a-z]', body) and re.search(r'[A-Z]', body) and re.search(r'[0-9]', body))


def from_binary(spec):
    """The id in the tool's own program, when exactly one candidate looks like an id. The
    program is what the command resolves to (a launcher script is followed to the real
    file), plus files in its package named like the command. Anything less certain falls
    through to the open-source code, if the tool has one."""
    pattern = re.compile(spec['binary_pattern'], re.DOTALL)
    candidates = candidate_binaries(spec['command'])
    for index, file in enumerate(candidates):
        if index > 0 and file.name != spec['command']:
            continue
        try:
            data = file.read_bytes()
        except OSError:
            continue
        found = set()
        for match in pattern.findall(data):
            value = match.decode() if isinstance(match, bytes) else match.decode()
            found.add(value)
        if 'id_pattern' in spec:
            found = {value for value in found if re.fullmatch(spec['id_pattern'], value)}
        else:
            found = {value for value in found if looks_like_an_id(value)}
        if len(found) == 1:
            return found.pop(), 'the installed program'
    return None, None


def google_pair(spec):
    """The id and secret of the Google client the installed program signs in with.

    Every candidate id is tried with every candidate secret against Google's token address
    with a made-up code: `invalid_grant` means the id and the secret belong together,
    `invalid_client` that they do not. No credential is involved or sent."""
    path = shutil.which(spec['command'])
    if not path:
        return None, None
    try:
        data = pathlib.Path(path).resolve().read_bytes()
    except OSError:
        return None, None
    ids = {m.decode() for m in re.findall(rb'[0-9]{12,13}-[a-z0-9]{30,34}\.apps\.googleusercontent\.com', data)}
    # Strings sit side by side in the program: a secret is the first 35 characters.
    secrets = {m.decode()[:35] for m in re.findall(rb'GOCSPX-[A-Za-z0-9_-]{20,}', data)}
    pairs = []
    for client_id in sorted(ids):
        for secret in sorted(secrets):
            body = urllib.parse.urlencode({
                'grant_type': 'authorization_code', 'code': 'not-a-real-code', 'client_id': client_id,
                'client_secret': secret, 'redirect_uri': 'http://127.0.0.1:51121/oauth-callback', 'code_verifier': 'x' * 43,
            }).encode()
            request = urllib.request.Request('https://oauth2.googleapis.com/token', data=body,
                                             headers={'Content-Type': 'application/x-www-form-urlencoded'})
            try:
                urllib.request.urlopen(request, timeout=15)  # noqa: S310 (fixed https url)
            except urllib.error.HTTPError as error:
                try:
                    verdict = json.loads(error.read().decode()).get('error')
                except ValueError:
                    verdict = None
                if verdict == 'invalid_grant':
                    pairs.append({'clientId': client_id, 'clientSecret': secret})
            except OSError:
                print(f'{spec["command"]}: could not reach Google to check the candidates (no network?)')
                return None, None
    # Only one pair is certain. Several would mean other Google clients in the program (a
    # cloud SDK, say), and the consent screen would then name the wrong application.
    if len(pairs) == 1:
        return pairs[0], 'the installed program, checked with Google'
    return None, None


def from_public_source(spec):
    if 'public_url' not in spec:
        return None, None
    try:
        with urllib.request.urlopen(spec['public_url'], timeout=20) as reply:  # noqa: S310 (fixed https url)
            text = reply.read(2_000_000).decode('utf-8', 'replace')
    except OSError:
        return None, None
    match = re.search(spec['public_pattern'], text)
    # Whatever the page says, only a value shaped like this provider's ids is accepted.
    if match and re.fullmatch(spec['id_pattern'], match.group(1)):
        return match.group(1), 'the open-source code'
    return None, None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('providers', nargs='*', default=list(PROVIDERS))
    parser.add_argument('--force', action='store_true', help='replace an id that is already set')
    args = parser.parse_args()

    unknown = [name for name in args.providers if name not in PROVIDERS]
    if unknown:
        sys.exit(f'unknown provider: {", ".join(unknown)}')

    data = {'version': 1, 'providers': {}}
    if CONFIG.exists():
        try:
            data = json.loads(CONFIG.read_text())
        except (OSError, ValueError):
            sys.exit(f'{CONFIG} exists but cannot be read; fix or remove it first')
        data.setdefault('providers', {})

    changed = False
    for name in args.providers:
        entry = data['providers'].get(name)
        if not isinstance(entry, dict):
            entry = {}
        needs_secret = PROVIDERS[name].get('custom') == 'google_pair'
        if entry.get('clientId') and (entry.get('clientSecret') or not needs_secret) and not args.force:
            print(f'{name}: already set, kept')
            continue
        spec = PROVIDERS[name]
        if spec.get('custom') == 'google_pair':
            found, source = google_pair(spec)
            client_id = found['clientId'] if found else None
            if found:
                entry['clientSecret'] = found['clientSecret']
        else:
            client_id, source = from_binary(spec)
            if not client_id:
                client_id, source = from_public_source(spec)
        if not client_id:
            print(f'{name}: not found; add its clientId to {CONFIG} by hand')
            continue
        entry['clientId'] = client_id
        data['providers'][name] = entry
        changed = True
        print(f'{name}: set from {source}')

    if changed:
        CONFIG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(CONFIG.parent, 0o700)
        # Write a private temporary file next to it, then replace: a crash never leaves half a file.
        temporary = CONFIG.with_name(CONFIG.name + '.tmp')
        temporary.unlink(missing_ok=True)      # left by an earlier crash
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w') as out:
            json.dump(data, out, indent=2)
            out.write('\n')
        os.replace(temporary, CONFIG)
        print(f'written to {CONFIG}')


main()
