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
//  1. godta én BAR forekomst av hver literal, uansett nabo;
//  2. gi FAIL når adressen har skjema (`://`) eller port (`:<siffer>`), for da
//     er det en adresse fra miljøet;
//  3. gi FAIL for flere enn én bar forekomst av 127.0.0.1 og [::1];
//  4. la de andre LAN-reglene stå som før (192.168-saken).
//
// `bundle_proof` kjøres på en falsk bundel: strengene skilt med NUL, så
// `strings` gir én linje per streng, slik den gir én per pakket løp i en ekte
// bundel. Bare linja for regelen under test sjekkes; de andre reglene (prod-
// adressen, UTF-16-tabellen) gir FAIL her og er ikke det testen spør om.
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

function proof(strings) {
  n += 1;
  const bundle = join(tmp, `bundle-${n}.bin`);
  const out = join(tmp, `bevis-${n}.txt`);
  writeFileSync(bundle, Buffer.from(`\0${strings.join('\0')}\0`, 'latin1'));
  writeFileSync(out, '');
  const result = spawnSync('bash', ['-c', HARNESS, 'bash', LIB, bundle, out], {
    encoding: 'utf8',
    env: { ...process.env, TORNY_APP_ENV_DIR: tmp, EXPO_PUBLIC_SUPABASE_ANON_KEY: '' },
  });
  const lines = result.stdout.split('\n').filter(Boolean);
  return {
    status: result.status,
    stderr: result.stderr,
    verdicts: lines.filter((l) => /^(PASS|FAIL) {2}/.test(l)),
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
    ['bar localhost (supabase-js)', 'PASS', ['set-thingslocalhostx-relay-error'], '«localhost»'],
    ['localhost med ukjent port', 'FAIL', ['set-thingslocalhost:3000/x'], '«localhost»'],
    ['192.168-adresse, som før', 'FAIL', ['ip192.168.1.20/x'], '192\\.168'],
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
});

describe('begge butikkbevisene bruker de samme bundel-reglene', () => {
  it.each(['store-build-proof.sh', 'store-build-proof-android.sh'])('%s sourcer bundle-proof.sh og kaller bundle_proof', (file) => {
    const text = readFileSync(join(__dirname, file), 'utf8');
    expect(text).toMatch(/^BUNDLE_PROOF_LIB=.*\/bundle-proof\.sh"$/m);
    expect(text).toMatch(/^\. "\$BUNDLE_PROOF_LIB"$/m);
    expect(text).toMatch(/^ {2}bundle_proof "\$BUNDLE"$/m);
  });
});
