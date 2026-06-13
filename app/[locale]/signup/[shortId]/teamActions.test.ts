import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit-tester for team-formasjons-server-actions (#199 chunks 8+9).
 *
 * Dekker:
 *  - Honeypot short-circuit
 *  - Auth-redirect for uautenticerte
 *  - Validering: lag-navn, slots-count, duplicate emails, self-i-slots
 *  - wrong_type / wrong_mode / game_locked grener
 *  - Kjent medspiller → child-request + notify
 *  - Ukjent e-post → invitations-rad
 *  - Kaptein-rad opprettelse for open og manual_approval
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>(async () => ({ shouldAlsoSendMail: false }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const notifyInvitedToTeamMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>(async () => ({ shouldAlsoSendMail: false }));
vi.mock('@/lib/notifications/notifyInvitedToTeam', () => ({
  notifyInvitedToTeam: (...args: unknown[]) => notifyInvitedToTeamMock(...args),
}));

const lookupUserByEmailMock = vi.fn();
vi.mock('@/lib/users/lookupByEmail', () => ({
  lookupUserByEmail: (...args: unknown[]) => lookupUserByEmailMock(...args),
}));

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const getGameByShortIdMock = vi.fn();
vi.mock('@/lib/games/getGameByShortId', () => ({
  getGameByShortId: (shortId: string) => getGameByShortIdMock(shortId),
}));

// Rate-limit + IP-lookup mock-es som no-op default-«ok».
const consumeRateLimitMock = vi.fn<(...args: unknown[]) => Promise<{ ok: true }>>(
  async () => ({ ok: true as const }),
);
vi.mock('@/lib/auth/registrationRateLimit', () => ({
  consumeRegistrationRateLimit: (...args: unknown[]) =>
    consumeRateLimitMock(...args),
}));
vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '127.0.0.1',
}));

const sendTeamInvitationMailMock = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => {},
);
vi.mock('@/lib/mail/teamInvitation', () => ({
  sendTeamInvitationMail: (...args: unknown[]) =>
    sendTeamInvitationMailMock(...args),
}));

const CAPTAIN_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';
const CAPTAIN_REQUEST_ID = '33333333-3333-3333-3333-333333333333';
const ADMIN_USER_ID = '44444444-4444-4444-4444-444444444444';
const KNOWN_USER_ID = '55555555-5555-5555-5555-555555555555';
const SHORT_ID = 'abc12345';

function authedAsCaptain(profileCompleted = true): void {
  serverMock = buildSupabaseMock([
    {
      data: profileCompleted
        ? { profile_completed_at: '2026-01-01T00:00:00Z' }
        : { profile_completed_at: null },
      error: null,
    },
  ]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: CAPTAIN_ID, email: 'kaptein@example.com' } },
  });
}

function makeGame(overrides: Record<string, unknown> = {}) {
  return {
    id: GAME_ID,
    name: 'Sommercup 2026',
    short_id: SHORT_ID,
    status: 'scheduled',
    registration_mode: 'open',
    registration_type: 'team',
    game_mode: 'texas_scramble',
    mode_config: {
      kind: 'texas_scramble',
      team_size: 4,
      teams_count: 4,
      team_handicap_pct: 10,
    },
    course_id: 'course-id',
    scheduled_tee_off_at: null,
    created_by: ADMIN_USER_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock = buildSupabaseMock([]);
  adminMock = buildSupabaseMock([]);
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
  notifyInvitedToTeamMock.mockResolvedValue({ shouldAlsoSendMail: false });
});

describe('submitTeamRegistration — input-validering', () => {
  it('honeypot fylt → returnerer ok uten DB-write', async () => {
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [],
      website: 'http://bot.example',
    });
    expect(result.ok).toBe(true);
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
  });

  it('ugyldig shortId → game_not_found', async () => {
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: 'BAD!',
      teamName: 'Lag A',
      slots: [],
    });
    expect(result).toEqual({ ok: false, error: 'game_not_found' });
  });

  it('lag-navn for kort → team_name_invalid', async () => {
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'AB',
      slots: [],
    });
    expect(result).toEqual({ ok: false, error: 'team_name_invalid' });
  });

  it('lag-navn for langt → team_name_invalid', async () => {
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'A'.repeat(41),
      slots: [],
    });
    expect(result).toEqual({ ok: false, error: 'team_name_invalid' });
  });
});

