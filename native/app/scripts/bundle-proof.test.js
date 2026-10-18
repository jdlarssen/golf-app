// native/app/scripts/bundle-proof.test.js
// #2561: loopback-reglene i bundel-beviset (`bundle-proof.sh`), som iOS- og
// Android-beviset deler.
//
// @supabase/supabase-js har «localhost», «127.0.0.1» og «[::1]» som bare
// literaler (standardmålene for trace-propagering, `getDefaultPropagationTargets`).
// Hermes pakker strengtabellen uten skilletegn, så hvem som står ved siden av
// literalen, varierer fra bygg til bygg. I 1.1.0 (3) fulgte «15.2.0.0» rett
// etter «127.0.0.1», og regelen bommet. I 1.2.0 (4) sto den alene og ga FAIL.
// Reglene skal derfor:
//
//  1. godta så mange BARE forekomster av hver literal som supabase-js-pakken
//     som er installert forklarer (1 når `getDefaultPropagationTargets` har den,
//     ellers 0), uansett nabo;
//  2. gi FAIL når literalen står som adresse: skjema (`://`), bruker (`@`),
//     URL-koding (`%2F`, `%40`, `%3A` foran, `%3A<siffer>` etter, `%5B::1%5D`)
//     eller port (`:<siffer>`), og for `localhost` også underdomene
//     (`.localhost`), uansett store og små bokstaver;
//  3. la de kjente `localhost`-formene fra Metro og auth-js stå, bare med
//     `http://` rett foran og med avgrenset port;
//  4. la de andre LAN-reglene stå som før.
//
// Hermes lar en kort streng dele lagring med en lengre (den bare «localhost»
// ligger inne i auth-js sin «http://localhost:9999» i de ekte bundlene). Derfor
// to modeller for hele beviset: én der bibliotek-literalene står for seg selv,
// og én der literalen ligger inne i den lekkede strengen og ikke finnes alene.
//
// `bundle_proof` kjøres på en falsk bundel: strengene skilt med NUL, så
// `strings` gir én linje per streng, slik den gir én per pakket løp i en ekte
// bundel. Sakene i første blokk sjekker bare linja for sin egen regel; de andre
// reglene (prod-adressen, UTF-16-tabellen) gir FAIL her og er ikke det de spør
// om. Blokka for hele beviset sammenligner antall FAIL.
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const LIB = join(__dirname, 'bundle-proof.sh');

let tmp;
let n = 0;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bundle-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// Kalleren slik `store-build-proof.sh` og `store-build-proof-android.sh`
// definerer den. `TORNY_APP_ENV_DIR` peker på en tom mappe, så ingen ekte
// .env-fil leses.
const HARNESS = `set -euo pipefail
export LC_ALL=C
PASS=0
FAIL=0
OUT=$3
STR=''
U16=''
trap 'rm -f "$STR" "$U16"' EXIT
say()  { printf '%s\\n' "$*" | tee -a "$OUT"; }
pass() { PASS=$((PASS + 1)); say "PASS  $*"; }
fail() { FAIL=$((FAIL + 1)); say "FAIL  $*"; }
. "$1"
bundle_proof_require
bundle_proof "$2"
printf 'TOTAL %s %s\\n' "$PASS" "$FAIL"`;

function proof(strings, env = {}) {
  n += 1;
  const bundle = join(tmp, `bundle-${n}.bin`);
  const out = join(tmp, `bevis-${n}.txt`);
  writeFileSync(bundle, Buffer.from(`\0${strings.join('\0')}\0`, 'latin1'));
  writeFileSync(out, '');
  const result = spawnSync('bash', ['-c', HARNESS, 'bash', LIB, bundle, out], {
    encoding: 'utf8',
    env: { ...process.env, TORNY_APP_ENV_DIR: tmp, EXPO_PUBLIC_SUPABASE_ANON_KEY: '', ...env },
  });
  const lines = result.stdout.split('\n').filter(Boolean);
  const verdicts = lines.filter((l) => /^(PASS|FAIL) {2}/.test(l));
  return {
    status: result.status,
    stderr: result.stderr,
    verdicts,
    fails: verdicts.filter((l) => l.startsWith('FAIL')).length,
  };
}

