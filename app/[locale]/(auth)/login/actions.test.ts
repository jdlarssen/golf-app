import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the /login server actions. Currently scoped to the
 * honeypot silent-reject path on `sendCode` — adding the test infrastructure
 * here so future login coverage can extend it.
 *
 * Honeypot semantics: a populated `website` field means a bot. The action
 * must NOT call Supabase signInWithOtp or the email_is_invited RPC, but
 * must still redirect to the verify step so the bot can't distinguish a
 * silent-reject from a real send.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
const rpcMock = vi.fn();
const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    ...supabaseMock,
    rpc: rpcMock,
    auth: {
      ...supabaseMock.auth,
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
    },
  }),
}));

// Admin client mock. Three call-sites i actions.ts treffer denne:
//
// 1. sendCode `opened_at`-stamping (main's #166-flyt):
//      .from('invitations').update({...}).ilike(...).is(...).is(...)
//    awaitable terminal — supabase-js løser builderen som thenable.
//
// 2. verifyCode pending-pickup (#182 deferred-notify):
//      .from('invitations').select(...).ilike().is().returns()
//
// 3. verifyCode user-lookup + game_players-insert for game-scoped invites:
//      .from('users').select().ilike().maybeSingle()
//      .from('game_players').insert(...)
//
// State variables under styres per-test slik at notify-grenen kan
// eksersises uten å påvirke main's eksisterende coverage.
let pendingInvitations: Array<{
  id: string;
  game_id: string | null;
  // NOT NULL i skjemaet (0001) — ingen fikstur kan uttrykke «ukjent inviter».
  invited_by: string;
  /**
   * #1348: verifyCode filtrerer nå på utløp i selve queryen, så fiksturene må
   * bære en frist. Alt annet enn de eksplisitt utløpte casene får en frist
   * langt fram i tid, så eksisterende tester beholder semantikken sin.
   */
  expires_at: string;
}> = [];

/** Frist langt inn i framtida — «denne invitasjonen er fortsatt gyldig». */
const FUTURE_EXPIRY = '2100-01-01T00:00:00.000Z';
let adminUserLookup: {
  id: string;
  profile_completed_at?: string | null;
} | null = null;
// #361: result of sendCode's lapsed-invitation lookup (null = none found).
let expiredInviteLookup: { id: string } | null = null;
let gamePlayersInsertResult: { error: unknown } = { error: null };
/**
 * Default for games-lookup i verifyCode (#199 chunk 9 / #676): vi sjekker
 * registration_type + short_id for å skippe game_players-insert og rute
 * invitéen riktig. Solo default-er slik at eksisterende #182-tester
 * ikke trenger endringer; team/both-tester override-er per case.
 */
let adminGameLookup: {
  registration_type: string;
  short_id?: string;
} | null = {
  registration_type: 'solo',
};
const adminUpdateMock = vi.fn();
const adminGamePlayersInsertMock = vi.fn();

function makeAdminBuilder() {
  const builder: Record<string, unknown> = {};
  for (const m of ['ilike', 'is', 'eq', 'select']) {
    builder[m] = () => builder;
  }
  // Awaitable terminal — supabase-js gjør samme triks på update-chains.
  (builder as { then: unknown }).then = (
    resolve: (value: { data: null; error: null }) => void,
  ) => resolve({ data: null, error: null });
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'invitations') {
        return {
          // sendCode opened_at-stamp: .update().ilike().is().is() awaited
          update: (...args: unknown[]) => {
            adminUpdateMock(...args);
            return makeAdminBuilder();
          },
          // Chainable select brukt av to call-sites:
          //  - verifyCode pending-pickup: .ilike().is().gt().returns()
          //      → pendingInvitations
          //  - sendCode #361 expired-invite:
          //      .ilike().is().not().lte().limit().maybeSingle()
          //      → expiredInviteLookup
          select: () => {
            const builder: Record<string, unknown> = {};
            let expiryCutoff: string | null = null;
            for (const m of ['ilike', 'is', 'not', 'lte', 'limit']) {
              builder[m] = () => builder;
            }
            // #1348: emulerer PostgREST-filteret verifyCode legger på
            // (.gt('expires_at', now)) så mock-en returnerer de samme radene
            // databasen ville gitt. ISO-strenger sammenlignes leksikalsk.
            builder.gt = (column: string, value: string) => {
              if (column === 'expires_at') expiryCutoff = value;
              return builder;
            };
            builder.returns = async () => ({
              data:
                expiryCutoff === null
                  ? pendingInvitations
                  : pendingInvitations.filter(
                      (inv) => inv.expires_at > expiryCutoff!,
                    ),
              error: null,
            });
            builder.maybeSingle = async () => ({
              data: expiredInviteLookup,
              error: null,
            });
            return builder;
          },
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            ilike: () => ({
              maybeSingle: async () => ({ data: adminUserLookup }),
            }),
          }),
        };
      }
      if (table === 'game_players') {
        return {
          insert: async (...args: unknown[]) => {
            adminGamePlayersInsertMock(...args);
            return gamePlayersInsertResult;
          },
        };
      }
      if (table === 'games') {
        // verifyCode (#199 chunk 9) sjekker registration_type for å skippe
        // game_players-insert på team-only spill.
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: adminGameLookup }),
            }),
          }),
        };
      }
      throw new Error(`unexpected admin.from(${table}) call`);
    },
    rpc: () => Promise.resolve({ data: true, error: null }),
  }),
}));

