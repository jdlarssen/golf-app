// native/app/scripts/entitlements-proof.test.js
// #2561: entitlements-reglene i iOS-beviset (`entitlements-proof.sh`).
//
// Appen har varsler på iOS, så arkivet må ha push-entitlementen. Tre ting må
// stå:
//
//  1. **`aps-environment` må finnes**, med `development` eller `production`.
//     Begge gir PASS, og verdien står i linja. Arkivet kreves ikke å ha
//     `production` (se `entitlements-proof.sh`). Mangler den, eller har den en
//     annen verdi, er det FAIL.
//  2. **Associated domains må være nøyaktig `applinks:tornygolf.no`** (#2627):
//     venne-lenka åpner appen, og AASA-fila på nettet slipper bare den
//     gjennom. Et ekstra domene og en manglende verdi gir begge FAIL. Fiksturene
//     har en gyldig `aps-environment`, så den ene FAIL-en kan bare komme fra
//     denne regelen, og testen sjekker at meldingen handler om associated
//     domains. Ellers ville testen stått grønn med regelen slettet.
//  3. **En tom fil er en app uten entitlements** (`codesign` skriver da
//     ingenting), og den gir FAIL på `aps-environment` og på associated
//     domains, ikke en lesefeil.
//  4. **Fail-closed ved en fil som ikke er en plist:** én FAIL og ingen PASS.
//
// Hver FAIL-fikstur bryter bare én regel. Reglene sources og kjøres i bash som
// i beviset, med `say`/`pass`/`fail` slik `store-build-proof.sh` definerer dem.
// Plist-en leses med python3 (`plistlib`), fordi CI kjører på ubuntu-latest
// uten plutil.
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { STORE_LINK_DOMAIN } from '../app.config';

const LIB = join(__dirname, 'entitlements-proof.sh');
const AD_OK =
  'PASS  com.apple.developer.associated-domains = applinks:tornygolf.no (AASA-fila slipper bare venne-lenka gjennom)';
const fixture = (name) => join(__dirname, '__fixtures__', `entitlements-${name}.plist`);

let tmp;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ent-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const HARNESS = `set -euo pipefail
export LC_ALL=C
PASS=0
FAIL=0
say()  { printf '%s\\n' "$*"; }
pass() { PASS=$((PASS + 1)); say "PASS  $*"; }
fail() { FAIL=$((FAIL + 1)); say "FAIL  $*"; }
. "$1"
entitlements_rules "$2"
printf 'TOTAL %s %s\\n' "$PASS" "$FAIL"`;

function rules(file) {
  const result = spawnSync('bash', ['-c', HARNESS, 'bash', LIB, file], { encoding: 'utf8' });
  const lines = result.stdout.split('\n').filter(Boolean);
  const total = lines.find((l) => l.startsWith('TOTAL '));
  const [pass, fail] = total ? total.split(' ').slice(1).map(Number) : [NaN, NaN];
  return {
    status: result.status,
    stderr: result.stderr,
    pass,
    fail,
    passes: lines.filter((l) => l.startsWith('PASS  ')),
    fails: lines.filter((l) => l.startsWith('FAIL  ')),
  };
}

describe('entitlements_rules', () => {
  it.each(['production', 'development'])('gir PASS for aps-environment = %s, og skriver verdien', (value) => {
    const r = rules(fixture(value));
    expect(r.status).toBe(0);
    expect(r.fail).toBe(0);
    expect(r.passes).toContain(`PASS  aps-environment = ${value}`);
    expect(r.passes).toContain(AD_OK);
  });

  it('gir FAIL når aps-environment mangler', () => {
    const r = rules(fixture('none'));
    expect(r.status).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toMatch(/^FAIL {2}aps-environment mangler/);
    expect(r.passes).toContain(AD_OK);
  });

  it('gir FAIL for en annen verdi, og skriver verdien', () => {
    const r = rules(fixture('other-value'));
    expect(r.status).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toMatch(/^FAIL {2}aps-environment = 'staging'/);
    expect(r.passes).toContain(AD_OK);
  });

  it.each([
    ['et domene til', 'ad-other-domain', /= applinks:tornygolf\.no applinks:www\.tornygolf\.no\. Bare applinks:tornygolf\.no er lov/],
    ['ingen verdi', 'ad-missing', /mangler\. Butikkappen skal ha applinks:tornygolf\.no/],
  ])('gir FAIL for associated domains med %s, og meldingen gjelder associated domains', (_label, name, why) => {
    const r = rules(fixture(name));
    expect(r.status).toBe(0);
    expect(r.passes).toContain('PASS  aps-environment = production');
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toMatch(/^FAIL {2}com\.apple\.developer\.associated-domains /);
    expect(r.fails[0]).toMatch(why);
    expect(r.fails[0]).not.toContain('aps-environment');
  });

  it('gir FAIL på aps-environment og associated domains for en tom fil (appen har ingen entitlements)', () => {
    const file = join(tmp, 'empty.plist');
    writeFileSync(file, '');
    const r = rules(file);
    expect(r.status).toBe(0);
    expect(r.pass).toBe(0);
    expect(r.fail).toBe(2);
    expect(r.fails[0]).toMatch(/^FAIL {2}aps-environment mangler/);
    expect(r.fails[1]).toMatch(/^FAIL {2}com\.apple\.developer\.associated-domains mangler/);
  });

  it('krever domenet fra app.config.ts, og et miljø kan ikke endre det', () => {
    const src = readFileSync(LIB, 'utf8');
    expect(/^ENTITLEMENTS_APPLINKS=(\S+)$/m.exec(src)?.[1]).toBe(`applinks:${STORE_LINK_DOMAIN}`);
    const result = spawnSync('bash', ['-c', HARNESS, 'bash', LIB, fixture('production')], {
      encoding: 'utf8',
      env: { ...process.env, ENTITLEMENTS_APPLINKS: 'applinks:example.com' },
    });
    expect(result.stdout).toContain(AD_OK);
    expect(result.stdout).toContain('TOTAL 2 0');
  });

  it('er fail-closed når fila ikke er en plist: én FAIL, ingen PASS', () => {
    const file = join(tmp, 'not-a-plist.xml');
    writeFileSync(file, 'dette er ikke en plist\n');
    const r = rules(file);
    expect(r.status).toBe(0);
    expect(r.pass).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toMatch(/^FAIL {2}kunne ikke lese entitlements/);
  });
});
