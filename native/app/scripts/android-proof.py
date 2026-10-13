#!/usr/bin/env python3
# native/app/scripts/android-proof.py
# #2560: to lesere for Android-beviset (`store-build-proof-android.sh`). Skriptet
# eier reglene (PASS/FAIL); denne fila leser bare fakta ut av AAB-en.
#
#   android-proof.py manifest < xmltree.txt
#       Leser `aapt2 dump xmltree`-utdata for manifestet (AAB-manifestet er
#       protobuf, og aapt2 leser det når skriptet har pakket det om til en
#       proto-APK). Skriver én fakta-linje per verdi:
#         package=… · versionCode=… · versionName=… · minSdk=… · targetSdk=…
#         debuggable=true|false|ikke-satt
#         permission=<navn>        én linje per uses-permission(-sdk-23)
#         autoverify-host=<vert>   én linje per vert i et intent-filter med
#                                  android:autoVerify="true"
#
#   android-proof.py elf-align <fil.so>
#       Minste `p_align` blant PT_LOAD-segmentene i en ELF-fil (32 eller 64 bit,
#       begge endianer). Exit 1 når fila ikke er ELF eller mangler LOAD.
#
# Bare standardbiblioteket: beviset skal kjøre med /usr/bin/python3 uten noe
# installert.
import re
import struct
import sys

ATTR = re.compile(r'^A: (?:[^=]*?:)?([A-Za-z0-9_]+)(?:\(0x[0-9a-f]+\))?=(.*)$')
RAW = re.compile(r'\(Raw: "(.*)"\)\s*$')


def attr_value(rest):
    raw = RAW.search(rest)
    if raw:
        return raw.group(1)
    value = rest.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1]
    return value


def parse_xmltree(text):
    """Tre av (navn, attributter, barn) fra aapt2 sitt innrykk (to mellomrom per nivå)."""
    root = {'name': '#root', 'attrs': {}, 'children': []}
    stack = [(-1, root)]
    for line in text.splitlines():
        stripped = line.lstrip(' ')
        indent = len(line) - len(stripped)
        if stripped.startswith('E: '):
            name = stripped[3:].split(' ', 1)[0]
            while stack[-1][0] >= indent:
                stack.pop()
            element = {'name': name, 'attrs': {}, 'children': []}
            stack[-1][1]['children'].append(element)
            stack.append((indent, element))
        elif stripped.startswith('A: '):
            match = ATTR.match(stripped)
            if not match:
                continue
            while stack[-1][0] >= indent:
                stack.pop()
            stack[-1][1]['attrs'][match.group(1)] = attr_value(match.group(2))
    return root


def walk(element):
    yield element
    for child in element['children']:
        yield from walk(child)


def manifest_facts(text):
    root = parse_xmltree(text)
    manifest = next((e for e in root['children'] if e['name'] == 'manifest'), None)
    if manifest is None:
        print('fant ikke <manifest> i aapt2-utdataene', file=sys.stderr)
        return 1
    attrs = manifest['attrs']
    print(f"package={attrs.get('package', '')}")
    print(f"versionCode={attrs.get('versionCode', '')}")
    print(f"versionName={attrs.get('versionName', '')}")
    uses_sdk = next((e for e in manifest['children'] if e['name'] == 'uses-sdk'), {'attrs': {}})
    print(f"minSdk={uses_sdk['attrs'].get('minSdkVersion', '')}")
    print(f"targetSdk={uses_sdk['attrs'].get('targetSdkVersion', '')}")
    application = next((e for e in manifest['children'] if e['name'] == 'application'), {'attrs': {}})
    print(f"debuggable={application['attrs'].get('debuggable', 'ikke-satt')}")
    for child in manifest['children']:
        if child['name'] in ('uses-permission', 'uses-permission-sdk-23'):
            print(f"permission={child['attrs'].get('name', '')}")
    for element in walk(manifest):
        if element['name'] == 'intent-filter' and element['attrs'].get('autoVerify') == 'true':
            for data in walk(element):
                if data['name'] == 'data' and 'host' in data['attrs']:
                    print(f"autoverify-host={data['attrs']['host']}")
    return 0


def elf_align(path):
    with open(path, 'rb') as handle:
        data = handle.read()
    if data[:4] != b'\x7fELF':
        print(f'{path}: ikke en ELF-fil', file=sys.stderr)
        return 1
    is64 = data[4] == 2
    endian = '<' if data[5] == 1 else '>'
    if is64:
        phoff, = struct.unpack_from(endian + 'Q', data, 0x20)
        phentsize, phnum = struct.unpack_from(endian + 'HH', data, 0x36)
    else:
        phoff, = struct.unpack_from(endian + 'I', data, 0x1C)
        phentsize, phnum = struct.unpack_from(endian + 'HH', data, 0x2A)
    aligns = []
    for i in range(phnum):
        base = phoff + i * phentsize
        p_type, = struct.unpack_from(endian + 'I', data, base)
        if p_type != 1:  # PT_LOAD
            continue
        if is64:
            p_align, = struct.unpack_from(endian + 'Q', data, base + 48)
        else:
            p_align, = struct.unpack_from(endian + 'I', data, base + 28)
        aligns.append(p_align)
    if not aligns:
        print(f'{path}: ingen LOAD-segmenter', file=sys.stderr)
        return 1
    print(min(aligns))
    return 0


def main(argv):
    if len(argv) == 2 and argv[1] == 'manifest':
        return manifest_facts(sys.stdin.read())
    if len(argv) == 3 and argv[1] == 'elf-align':
        return elf_align(argv[2])
    print('Bruk: android-proof.py manifest < xmltree.txt | android-proof.py elf-align <fil.so>', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
