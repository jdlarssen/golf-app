// native/app/scripts/fcm-key-to-vercel.test.js
// #2758: skriptet som legger FCM_SERVICE_ACCOUNT inn i Vercel. En ekte kjøring
// skriver til Vercel, så det ekte skriptet kjøres her mot en falsk `npx`, som
// logger argumentene og stdin. Fire ting må stå:
//
//  1. **Verdien går i stdin**, aldri i argv eller utdata.
//  2. **Feil fil stopper** før et eneste kall til Vercel, og uten å vise innholdet.
//  3. **Et navn som finnes alt, overskrives ikke**, heller ikke når det bare står
//     på stderr.
//  4. **Stopp er stopp:** en feil gir exit ≠ 0, aldri ferdig-meldingen.
//
// Skriptet kjøres i en UTF-8-locale: bash 3.2 på Macen leser `«$var»` feil der,
// og agent-skall har tom LANG, så feilen ellers skjuler seg.
import { spawnSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const SCRIPT = join(__dirname, 'fcm-key-to-vercel.sh');
const SECRET = 'hemmelig-privatnokkel';
const ACCOUNT = {
  type: 'service_account',
  project_id: 'torny-test',
  client_email: 'sender@example.test',
  private_key: SECRET,
};

const FAKE_NPX = `#!/bin/bash
printf '%s\\n' "$*" >> "$FAKE/argv.log"
shift 2
case "$1" in
  whoami) [ -f "$FAKE/logged-in" ] ;;
  login) touch "$FAKE/logged-in" ;;
  env)
    case "$2" in
      ls)
        [ -z "\${LS_FAILS:-}" ] || exit 1
        if [ -f "$FAKE/has-name" ]; then
          if [ -n "\${LS_ON_STDERR:-}" ]; then echo "FCM_SERVICE_ACCOUNT Encrypted" >&2
          else echo "FCM_SERVICE_ACCOUNT Encrypted"; fi
        fi
        ;;
      add)
        cat > "$FAKE/stdin.log"
        if [ -n "\${ADD_FAILS:-}" ]; then echo "vercel sier nei" >&2; exit 1; fi
        [ -n "\${ADD_DOES_NOTHING:-}" ] || touch "$FAKE/has-name"
        ;;
    esac
    ;;
esac
`;

let home;
let fake;
let bin;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'fcm-key-'));
  home = join(root, 'home');
  fake = join(root, 'fake');
  bin = join(root, 'bin');
  mkdirSync(join(home, '.torny-native'), { recursive: true });
  mkdirSync(fake);
  mkdirSync(bin);
  writeFileSync(join(bin, 'npx'), FAKE_NPX);
  chmodSync(join(bin, 'npx'), 0o755);
  writeFileSync(join(fake, 'logged-in'), '');
});

afterEach(() => {
  rmSync(dirname(home), { recursive: true, force: true });
});

function writeKey(contents = JSON.stringify(ACCOUNT)) {
  writeFileSync(join(home, '.torny-native', 'firebase-service-account.json'), contents);
}

function run(env = {}) {
  return spawnSync('/bin/bash', [SCRIPT], {
    encoding: 'utf8',
    input: '',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: home,
      FAKE: fake,
      LANG: 'nb_NO.UTF-8',
      LC_ALL: 'nb_NO.UTF-8',
      ...env,
    },
  });
}

const calls = () => {
  const log = join(fake, 'argv.log');
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
};
const addCalls = () => calls().filter((call) => call.includes(' env add '));
const output = (result) => `${result.stdout}\n${result.stderr}`;
const encoded = () => Buffer.from(JSON.stringify(ACCOUNT), 'utf8').toString('base64');