// loginRateLimit (#166) er mocket så tester deterministisk kan velge
// allow/deny uten å gå gjennom admin RPC-maskineriet. Default = ok;
// per-test override dekker deny-grenen.
const consumeLoginRateLimitMock = vi.fn();
vi.mock('@/lib/auth/loginRateLimit', () => ({
  consumeLoginRateLimit: (
    opts: Parameters<typeof consumeLoginRateLimitMock>[0],
  ) => consumeLoginRateLimitMock(opts),
}));

vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '1.2.3.4',
}));

const notifyInvitedToGameMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (...args: unknown[]) =>
    notifyInvitedToGameMock(...args),
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  supabaseMock = buildSupabaseMock([]);
  // Default: rate-limit allows; tests som eksersiserer deny-grenen override-er.
  consumeLoginRateLimitMock.mockResolvedValue({ ok: true });
  pendingInvitations = [];
  adminUserLookup = null;
  expiredInviteLookup = null;
  gamePlayersInsertResult = { error: null };
  adminGameLookup = { registration_type: 'solo' };
});

describe('sendCode — honeypot', () => {
  it('silent-rejects when the website field is populated: no signInWithOtp call, redirects to verify step', async () => {
    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'bot@example.com',
          website: 'https://spam.example.com', // bot filled the trap
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // Bot sees a "success" response — verify step, no error code.
    expect(lastRedirect()).toBe(
      '/login?step=verify&email=bot%40example.com',
    );

    // Critical: no Supabase work happened.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
    expect(adminUpdateMock).not.toHaveBeenCalled();
  });

  it('proceeds normally when website is empty (happy path reaches Supabase)', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'real@example.com',
          website: '', // empty — real user
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // Empty honeypot → the action calls Supabase and the email_is_invited RPC.
    expect(rpcMock).toHaveBeenCalledWith('email_is_invited', {
      check_email: 'real@example.com',
    });
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    expect(lastRedirect()).toBe(
      '/login?step=verify&email=real%40example.com',
    );
  });

  it('skips the rate-limit RPC when honeypot fires (cheap short-circuit)', async () => {
    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'bot@example.com',
          website: 'https://spam.example.com',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(consumeLoginRateLimitMock).not.toHaveBeenCalled();
  });
});

describe('sendCode — self-registration flag', () => {
  it('passes shouldCreateUser=false for a non-invited email when the flag is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'newcomer@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'newcomer@example.com',
      options: { shouldCreateUser: false },
    });
  });

  it('passes shouldCreateUser=true for a non-invited email when the flag is on', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'true');
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'newcomer@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'newcomer@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('keeps shouldCreateUser=true for an invited email regardless of flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    rpcMock.mockResolvedValue({ data: true, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'invited@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'invited@example.com',
      options: { shouldCreateUser: true },
    });
  });
});

