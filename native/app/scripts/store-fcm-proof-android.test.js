// native/app/scripts/store-fcm-proof-android.test.js
// #2758: butikkbygget peker på prod, så beviset skal nekte alt annet enn en
// emulator, før det gjør noe annet. Hele kjøringen krever en emulator og står som
// bevis på PR-en. Her kjøres det ekte skriptet mot en falsk `adb`, som logger hva
// den blir bedt om. Skriptet kjøres i en UTF-8-locale (bash 3.2-fella, #1983).
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, 'store-fcm-proof-android.sh');

const fakeAdb = ({ devices, qemu = '', bootQemu = '' }) => `#!/bin/bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
if [ "$1" = "devices" ]; then
  echo "List of devices attached"
  ${devices.map((d) => `printf '%s\\tdevice\\n' '${d}'`).join('\n  ')}
  printf 'offline-1\\toffline\\n'
  exit 0
fi
case "$*" in
  *"getprop ro.kernel.qemu"*) echo '${qemu}' ;;
  *"getprop ro.boot.qemu"*) echo '${bootQemu}' ;;
esac
`;

let dir;
let log;
let aab;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fcm-proof-sh-'));
  log = join(dir, 'adb.log');
  writeFileSync(log, '');
  aab = join(dir, 'app.aab');
  writeFileSync(aab, 'ikke en ekte aab');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args, adb) {
  const adbPath = join(dir, 'adb');
  writeFileSync(adbPath, adb);
  chmodSync(adbPath, 0o755);
  return spawnSync('/bin/bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input: '',
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      ADB: adbPath,
      FAKE_LOG: log,
      TORNY_DIST_DIR: join(dir, 'dist'),
      LANG: 'nb_NO.UTF-8',
      LC_ALL: 'nb_NO.UTF-8',
    },
  });
}

const calls = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);

/** Bare spørsmålene for å sjekke enheten: ingenting er installert eller startet. */
function expectNothingHappened() {
  for (const call of calls()) {
    expect(call).toMatch(/^devices$|getprop ro\.(kernel|boot)\.qemu$/);
  }
}

describe('store-fcm-proof-android.sh nekter alt annet enn en emulator', () => {
  it.each([
    ['en fysisk telefon', { devices: ['R58N123ABC'], qemu: '', bootQemu: '' }],
    ['en fysisk telefon som later som den er qemu', { devices: ['R58N123ABC'], qemu: '1' }],
    ['et emulator-navn uten qemu-verdi', { devices: ['emulator-5554'] }],
    ['to enheter', { devices: ['emulator-5554', 'emulator-5556'], qemu: '1' }],
    ['ingen enhet', { devices: [] }],
  ])('stopper på %s', (_case, device) => {
    const result = run(['--aab', aab], fakeAdb(device));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('✗');
    expectNothingHappened();
  });

  it('går forbi vakta på en ekte emulator, enten qemu-verdien er den ene eller den andre', () => {
    for (const device of [
      { devices: ['emulator-5554'], qemu: '1' },
      { devices: ['emulator-5554'], bootQemu: '1' },
    ]) {
      const result = run(['--aab', aab], fakeAdb(device));
      // Neste port er tjenestekontoen, som ikke finnes i test-hjemmet.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('tjenestekontoen');
    }
  });
});

describe('store-fcm-proof-android.sh leser argumentene før den rører enheten', () => {
  it.each([
    ['ingen argumenter', []],
    ['ukjent argument', ['--galt']],
    ['begge byggene', ['--aab', 'a.aab', '--apk', 'b.apk', '--package', 'p']],
    ['apk uten pakke', ['--apk', 'b.apk']],
    ['en AAB som ikke finnes', ['--aab', '/finnes/ikke.aab']],
  ])('stopper på %s', (_case, args) => {
    const result = run(args, fakeAdb({ devices: ['emulator-5554'], qemu: '1' }));

    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
  });

  it('stopper på en ukjent nøkkeltype', () => {
    const result = run(['--aab', aab, '--key', 'galt'], fakeAdb({ devices: ['emulator-5554'], qemu: '1' }));

    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
  });
});
