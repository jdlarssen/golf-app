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
  invited_by: string | null;
}> = [];
let adminUserLookup: { id: string } | null = null;
let gamePlayersInsertResult: { error: unknown } = { error: null };
/**
 * Default for games-lookup i verifyCode (#199 chunk 9): vi sjekker
 * registration_type for å skippe game_players-insert hvis spillet er team-only.
 * Solo + both default-er til 'solo' (eksisterende #182-tester); team-only-
 * tester override-er per case.
 */
let adminGameLookup: { registration_type: string } | null = {
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
          // verifyCode pending-pickup: .select().ilike().is().returns()
          select: () => ({
            ilike: () => ({
              is: () => ({
                returns: async () => ({
                  data: pendingInvitations,
                  error: null,
                }),
              }),
            }),
          }),
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

describe('sendCode — rate-limit', () => {
  it('redirects with rate_limited when consumeLoginRateLimit denies (email bucket)', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'email' });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'spam@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/login?error=rate_limited');
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

    expect(lastRedirect()).toBe('/login?error=rate_limited');
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
      },
      { id: 'inv-2', game_id: null, invited_by: 'admin-x' },
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
    });
    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(1);
    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: 'new-user-1',
      gameId: '00000000-0000-0000-0000-0000000000aa',
      inviterUserId: '00000000-0000-0000-0000-0000000000bb',
    });
    expect(lastRedirect()).toBe('/');
  });

  it('kun game-løse invitasjoner: ingen insert / notify, login lykkes uansett', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    pendingInvitations = [
      { id: 'inv-friend', game_id: null, invited_by: 'admin-x' },
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
      },
    ];
    adminUserLookup = { id: 'new-user-1' };
    adminGameLookup = { registration_type: 'team' };
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { verifyCode } = await import('./actions');
    await expect(
      verifyCode(fd({ email: 'kompis@example.com', token: '123456' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(adminGamePlayersInsertMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(1);
  });
});