describe('sendCode — disposable email block (#365)', () => {
  it('blocks a known disposable domain when self-reg is on: redirect disposable_email, no Supabase work', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'true');

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'throwaway@mailinator.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/login?email=throwaway%40mailinator.com&error=disposable_email',
    );
    // Short-circuits before the email_is_invited RPC and Supabase OTP, so we
    // never pay quota on a known-bad domain.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('blocks disposable domains regardless of invitation status (closes the spray-invite bypass)', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'true');
    // Even if this address had an open invitation, the disposable guard fires
    // first — email_is_invited is never consulted.
    rpcMock.mockResolvedValue({ data: true, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'invited@guerrillamail.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/login?email=invited%40guerrillamail.com&error=disposable_email',
    );
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('does not block disposable domains when self-reg is off (no change in invite-only mode)', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'someone@mailinator.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Guard skipped → flow proceeds to Supabase OTP as before.
    expect(lastRedirect()).not.toBe('/login?error=disposable_email');
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
  });
});

describe('sendCode — rate-limit', () => {
  it('redirects with rate_limited when consumeLoginRateLimit denies (email bucket)', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'email' });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'spam@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/login?email=spam%40example.com&error=rate_limited',
    );
    // Critical: Supabase OTP is NOT called when rate-limit denies.
    expect(signInWithOtpMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('redirects with rate_limited (same error) when IP bucket denies — no leak of which bucket hit', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'ip' });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'anyone@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/login?email=anyone%40example.com&error=rate_limited',
    );
  });

  it('maps the Supabase 60-second throttle to rate_limited_minute and keeps the user on the verify step (#1347)', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    signInWithOtpMock.mockResolvedValue({
      error: {
        message:
          'For security purposes, you can only request this after 60 seconds.',
      },
    });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'kompis@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Distinct from the own-bucket `rate_limited` (15 minutes), and the code
    // field stays visible — a valid code is already in the inbox.
    expect(lastRedirect()).toBe(
      '/login?step=verify&email=kompis%40example.com&error=rate_limited_minute',
    );
  });

  it('maps the project-wide mail quota to rate_limited_quota WITHOUT verify-parking (#1434)', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    signInWithOtpMock.mockResolvedValue({
      error: { message: 'email rate limit exceeded' },
    });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'kompis@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // No mail was sent, so parking the user at the code field would promise a
    // code that never comes. The quota string contains "rate" — this asserts
    // the quota check wins over the generic heuristic.
    expect(lastRedirect()).toBe(
      '/login?email=kompis%40example.com&error=rate_limited_quota',
    );
  });

  it('quota hit from «Send ny kode» (from=verify) stays on the verify step via errorCtx (#1434)', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    signInWithOtpMock.mockResolvedValue({
      error: { message: 'email rate limit exceeded' },
    });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'kompis@example.com', from: 'verify' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // The verify step is honest context here — an older code may still be
    // valid, and the copy promises no new one. This is the plain errorCtx
    // path (#1345), not the forced step-override the throttle branch uses.
    expect(lastRedirect()).toBe(
      '/login?step=verify&email=kompis%40example.com&error=rate_limited_quota',
    );
  });

  it('calls consumeLoginRateLimit with the trimmed/lowercased email and resolved IP', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: '  Spammer@Example.com  ' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(consumeLoginRateLimitMock).toHaveBeenCalledWith({
      email: 'spammer@example.com',
      ip: '1.2.3.4',
    });
  });
});

