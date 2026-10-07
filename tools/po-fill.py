"""Rebuild po/pt_BR.po from po/gnome-ai-quota.pot.

Keeps the existing translations that are not fuzzy, adds the ones given in a JSON
file ({"msgid": "translation"} or {"msgid": ["singular", "plural"]}) and prints the
msgids that still have no translation. Entries that left the template are dropped,
and msgmerge's fuzzy guesses are never kept.

    python3 -I tools/po-fill.py new-translations.json
"""
import json
import re
import sys


def joined(text):
    return ''.join(re.findall(r'"((?:[^"\\]|\\.)*)"', text))


def unquote(s):
    return s.replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')


def quote(s):
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')


def main():
    old = {}
    blocks = open('po/pt_BR.po', encoding='utf-8').read().split('\n\n')
    header = blocks[0]
    for block in blocks[1:]:
        if '#, fuzzy' in block:
            continue
        ctx = re.search(r'^msgctxt "(.*)"', block, re.M)
        msgid = re.search(r'^msgid ((?:".*"\n?)+)', block, re.M)
        if not msgid:
            continue
        key = (ctx.group(1) if ctx else '', unquote(joined(msgid.group(1))))
        if re.search(r'^msgid_plural', block, re.M):
            old[key] = [unquote(joined(m)) for m in re.findall(r'^msgstr\[\d\] ((?:".*"\n?)+)', block, re.M)]
        else:
            msgstr = re.search(r'^msgstr ((?:".*"\n?)+)', block, re.M)
            if msgstr and unquote(joined(msgstr.group(1))):
                old[key] = unquote(joined(msgstr.group(1)))
    for msgid, translation in json.load(open(sys.argv[1], encoding='utf-8')).items():
        old[('', msgid)] = translation

    out, missing = [header], []
    for block in open('po/gnome-ai-quota.pot', encoding='utf-8').read().split('\n\n')[1:]:
        if not block.strip():
            continue
        ctx = re.search(r'^msgctxt "(.*)"', block, re.M)
        msgid = re.search(r'^msgid ((?:".*"\n?)+)', block, re.M)
        plural = re.search(r'^msgid_plural ((?:".*"\n?)+)', block, re.M)
        key = (ctx.group(1) if ctx else '', unquote(joined(msgid.group(1))))
        translation = old.get(key)
        refs = '\n'.join(line for line in block.split('\n') if line.startswith('#:'))
        body = ('msgctxt "%s"\n' % ctx.group(1) if ctx else '') + 'msgid ' + msgid.group(1).rstrip('\n') + '\n'
        if plural:
            if not isinstance(translation, list):
                missing.append(key[1])
                continue
            body += 'msgid_plural ' + plural.group(1).rstrip('\n') + '\n'
            body += 'msgstr[0] "%s"\nmsgstr[1] "%s"' % (quote(translation[0]), quote(translation[1]))
        else:
            if not isinstance(translation, str):
                missing.append(key[1])
                continue
            body += 'msgstr "%s"' % quote(translation)
        out.append((refs + '\n' if refs else '') + body)
    open('po/pt_BR.po', 'w', encoding='utf-8').write('\n\n'.join(out) + '\n')
    print('missing:', missing)


main()