describe('bundle_proof: loopback-literalene fra @supabase/supabase-js', () => {
  it.each([
    ['bar 127.0.0.1 (supabase-js)', 'PASS', ['create-next-hint127.0.0.1x-relay-error'], 'loopback 127.0.0.1'],
    ['127.0.0.1 med skjema', 'FAIL', ['wss://127.0.0.1/realtime/v1'], 'loopback 127.0.0.1'],
    ['127.0.0.1 med port', 'FAIL', ['host127.0.0.1:54321/rest'], 'loopback 127.0.0.1'],
    ['to bare 127.0.0.1', 'FAIL', ['aa127.0.0.1bb', 'cc127.0.0.1dd'], 'loopback 127.0.0.1'],
    ['bar [::1] (supabase-js)', 'PASS', ['WebSocket closed - code[::1]isForwardRef'], 'loopback [::1]'],
    ['[::1] med skjema', 'FAIL', ['wss://[::1]/realtime/v1'], 'loopback [::1]'],
    ['[::1] med port', 'FAIL', ['host[::1]:3111/x'], 'loopback [::1]'],
    ['127.0.0.1 med bruker@', 'FAIL', ['postgres://postgres:postgres@127.0.0.1/postgres'], 'loopback 127.0.0.1'],
    ['127.0.0.1 URL-kodet', 'FAIL', ['http%3A%2F%2F127.0.0.1%3A54321'], 'loopback 127.0.0.1'],
    ['[::1] med bruker@', 'FAIL', ['postgres://u@[::1]/db'], 'loopback [::1]'],
    ['[::1] URL-kodet', 'FAIL', ['http%3A%2F%2F%5B::1%5D%3A3000'], 'loopback [::1]'],
    ['bar localhost (supabase-js)', 'PASS', ['set-thingslocalhostx-relay-error'], 'loopback localhost'],
    ['localhost med kjente porter (Metro, auth-js)', 'PASS', ['heighttp://localhost:8081/assets/x', 'Lighttp://localhost:9999__get'], 'loopback localhost'],
    ['localhost med ukjent port', 'FAIL', ['set-thingslocalhost:3000/x'], 'loopback localhost'],
    ['https://localhost uten port', 'FAIL', ['xxhttps://localhost/auth/v1'], 'loopback localhost'],
    ['localhost som underdomene', 'FAIL', ['https://torny.localhost/x'], 'loopback localhost'],
    ['localhost med bruker@', 'FAIL', ['postgres://u@localhost/db'], 'loopback localhost'],
    ['to bare localhost', 'FAIL', ['aalocalhostbb', 'cclocalhostdd'], 'loopback localhost'],
    ['localhost URL-kodet', 'FAIL', ['http%3A%2F%2Flocalhost%3A3000'], 'loopback localhost'],
    ['LOCALHOST med store bokstaver', 'FAIL', ['https://LOCALHOST/x'], 'loopback localhost'],
    ['Metro-formen uten http:// foran', 'FAIL', ['xxlocalhost:8081/assets/x'], 'loopback localhost'],
    ['auth-js-porten med ett siffer til', 'FAIL', ['Lighttp://localhost:99999__get'], 'loopback localhost'],
    ['192.168-adresse, som før', 'FAIL', ['ip192.168.1.20/x'], '192\\.168'],
    ['10.0-adresse, som før', 'FAIL', ['ip10.0.0.5/x'], '10\\.0'],
    ['IPv6 med skjema, som før', 'FAIL', ['http://[fe80::1]/x'], '://\\[[0-9a-fA-F'],
    ['.local:, som før', 'FAIL', ['mac.local:8081'], '\\.local:'],
  ])('%s gir %s', (_name, verdict, strings, label) => {
    const r = proof(strings);
    expect(r.status).toBe(0);
    const hits = r.verdicts.filter((l) => l.includes(label));
    expect(hits).toHaveLength(1);
    expect(hits[0].slice(0, 4)).toBe(verdict);
  });

  it('skriver kilden i PASS-linja for den bare literalen', () => {
    const r = proof(['create-next-hint127.0.0.1x-relay-error']);
    const line = r.verdicts.find((l) => l.includes('loopback 127.0.0.1'));
    expect(line).toContain('getDefaultPropagationTargets');
  });

  // Unntaket er bundet til pakken som er installert: uten literalen i
  // `getDefaultPropagationTargets` er ingen bar forekomst forklart.
  it.each([
    ['127.0.0.1', 'create-next-hint127.0.0.1x-relay-error', 'loopback 127.0.0.1'],
    ['[::1]', 'WebSocket closed - code[::1]isForwardRef', 'loopback [::1]'],
    ['localhost', 'set-thingslocalhostx-relay-error', 'loopback localhost'],
  ])('bar %s gir FAIL når supabase-js ikke har literalen', (_literal, string, label) => {
    const r = proof([string], { TORNY_SUPABASE_JS_ENTRY: join(tmp, 'finnes-ikke.cjs') });
    const hits = r.verdicts.filter((l) => l.includes(label));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^FAIL .*høyst 0/);
  });

  // Funksjonen leses fra «function getDefaultPropagationTargets(» til «}» på
  // samme innrykk. Finnes ikke slutten (minifisert fil), er literalen ikke
  // forklart, også når den står et annet sted i fila.
  it.each([
    ['innrykket, literalen i funksjonen', 'PASS', '  function getDefaultPropagationTargets(u) {\n    targets.push("localhost", "127.0.0.1", "[::1]");\n  }\n'],
    ['innrykket, literalen etter funksjonen', 'FAIL', '  function getDefaultPropagationTargets(u) {\n    return [];\n  }\n  const x = "127.0.0.1";\n'],
    ['minifisert på én linje', 'FAIL', 'function getDefaultPropagationTargets(u){const t=[];t.push("localhost","127.0.0.1","[::1]");return t}\n'],
  ])('supabase-js %s gir %s for bar 127.0.0.1', (name, verdict, source) => {
    const entry = join(tmp, `entry-${name.replace(/[^a-z]/g, '-')}.cjs`);
    writeFileSync(entry, source);
    const r = proof(['create-next-hint127.0.0.1x-relay-error'], { TORNY_SUPABASE_JS_ENTRY: entry });
    const hits = r.verdicts.filter((l) => l.includes('loopback 127.0.0.1'));
    expect(hits).toHaveLength(1);
    expect(hits[0].slice(0, 4)).toBe(verdict);
  });
});

