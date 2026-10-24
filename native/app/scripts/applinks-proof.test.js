// native/app/scripts/applinks-proof.test.js
// #2627: App Links-regelen i Android-beviset (`applinks-proof.sh`).
//
// Venne-lenka og QR-koden på bag-taggen åpner appen, og ingenting annet på
// tornygolf.no gjør det. Fire ting må stå:
//
//  1. **Butikkmanifestets filter gir PASS**: fiksturen går gjennom den ekte
//     leseren (`android-proof.py manifest`) og så regelen, som i beviset.
//  2. **Alt utenfor venne-lenka er FAIL**: en annen sti, et filter uten sti,
//     et underdomene og en ressursreferanse (TWA-ens `@string/hostName`).
//     Andre verter er bare informasjon.
//  3. **Mangler en av venne-stiene, er det FAIL**, ellers ville et bygg uten
//     filteret stått grønt.
//  4. **Lista i regelen er appens**: `STORE_FRIEND_LINK_PATH_PREFIXES` i
//     `app.config.ts`, så de to ikke kan gli fra hverandre.
//
// Regelen sources og kjøres i bash som i beviset, med `say`/`pass`/`fail`
// slik `store-build-proof-android.sh` definerer dem.
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { STORE_FRIEND_LINK_PATH_PREFIXES } from '../app.config';

const LIB = join(__dirname, 'applinks-proof.sh');
const READER = join(__dirname, 'android-proof.py');
const fixture = (name) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
const STORE = fixture('manifest-store.xmltree.txt');
const FRIEND_LINK = fixture('manifest-friend-link.xmltree.txt');

const OK = 'pathPrefix:/venner/legg-til/';
const OK_EN = 'pathPrefix:/en/venner/legg-til/';

let tmp;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'applinks-'));
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
android_applinks_rules "$2"
printf 'TOTAL %s %s\\n' "$PASS" "$FAIL"`;

/** Regelen på gitte fakta-linjer (`autoverify-path=…`). */
function rules(lines) {
  const file = join(tmp, `facts-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(file, lines.map((l) => `${l}\n`).join(''));
  const result = spawnSync('bash', ['-c', HARNESS, 'bash', LIB, file], { encoding: 'utf8' });
  const out = result.stdout.split('\n').filter(Boolean);
  const total = out.find((l) => l.startsWith('TOTAL '));
  const [pass, fail] = total ? total.split(' ').slice(1).map(Number) : [NaN, NaN];
  return {
    status: result.status,
    pass,
    fail,
    passes: out.filter((l) => l.startsWith('PASS  ')),
    fails: out.filter((l) => l.startsWith('FAIL  ')),
  };
}

const path = (host, spec) => `autoverify-path=${host} ${spec}`;

describe('android_applinks_rules', () => {
  it('gir PASS for butikkmanifestets filter, lest av den ekte leseren', () => {
    const filter = FRIEND_LINK.split('\n').filter((l) => !l.startsWith('#')).join('\n');
    const read = spawnSync('python3', [READER, 'manifest'], {
      input: `${STORE.trimEnd()}\n${filter}\n`,
      encoding: 'utf8',
    });
    expect(read.status).toBe(0);
    const r = rules(read.stdout.split('\n').filter(Boolean));
    expect(r.status).toBe(0);
    expect(r.fail).toBe(0);
    expect(r.passes).toEqual([`PASS  autoVerify bare for venne-lenka (tornygolf.no ${OK} ${OK_EN})`]);
  });

  it('godtar store bokstaver i verten', () => {
    const r = rules([path('TornyGolf.no', OK), path('tornygolf.no', OK_EN)]);
    expect(r.fail).toBe(0);
  });

  it('lar andre verter være informasjon', () => {
    const r = rules([path('tornygolf.no', OK), path('tornygolf.no', OK_EN), path('example.com', '*')]);
    expect(r.fail).toBe(0);
  });

  it.each([
    ['en annen sti', path('tornygolf.no', 'pathPrefix:/login')],
    ['et filter uten sti (hele verten)', path('tornygolf.no', '*')],
    ['et mønster', path('tornygolf.no', 'pathPattern:/venner/.*')],
    ['et underdomene', path('www.tornygolf.no', OK)],
    ['en ressursreferanse (TWA)', path('@string/hostName', '*')],
  ])('gir FAIL for %s ved siden av venne-lenka', (_label, extra) => {
    const r = rules([path('tornygolf.no', OK), path('tornygolf.no', OK_EN), extra]);
    expect(r.status).toBe(0);
    expect(r.pass).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toMatch(/^FAIL {2}1 autoVerify-claim\(er\) for tornygolf\.no utenfor venne-lenka/);
  });

  it.each([
    ['ingen autoVerify i det hele tatt', [], `${OK} ${OK_EN}`],
    ['bare den norske stien', [path('tornygolf.no', OK)], OK_EN],
  ])('gir FAIL når venne-lenka mangler: %s', (_label, lines, missing) => {
    const r = rules(lines);
    expect(r.status).toBe(0);
    expect(r.pass).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toBe(
      `FAIL  autoVerify for venne-lenka mangler: ${missing}. Uten den åpner ikke lenka appen på Android (#2627)`,
    );
  });

  it('har de samme stiene som app.config.ts', () => {
    const src = readFileSync(LIB, 'utf8');
    const allowed = /^ANDROID_APPLINKS_ALLOWED='([^']*)'$/m.exec(src)?.[1].split(' ');
    expect(allowed).toEqual(STORE_FRIEND_LINK_PATH_PREFIXES.map((p) => `pathPrefix:${p}`));
  });
});
