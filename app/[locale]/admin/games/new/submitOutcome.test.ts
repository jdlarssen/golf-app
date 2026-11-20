import { describe, it, expect, vi } from 'vitest';
import { isSuccessRedirect, settleSubmit } from './submitOutcome';

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

const GAME = '0b7c1a2e-1111-4222-8333-444455556666';

describe('isSuccessRedirect', () => {
  // The success targets of the create action (new/actions.ts), with and
  // without the locale prefix next-intl adds for a non-default locale.
  it.each([
    `/games/${GAME}/klar`,
    `/games/${GAME}`,
    `/games/${GAME}/spillere?error=invites_failed`,
    `/admin/games/${GAME}?status=scheduled`,
    `/admin/cup/${GAME}?status=match_added`,
    `/en/games/${GAME}/klar`,
  ])('%s is a success', (href) => {
    expect(isSuccessRedirect(thrownBy(() => redirect(href)))).toBe(true);
  });

  // Re-review: an expired session redirects to /login. That is no success,
  // and the draft must stay.
  it.each(['/login', '/en/login', '/', `/games/${GAME}/slett`, 'https://example.com/games/x'])(
    '%s is not a success',
    (href) => {
      expect(isSuccessRedirect(thrownBy(() => redirect(href)))).toBe(false);
    },
  );

  it('is false for anything that is not a redirect', () => {
    expect(isSuccessRedirect(new Error('Failed to fetch'))).toBe(false);
    expect(isSuccessRedirect({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })).toBe(false);
    expect(isSuccessRedirect(null)).toBe(false);
    expect(isSuccessRedirect('NEXT_REDIRECT')).toBe(false);
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

  it('a redirect to /login (session expired) is a failure, and is thrown on', async () => {
    const onResult = vi.fn();
    const toLogin = thrownBy(() => redirect('/login'));
    await expect(
      settleSubmit(async () => {
        throw toLogin;
      }, onResult),
    ).rejects.toBe(toLogin);
    expect(onResult).toHaveBeenCalledExactlyOnceWith(false);
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
