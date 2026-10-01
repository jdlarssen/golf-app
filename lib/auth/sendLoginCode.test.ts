// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2216): sperrene foran «send meg kode», i én kjerne.
 *
 * Nettsidens skjema og appens rute kaller samme `sendLoginCode`, så reglene
 * testes her én gang: fartsgrensen, av/på-bryteren for nye kontoer, sperren mot
 * engangs-e-post, invitasjonen som åpner for ny konto, og oversettingen av
 * GoTrue-feilene. Ruta og skjemaet tester bare sin egen form.
 *
 * Bare grensene er byttet: fartsgrensen (egen suite i `loginRateLimit.test.ts`),
 * service-klienten (oppslaget etter utløpt invitasjon og `opened_at`-stempelet)
 * og klienten kalleren sender inn (`email_is_invited` og GoTrue).
 */

const consumeLoginRateLimitMock = vi.fn();
vi.mock('@/lib/auth/loginRateLimit', () => ({
  consumeLoginRateLimit: (opts: { email: string; ip: string }) =>
    consumeLoginRateLimitMock(opts),
}));

/** Svaret på oppslaget etter en utløpt invitasjon (`null` = ingen). */
let expiredInvite: { id: string } | null = null;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'invitations' && op.kind === 'select') return { data: expiredInvite };
  if (op.table === 'invitations' && op.kind === 'update') return { data: null };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const admin = createAdminClientMock({ respond: (op) => respond(op) });
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => admin.client,
}));

const rpcMock = vi.fn();
const signInWithOtpMock = vi.fn();
/** Klienten kalleren sender inn — bare de to kallene kjernen gjør med den. */
const client = {
  rpc: rpcMock,
  auth: { signInWithOtp: signInWithOtpMock },
} as unknown as SupabaseClient<Database>;

const { sendLoginCode, selfRegistrationOpen } = await import('./sendLoginCode');

const IP = '10.0.0.7';
const send = (email: string) => sendLoginCode({ supabase: client, email, ip: IP });

/** `shouldCreateUser` i det ene kallet mot GoTrue. */
const shouldCreateUser = () =>
  signInWithOtpMock.mock.calls[0]?.[0]?.options?.shouldCreateUser;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  admin.reset();
  expiredInvite = null;
  consumeLoginRateLimitMock.mockResolvedValue({ ok: true });
  rpcMock.mockResolvedValue({ data: false, error: null });
  signInWithOtpMock.mockResolvedValue({ error: null });
});

describe('sendLoginCode', () => {
  it('fartsgrensen nekter → rate_limited, uten RPC og uten kode', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'ip' });

    expect(await send('spiller@example.com')).toEqual({ ok: false, code: 'rate_limited' });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('bryter av, ikke invitert → ingen ny konto, og GoTrues «signups not allowed» blir user_not_found', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    signInWithOtpMock.mockResolvedValue({
      error: { message: 'Signups not allowed for otp' },
    });

    expect(await send('ukjent@example.com')).toEqual({ ok: false, code: 'user_not_found' });
    expect(shouldCreateUser()).toBe(false);
  });

  it('bryter av, invitert → ny konto tillatt, og invitasjonen stemples opened_at', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    rpcMock.mockResolvedValue({ data: true, error: null });

    expect(await send('invitert@example.com')).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('email_is_invited', {
      check_email: 'invitert@example.com',
    });
    expect(shouldCreateUser()).toBe(true);
    const stamp = admin.ops.find((op) => op.table === 'invitations' && op.kind === 'update');
    expect(stamp?.payload).toHaveProperty('opened_at');
  });

  it('bryter på, ikke invitert → ny konto tillatt', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'true');

    expect(await send('ny@example.com')).toEqual({ ok: true });
    expect(shouldCreateUser()).toBe(true);
  });

  it('bryter på, engangs-e-post → disposable_email, uten RPC og uten kode', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'true');

    expect(await send('x2216@mailinator.com')).toEqual({
      ok: false,
      code: 'disposable_email',
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('bryter av, engangs-e-post, ikke invitert → koden forsøkes uten ny konto (sperren gjelder bare med bryteren på)', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');

    await send('x2216@mailinator.com');
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    expect(shouldCreateUser()).toBe(false);
  });

  it('som «ikke invitert», men med en utløpt invitasjon i basen → invite_expired', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    signInWithOtpMock.mockResolvedValue({
      error: { message: 'Signups not allowed for otp' },
    });
    expiredInvite = { id: 'utlopt-1' };

    expect(await send('utlopt@example.com')).toEqual({ ok: false, code: 'invite_expired' });
    const lookup = admin.ops.find((op) => op.table === 'invitations' && op.kind === 'select');
    // Oppslaget ser bare etter invitasjoner som har gått ut.
    expect(lookup?.filters.map((f) => [f.op, f.column])).toEqual(
      expect.arrayContaining([
        ['is', 'accepted_at'],
        ['lte', 'expires_at'],
      ]),
    );
  });

  it.each([
    ['Email rate limit exceeded', 'rate_limited_quota'],
    [
      'For security purposes, you can only request this after 42 seconds.',
      'rate_limited_minute',
    ],
    ['Noe helt annet', 'unknown'],
  ] as const)('GoTrue sier «%s» → %s', async (message, code) => {
    signInWithOtpMock.mockResolvedValue({ error: { message } });

    expect(await send('spiller@example.com')).toEqual({ ok: false, code });
  });

  it('tom e-post → unknown, og fartsgrensen spørres ikke', async () => {
    expect(await send('   ')).toEqual({ ok: false, code: 'unknown' });
    expect(consumeLoginRateLimitMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('e-posten trimmes og gjøres liten før fartsgrensen og GoTrue ser den', async () => {
    await send(' Ny@Example.TEST ');

    expect(consumeLoginRateLimitMock).toHaveBeenCalledWith({
      email: 'ny@example.test',
      ip: IP,
    });
    expect(signInWithOtpMock.mock.calls[0]?.[0]?.email).toBe('ny@example.test');
  });
});

describe('selfRegistrationOpen', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['', false],
  ])('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION=%j → %s, lest ved hvert kall', (value, open) => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', value);
    expect(selfRegistrationOpen()).toBe(open);
  });
});