describe('submitTeamRegistration — game-state-gating', () => {
  beforeEach(() => {
    authedAsCaptain();
  });

  it('solo-only spill → wrong_type', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_type: 'solo' }),
    );
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'a@x' },
        { mode: 'email', value: 'b@x' },
        { mode: 'email', value: 'c@x' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'wrong_type' });
  });

  it('invite_only spill → wrong_mode', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'invite_only' }),
    );
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'a@x' },
        { mode: 'email', value: 'b@x' },
        { mode: 'email', value: 'c@x' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'wrong_mode' });
  });

  it('aktivt spill → game_locked', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'active' }));
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'a@x' },
        { mode: 'email', value: 'b@x' },
        { mode: 'email', value: 'c@x' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'game_locked' });
  });

  it('#543: stengt påmelding → signup_closed', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ signups_closed_at: '2026-06-11T10:00:00Z' }),
    );
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'a@x' },
        { mode: 'email', value: 'b@x' },
        { mode: 'email', value: 'c@x' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'signup_closed' });
  });

  it('solo-modus (stableford) → mode_does_not_support_teams', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
        registration_type: 'team',
      }),
    );
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [],
    });
    expect(result).toEqual({ ok: false, error: 'mode_does_not_support_teams' });
  });

  it('feil antall slots → slots_count_wrong', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    // team_size=4 betyr 3 slots; vi sender 2.
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'a@x' },
        { mode: 'email', value: 'b@x' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'slots_count_wrong' });
  });

  it('duplikat e-poster i slots → duplicate_emails', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'a@x' },
        { mode: 'email', value: 'a@x' },
        { mode: 'email', value: 'b@x' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'duplicate_emails' });
  });

  it('kaptein-egen e-post i slots → self_in_slots', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'kaptein@example.com' },
        { mode: 'email', value: 'b@x' },
        { mode: 'email', value: 'c@x' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'self_in_slots' });
  });

  it('disposable medspiller-e-post → disposable_email, ingen DB-write (#422)', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'a@example.com' },
        { mode: 'email', value: 'throwaway@mailinator.com' },
        { mode: 'email', value: 'c@example.com' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'disposable_email' });
    // Pre-validation aborts before captain-row / invitations insert.
    const insertCalls = adminMock.__fromCalls.filter(
      (c) => c.method === 'insert',
    );
    expect(insertCalls).toHaveLength(0);
  });
});

