import { describe, it, expect, vi } from 'vitest';
import { isNextRedirect, settleSubmit } from './submitOutcome';

// vitest.setup.ts stubs next/navigation without redirect; the real one is
// what the action's redirect error comes from.
const { redirect } = await vi.importActual<typeof import('next/navigation')>('next/navigation');

// Audit 20.11 (p11), review: the wizard's local draft may go only on a positive
// success signal. A save comes back in one of three ways: a returned result
// (error code or none), a thrown Next redirect (the success path), or any
// other thrown error (crash, network).

function thrownBy(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('did not throw');
}

describe('isNextRedirect', () => {
  it('knows the error redirect() throws', () => {
    expect(isNextRedirect(thrownBy(() => redirect('/games/g1/klar')))).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isNextRedirect(new Error('Failed to fetch'))).toBe(false);
    expect(isNextRedirect({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })).toBe(false);
    expect(isNextRedirect(null)).toBe(false);
    expect(isNextRedirect('NEXT_REDIRECT')).toBe(false);
  });
});

describe('settleSubmit', () => {
  it('a result without an error is a success', async () => {
    const onResult = vi.fn();
    await expect(settleSubmit(async () => ({ error: '' }), onResult)).resolves.toEqual({ error: '' });
    expect(onResult).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('a returned error code is a failure', async () => {
    const onResult = vi.fn();
    await settleSubmit(async () => ({ error: 'db_game' }), onResult);
    expect(onResult).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('a thrown redirect is a success, and is thrown on', async () => {
    const onResult = vi.fn();
    const redirectError = thrownBy(() => redirect('/games/g1/klar'));
    await expect(
      settleSubmit(async () => {
        throw redirectError;
      }, onResult),
    ).rejects.toBe(redirectError);
    expect(onResult).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('any other thrown error is a failure, and is thrown on', async () => {
    const onResult = vi.fn();
    const crash = new Error('Failed to fetch');
    await expect(
      settleSubmit(async () => {
        throw crash;
      }, onResult),
    ).rejects.toBe(crash);
    expect(onResult).toHaveBeenCalledExactlyOnceWith(false);
  });
});
