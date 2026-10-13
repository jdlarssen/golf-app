// native/app/scripts/android-proof.test.js
// #2560: leserne Android-beviset bygger på (`android-proof.py`).
//
// Beviset eier reglene, men det kan bare stole på det leserne gir det. Fire
// ting må stå:
//
//  1. **Manifest-leseren gir de riktige fakta** fra ekte `aapt2 dump xmltree`-
//     utdata (fiksturene er hentet fra butikk-AAB-en og TWA-AAB-en).
//  2. **Fail-closed ved uventet format.** En boolsk verdi aapt2 skriver typet
//     (`(type 0x12)0xffffffff`) eller som noe leseren ikke kjenner, regnes
//     aldri som «ikke satt»: `debuggable` blir `true` eller `ukjent:…`, og et
//     `autoVerify` som ikke er tydelig `false`, gir vertene videre. Et manifest
//     uten `package` er en lesefeil (exit 1), ikke et tomt svar.
//  3. **ELF-leseren gir minste `p_align` blant LOAD-segmentene** for 32- og
//     64-bit, begge endianer, og exit 1 når fila ikke er ELF, mangler LOAD
//     eller er avkortet.
//  4. **`blocked` melder hver tillatelse fra `blockedPermissions` som står i
//     manifestet**, og er fail-closed på begge sider: en app.json uten lista
//     (eller med den tom) og et manifest som ikke ble lest, gir exit 1, aldri
//     «ingen treff».
//
// Python kjøres som i beviset; `python3` fra PATH, som finnes på Mac-en og i
// CI (ubuntu-latest).
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, 'android-proof.py');
const STORE = readFileSync(join(__dirname, '__fixtures__', 'manifest-store.xmltree.txt'), 'utf8');
const TWA_AUTOVERIFY = readFileSync(join(__dirname, '__fixtures__', 'manifest-twa-autoverify.xmltree.txt'), 'utf8');

// Ekte linje fra debug-AAB-en av dev-varianten (samme aapt2-dump, 2026-10-13).
const DEBUGGABLE_LINE =
  '        A: http://schemas.android.com/apk/res/android:debuggable(0x0101000f)=true (Raw: "true")';
const APP_LINE = '      E: application (line=84)';