// Hele beviset. Bibliotek-literalene, også i Hermes-formen fra 1.1.0 (3) med
// sifre limt på, skal gi nøyaktig like mange FAIL som en tom bundel. Legges en
// lekket adresse til, må antallet FAIL øke, uansett hvilken regel som fanger
// den. Adressen står både alene og limt inn mellom to nabo-strenger, fordi
// Hermes pakker uten skilletegn.
describe('hele beviset', () => {
  const LIBRARY = [
    'create-next-hint127.0.0.1x-relay-error',
    'rotation slot write failedraft-2020-127.0.0.15.2.0.0_loop',
    'WebSocket closed - code[::1]isForwardRef',
    'set-thingslocalhostx-relay-error',
    'heighttp://localhost:8081/assets/x',
    'Lighttp://localhost:9999__get',
  ];
  const LEAKS = [
    'https://localhost',
    'ws://localhost',
    'http://localhost',
    'http://localhost:3111',
    'https://torny.localhost',
    'wss://app.localhost/ws',
    'http://torny.localhost:3111',
    'postgres://u@localhost/db',
    'http://127.0.0.1:3111',
    'wss://127.0.0.1',
    'http://[::1]:3111',
    'https://user@127.0.0.1/x',
    'postgres://postgres:postgres@127.0.0.1/postgres',
    'http%3A%2F%2F127.0.0.1%3A54321',
    'postgres://u@[::1]/db',
    'http%3A%2F%2F%5B::1%5D%3A3000',
    'http%3A%2F%2Flocalhost%3A3000',
    'https://LOCALHOST/x',
    'http://192.168.1.10:3111',
    'exp://192.168.1.10:8081',
  ];
  // Modellen der literalen ligger inne i den lekkede strengen: bare de kjente
  // localhost-formene står for seg selv.
  const MERGED_LIBRARY = ['heighttp://localhost:8081/assets/x', 'Lighttp://localhost:9999__get'];
  const MERGED_LEAKS = LEAKS.filter((leak) => /127\.0\.0\.1|::1|localhost/i.test(leak));
  let empty;
  let library;
  let merged;
  beforeAll(() => {
    empty = proof([]).fails;
    library = proof(LIBRARY).fails;
    merged = proof(MERGED_LIBRARY).fails;
  });

  it('bibliotek-literalene gir ingen FAIL', () => {
    expect(library).toBe(empty);
  });

  it.each(LEAKS.flatMap((leak) => [[leak, 'alene', leak], [leak, 'limt inn', `abc${leak}Def`]]))(
    'lekket %s (%s) gir en FAIL til',
    (_leak, _shape, string) => {
      const r = proof([...LIBRARY, string]);
      expect(r.status).toBe(0);
      expect(r.fails).toBeGreaterThan(library);
    },
  );

  it.each(MERGED_LEAKS.flatMap((leak) => [[leak, 'alene', leak], [leak, 'limt inn', `abc${leak}Def`]]))(
    'lekket %s (%s) med literalen inne i seg gir en FAIL til',
    (_leak, _shape, string) => {
      const r = proof([...MERGED_LIBRARY, string]);
      expect(r.status).toBe(0);
      expect(r.fails).toBeGreaterThan(merged);
    },
  );
});

describe('begge butikkbevisene bruker de samme bundel-reglene', () => {
  it.each(['store-build-proof.sh', 'store-build-proof-android.sh'])('%s sourcer bundle-proof.sh og kaller bundle_proof', (file) => {
    const text = readFileSync(join(__dirname, file), 'utf8');
    expect(text).toMatch(/^BUNDLE_PROOF_LIB=.*\/bundle-proof\.sh"$/m);
    expect(text).toMatch(/^\. "\$BUNDLE_PROOF_LIB"$/m);
    expect(text).toMatch(/^ {2}bundle_proof "\$BUNDLE"$/m);
  });
});
