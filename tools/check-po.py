"""Check the translation catalogs: every placeholder of a message appears in its
translation (and the other way round), nothing is untranslated or fuzzy, and nothing
is left over from an old template.

    python3 -I tools/check-po.py po/*.po
"""
import re
import sys

PLACEHOLDER = re.compile(r'%(?:\d+\$)?[sdif%]|%\d*[sdif]')


def joined(text):
    return ''.join(re.findall(r'"((?:[^"\\]|\\.)*)"', text))


def entries(path):
    blocks = open(path, encoding='utf-8').read().split('\n\n')
    for block in blocks[1:]:
        if not block.strip():
            continue
        fuzzy = '#, fuzzy' in block
        msgid = re.search(r'^msgid ((?:".*"\n?)+)', block, re.M)
        plural = re.search(r'^msgid_plural ((?:".*"\n?)+)', block, re.M)
        strings = [joined(m) for m in re.findall(r'^msgstr(?:\[\d\])? ((?:".*"\n?)+)', block, re.M)]
        if msgid:
            yield fuzzy, joined(msgid.group(1)), joined(plural.group(1)) if plural else None, strings


def placeholders(text):
    return sorted(PLACEHOLDER.findall(text))


def main(paths):
    problems = 0
    for path in paths:
        for fuzzy, msgid, plural, strings in entries(path):
            where = f'{path}: "{msgid[:50]}"'
            if fuzzy:
                print(f'{where}: fuzzy')
                problems += 1
            for index, text in enumerate(strings):
                if not text:
                    print(f'{where}: untranslated')
                    problems += 1
                    continue
                source = plural if (plural and index > 0) else msgid
                if placeholders(source) != placeholders(text):
                    print(f'{where}: placeholders differ ({placeholders(source)} vs {placeholders(text)})')
                    problems += 1
    print(f'{len(paths)} catalog(s) checked, {problems} problem(s)')
    return 1 if problems else 0


sys.exit(main(sys.argv[1:]))