function run(args, input) {
  const result = spawnSync('python3', [SCRIPT, ...args], { input, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

/** Fakta-linjene som et objekt; nøkler som gjentas (permission, autoverify-host) blir lister. */
function facts(xmltree) {
  const { status, stdout } = run(['manifest'], xmltree);
  const out = { status, permission: [], 'autoverify-host': [] };
  for (const line of stdout.split('\n').filter(Boolean)) {
    const [key, ...rest] = line.split('=');
    const value = rest.join('=');
    if (Array.isArray(out[key])) out[key].push(value);
    else out[key] = value;
  }
  return out;
}

/** Butikk-manifestet med én ekstra linje rett under `E: application`. */
function withApplicationAttr(line) {
  return STORE.replace(APP_LINE, `${APP_LINE}\n${line}`);
}

/** Butikk-manifestet med TWA-ens autoVerify-filter inne i MainActivity. */
function withAutoVerify(transform = (s) => s) {
  const filter = TWA_AUTOVERIFY.split('\n').filter((l) => !l.startsWith('#')).join('\n');
  return `${STORE.trimEnd()}\n${transform(filter)}\n`;
}

describe('android-proof.py manifest', () => {
  it('leser pakke, versjon, SDK-nivåer og tillatelser fra butikk-AAB-en', () => {
    const f = facts(STORE);
    expect(f.status).toBe(0);
    expect([f.package, f.versionCode, f.versionName, f.minSdk, f.targetSdk]).toEqual([
      'no.tornygolf.app',
      '3',
      '1.1.0',
      '24',
      '36',
    ]);
    expect(f.permission).toEqual([
      'android.permission.INTERNET',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ]);
  });

  it('melder debuggable som ikke satt og ingen autoVerify-vert for butikk-AAB-en', () => {
    const f = facts(STORE);
    expect(f.debuggable).toBe('ikke-satt');
    expect(f['autoverify-host']).toEqual([]);
  });

  it('leser debuggable=true fra debug-AAB-ens linje', () => {
    expect(facts(withApplicationAttr(DEBUGGABLE_LINE)).debuggable).toBe('true');
  });

  it.each([
    ['typet sann verdi', '=(type 0x12)0xffffffff', 'true'],
    ['bare heksverdien', '=0xffffffff', 'true'],
    ['eksplisitt false', '=false (Raw: "false")', 'false'],
    ['typet usann verdi', '=(type 0x12)0x0', 'false'],
  ])('tolker debuggable som %s', (_label, tail, expected) => {
    const line = `        A: http://schemas.android.com/apk/res/android:debuggable(0x0101000f)${tail}`;
    expect(facts(withApplicationAttr(line)).debuggable).toBe(expected);
  });

  it('gir en ukjent debuggable-verdi videre som ukjent, aldri som «ikke satt»', () => {
    const line = '        A: http://schemas.android.com/apk/res/android:debuggable(0x0101000f)=@bool/kanskje';
    expect(facts(withApplicationAttr(line)).debuggable).toBe('ukjent:@bool/kanskje');
  });

  it('gir verten fra et autoVerify-filter videre, også som ressursreferanse', () => {
    expect(facts(withAutoVerify())['autoverify-host']).toEqual(['@string/hostName']);
  });

  it.each([
    ['typet sann verdi', '=(type 0x12)0xffffffff'],
    ['en verdi leseren ikke kjenner', '=@bool/kanskje'],
  ])('gir vertene videre når autoVerify er %s (fail-closed)', (_label, tail) => {
    const f = facts(withAutoVerify((s) => s.replace(/=true \(Raw: "true"\)/, tail)));
    expect(f['autoverify-host']).toEqual(['@string/hostName']);
  });

  it('gir ingen verter når autoVerify er false', () => {
    const f = facts(withAutoVerify((s) => s.replace(/=true \(Raw: "true"\)/, '=false (Raw: "false")')));
    expect(f['autoverify-host']).toEqual([]);
  });

  it('stopper med exit 1 når manifestet mangler pakkenavn (uventet format)', () => {
    const broken = STORE.replace(/^ {4}A: package=.*$/m, '');
    const { status, stdout } = run(['manifest'], broken);
    expect(status).toBe(1);
    expect(stdout).toBe('');
  });

  it('stopper med exit 1 når det ikke finnes noe manifest', () => {
    expect(run(['manifest'], 'Error: noe annet enn xmltree\n').status).toBe(1);
  });
});

describe('android-proof.py blocked', () => {
  // Ekte form fra butikk-manifestet, med navnet byttet.
  const POST_NOTIFICATIONS_LINE = [
    '      E: uses-permission (line=18)',
    '        A: http://schemas.android.com/apk/res/android:name(0x01010003)="android.permission.POST_NOTIFICATIONS" (Raw: "android.permission.POST_NOTIFICATIONS")',
  ].join('\n');
  const withPostNotifications = STORE.replace(APP_LINE, `${POST_NOTIFICATIONS_LINE}\n${APP_LINE}`);

  /** En midlertidig app.json; `android` blir `expo.android` som den står. */
  function appJson(android) {
    const dir = mkdtempSync(join(tmpdir(), 'android-proof-blocked-'));
    const path = join(dir, 'app.json');
    writeFileSync(path, JSON.stringify({ expo: { name: 'Tørny', android } }));
    return path;
  }

  function blocked(xmltree, path) {
    const { status, stdout, stderr } = run(['blocked', path], xmltree);
    const lines = stdout.split('\n').filter(Boolean);
    return {
      status,
      stderr,
      count: lines.filter((l) => l.startsWith('blocked-count=')).map((l) => l.slice('blocked-count='.length)),
      present: lines.filter((l) => l.startsWith('blocked-present=')).map((l) => l.slice('blocked-present='.length)),
    };
  }

  const LIST = [
    'android.permission.READ_CALENDAR',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.WRITE_CALENDAR',
  ];

  it('melder en blokkert tillatelse som står i manifestet, og antallet i lista', () => {
    const r = blocked(withPostNotifications, appJson({ blockedPermissions: LIST }));
    expect(r.status).toBe(0);
    expect(r.count).toEqual(['3']);
    expect(r.present).toEqual(['android.permission.POST_NOTIFICATIONS']);
  });

  it('gir ingen treff og exit 0 når ingen blokkert tillatelse står i manifestet', () => {
    const r = blocked(STORE, appJson({ blockedPermissions: LIST }));
    expect(r.status).toBe(0);
    expect(r.count).toEqual(['3']);
    expect(r.present).toEqual([]);
  });

  it.each([
    ['uten blockedPermissions', () => appJson({ package: 'no.tornygolf.app' })],
    ['med tom blockedPermissions', () => appJson({ blockedPermissions: [] })],
    ['som ikke kan leses', () => join(tmpdir(), 'finnes-ikke', 'app.json')],
  ])('stopper med exit 1 på en app.json %s', (_name, path) => {
    const r = blocked(withPostNotifications, path());
    expect(r.status).toBe(1);
    expect(r.present).toEqual([]);
  });

  it.each([
    ['tom stdin', ''],
    ['stdin uten <manifest>', 'N: android=http://schemas.android.com/apk/res/android\n'],
    ['stdin uten pakkenavn', withPostNotifications.replace(/^\s*A: package=.*$/m, '')],
  ])('stopper med exit 1 og ingen treff på %s', (_name, xmltree) => {
    const r = blocked(xmltree, appJson({ blockedPermissions: LIST }));
    expect(r.status).toBe(1);
    expect(r.present).toEqual([]);
    expect(r.stderr).not.toBe('');
  });
});

describe('android-proof.py elf-align', () => {
  const dir = mkdtempSync(join(tmpdir(), 'android-proof-test-'));

  /**
   * En minimal ELF-fil: header + programheadere, ingen seksjoner. `segments`
   * er [p_type, p_align]-par. Nok til å lese, ikke til å laste.
   */
  function elf({ bits = 64, little = true, segments }) {
    const is64 = bits === 64;
    const ehsize = is64 ? 64 : 52;
    const phentsize = is64 ? 56 : 32;
    const buf = Buffer.alloc(ehsize + phentsize * segments.length);
    buf.write('\x7fELF', 0, 'latin1');
    buf[4] = is64 ? 2 : 1;
    buf[5] = little ? 1 : 2;
    buf[6] = 1;
    const u16 = (v, o) => (little ? buf.writeUInt16LE(v, o) : buf.writeUInt16BE(v, o));
    const u32 = (v, o) => (little ? buf.writeUInt32LE(v, o) : buf.writeUInt32BE(v, o));
    const u64 = (v, o) => (little ? buf.writeBigUInt64LE(BigInt(v), o) : buf.writeBigUInt64BE(BigInt(v), o));
    if (is64) {
      u64(ehsize, 0x20);
      u16(phentsize, 0x36);
      u16(segments.length, 0x38);
    } else {
      u32(ehsize, 0x1c);
      u16(phentsize, 0x2a);
      u16(segments.length, 0x2c);
    }
    segments.forEach(([type, align], i) => {
      const base = ehsize + i * phentsize;
      u32(type, base);
      if (is64) u64(align, base + 48);
      else u32(align, base + 28);
    });
    return buf;
  }

  function align(name, bytes) {
    const file = join(dir, name);
    writeFileSync(file, bytes);
    return run(['elf-align', file]);
  }

  const PT_LOAD = 1;
  const PT_DYNAMIC = 2;

  it.each([
    ['64-bit little-endian, 16 KB', { segments: [[PT_LOAD, 0x4000], [PT_LOAD, 0x4000]] }, '16384'],
    ['64-bit, ett 4 KB-segment blant 16 KB', { segments: [[PT_LOAD, 0x4000], [PT_LOAD, 0x1000]] }, '4096'],
    ['64-bit, ikke-LOAD teller ikke', { segments: [[PT_DYNAMIC, 8], [PT_LOAD, 0x4000]] }, '16384'],
    ['64-bit big-endian', { little: false, segments: [[PT_LOAD, 0x10000]] }, '65536'],
    ['32-bit little-endian, 4 KB', { bits: 32, segments: [[PT_LOAD, 0x1000], [PT_LOAD, 0x1000]] }, '4096'],
    ['32-bit, uten justering', { bits: 32, segments: [[PT_LOAD, 0]] }, '0'],
  ])('gir minste LOAD-justering for %s', (label, spec, expected) => {
    const { status, stdout } = align(`${label.replace(/\W+/g, '-')}.so`, elf(spec));
    expect(status).toBe(0);
    expect(stdout).toBe(expected);
  });

  it('stopper med exit 1 uten LOAD-segmenter', () => {
    expect(align('uten-load.so', elf({ segments: [[PT_DYNAMIC, 8]] })).status).toBe(1);
  });

  it('stopper med exit 1 på en fil som ikke er ELF', () => {
    expect(align('ikke-elf.so', Buffer.from('#!/bin/sh\necho hei\n')).status).toBe(1);
  });

  it('stopper med exit 1 og en lesbar melding på en avkortet ELF-fil', () => {
    const cut = elf({ segments: [[PT_LOAD, 0x4000]] }).subarray(0, 70);
    const { status, stderr } = align('avkortet.so', cut);
    expect(status).toBe(1);
    expect(stderr).toMatch(/avkortet/);
    expect(stderr).not.toMatch(/Traceback/);
  });

  it('stopper med exit 1 på en ukjent ELF-klasse', () => {
    const bytes = elf({ segments: [[PT_LOAD, 0x4000]] });
    bytes[4] = 9;
    expect(align('ukjent-klasse.so', bytes).status).toBe(1);
  });
});