describe('sendCode — #361 lapsed invitation', () => {
  it('maps a lapsed invitation to invite_expired instead of user_not_found', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({
      error: { message: 'User not found' },
    });
    expiredInviteLookup = { id: 'inv-expired' };

    const { sendCode } = await import('./actions');
    await expect(
      sendCode(fd({ email: 'lapsed@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/login?email=lapsed%40example.com&error=invite_expired',
    );
  });

  it('keeps user_not_found when no lapsed invitation exists', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({
      error: { message: 'User not found' },
    });
    expiredInviteLookup = null;

    const { sendCode } = await import('./actions');
    await expect(
      sendCode(fd({ email: 'stranger@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/login?email=stranger%40example.com&error=user_not_found',
    );
  });
});

describe('error redirects keep the login context (#1345)', () => {
  const INVITE = '11111111-2222-3333-4444-555555555555';

  it('sendCode: an error redirect carries email, next and invite', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'email' });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'kompis@example.com',
          next: '/signup/abc12345',
          invite: INVITE,
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      `/login?email=kompis%40example.com&error=rate_limited&next=%2Fsignup%2Fabc12345&invite=${INVITE}`,
    );
  });

  it('sendCode: «Send ny kode» (from=verify) keeps the user on the verify step', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'email' });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'kompis@example.com',
          next: '/signup/abc12345',
          invite: INVITE,
          from: 'verify',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // Step 1 would blank the email field while a valid code is in transit.
    expect(lastRedirect()).toBe(
      `/login?step=verify&email=kompis%40example.com&error=rate_limited&next=%2Fsignup%2Fabc12345&invite=${INVITE}`,
    );
  });

  it('sendCode: an empty email never lands on the verify step, but keeps next/invite', async () => {
    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: '', next: '/spill', invite: INVITE, from: 'verify' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // step=verify without an email is a blind alley — there is nothing to
    // verify against, so the user goes back to the email field.
    expect(lastRedirect()).toBe(
      `/login?error=unknown&next=%2Fspill&invite=${INVITE}`,
    );
  });

  it('sendCode: an open-redirect next and a non-UUID invite are dropped', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'ip' });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'kompis@example.com',
          next: '//evil.example.com',
          invite: 'not-a-uuid',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/login?email=kompis%40example.com&error=rate_limited',
    );
  });

  it('verifyCode: a wrong code keeps step, email, next and invite', async () => {
    verifyOtpMock.mockResolvedValue({ error: { message: 'Invalid token' } });

    const { verifyCode } = await import('./actions');

    await expect(
      verifyCode(
        fd({
          email: 'kompis@example.com',
          token: '00000000',
          next: '/signup/abc12345',
          invite: INVITE,
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      `/login?step=verify&email=kompis%40example.com&error=code_invalid&next=%2Fsignup%2Fabc12345&invite=${INVITE}`,
    );
  });

  it('verifyCode: a missing email falls back to step 1 with next/invite intact', async () => {
    const { verifyCode } = await import('./actions');

    await expect(
      verifyCode(fd({ email: '', token: '12345678', next: '/spill', invite: INVITE })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      `/login?error=code_invalid&next=%2Fspill&invite=${INVITE}`,
    );
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });
});

describe('verifyCode — deferred game-scoped invite-notify (#182)', () => {
  it('game-scoped pending invitation: insertes i game_players + fyrer notify', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    // En pending invitasjon med game_id satt. Også en game-løs en for å
    // bekrefte at vi ikke prøver å inserte/notify på den.
    pendingInvitations = [
      {
        id: 'inv-1',
        game_id: '00000000-0000-0000-0000-0000000000aa',
        invited_by: '00000000-0000-0000-0000-0000000000bb',
        expires_at: FUTURE_EXPIRY,
      },
      {
        id: 'inv-2',
        game_id: null,
        invited_by: 'admin-x',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = { id: 'new-user-1' };

    // accept-update bruker cookie-klienten — la mock-en svare null/null.
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'kompis@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(adminGamePlayersInsertMock).toHaveBeenCalledTimes(1);
    expect(adminGamePlayersInsertMock).toHaveBeenCalledWith({
      game_id: '00000000-0000-0000-0000-0000000000aa',
      user_id: 'new-user-1',
      team_number: null,
      flight_number: null,
      course_handicap: null,
      // #463: OTP-aksept bekrefter deltakelse med en gang.
      accepted_at: expect.any(String),
    });
    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(1);
    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: 'new-user-1',
      gameId: '00000000-0000-0000-0000-0000000000aa',
      inviterUserId: '00000000-0000-0000-0000-0000000000bb',
    });
    // #1176: a fresh invitee (no profile yet) now lands DIRECTLY on the game.
    // The profile form is a soft stripe on game-home + a hard gate at scoring,
    // no longer a /complete-profile detour before they get to see the game.
    expect(lastRedirect()).toBe('/games/00000000-0000-0000-0000-0000000000aa');
  });

  it('#356: ferdig profil + ett solo-spill → lander rett på /games/[id]', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-1',
        game_id: '00000000-0000-0000-0000-0000000000aa',
        invited_by: '00000000-0000-0000-0000-0000000000bb',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = {
      id: 'returning-user',
      profile_completed_at: '2026-01-01T00:00:00.000Z',
    };
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'kompis@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/games/00000000-0000-0000-0000-0000000000aa',
    );
  });

  it('#356: eksplisitt next vinner over spill-landing (f.eks. /signup-deep-link)', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-1',
        game_id: '00000000-0000-0000-0000-0000000000aa',
        invited_by: '00000000-0000-0000-0000-0000000000bb',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = {
      id: 'returning-user',
      profile_completed_at: '2026-01-01T00:00:00.000Z',
    };
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(
        fd({
          email: 'kompis@example.com',
          token: '123456',
          next: '/signup/abc12345',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/signup/abc12345');
  });

  it('kun game-løse invitasjoner: ingen insert / notify, login lykkes uansett', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-friend',
        game_id: null,
        invited_by: 'admin-x',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = { id: 'user-x' };

    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'kompis@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(adminGamePlayersInsertMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe('/');
  });

  it('duplicate game_players UNIQUE-violation: notify fyrer fortsatt (idempotent)', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-1',
        game_id: '00000000-0000-0000-0000-0000000000aa',
        invited_by: '00000000-0000-0000-0000-0000000000bb',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = { id: 'new-user-1' };
    gamePlayersInsertResult = {
      error: { code: '23505', message: 'duplicate key' },
    };

    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'kompis@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // notify fyrer fortsatt — målet er at invitee får varslet uavhengig av
    // om de allerede var på rosteren via en annen vei.
    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(1);
  });

  it('ingen pending invitations: hopper over notify-pipelinen helt', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [];
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'first-login@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(adminGamePlayersInsertMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe('/');
  });

  it('team-only spill: hopper over game_players-insert (chunk 9), men notify-er fortsatt', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-team-1',
        game_id: '00000000-0000-0000-0000-0000000000aa',
        invited_by: '00000000-0000-0000-0000-0000000000bb',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = {
      id: 'new-user-1',
      profile_completed_at: '2026-01-01T00:00:00.000Z',
    };
    adminGameLookup = { registration_type: 'team', short_id: 'abc12345' };
    // No queue item: the accepted_at flip is skipped for team-scoped invitations,
    // so the server client should not perform any invitation update.
    supabaseMock = buildSupabaseMock([]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'kompis@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(adminGamePlayersInsertMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(1);
    // #676: team-scoped → invitation NOT consumed; redirect to attach flow.
    expect(lastRedirect()).toBe('/signup/abc12345/team');
  });
});

