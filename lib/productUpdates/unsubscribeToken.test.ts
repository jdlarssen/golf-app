import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.PRODUCT_UPDATE_UNSUB_SECRET = 'test-secret-must-be-long-enough-for-hmac';
});

describe('unsubscribeToken', () => {
  it('round-trip: sign så verify returnerer samme userId', async () => {
    const { signUnsubToken, verifyUnsubToken } = await import('./unsubscribeToken');
    const userId = '11111111-1111-1111-1111-111111111111';
    const token = signUnsubToken(userId);
    const result = verifyUnsubToken(token);
    expect(result).toEqual({ userId });
  });

  it('verify avviser tampered sig', async () => {
    const { signUnsubToken, verifyUnsubToken } = await import('./unsubscribeToken');
    const token = signUnsubToken('user-x');
    // Flip ett tegn i siste del (sig)
    const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'B' : 'A') + token.slice(-1);
    expect(verifyUnsubToken(tampered)).toBeNull();
  });

  it('verify avviser tampered userId (sig matcher ikke ny payload)', async () => {
    const { signUnsubToken, verifyUnsubToken } = await import('./unsubscribeToken');
    const token = signUnsubToken('user-x');
    // Decode → bytt userId → re-encode med ORIGINAL sig
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    const tamperedDecoded = ['user-y', parts[1], parts[2]].join('.');
    const tampered = Buffer.from(tamperedDecoded, 'utf8').toString('base64url');
    expect(verifyUnsubToken(tampered)).toBeNull();
  });

  it('verify avviser utløpt token', async () => {
    const { signUnsubToken, verifyUnsubToken } = await import('./unsubscribeToken');
    const past = Date.now() - 400 * 24 * 60 * 60 * 1000; // sign-tidspunkt > 1 år siden
    const token = signUnsubToken('user-z', past);
    expect(verifyUnsubToken(token)).toBeNull();
  });

  it('verify avviser tomt token', async () => {
    const { verifyUnsubToken } = await import('./unsubscribeToken');
    expect(verifyUnsubToken('')).toBeNull();
  });

  it('verify avviser ikke-base64-token', async () => {
    const { verifyUnsubToken } = await import('./unsubscribeToken');
    expect(verifyUnsubToken('not-a-valid-token-at-all')).toBeNull();
  });

  it('verify avviser token med feil antall deler', async () => {
    const { verifyUnsubToken } = await import('./unsubscribeToken');
    const garbage = Buffer.from('only.two', 'utf8').toString('base64url');
    expect(verifyUnsubToken(garbage)).toBeNull();
  });

  it('sign kaster når secret ikke er satt', async () => {
    delete process.env.PRODUCT_UPDATE_UNSUB_SECRET;
    const { signUnsubToken } = await import('./unsubscribeToken');
    expect(() => signUnsubToken('user-x')).toThrow();
  });

  it('verify gir samme resultat for samme input (deterministisk)', async () => {
    const { signUnsubToken, verifyUnsubToken } = await import('./unsubscribeToken');
    const t1 = signUnsubToken('user-a', 1000);
    const t2 = signUnsubToken('user-a', 1000);
    expect(t1).toEqual(t2);
    expect(verifyUnsubToken(t1, 2000)).toEqual({ userId: 'user-a' });
  });
});
