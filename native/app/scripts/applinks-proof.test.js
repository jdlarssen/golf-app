// native/app/scripts/applinks-proof.test.js
// #2627, #2748: App Links-regelen i Android-beviset (`applinks-proof.sh`).
//
// Venne-lenka, QR-koden på bag-taggen og ligalenka åpner appen, og ingenting annet
// på tornygolf.no gjør det. Fire ting må stå:
//
//  1. **Butikkmanifestets filter gir PASS**: fiksturen går gjennom den ekte
//     leseren (`android-proof.py manifest`) og så regelen, som i beviset.
//  2. **Alt utenfor lista er FAIL**: en annen sti, et filter uten sti, en annen
//     vert, et annet underdomene og en ressursreferanse (TWA-ens `@string/hostName`).
//  3. **Mangler en sti eller en vert, er det FAIL**, ellers ville et bygg uten
//     filteret stått grønt.
//  4. **Lista i regelen er appens**: `STORE_APP_LINK_PATH_PREFIXES` og
//     `STORE_LINK_DOMAINS` i `app.config.ts`, så de ikke kan gli fra hverandre.
//
// Regelen sources og kjøres i bash som i beviset, med `say`/`pass`/`fail`
// slik `store-build-proof-android.sh` definerer dem.
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { STORE_APP_LINK_PATH_PREFIXES, STORE_LINK_DOMAINS } from '../app.config';

const LIB = join(__dirname, 'applinks-proof.sh');
const READER = join(__dirname, 'android-proof.py');
const fixture = (name) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
const STORE = fixture('manifest-store.xmltree.txt');
const FRIEND_LINK = fixture('manifest-friend-link.xmltree.txt');

const SPECS = STORE_APP_LINK_PATH_PREFIXES.map((p) => `pathPrefix:${p}`);
const FRIEND_SPEC = 'pathPrefix:/venner/legg-til/';
const APEX = 'tornygolf.no';
const WWW = 'www.tornygolf.no';

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
const ALL = [APEX, WWW].flatMap((host) => SPECS.map((spec) => path(host, spec)));

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
    expect(r.passes).toEqual([
      `PASS  autoVerify bare for lista (${APEX} ${WWW}: ${SPECS.join(' ')})`,
    ]);
  });

  it('godtar store bokstaver i verten', () => {
    const r = rules(ALL.map((l) => l.replace('=tornygolf.no', '=TornyGolf.no')));
    expect(r.fail).toBe(0);
  });

  it.each([
    ['en annen sti', path(APEX, 'pathPrefix:/login')],
    ['en annen sti på www', path(WWW, 'pathPrefix:/games/')],
    ['ligasiden', path(APEX, 'pathPrefix:/liga/')],
    ['et filter uten sti (hele verten)', path(APEX, '*')],
    ['et filter uten sti på www', path(WWW, '*')],
    ['et mønster', path(APEX, 'pathPattern:/venner/.*')],
    ['et annet underdomene', path('app.tornygolf.no', FRIEND_SPEC)],
    ['en annen vert uten sti', path('example.com', '*')],
    ['en annen vert med en sti fra lista', path('example.com', FRIEND_SPEC)],
    ['en vert som bare ligner', path('tornygolf.com', FRIEND_SPEC)],
    ['en ressursreferanse (TWA)', path('@string/hostName', '*')],
  ])('gir FAIL for %s ved siden av lista', (_label, extra) => {
    const r = rules([...ALL, extra]);
    expect(r.status).toBe(0);
    expect(r.pass).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toMatch(/^FAIL {2}1 autoVerify-claim\(er\) utenfor lista/);
  });

  it('gir FAIL når ingenting er claimet', () => {
    const r = rules([]);
    expect(r.status).toBe(0);
    expect(r.pass).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toMatch(/^FAIL {2}autoVerify mangler: tornygolf\.no\|pathPrefix:\/venner\/legg-til\//);
  });

  // Hver sti på hver vert: mangler én, åpner ikke den lenka appen.
  it.each(ALL)('gir FAIL når %s mangler', (line) => {
    const r = rules(ALL.filter((l) => l !== line));
    const [host, spec] = line.replace('autoverify-path=', '').split(' ');
    expect(r.status).toBe(0);
    expect(r.pass).toBe(0);
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toBe(
      `FAIL  autoVerify mangler: ${host}|${spec}. Uten den åpner ikke lenka appen på Android (#2748)`,
    );
  });

  it('gir FAIL når www mangler helt', () => {
    const r = rules(SPECS.map((spec) => path(APEX, spec)));
    expect(r.fail).toBe(1);
    expect(r.fails[0]).toContain(`${WWW}|${SPECS[0]}`);
  });

  it('har de samme stiene og vertene som app.config.ts', () => {
    const src = readFileSync(LIB, 'utf8');
    const allowed = /^ANDROID_APPLINKS_ALLOWED=\'([^\']*)\'$/m.exec(src)?.[1].split(' ');
    expect(allowed).toEqual(SPECS);
    const hosts = /^ANDROID_APPLINKS_HOSTS=\'([^\']*)\'$/m.exec(src)?.[1].split(' ');
    expect(hosts).toEqual([...STORE_LINK_DOMAINS]);
  });
});