describe('fcm-key-to-vercel.sh', () => {
  it('sends the file as base64 on stdin, and neither argv nor the output shows it', () => {
    writeKey();

    const result = run();

    expect(output(result)).toContain('Ferdig');
    expect(result.status).toBe(0);
    expect(readFileSync(join(fake, 'stdin.log'), 'utf8')).toBe(encoded());
    expect(addCalls()).toEqual([
      '--yes vercel@65.9.0 env add FCM_SERVICE_ACCOUNT --environment production,preview --sensitive --yes --project golf-app --scope jdlarssen-prosjekter',
    ]);
    for (const text of [calls().join('\n'), output(result)]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(encoded());
    }
    expect(calls().join('\n')).not.toMatch(/--value|--force|--json/);
  });

  it('reads the name back after adding it', () => {
    writeKey();

    run();

    const lists = calls().filter((call) => call.includes(' env ls '));
    expect(lists).toHaveLength(2);
    expect(calls().indexOf(lists[0])).toBeLessThan(calls().indexOf(addCalls()[0]));
    expect(calls().lastIndexOf(lists[1])).toBeGreaterThan(calls().indexOf(addCalls()[0]));
  });

  it('logs in first when Vercel does not know the machine', () => {
    writeKey();
    rmSync(join(fake, 'logged-in'));

    expect(run().status).toBe(0);

    const verbs = calls().map((call) => call.split(' ').slice(2, 4).join(' '));
    expect(verbs.slice(0, 3)).toEqual(['whoami', 'login', 'env ls']);
  });

  it('does not log in when the machine is already logged in', () => {
    writeKey();

    expect(run().status).toBe(0);

    expect(calls().join('\n')).not.toContain(' login');
  });

  it('stops without calling Vercel when the file is missing', () => {
    const result = run();

    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
    expect(output(result)).not.toContain('Ferdig');
  });

  it.each([
    ['not JSON', `ikke json ${SECRET}`],
    ['another kind of credential', JSON.stringify({ ...ACCOUNT, type: 'authorized_user' })],
    ['no project id', JSON.stringify({ ...ACCOUNT, project_id: '' })],
    ['no key', JSON.stringify({ ...ACCOUNT, private_key: undefined })],
    ['no client email', JSON.stringify({ ...ACCOUNT, client_email: undefined })],
    ['a JSON value that is not an object', 'null'],
  ])('stops without calling Vercel or showing the file for %s', (_case, contents) => {
    writeKey(contents);

    const result = run();

    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
    expect(output(result)).not.toContain(SECRET);
    expect(output(result)).not.toContain('Ferdig');
  });

  it.each([
    ['on stdout', {}],
    ['on stderr only', { LS_ON_STDERR: '1' }],
  ])('does not overwrite a name that already exists, listed %s', (_case, env) => {
    writeKey();
    writeFileSync(join(fake, 'has-name'), '');

    const result = run(env);

    expect(result.status).not.toBe(0);
    expect(addCalls()).toEqual([]);
    expect(output(result)).not.toContain('Ferdig');
  });

  it('stops before adding when the list cannot be read', () => {
    writeKey();

    const result = run({ LS_FAILS: '1' });

    expect(result.status).not.toBe(0);
    expect(addCalls()).toEqual([]);
  });

  it('stops and shows why when Vercel refuses the value', () => {
    writeKey();

    const result = run({ ADD_FAILS: '1' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('vercel sier nei');
    expect(output(result)).not.toContain(SECRET);
    expect(output(result)).not.toContain('Ferdig');
  });

  it('stops when the name is not in the list afterwards', () => {
    writeKey();

    const result = run({ ADD_DOES_NOTHING: '1' });

    expect(result.status).not.toBe(0);
    expect(output(result)).not.toContain('Ferdig');
  });

  it('finds Node through nvm when a double-click gives a shell without it', () => {
    writeKey();
    const noNode = join(dirname(home), 'no-node');
    mkdirSync(noNode);
    for (const tool of ['base64', 'tr']) {
      const found = spawnSync('/bin/bash', ['-c', `command -v ${tool}`], { encoding: 'utf8' });
      symlinkSync(found.stdout.trim(), join(noNode, tool));
    }
    mkdirSync(join(home, '.nvm'));
    writeFileSync(
      join(home, '.nvm', 'nvm.sh'),
      `nvm() { PATH="${bin}:${process.env.PATH}"; }\n`,
    );

    const result = run({ PATH: noNode });

    expect(output(result)).toContain('Ferdig');
    expect(result.status).toBe(0);
  });
});
