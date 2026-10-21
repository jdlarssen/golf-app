// native/app/scripts/privacy-proof.test.js
// #2561: personvern-reglene i iOS-beviset (`privacy-proof.sh`).
//
// Apple stoppet 1.2.0 (5) på to ting som ikke fantes i arkivet: teksten for å
// skrive til Bilder («Lagre bilde» i delearket) og DiskSpace i
// personvernmanifestet. Fire ting må stå:
//
//  1. **Tillatelsesteksten må finnes** i Info.plist, og ikke være tom.
//  2. **DiskSpace må stå i app-manifestet** med minst én grunnkode når binærene
//     importerer disk-API-er. Mangler den, er det FAIL.
//  3. **Importerer binærene ingenting, er DiskSpace ikke påkrevd.** Regelen
//     skal ikke kreve en erklæring appen ikke har bruk for.
//  4. **Fail-closed:** en fil som ikke er en plist gir FAIL, aldri PASS.
//
// Hver FAIL-test bryter bare én regel, og sjekker at meldingen handler om den.
// Reglene sources og kjøres i bash som i beviset, med `say`/`pass`/`fail` slik
// `store-build-proof.sh` definerer dem. Plist-ene leses med python3
// (`plistlib`), fordi CI kjører på ubuntu-latest uten plutil.
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const LIB = join(__dirname, 'privacy-proof.sh');

let tmp;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'privacy-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const plist = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${body}</dict></plist>`;

const INFO_WITH_TEXT = plist(
  '<key>NSPhotoLibraryAddUsageDescription</key><string>Tørny lagrer bildet du deler i Bilder.</string>'
);
const INFO_EMPTY_TEXT = plist('<key>NSPhotoLibraryAddUsageDescription</key><string>  </string>');
const INFO_NONE = plist('<key>CFBundleIdentifier</key><string>no.tornygolf.app</string>');

const apiType = (category, reasons) =>
  `<dict><key>NSPrivacyAccessedAPIType</key><string>${category}</string>` +
  `<key>NSPrivacyAccessedAPITypeReasons</key><array>${reasons.map((r) => `<string>${r}</string>`).join('')}</array></dict>`;
const manifest = (...types) => plist(`<key>NSPrivacyAccessedAPITypes</key><array>${types.join('')}</array>`);

const FILE_TIMESTAMP = apiType('NSPrivacyAccessedAPICategoryFileTimestamp', ['C617.1']);
const DISK_SPACE = apiType('NSPrivacyAccessedAPICategoryDiskSpace', ['E174.1']);
const DISK_SPACE_NO_REASON = apiType('NSPrivacyAccessedAPICategoryDiskSpace', []);

function write(name, contents) {
  const file = join(tmp, name);
  writeFileSync(file, contents);
  return file;
}

const HARNESS = `set -euo pipefail
export LC_ALL=C
PASS=0
FAIL=0
say()  { printf '%s\\n' "$*"; }
pass() { PASS=$((PASS + 1)); say "PASS  $*"; }
fail() { FAIL=$((FAIL + 1)); say "FAIL  $*"; }
. "$1"
privacy_rules "$2" "$3" "$4"
printf 'TOTAL %s %s\\n' "$PASS" "$FAIL"`;

function rules(info, privacy, imports) {
  const result = spawnSync('bash', ['-c', HARNESS, 'bash', LIB, info, privacy, imports], { encoding: 'utf8' });
  const lines = result.stdout.split('\n').filter(Boolean);
  const total = lines.find((l) => l.startsWith('TOTAL '));
  const [pass, fail] = total ? total.split(' ').slice(1).map(Number) : [NaN, NaN];
  return {
    status: result.status,
    pass,
    fail,
    passes: lines.filter((l) => l.startsWith('PASS  ')),
    fails: lines.filter((l) => l.startsWith('FAIL  ')),
  };
}

describe('privacy_rules', () => {
  it('gir to PASS når teksten står og DiskSpace er oppgitt, og skriver grunnkoden', () => {
    const r = rules(write('info-ok.plist', INFO_WITH_TEXT), write('pm-ok.plist', manifest(FILE_TIMESTAMP, DISK_SPACE)), 'yes');
    expect(r.status).toBe(0);
    expect(r.fail).toBe(0);
    expect(r.passes).toEqual([
      'PASS  NSPhotoLibraryAddUsageDescription står i Info.plist',
      'PASS  PrivacyInfo oppgir NSPrivacyAccessedAPICategoryDiskSpace (E174.1)',
    ]);
  });

  it.each([
    ['mangler', INFO_NONE],
    ['er tom', INFO_EMPTY_TEXT],
  ])('gir FAIL når tillatelsesteksten %s', (_label, info) => {
    const r = rules(write('info-bad.plist', info), write('pm-ok2.plist', manifest(DISK_SPACE)), 'yes');
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toContain('NSPhotoLibraryAddUsageDescription mangler');
    expect(r.passes[0]).toContain('DiskSpace');
  });

  it('gir FAIL når DiskSpace mangler og binærene importerer disk-API-er', () => {
    const r = rules(write('info-ok3.plist', INFO_WITH_TEXT), write('pm-none.plist', manifest(FILE_TIMESTAMP)), 'yes');
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toContain('DiskSpace');
    expect(r.fails[0]).not.toContain('NSPhotoLibraryAddUsageDescription');
    expect(r.passes[0]).toContain('NSPhotoLibraryAddUsageDescription');
  });

  it('krever ikke DiskSpace når binærene ikke importerer disk-API-er', () => {
    const r = rules(write('info-ok4.plist', INFO_WITH_TEXT), write('pm-none2.plist', manifest(FILE_TIMESTAMP)), 'no');
    expect(r.fail).toBe(0);
    expect(r.passes[1]).toContain('ikke påkrevd');
  });

  it('gir FAIL for DiskSpace uten grunnkode', () => {
    const r = rules(write('info-ok5.plist', INFO_WITH_TEXT), write('pm-empty.plist', manifest(DISK_SPACE_NO_REASON)), 'yes');
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toContain('uten grunnkode');
  });

  it('er fail-closed når filene ikke er plist: én FAIL per regel, ingen PASS', () => {
    const junk = write('junk.xml', 'dette er ikke en plist\n');
    const r = rules(junk, junk, 'yes');
    expect(r.status).toBe(0);
    expect(r.pass).toBe(0);
    expect(r.fail).toBe(2);
    expect(r.fails[0]).toMatch(/^FAIL {2}kunne ikke lese Info\.plist/);
    expect(r.fails[1]).toMatch(/^FAIL {2}kunne ikke lese PrivacyInfo\.xcprivacy/);
  });

  it('gir FAIL for en ukjent import-verdi i stedet for å gjette', () => {
    const r = rules(write('info-ok6.plist', INFO_WITH_TEXT), write('pm-ok6.plist', manifest(DISK_SPACE)), 'kanskje');
    expect(r.fails.join('\n')).toContain('ukjent verdi for disk-API-importer');
  });
});