describe('verifyCode — #676 both-game email-invite co-player', () => {
  it("'both' game: no solo game_players insert, invitation stays pending, redirect to team attach page", async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-both-1',
        game_id: '00000000-0000-0000-0000-0000000000cc',
        invited_by: '00000000-0000-0000-0000-0000000000dd',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = {
      id: 'co-player-1',
      profile_completed_at: '2026-01-01T00:00:00.000Z',
    };
    // 'both' game — captain registered as team, co-player invited via email.
    adminGameLookup = { registration_type: 'both', short_id: 'xyz98765' };
    // No queue item: the accepted_at flip must be skipped for 'both' games
    // so team/page.tsx can still find the pending invitation via .is('accepted_at', null).
    supabaseMock = buildSupabaseMock([]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'coplayer@example.com', token: '654321' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Critical: no solo row auto-inserted — the attach flow creates the proper
    // team-linked game_players row when the co-player clicks "Bli med på lag".
    expect(adminGamePlayersInsertMock).not.toHaveBeenCalled();

    // Notify still fires so the co-player gets a "you've been invited" nudge.
    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(1);
    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: 'co-player-1',
      gameId: '00000000-0000-0000-0000-0000000000cc',
      inviterUserId: '00000000-0000-0000-0000-0000000000dd',
    });

    // Routes to the team attach page, not /games/[id].
    expect(lastRedirect()).toBe('/signup/xyz98765/team');
  });

  it("'both' game with incomplete profile: #1176 lands directly on the team attach page (soft gate, no detour)", async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-both-2',
        game_id: '00000000-0000-0000-0000-0000000000cc',
        invited_by: '00000000-0000-0000-0000-0000000000dd',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    // profile_completed_at is null → incomplete profile.
    adminUserLookup = { id: 'new-co-player', profile_completed_at: null };
    adminGameLookup = { registration_type: 'both', short_id: 'xyz98765' };
    supabaseMock = buildSupabaseMock([]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'newco@example.com', token: '111222' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(adminGamePlayersInsertMock).not.toHaveBeenCalled();
    // #1176: no more /complete-profile detour — the invitee lands on the team
    // attach page and completes their profile at scoring time.
    expect(lastRedirect()).toBe('/signup/xyz98765/team');
  });

  it("'both' game with explicit next: skips team-attach routing, honors the explicit next", async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-both-3',
        game_id: '00000000-0000-0000-0000-0000000000cc',
        invited_by: '00000000-0000-0000-0000-0000000000dd',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = { id: 'co-player-3', profile_completed_at: '2026-01-01T00:00:00.000Z' };
    adminGameLookup = { registration_type: 'both', short_id: 'xyz98765' };
    supabaseMock = buildSupabaseMock([]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(
        fd({
          email: 'coplayer3@example.com',
          token: '333444',
          next: '/signup/xyz98765/team',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // Explicit next takes precedence — gameDest is not set.
    expect(lastRedirect()).toBe('/signup/xyz98765/team');
  });
});

describe('verifyCode — #1348 utløpt invitasjon', () => {
  const PAST_EXPIRY = '2020-01-01T00:00:00.000Z';

  /** Invitations-update-kall på cookie-klienten = accepted_at-flippen. */
  function invitationUpdateCalls() {
    return supabaseMock.__fromCalls.filter(
      (c) => c.table === 'invitations' && c.method === 'update',
    );
  }

  it('utløpt game-scoped invitasjon: ingen accepted_at-flip, ingen game_players-insert, ingen notify, ingen spill-landing', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-expired',
        game_id: '00000000-0000-0000-0000-0000000000ee',
        invited_by: '00000000-0000-0000-0000-0000000000ff',
        expires_at: PAST_EXPIRY,
      },
    ];
    adminUserLookup = { id: 'late-user' };
    // Ingen kø-elementer: en utløpt invitasjon skal ikke gi noen skriving.
    supabaseMock = buildSupabaseMock([]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'forsent@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(invitationUpdateCalls()).toHaveLength(0);
    expect(adminGamePlayersInsertMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    // Innloggingen lykkes fortsatt — den utløpte invitasjonen gir bare ingen
    // spill-landing.
    expect(lastRedirect()).toBe('/');
  });

  it('utløpt + gyldig invitasjon: kun den gyldige konsumeres og styrer redirecten', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      {
        id: 'inv-expired',
        game_id: '00000000-0000-0000-0000-0000000000ee',
        invited_by: '00000000-0000-0000-0000-0000000000ff',
        expires_at: PAST_EXPIRY,
      },
      {
        id: 'inv-valid',
        game_id: '00000000-0000-0000-0000-0000000000aa',
        invited_by: '00000000-0000-0000-0000-0000000000bb',
        expires_at: FUTURE_EXPIRY,
      },
    ];
    adminUserLookup = { id: 'mixed-user' };
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'blanding@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Kun den gyldige raden flippes til accepted.
    expect(invitationUpdateCalls()).toHaveLength(1);
    expect(
      supabaseMock.__fromCalls.find(
        (c) => c.table === 'invitations' && c.method === 'in',
      )?.args,
    ).toEqual(['id', ['inv-valid']]);

    expect(adminGamePlayersInsertMock).toHaveBeenCalledTimes(1);
    expect(adminGamePlayersInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        game_id: '00000000-0000-0000-0000-0000000000aa',
        user_id: 'mixed-user',
      }),
    );
    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(1);
    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: 'mixed-user',
      gameId: '00000000-0000-0000-0000-0000000000aa',
      inviterUserId: '00000000-0000-0000-0000-0000000000bb',
    });
    // Én gyldig solo-invitasjon igjen → entydig spill-landing.
    expect(lastRedirect()).toBe('/games/00000000-0000-0000-0000-0000000000aa');
  });
});
