#!/usr/bin/env python3
"""Ensure nested shell extension calls use the same endpoint as headless."""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
nested = (root / 'tools/nested-shell.sh').read_text()
for method in ('ListExtensions', 'EnableExtension', 'OpenExtensionPrefs'):
    pattern = (r'gdbus call --session --dest org\.gnome\.Shell\s+'
               r'--object-path /org/gnome/Shell\s+\\?\s*'
               r'--method org\.gnome\.Shell\.Extensions\.' + method + r'\b')
    assert re.search(pattern, nested), f'{method} uses the wrong D-Bus endpoint'
print('nested endpoint checks passed')
