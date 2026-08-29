import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, verify, type KeyObject } from 'node:crypto';

/**
 * Type A tests for the hand-rolled APNs provider (#1282).
 *
 * The module reads its env at import time (vapid.ts pattern), so every case
 * re-imports through `loadApns()` after setting env — the pushActions.test.ts
 * idiom. That also gives each case a fresh JWT cache.
 *
 * The http2 IO (`sendApnsNotification`) is deliberately untested: it holds no
 * decisions. Everything that branches lives in the pure functions below.
 */

// A throwaway P-256 keypair stands in for the real .p8 — the public half lets us
// verify the JWT signature for real instead of asserting on its shape.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const PRIVATE_KEY_B64 = Buffer.from(PRIVATE_PEM, 'utf8').toString('base64');

const KEY_ID = 'ABCD123456';
const TEAM_ID = '8C8WCW67J9';
const BUNDLE_ID = 'no.tornygolf.app';

const ENV_KEYS = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_PRIVATE_KEY'] as const;
const savedEnv: Record<string, string | undefined> = {};

async function loadApns(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  const full = {
    APNS_KEY_ID: KEY_ID,
    APNS_TEAM_ID: TEAM_ID,
    APNS_BUNDLE_ID: BUNDLE_ID,
    APNS_PRIVATE_KEY: PRIVATE_KEY_B64,
    ...overrides,
  };
  for (const key of ENV_KEYS) {
    if (full[key] === '') delete process.env[key];
    else process.env[key] = full[key];
  }
  return import('./apns');
}

/** Decode one base64url JWT segment back to an object. */
function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/** Verify an ES256 JWT against a public key the way Apple would. */
function verifyJwt(token: string, key: KeyObject): boolean {
  const [header, claims, signature] = token.split('.');
  return verify(
    'sha256',
    Buffer.from(`${header}.${claims}`, 'utf8'),
    { key, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url'),
  );
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  vi.useRealTimers();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('isApnsConfigured', () => {
  it('is true when all four env vars are present', async () => {
    const { isApnsConfigured } = await loadApns();
    expect(isApnsConfigured()).toBe(true);
  });

  it.each(ENV_KEYS)('is false when %s is missing (send must no-op)', async (missing) => {
    const { isApnsConfigured } = await loadApns({ [missing]: '' });
    expect(isApnsConfigured()).toBe(false);
  });
});

describe('buildApnsJwt', () => {
  it('signs a header+claims Apple accepts, verifiable with the public key', async () => {
    const { buildApnsJwt } = await loadApns();
    const token = buildApnsJwt();

    const [header, claims, signature] = token.split('.');
    expect(signature).toBeTruthy();
    expect(decodeSegment(header)).toEqual({ alg: 'ES256', kid: KEY_ID });

    const payload = decodeSegment(claims);
    expect(payload.iss).toBe(TEAM_ID);
    // iat is epoch SECONDS, not millis — a millisecond value would be rejected.
    expect(payload.iat).toBeTypeOf('number');
    expect(Math.abs((payload.iat as number) - Math.floor(Date.now() / 1000))).toBeLessThan(5);

    expect(verifyJwt(token, publicKey)).toBe(true);
  });

  it('produces an ieee-p1363 (raw R||S) signature, not DER', async () => {
    const { buildApnsJwt } = await loadApns();
    const signature = Buffer.from(buildApnsJwt().split('.')[2], 'base64url');
    // P-256 raw signatures are exactly 64 bytes; DER-wrapped ones are ~70 and
    // start with 0x30. JWT requires the raw form.
    expect(signature.length).toBe(64);
  });

  it('reuses the cached token inside the TTL and reissues after it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T10:00:00Z'));
    const { buildApnsJwt } = await loadApns();

    const first = buildApnsJwt();
    vi.setSystemTime(new Date('2026-08-29T10:40:00Z')); // 40 min — inside the 45 min TTL
    expect(buildApnsJwt()).toBe(first);

    vi.setSystemTime(new Date('2026-08-29T10:50:00Z')); // 50 min — past it
    const second = buildApnsJwt();
    expect(second).not.toBe(first);
    expect(verifyJwt(second, publicKey)).toBe(true);
  });
});

describe('buildApnsPayload', () => {
  it('builds the aps envelope with the deeplink and kind alongside it', async () => {
    const { buildApnsPayload } = await loadApns();
    expect(buildApnsPayload('Tittel', 'Detalj', '/games/abc', 'game_finished')).toEqual({
      aps: { alert: { title: 'Tittel', body: 'Detalj' }, sound: 'default' },
      url: '/games/abc',
      kind: 'game_finished',
    });
  });

  it('clamps title at 120 and body at 240 like web-push does', async () => {
    const { buildApnsPayload } = await loadApns();
    const payload = buildApnsPayload('t'.repeat(300), 'd'.repeat(300), '/', 'product_update');
    expect(payload.aps.alert.title).toHaveLength(120);
    expect(payload.aps.alert.title.endsWith('…')).toBe(true);
    expect(payload.aps.alert.body).toHaveLength(240);
    expect(payload.aps.alert.body.endsWith('…')).toBe(true);
  });
});

describe('decidePruneAction', () => {
  it.each([
    // status, reason, triedBothEnvs, expected
    [410, 'Unregistered', false, 'prune'],
    [410, 'Unregistered', true, 'prune'],
    [410, null, false, 'prune'],
    [400, 'BadDeviceToken', false, 'retry-sandbox'],
    [400, 'BadDeviceToken', true, 'prune'],
    [400, 'BadTopic', false, 'keep-log'],
    [403, 'ExpiredProviderToken', false, 'keep-log'],
    [429, 'TooManyRequests', true, 'keep-log'],
    [500, 'InternalServerError', true, 'keep-log'],
    [0, null, false, 'keep-log'],
  ] as const)(
    'status %i / reason %s / triedBothEnvs %s → %s',
    async (status, reason, triedBothEnvs, expected) => {
      const { decidePruneAction } = await loadApns();
      expect(decidePruneAction(status, reason, triedBothEnvs)).toBe(expected);
    },
  );
});
