import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * Unit-tester for `/review-login`-server-action-en (#1284).
 *
 * Mockene ligger på systemgrensen (next/navigation, Supabase-klienten,
 * rate-limit-helperen), som i login/actions.test.ts. Det som faktisk testes
 * er reglene action-en eier selv:
 *   - kun `REVIEW_ACCOUNT_EMAIL` kan logges inn,
 *   - feil adresse og feil passord gir SAMME kode (ingen konto-orakel),
 *   - rate-limit konsumeres FØR auth-kallet.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const signInWithPasswordMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }),
}));

const consumeLoginRateLimitMock = vi.fn();
vi.mock('@/lib/auth/loginRateLimit', () => ({
  consumeLoginRateLimit: (
    opts: Parameters<typeof consumeLoginRateLimitMock>[0],
  ) => consumeLoginRateLimitMock(opts),
}));

vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '1.2.3.4',
}));

const REVIEW_EMAIL = 'reviewer@example.test';

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

/** Kjør action-en og returner URL-en den redirectet til. */
async function runAndCaptureRedirect(
  entries: Record<string, string>,
): Promise<string> {
  const { signInWithReviewPassword } = await import('./actions');
  try {
    await signInWithReviewPassword(fd(entries));
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error('action returned without redirecting');
}

/** `?error=`-koden fra en redirect-URL. */
function errorCode(url: string): string | null {
  return new URLSearchParams(url.split('?')[1] ?? '').get('error');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  consumeLoginRateLimitMock.mockResolvedValue({ ok: true });
  signInWithPasswordMock.mockResolvedValue({ error: null });
});

describe('signInWithReviewPassword', () => {
  it('avviser alt når REVIEW_ACCOUNT_EMAIL er usatt — ruta er inert', async () => {
    vi.stubEnv('REVIEW_ACCOUNT_EMAIL', '');

    const url = await runAndCaptureRedirect({
      email: REVIEW_EMAIL,
      password: 'riktig-passord',
    });

    expect(errorCode(url)).toBe('review_failed');
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('gir SAMME feilkode for feil adresse som for feil passord (ingen konto-orakel)', async () => {
    vi.stubEnv('REVIEW_ACCOUNT_EMAIL', REVIEW_EMAIL);

    const wrongEmailUrl = await runAndCaptureRedirect({
      email: 'noen-annen@example.test',
      password: 'riktig-passord',
    });
    // Feil adresse skal aldri nå Supabase — ingen konto å prøve mot.
    expect(signInWithPasswordMock).not.toHaveBeenCalled();

    signInWithPasswordMock.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });
    const wrongPasswordUrl = await runAndCaptureRedirect({
      email: REVIEW_EMAIL,
      password: 'feil-passord',
    });
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);

    expect(errorCode(wrongEmailUrl)).toBe('review_failed');
    expect(errorCode(wrongPasswordUrl)).toBe('review_failed');
    expect(errorCode(wrongEmailUrl)).toBe(errorCode(wrongPasswordUrl));
  });

  it('matcher adressen case-insensitivt og tåler mellomrom rundt', async () => {
    vi.stubEnv('REVIEW_ACCOUNT_EMAIL', `  ${REVIEW_EMAIL.toUpperCase()}  `);

    const { signInWithReviewPassword } = await import('./actions');
    await expect(
      signInWithReviewPassword(
        fd({ email: `  ${REVIEW_EMAIL}  `, password: 'riktig-passord' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: REVIEW_EMAIL,
      password: 'riktig-passord',
    });
  });

  it('stopper på rate-limit uten å røre auth-kallet', async () => {
    vi.stubEnv('REVIEW_ACCOUNT_EMAIL', REVIEW_EMAIL);
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'email' });

    const url = await runAndCaptureRedirect({
      email: REVIEW_EMAIL,
      password: 'riktig-passord',
    });

    expect(errorCode(url)).toBe('rate_limited');
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('konsumerer rate-limit før auth-kallet og sender innlogget bruker til /', async () => {
    vi.stubEnv('REVIEW_ACCOUNT_EMAIL', REVIEW_EMAIL);

    const url = await runAndCaptureRedirect({
      email: REVIEW_EMAIL,
      password: 'riktig-passord',
    });

    expect(consumeLoginRateLimitMock).toHaveBeenCalledWith({
      email: REVIEW_EMAIL,
      ip: '1.2.3.4',
    });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: REVIEW_EMAIL,
      password: 'riktig-passord',
    });
    // Rekkefølgen er poenget: en angriper skal brenne bucket-en selv når
    // passordet er riktig, ellers er kvoten gratis å omgå.
    expect(
      consumeLoginRateLimitMock.mock.invocationCallOrder[0],
    ).toBeLessThan(signInWithPasswordMock.mock.invocationCallOrder[0]);
    expect(url).toBe('/');
  });

  it('beholder adressen i feil-redirecten så feltet står utfylt', async () => {
    vi.stubEnv('REVIEW_ACCOUNT_EMAIL', REVIEW_EMAIL);
    signInWithPasswordMock.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });

    const url = await runAndCaptureRedirect({
      email: REVIEW_EMAIL,
      password: 'feil-passord',
    });

    expect(url).toBe(
      `/review-login?email=${encodeURIComponent(REVIEW_EMAIL)}&error=review_failed`,
    );
  });
});