describe('submitTeamRegistration — happy paths', () => {
  beforeEach(() => {
    authedAsCaptain();
  });

  it('open-modus med alle kjente brukere: kaptein-rad + child-rader + game_players + team_invite-notify', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'open',
        mode_config: {
          kind: 'texas_scramble',
          team_size: 2,
          teams_count: 4,
          team_handicap_pct: 25,
        },
      }),
    );
    // Tre kjente brukere — vi gjør lookup ALLE som lookup-mode (matcher
    // form-state hvor kaptein eksplisitt velger eksisterende-spiller-toggle).
    lookupUserByEmailMock.mockResolvedValue({
      id: KNOWN_USER_ID,
      name: 'Kjent Bruker',
      email: 'kjent@example.com',
    });
    // admin-mock queue:
    //   1) captain insert → {id: captain-request-id}
    //   2) captain display lookup (users) — vi returnerer en row
    //   3) existing teams lookup (team_number)
    //   4) captain game_players upsert
    //   5..) per-slot: insert child request, player upsert (open-modus)
    adminMock = buildSupabaseMock([
      { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
      {
        data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
        error: null,
      }, // captain display
      { data: [], error: null }, // existing teams (empty)
      { data: null, error: null }, // captain game_players upsert
      // Slot 1 (lookup, kjent)
      { data: null, error: null }, // child request insert
      { data: null, error: null }, // child player upsert
    ]);

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Birdie-jegerne',
      slots: [{ mode: 'lookup', value: 'kjent@example.com' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.captainRequestId).toBe(CAPTAIN_REQUEST_ID);
    expect(result.slotResults).toHaveLength(1);
    expect(result.slotResults[0]).toMatchObject({
      ok: true,
      outcome: 'known_added',
    });
    expect(notifyInvitedToTeamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: KNOWN_USER_ID,
        teamName: 'Birdie-jegerne',
      }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
  });

  it('open-modus med ukjent e-post: opprettet invitations-rad (slot resultat unknown_invited)', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'open',
        mode_config: {
          kind: 'texas_scramble',
          team_size: 2,
          teams_count: 4,
          team_handicap_pct: 25,
        },
      }),
    );
    lookupUserByEmailMock.mockResolvedValue(null); // ukjent
    adminMock = buildSupabaseMock([
      { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
      {
        data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
        error: null,
      }, // captain display
      { data: [], error: null }, // existing teams
      { data: null, error: null }, // captain game_players upsert
      { data: null, error: null }, // invitations insert
    ]);

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [{ mode: 'email', value: 'ukjent@example.com' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotResults[0]).toMatchObject({
      ok: true,
      outcome: 'unknown_invited',
    });
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it('lookup-modus mot ukjent bruker: slot feiler med "Bruker ikke funnet"', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'open',
        mode_config: {
          kind: 'texas_scramble',
          team_size: 2,
          teams_count: 4,
          team_handicap_pct: 25,
        },
      }),
    );
    lookupUserByEmailMock.mockResolvedValue(null);
    adminMock = buildSupabaseMock([
      { data: { id: CAPTAIN_REQUEST_ID }, error: null },
      {
        data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
        error: null,
      },
      { data: [], error: null }, // existing teams
      { data: null, error: null }, // captain player upsert
    ]);

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [{ mode: 'lookup', value: 'ukjent@example.com' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotResults[0]).toEqual({
      ok: false,
      email: 'ukjent@example.com',
      reason: 'Bruker ikke funnet',
    });
  });

  it('manual_approval: kaptein-rad opprettes med status=pending + admin-notify', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'manual_approval',
        mode_config: {
          kind: 'texas_scramble',
          team_size: 2,
          teams_count: 4,
          team_handicap_pct: 25,
        },
      }),
    );
    lookupUserByEmailMock.mockResolvedValue(null);
    adminMock = buildSupabaseMock([
      { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
      {
        data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
        error: null,
      }, // captain display
      { data: null, error: null }, // invitations insert (ukjent slot)
    ]);

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [{ mode: 'email', value: 'ukjent@example.com' }],
    });

    expect(result.ok).toBe(true);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_USER_ID,
        kind: 'registration_request',
      }),
    );
  });

  it('kaptein dobbel-submit (UNIQUE 23505) → already_registered', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([
      { data: null, error: { code: '23505', message: 'duplicate' } },
    ]);

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [
        { mode: 'email', value: 'a@x' },
        { mode: 'email', value: 'b@x' },
        { mode: 'email', value: 'c@x' },
      ],
    });
    expect(result).toEqual({ ok: false, error: 'already_registered' });
  });

  it('uautentisert → redirect /login med next-param', async () => {
    serverMock = buildSupabaseMock([]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { submitTeamRegistration } = await import('./teamActions');
    await expect(
      submitTeamRegistration({
        shortId: SHORT_ID,
        teamName: 'Lag A',
        slots: [
          { mode: 'email', value: 'a@x' },
          { mode: 'email', value: 'b@x' },
          { mode: 'email', value: 'c@x' },
        ],
      }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/login?next=/signup/${SHORT_ID}` }),
    );
  });
});

describe('#543: stengt påmelding — accept/attach-guards', () => {
  beforeEach(() => {
    authedAsCaptain();
  });

  it('acceptTeamInvite på stengt spill → signup_closed', async () => {
    // Admin-kø: kun request-raden — guarden treffer før team_number-oppslag.
    adminMock = buildSupabaseMock([
      {
        data: {
          id: 'req-1',
          game_id: GAME_ID,
          user_id: CAPTAIN_ID,
          status: 'pending',
          team_request_id: null,
          team_name: 'Lag A',
          is_team_captain: false,
        },
        error: null,
      },
    ]);
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ signups_closed_at: '2026-06-11T10:00:00Z' }),
    );
    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite('req-1', SHORT_ID);
    expect(result).toEqual({ ok: false, error: 'signup_closed' });
  });

  it('attachToCaptainTeam på stengt spill → signup_closed', async () => {
    // Guarden treffer rett etter game-oppslaget — før invitations-querien.
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ signups_closed_at: '2026-06-11T10:00:00Z' }),
    );
    const { attachToCaptainTeam } = await import('./teamActions');
    const result = await attachToCaptainTeam('inv-1', SHORT_ID);
    expect(result).toEqual({ ok: false, error: 'signup_closed' });
  });
});
