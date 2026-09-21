// native/app/src/devLogin.test.ts
// Native #1923 (Type A): gaten og parseren bak tapp-innloggingen.
//
// Gaten er det som holder testbruker-knappene ute av prod, så tabellen under
// er beviset: bare staging-vert + satt passord gir en config. Alt annet —
// prod-verten, en vert som bare «ligner», tomt passord — gir null.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikken heises over importene og må bruke require */
import {
  fetchDevLoginUsers,
  parseDevLoginUsers,
  readDevLoginEnv,
  resolveDevLoginConfig,
  type DevLoginConfig,
} from './devLogin';
import { STAGING_SUPABASE_HOST } from './lib/stagingGate';

jest.mock('./supabase', () => require('./test/supabaseMock'));

const STAGING_URL = `https://${STAGING_SUPABASE_HOST}`;
const PASSWORD = 'et-langt-testpassord-for-staging';

describe('resolveDevLoginConfig', () => {
  it.each([
    ['uten passord', { supabaseUrl: STAGING_URL }],
    ['tomt passord', { supabaseUrl: STAGING_URL, password: '' }],
    ['passord av bare mellomrom', { supabaseUrl: STAGING_URL, password: '   ' }],
    ['uten URL', { password: PASSWORD }],
    // Prod-refen skrives ikke inn her; enhver vert som ikke ER staging er nok.
    ['et annet prosjekt (som prod)', { supabaseUrl: 'https://etannet.supabase.co', password: PASSWORD }],
    [
      'staging-verten som delstreng',
      { supabaseUrl: `${STAGING_URL}.angriper.no`, password: PASSWORD },
    ],
    ['uparsbar URL', { supabaseUrl: 'ikke en url', password: PASSWORD }],
  ])('gir null %s', (_name, env) => {
    expect(resolveDevLoginConfig(env)).toBeNull();
  });

  it('gir config for staging + passord, uten skråstrek til slutt', () => {
    expect(resolveDevLoginConfig({ supabaseUrl: `${STAGING_URL}/`, password: PASSWORD })).toEqual({
      supabaseUrl: STAGING_URL,
      password: PASSWORD,
    });
  });
});

describe('readDevLoginEnv', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD;
  });

  it('leser de to EXPO_PUBLIC-variablene', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = STAGING_URL;
    process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD = PASSWORD;
    expect(readDevLoginEnv()).toEqual({ supabaseUrl: STAGING_URL, password: PASSWORD });
  });
});

describe('parseDevLoginUsers', () => {
  const anne = { email: 'a@example.test', label: 'Anne Admin', role: 'admin' };
  const kari = { email: 'k@example.test', label: 'Kari Arrangør', role: 'arrangor' };
  const ola = { email: 'o@example.test', label: 'Ola Kompis', role: 'spiller' };

  it.each([
    ['null', null],
    ['en streng', 'users'],
    ['et tall', 7],
    ['objekt uten users', { version: 1 }],
    ['users som ikke er en liste', { users: { a: anne } }],
    ['tom liste', { users: [] }],
  ])('gir [] for %s', (_name, json) => {
    expect(parseDevLoginUsers(json)).toEqual([]);
  });

  it('beholder én gyldig oppføring', () => {
    expect(parseDevLoginUsers({ users: [anne] })).toEqual([anne]);
  });

  it('bevarer rekkefølgen og dropper ekstrafelt', () => {
    const withExtras = { ...ola, origin: '#1930', addedAt: '2026-09-05T10:12:00.000Z' };
    expect(parseDevLoginUsers({ version: 1, users: [kari, withExtras, anne] })).toEqual([
      kari,
      ola,
      anne,
    ]);
  });

  it.each([
    ['uten e-post', { label: 'Uten e-post', role: 'spiller' }],
    ['tom e-post', { email: '  ', label: 'Tom e-post', role: 'spiller' }],
    ['uten navn', { email: 'x@example.test', role: 'spiller' }],
    ['tomt navn', { email: 'x@example.test', label: '', role: 'spiller' }],
    ['ikke et objekt', 'x@example.test'],
  ])('dropper en oppføring %s', (_name, bad) => {
    expect(parseDevLoginUsers({ users: [anne, bad, ola] })).toEqual([anne, ola]);
  });

  it('gjør ukjent rolle til spiller', () => {
    expect(parseDevLoginUsers({ users: [{ ...ola, role: 'kaptein' }] })).toEqual([ola]);
    expect(parseDevLoginUsers({ users: [{ email: ola.email, label: ola.label }] })).toEqual([ola]);
  });

  it('lar den første vinne ved duplikat-e-post (uansett store bokstaver)', () => {
    const dup = { email: 'A@EXAMPLE.TEST', label: 'Kopi', role: 'spiller' };
    expect(parseDevLoginUsers({ users: [anne, dup] })).toEqual([anne]);
  });
});

describe('fetchDevLoginUsers', () => {
  const config: DevLoginConfig = { supabaseUrl: STAGING_URL, password: PASSWORD };
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(impl: () => Promise<unknown>) {
    const fn = jest.fn(impl);
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('henter fra den offentlige bucketen med cache-buster', async () => {
    const fn = mockFetch(async () => ({
      status: 200,
      json: async () => ({ users: [{ email: 'a@example.test', label: 'A', role: 'admin' }] }),
    }));
    await expect(fetchDevLoginUsers(config)).resolves.toEqual([
      { email: 'a@example.test', label: 'A', role: 'admin' },
    ]);
    const url = (fn.mock.calls[0] as unknown[])[0] as string;
    expect(url).toMatch(
      new RegExp(`^${STAGING_URL}/storage/v1/object/public/dev-login/users\\.json\\?t=\\d+$`),
    );
  });

  it.each([
    ['404', async () => ({ status: 404, json: async () => ({}) })],
    ['ugyldig JSON', async () => ({ status: 200, json: async () => Promise.reject(new Error('x')) })],
    ['nettfeil', async () => Promise.reject(new TypeError('Network request failed'))],
  ])('gir [] og kaster ikke ved %s', async (_name, impl) => {
    mockFetch(impl);
    await expect(fetchDevLoginUsers(config)).resolves.toEqual([]);
  });
});
