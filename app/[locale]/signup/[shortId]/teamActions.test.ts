import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
  type QueryResult,
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
// #2209: the shared double (lib/games/__mocks__) — the real helper would eat
// this file's queued Supabase answers with its two reads.
vi.mock('@/lib/games/joinTeeGenders');
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

// #2207: a picked candidate arrives as an id; the address comes from the
// captain's own candidate set (friends ∪ co-players), stubbed here like
// lookupUserByEmail above.
const getTeamCandidateEmailsMock = vi.fn<
  (userId: string, ids: readonly string[]) => Promise<Map<string, string>>
>(async () => new Map());
vi.mock('@/lib/users/getTeamCandidates', () => ({
  getTeamCandidateEmails: (userId: string, ids: readonly string[]) =>
    getTeamCandidateEmailsMock(userId, ids),
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
    //   (the captain's game_players row comes from the seat claim RPC, #2060)
    //   3..) per-slot: insert child request, player upsert (open-modus)
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        {
          data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
          error: null,
        }, // captain display
        // Slot 1 (lookup, kjent)
        { data: null, error: null }, // child request insert
        { data: null, error: null }, // child player upsert
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

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
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
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
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        {
          data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
          error: null,
        }, // captain display
        { data: null, error: null }, // invitations insert
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

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

  it('lookup-modus mot ukjent bruker: slot feiler med reason-kode "userNotFound"', async () => {
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
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null },
        {
          data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
          error: null,
        },
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

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
      reason: 'userNotFound',
    });
  });

  it('valgt kandidat (id) legges til, og resultatet viser adressen maskert (#2207)', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'open',
        mode_config: { kind: 'texas_scramble', team_size: 2, teams_count: 4, team_handicap_pct: 25 },
      }),
    );
    // Stored with mixed case (older rows can be): normalised like a typed address.
    getTeamCandidateEmailsMock.mockResolvedValue(new Map([[KNOWN_USER_ID, 'Kjent.Bruker@Example.test']]));
    lookupUserByEmailMock.mockResolvedValue({
      id: KNOWN_USER_ID,
      name: null,
      email: 'kjent.bruker@example.test',
    });
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        { data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.test' }, error: null }, // captain display
        { data: null, error: null }, // child request insert
        { data: null, error: null }, // child player upsert
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Birdie-jegerne',
      slots: [{ mode: 'lookup', userId: KNOWN_USER_ID }],
    });

    expect(getTeamCandidateEmailsMock).toHaveBeenCalledWith(CAPTAIN_ID, [KNOWN_USER_ID]);
    expect(lookupUserByEmailMock).toHaveBeenCalledWith('kjent.bruker@example.test');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotResults).toEqual([
      { ok: true, outcome: 'known_added', email: 'kj•••@example.test' },
    ]);
    expect(notifyInvitedToTeamMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: KNOWN_USER_ID }),
    );
  });

  it('en id utenfor kapteinens kandidatsett gir userNotFound, uten child-rad (#2207)', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'open',
        mode_config: { kind: 'texas_scramble', team_size: 2, teams_count: 4, team_handicap_pct: 25 },
      }),
    );
    getTeamCandidateEmailsMock.mockResolvedValue(new Map());
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null },
        { data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.test' }, error: null },
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag A',
      slots: [{ mode: 'lookup', userId: 'not-a-candidate' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotResults).toEqual([{ ok: false, email: '', reason: 'userNotFound' }]);
    expect(lookupUserByEmailMock).not.toHaveBeenCalled();
    expect(
      adminMock.__fromCalls.filter(
        (c) => c.table === 'game_registration_requests' && c.method === 'insert',
      ),
    ).toHaveLength(1); // the captain's own row only
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

  it('#667: kapteinens plass-krav feiler → db_error (ikke ok:true)', async () => {
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
    lookupUserByEmailMock.mockResolvedValue({
      id: KNOWN_USER_ID,
      name: 'Kjent Bruker',
      email: 'kjent@example.com',
    });
    // admin-mock queue — speiler happy-path-sekvensen, men kapteinens
    // game_players-rad kommer fra plass-kravet (#2060), og det feiler.
    //   1) captain insert → {id: captain-request-id}
    //   2) captain display lookup (users)
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        {
          data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
          error: null,
        }, // captain display
        { data: [{ id: CAPTAIN_REQUEST_ID }], error: null }, // rollback delete .select('id')
      ],
      {},
      { rpcErrors: { claim_open_registration_seat: { message: 'db constraint violation' } } },
    );

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Birdie-jegerne',
      slots: [{ mode: 'lookup', value: 'kjent@example.com' }],
    });

    expect(result).toEqual({ ok: false, error: 'db_error' });
    // The request row is rolled back so a retry starts clean instead of
    // answering already_registered.
    expect(
      adminMock.__fromCalls.find(
        (c) => c.table === 'game_registration_requests' && c.method === 'delete',
      ),
    ).toBeDefined();
    // No teammate gets a game_players row when the captain has none.
    expect(
      adminMock.__fromCalls.filter((c) => c.table === 'game_players'),
    ).toEqual([]);
  });
});

/**
 * #2011: open team registration stops at the player cap and inside the
 * four-team grid. #2060/#2062 moved the decision into
 * claim_open_registration_seat: it locks the game, counts the seats already held
 * (every team at least its full size, the incoming team too), picks the lowest
 * free team number in 1..maxTeamsForSize(team size) and writes the captain's row — so two
 * captains can no longer read the same roster. The seat counting these tests
 * used to pin through tallyActiveRoster is tested against a real database in
 * supabase/tests/open_registration_seat_claim_test.sql, row for row.
 *
 * What stays here: what the action hands the claim, how each outcome maps to
 * the action's answer, and the rollback of the captain's own request row
 * (AGENTS.md trap 5) — which a full game now reaches, because the claim runs
 * after that row exists.
 */
describe('#2011/#2060: åpen lag-påmelding stopper på spiller-taket', () => {
  beforeEach(() => {
    authedAsCaptain();
    lookupUserByEmailMock.mockResolvedValue(null);
  });

  const threeSlots = [
    { mode: 'email' as const, value: 'a@x' },
    { mode: 'email' as const, value: 'b@x' },
    { mode: 'email' as const, value: 'c@x' },
  ];

  /** The captain display lookup every path reads after the captain insert. */
  const captainDisplay = {
    data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
    error: null,
  };

  function findCall(table: string, method: string) {
    return adminMock.__fromCalls.find(
      (c) => c.table === table && c.method === method,
    );
  }

  function claimParams(): Record<string, unknown> | undefined {
    return adminMock.__rpcCalls.find((c) => c.name === 'claim_open_registration_seat')
      ?.params as Record<string, unknown> | undefined;
  }

  /**
   * An open Texas à 4 game (cap 40), a team of four with three e-mail slots,
   * and a seat claim that refuses with `outcome`. Queues the reads up to the
   * compensating delete, whose answer the test passes in.
   */
  function refusedTexasFours(
    outcome: string | null,
    rollbackDelete: { data: unknown; error: unknown } = {
      data: [{ id: CAPTAIN_REQUEST_ID }],
      error: null,
    },
  ) {
    getGameByShortIdMock.mockResolvedValue(makeGame()); // open, texas à 4 → cap 40
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        captainDisplay,
        rollbackDelete, // rollback delete .select('id')
        // What the action would consume if it went on past a refusal:
        { data: null, error: null }, // invitations insert (slot 1)
        { data: null, error: null }, // invitations insert (slot 2)
        { data: null, error: null }, // invitations insert (slot 3)
      ],
      {
        claim_open_registration_seat:
          outcome === null ? null : { outcome, team_number: null },
      },
    );
    return { shortId: SHORT_ID, teamName: 'Lag D', slots: threeSlots };
  }

  it('fullt spill → game_full, kaptein-raden rulles tilbake', async () => {
    const input = refusedTexasFours('game_full');

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration(input);

    expect(result).toEqual({ ok: false, error: 'game_full' });
    expect(findCall('game_registration_requests', 'delete')).toBeDefined();
    expect(findCall('invitations', 'insert')).toBeUndefined();
    expect(adminMock.__fromCalls.filter((c) => c.table === 'game_players')).toEqual([]);
  });

  it('kravet får taket, lagstørrelsen og et nytt lag — tallene fra TypeScript', async () => {
    const input = refusedTexasFours('game_full');

    const { submitTeamRegistration } = await import('./teamActions');
    await submitTeamRegistration(input);

    expect(claimParams()).toMatchObject({
      p_game_id: GAME_ID,
      p_user_id: CAPTAIN_ID,
      p_cap: 40,
      p_seat_team_size: 4,
      p_new_team_size: 4,
      p_max_teams: 10,
    });
    // #463: the captain registers themself → confirmed at once.
    expect(typeof claimParams()?.p_accepted_at).toBe('string');
  });

  it.each(['signup_closed', 'game_locked'] as const)(
    'porten lukket under låsen (%s) → samme feil, kaptein-raden rulles tilbake',
    async (outcome) => {
      const input = refusedTexasFours(outcome);

      const { submitTeamRegistration } = await import('./teamActions');
      const result = await submitTeamRegistration(input);

      expect(result).toEqual({ ok: false, error: outcome });
      expect(findCall('game_registration_requests', 'delete')).toBeDefined();
    },
  );

  it('ukjent svar fra kravet → db_error, kaptein-raden rulles tilbake', async () => {
    const input = refusedTexasFours(null);

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration(input);

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(findCall('game_registration_requests', 'delete')).toBeDefined();
  });

  it('kompenserende sletting treffer 0 rader → svarer fortsatt game_full', async () => {
    // The rollback delete matches nothing (the row is already gone), so
    // expectAffected throws. The action logs that and still answers game_full;
    // the captain must never see a 500 for a full game.
    const input = refusedTexasFours('game_full', { data: [], error: null });

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration(input);

    expect(result).toEqual({ ok: false, error: 'game_full' });
    expect(findCall('game_registration_requests', 'delete')).toBeDefined();
  });

  it('kravet gir lag 3 → kjente medspillere havner på samme lag', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    lookupUserByEmailMock.mockResolvedValueOnce({
      id: KNOWN_USER_ID,
      name: 'Kjent Bruker',
      email: 'a@x',
    });
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        captainDisplay,
        { data: null, error: null }, // child request insert (slot 1, known)
        { data: null, error: null }, // child player upsert (slot 1)
        { data: null, error: null }, // invitations insert (slot 2)
        { data: null, error: null }, // invitations insert (slot 3)
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 3 } },
    );

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag C',
      slots: threeSlots,
    });

    expect(result.ok).toBe(true);
    expect(findCall('game_players', 'upsert')?.args[0]).toMatchObject({
      user_id: KNOWN_USER_ID,
      team_number: 3,
      flight_number: 3,
    });
    expect(findCall('game_registration_requests', 'delete')).toBeUndefined();
  });

  it('kapteinen står alt på lista (already_on_roster) → already_registered, kaptein-forespørselen rulles tilbake (#2072)', async () => {
    // The claim writes nothing for a captain already on the roster, so the new
    // team would have no number and its teammates would land on none. The
    // registration is refused like the other claim refusals instead.
    getGameByShortIdMock.mockResolvedValue(makeGame());
    lookupUserByEmailMock.mockResolvedValueOnce({
      id: KNOWN_USER_ID,
      name: 'Kjent Bruker',
      email: 'a@x',
    });
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        captainDisplay,
        { data: [{ id: CAPTAIN_REQUEST_ID }], error: null }, // rollback delete
        // What the action would consume if it went on:
        { data: null, error: null }, // child request insert (slot 1, known)
        { data: null, error: null }, // invitations insert (slot 2)
        { data: null, error: null }, // invitations insert (slot 3)
      ],
      { claim_open_registration_seat: { outcome: 'already_on_roster', team_number: null } },
    );

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag C',
      slots: threeSlots,
    });

    expect(result).toEqual({ ok: false, error: 'already_registered' });
    expect(findCall('game_registration_requests', 'delete')).toBeDefined();
    expect(findCall('game_registration_requests', 'insert')?.args[0]).toMatchObject({
      is_team_captain: true,
    });
    expect(
      adminMock.__fromCalls.filter(
        (c) => c.table === 'game_registration_requests' && c.method === 'insert',
      ),
    ).toHaveLength(1);
    expect(findCall('invitations', 'insert')).toBeUndefined();
    expect(adminMock.__fromCalls.filter((c) => c.table === 'game_players')).toEqual([]);
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
    expect(sendTeamInvitationMailMock).not.toHaveBeenCalled();
  });

  it('manual_approval: forespørselen legges i kø uten plass-krav — taket gjelder bare åpen påmelding', async () => {
    // Owner's decision on #2011: the cap applies to open self-registration
    // only; a manual_approval request queues up and the organiser's approval
    // is the gate (#662). So the action must neither claim a seat nor touch
    // game_players.
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'manual_approval' }),
    );
    adminMock = buildSupabaseMock([
      { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
      captainDisplay,
      { data: null, error: null }, // invitations insert (slot 1)
      { data: null, error: null }, // invitations insert (slot 2)
      { data: null, error: null }, // invitations insert (slot 3)
    ]);

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Lag E',
      slots: threeSlots,
    });

    expect(result).toMatchObject({ ok: true, captainRequestId: CAPTAIN_REQUEST_ID });
    expect(adminMock.__rpcCalls).toEqual([]);
    expect(
      adminMock.__fromCalls.filter((c) => c.table === 'game_players'),
    ).toEqual([]);
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
          // A team member's row: it has a captain (#2440 refuses any other).
          team_request_id: CAPTAIN_REQUEST_ID,
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

/**
 * #1445: the request lookup used to fold a failed query into the same
 * `not_found` answer as a genuinely missing row — a transient blip told the
 * invitee their invitation did not exist. `db_error` now carries the retryable
 * case; a real 0-row result (and a row owned by someone else) still answers
 * not_found.
 */
describe('#1445: acceptTeamInvite skiller DB-feil fra fravær', () => {
  beforeEach(() => {
    authedAsCaptain();
  });

  it('request-oppslaget feiler → db_error (ikke not_found)', async () => {
    adminMock = buildSupabaseMock([
      {
        data: null,
        error: { message: 'AbortError: This operation was aborted', code: '' },
      },
    ]);
    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite('req-1', SHORT_ID);
    expect(result).toEqual({ ok: false, error: 'db_error' });
    // Fravær-grenen ble ikke tatt: ingen game-oppslag i det hele tatt.
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
  });

  it('ekte 0-rad beholder not_found', async () => {
    // strictSingle (#1693): låser .maybeSingle()-byttet på request-oppslaget.
    adminMock = buildSupabaseMock([{ data: null, error: null }], {}, { strictSingle: true });
    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite('req-1', SHORT_ID);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('rad som tilhører en annen bruker beholder not_found', async () => {
    adminMock = buildSupabaseMock([
      {
        data: {
          id: 'req-1',
          game_id: GAME_ID,
          user_id: KNOWN_USER_ID, // ikke CAPTAIN_ID
          status: 'pending',
          team_request_id: null,
          team_name: 'Lag A',
          is_team_captain: false,
        },
        error: null,
      },
    ]);
    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite('req-1', SHORT_ID);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('#1344: profil-porten beholder /team-konteksten', () => {
  // attachToCaptainTeam er stien en e-post-invitert ny bruker treffer fra
  // lag-dashboardet. requireAuthedUser kjører FØR game-oppslaget, så ingen av
  // disse testene trenger en game-mock.
  const TEAM_NEXT = `/signup/${SHORT_ID}/team`;

  it('uinnlogget → /login beholder /team i next', async () => {
    serverMock = buildSupabaseMock([]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { attachToCaptainTeam } = await import('./teamActions');
    await expect(attachToCaptainTeam('inv-1', SHORT_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/login?next=${TEAM_NEXT}` }),
    );
  });

  it('innlogget uten fullført profil → /complete-profile beholder /team i next', async () => {
    authedAsCaptain(false);

    const { attachToCaptainTeam } = await import('./teamActions');
    await expect(attachToCaptainTeam('inv-1', SHORT_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/complete-profile?next=${TEAM_NEXT}` }),
    );
  });

  it('kaptein-skjemaet på base-siden beholder base-stien', async () => {
    // Motprøve: submitTeamRegistration kalles fra TeamRegistrationForm på
    // /signup/[shortId] — der er base-stien riktig retur, og default-en står.
    serverMock = buildSupabaseMock([]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { submitTeamRegistration } = await import('./teamActions');
    await expect(
      submitTeamRegistration({
        shortId: SHORT_ID,
        teamName: 'Lag A',
        slots: [{ mode: 'email', value: 'a@x' }],
      }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/login?next=/signup/${SHORT_ID}` }),
    );
  });
});

describe('#1343: attachToCaptainTeam kobler invitéen til kapteinen som inviterte', () => {
  const INVITEE_ID = '66666666-6666-6666-6666-666666666666';
  const INVITEE_EMAIL = 'ny.spiller@example.com';
  const INVITING_CAPTAIN_ID = '77777777-7777-7777-7777-777777777777';
  const INVITING_REQUEST_ID = '88888888-8888-8888-8888-888888888888';
  const NEWEST_CAPTAIN_ID = '99999999-9999-9999-9999-999999999999';
  const NEWEST_REQUEST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(() => {
    serverMock = buildSupabaseMock([
      { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null },
    ]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: INVITEE_ID, email: INVITEE_EMAIL } },
    });
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'manual_approval' }),
    );
  });

  it('velger invited_by-kapteinens lag selv når et annet lag er nyere', async () => {
    adminMock = buildSupabaseMock([
      // 1) invitations-raden — invited_by peker på kapteinen som inviterte.
      {
        data: {
          id: 'inv-1',
          email: INVITEE_EMAIL,
          game_id: GAME_ID,
          invited_by: INVITING_CAPTAIN_ID,
        },
        error: null,
      },
      // 2) e-post-eierskap
      { data: { email: INVITEE_EMAIL }, error: null },
      // 3) kaptein-rader, nyest først — inviterens lag er det ELDSTE.
      {
        data: [
          {
            id: NEWEST_REQUEST_ID,
            user_id: NEWEST_CAPTAIN_ID,
            team_name: 'Lag Sist',
            status: 'pending',
          },
          {
            id: INVITING_REQUEST_ID,
            user_id: INVITING_CAPTAIN_ID,
            team_name: 'Lag Først',
            status: 'pending',
          },
        ],
        error: null,
      },
      // 4) child-insert
      { data: { id: 'child-1' }, error: null },
      // 5) invitations-update (accepted_at)
      { data: null, error: null },
    ]);

    const { attachToCaptainTeam } = await import('./teamActions');
    const result = await attachToCaptainTeam('inv-1', SHORT_ID);

    expect(result).toEqual({ ok: true });
    const insertCall = adminMock.__fromCalls.find(
      (c) => c.method === 'insert' && c.table === 'game_registration_requests',
    );
    expect(insertCall?.args[0]).toMatchObject({
      user_id: INVITEE_ID,
      team_request_id: INVITING_REQUEST_ID,
      team_name: 'Lag Først',
      is_team_captain: false,
    });
  });

  it('stopper med team_unknown når inviteren ikke er kaptein — ingen gjetting', async () => {
    // Køen stopper etter kaptein-oppslaget: actionen returnerer før insert.
    adminMock = buildSupabaseMock([
      {
        data: {
          id: 'inv-1',
          email: INVITEE_EMAIL,
          game_id: GAME_ID,
          // Arrangøren inviterte — sier ingenting om hvilket lag.
          invited_by: ADMIN_USER_ID,
        },
        error: null,
      },
      { data: { email: INVITEE_EMAIL }, error: null },
      {
        data: [
          {
            id: NEWEST_REQUEST_ID,
            user_id: NEWEST_CAPTAIN_ID,
            team_name: 'Lag Sist',
            status: 'pending',
          },
          {
            id: INVITING_REQUEST_ID,
            user_id: INVITING_CAPTAIN_ID,
            team_name: 'Lag Først',
            status: 'pending',
          },
        ],
        error: null,
      },
    ]);

    const { attachToCaptainTeam } = await import('./teamActions');
    const result = await attachToCaptainTeam('inv-1', SHORT_ID);

    expect(result).toEqual({ ok: false, error: 'team_unknown' });
    const insertCall = adminMock.__fromCalls.find(
      (c) => c.method === 'insert' && c.table === 'game_registration_requests',
    );
    expect(insertCall).toBeUndefined();
  });

  it('#1437: invitasjons-oppslaget håndhever utløp (.gt på expires_at)', async () => {
    // FIFO-mocken filter-emulerer ikke, så det ærlige regresjonsbeviset er
    // query-formen: verifyCode-laget fikk utløpsfilteret i #1348, og uten
    // samme filter her er attach-stien et andre, uenig hjem for regelen
    // (AGENTS.md felle 4) — en utløpt lag-invitert kunne fortsatt feste seg.
    adminMock = buildSupabaseMock([
      {
        data: {
          id: 'inv-1',
          email: INVITEE_EMAIL,
          game_id: GAME_ID,
          invited_by: INVITING_CAPTAIN_ID,
        },
        error: null,
      },
      { data: { email: INVITEE_EMAIL }, error: null },
      {
        data: [
          {
            id: INVITING_REQUEST_ID,
            user_id: INVITING_CAPTAIN_ID,
            team_name: 'Lag Først',
            status: 'pending',
          },
        ],
        error: null,
      },
      { data: { id: 'child-1' }, error: null },
      { data: null, error: null },
    ]);

    const { attachToCaptainTeam } = await import('./teamActions');
    await attachToCaptainTeam('inv-1', SHORT_ID);

    const expiryFilter = adminMock.__fromCalls.find(
      (c) =>
        c.table === 'invitations' &&
        c.method === 'gt' &&
        c.args[0] === 'expires_at',
    );
    expect(
      expiryFilter,
      'invitations-oppslaget må kjede .gt("expires_at", now)',
    ).toBeDefined();
    expect(Number.isNaN(Date.parse(expiryFilter!.args[1] as string))).toBe(false);
  });
});

/**
 * #2440 (søsken-funn): the team invitation's accept answers only a team
 * member's own row — one with a captain (`team_request_id`) in the same game.
 * Any other own row (a solo request, the captain's own request) is not an
 * invitation: it waits for the organiser, so the accept leaves it untouched.
 */
describe('#2440: bare lagmedlemmets egen rad kan godtas', () => {
  const OWN_REQUEST_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  beforeEach(() => {
    serverMock = buildSupabaseMock([
      { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null },
    ]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: KNOWN_USER_ID, email: 'mate@example.com' } },
    });
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
  });

  const ownRow = (over: { team_request_id: string | null; is_team_captain: boolean }) => ({
    data: {
      id: OWN_REQUEST_ID,
      game_id: GAME_ID,
      user_id: KNOWN_USER_ID,
      status: 'pending',
      team_name: over.is_team_captain ? 'Lag A' : null,
      ...over,
    },
    error: null,
  });

  const requestWrites = () =>
    adminMock.__fromCalls.filter(
      (c) =>
        (c.table === 'game_registration_requests' || c.table === 'game_players') &&
        ['update', 'upsert', 'insert', 'delete'].includes(c.method),
    );

  it.each([
    ['en vanlig forespørsel (ingen kaptein)', { team_request_id: null, is_team_captain: false }],
    ['kapteinens egen forespørsel', { team_request_id: null, is_team_captain: true }],
  ] as const)('%s → not_found, ingenting skrevet', async (_label, row) => {
    adminMock = buildSupabaseMock(
      [ownRow(row), { data: [{ id: OWN_REQUEST_ID }], error: null }],
      {},
      { strictSingle: true },
    );

    const { acceptTeamInvite } = await import('./teamActions');
    expect(await acceptTeamInvite(OWN_REQUEST_ID, SHORT_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(requestWrites()).toEqual([]);
  });

  it('kapteinsraden ligger ikke i dette spillet → not_found, ingenting skrevet', async () => {
    adminMock = buildSupabaseMock(
      [
        ownRow({ team_request_id: CAPTAIN_REQUEST_ID, is_team_captain: false }),
        { data: null, error: null }, // the captain lookup, bound to this game: no row
        { data: [{ id: OWN_REQUEST_ID }], error: null }, // what a status update would consume
      ],
      {},
      { strictSingle: true },
    );

    const { acceptTeamInvite } = await import('./teamActions');
    expect(await acceptTeamInvite(OWN_REQUEST_ID, SHORT_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(requestWrites()).toEqual([]);
    const captainLookup = adminMock.__fromCalls
      .filter((c) => c.table === 'game_registration_requests' && c.method === 'eq')
      .map((c) => c.args);
    expect(captainLookup).toContainEqual(['id', CAPTAIN_REQUEST_ID]);
    expect(captainLookup).toContainEqual(['game_id', GAME_ID]);
  });
});

/**
 * #2061: a teammate who accepted before the organiser approved the captain
 * used to take the lowest free team number for themself; the captain then got
 * the next one and the team was split in two. The teammate now waits — no
 * game_players row — until approveRequest places the whole team together.
 */
describe('#2061: medspiller som godtar før kapteinen har lag, venter', () => {
  const MATE_REQUEST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const DB_ERR = { message: 'AbortError: This operation was aborted', code: '' };

  beforeEach(() => {
    serverMock = buildSupabaseMock([
      { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null },
    ]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: KNOWN_USER_ID, email: 'mate@example.com' } },
    });
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'manual_approval' }),
    );
  });

  const mateRequest = {
    data: {
      id: MATE_REQUEST_ID,
      game_id: GAME_ID,
      user_id: KNOWN_USER_ID,
      status: 'pending',
      team_request_id: CAPTAIN_REQUEST_ID,
      team_name: 'Lag A',
      is_team_captain: false,
    },
    error: null,
  };
  const captainRequest = { data: { user_id: CAPTAIN_ID }, error: null };

  function playerWrites() {
    return adminMock.__fromCalls.filter(
      (c) =>
        c.table === 'game_players' &&
        (c.method === 'upsert' || c.method === 'insert' || c.method === 'update'),
    );
  }

  it('kapteinen har ingen spillerrad → godtatt, men ingen game_players-rad', async () => {
    adminMock = buildSupabaseMock([
      mateRequest,
      captainRequest,
      { data: null, error: null }, // captain's game_players row: none
      { data: [{ id: MATE_REQUEST_ID }], error: null }, // status update .select('id')
      { data: null, error: null }, // what a player upsert would consume
    ], {}, { strictSingle: true });

    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite(MATE_REQUEST_ID, SHORT_ID);

    expect(result).toEqual({ ok: true });
    expect(playerWrites()).toEqual([]);
    const update = adminMock.__fromCalls.find(
      (c) => c.table === 'game_registration_requests' && c.method === 'update',
    );
    expect(update?.args[0]).toMatchObject({ status: 'approved' });
    // Trap 2: the status update is the only write here, so it asserts rows.
    const updateIdx = adminMock.__fromCalls.indexOf(update!);
    expect(
      adminMock.__fromCalls
        .slice(updateIdx)
        .some((c) => c.table === 'game_registration_requests' && c.method === 'select'),
    ).toBe(true);
  });

  it('status-oppdateringen treffer 0 rader → db_error', async () => {
    adminMock = buildSupabaseMock([
      mateRequest,
      captainRequest,
      { data: null, error: null },
      { data: [], error: null }, // status update matched nothing
    ]);

    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite(MATE_REQUEST_ID, SHORT_ID);

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(playerWrites()).toEqual([]);
  });

  it('kapteinens rad har team_number null → ingen game_players-rad', async () => {
    adminMock = buildSupabaseMock([
      mateRequest,
      captainRequest,
      { data: { team_number: null }, error: null },
      { data: [{ id: MATE_REQUEST_ID }], error: null },
      { data: null, error: null },
    ]);

    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite(MATE_REQUEST_ID, SHORT_ID);

    expect(result).toEqual({ ok: true });
    expect(playerWrites()).toEqual([]);
  });

  it('kapteinen har lag 2 → medspilleren settes på lag 2', async () => {
    adminMock = buildSupabaseMock([
      mateRequest,
      captainRequest,
      { data: { team_number: 2 }, error: null },
      { data: [{ id: MATE_REQUEST_ID }], error: null },
      { data: null, error: null }, // player upsert
    ]);

    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite(MATE_REQUEST_ID, SHORT_ID);

    expect(result).toEqual({ ok: true });
    const writes = playerWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.args[0]).toMatchObject({
      user_id: KNOWN_USER_ID,
      team_number: 2,
      flight_number: 2,
    });
  });

  it('best ball: medspilleren får kapteinens flight, ikke lagnummeret (#2290)', async () => {
    // Arrangøren har gruppert parene i flighter: lag 2 går i flight 1.
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'manual_approval',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      }),
    );
    adminMock = buildSupabaseMock([
      mateRequest,
      captainRequest,
      { data: { team_number: 2, flight_number: 1, withdrawn_at: null }, error: null },
      { data: [{ id: MATE_REQUEST_ID }], error: null },
      { data: null, error: null }, // player upsert
    ]);

    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite(MATE_REQUEST_ID, SHORT_ID);

    expect(result).toEqual({ ok: true });
    expect(playerWrites()[0]?.args[0]).toMatchObject({
      user_id: KNOWN_USER_ID,
      team_number: 2,
      flight_number: 1,
    });
  });

  it('attachToCaptainTeam, best ball: medspilleren får kapteinens flight (#2290)', async () => {
    const INVITEE_EMAIL = 'ny.spiller@example.com';
    serverMock = buildSupabaseMock([
      { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null },
    ]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: KNOWN_USER_ID, email: INVITEE_EMAIL } },
    });
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      }),
    );
    adminMock = buildSupabaseMock([
      {
        data: { id: 'inv-1', email: INVITEE_EMAIL, game_id: GAME_ID, invited_by: CAPTAIN_ID },
        error: null,
      },
      { data: { email: INVITEE_EMAIL }, error: null },
      {
        data: [
          { id: CAPTAIN_REQUEST_ID, user_id: CAPTAIN_ID, team_name: 'Lag A', status: 'approved' },
        ],
        error: null,
      },
      { data: { id: 'child-1' }, error: null }, // child insert
      { data: { team_number: 2, flight_number: 1, withdrawn_at: null }, error: null }, // captain's row
      { data: null, error: null }, // player upsert
      { data: null, error: null }, // invitations update
    ]);

    const { attachToCaptainTeam } = await import('./teamActions');
    const result = await attachToCaptainTeam('inv-1', SHORT_ID);

    expect(result).toEqual({ ok: true });
    expect(playerWrites()[0]?.args[0]).toMatchObject({
      user_id: KNOWN_USER_ID,
      team_number: 2,
      flight_number: 1,
    });
  });

  it.each([
    ['kaptein-forespørselen', [mateRequest, { data: null, error: DB_ERR }]],
    [
      'kapteinens spillerrad',
      [mateRequest, captainRequest, { data: null, error: DB_ERR }],
    ],
  ])('oppslaget av %s feiler → db_error, ingen skriv', async (_label, queue) => {
    adminMock = buildSupabaseMock([
      ...(queue as { data: unknown; error: unknown }[]),
      { data: [{ id: MATE_REQUEST_ID }], error: null },
      { data: null, error: null },
    ]);

    const { acceptTeamInvite } = await import('./teamActions');
    const result = await acceptTeamInvite(MATE_REQUEST_ID, SHORT_ID);

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(playerWrites()).toEqual([]);
    expect(
      adminMock.__fromCalls.find(
        (c) => c.table === 'game_registration_requests' && c.method === 'update',
      ),
    ).toBeUndefined();
  });

  it('attachToCaptainTeam: godkjent kaptein uten lagnummer → ingen game_players-rad', async () => {
    const INVITEE_EMAIL = 'ny.spiller@example.com';
    serverMock = buildSupabaseMock([
      { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null },
    ]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: KNOWN_USER_ID, email: INVITEE_EMAIL } },
    });
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([
      {
        data: { id: 'inv-1', email: INVITEE_EMAIL, game_id: GAME_ID, invited_by: CAPTAIN_ID },
        error: null,
      },
      { data: { email: INVITEE_EMAIL }, error: null },
      {
        data: [
          { id: CAPTAIN_REQUEST_ID, user_id: CAPTAIN_ID, team_name: 'Lag A', status: 'approved' },
        ],
        error: null,
      },
      { data: { id: 'child-1' }, error: null }, // child insert
      { data: { team_number: null }, error: null }, // captain's game_players row
      { data: null, error: null }, // what a player upsert would consume
      { data: null, error: null }, // invitations update
    ]);

    const { attachToCaptainTeam } = await import('./teamActions');
    const result = await attachToCaptainTeam('inv-1', SHORT_ID);

    expect(result).toEqual({ ok: true });
    expect(playerWrites()).toEqual([]);
  });
});

/**
 * #2223: every team path that writes the roster answers from that write. Before,
 * attachToCaptainTeam and submitTeamRegistration logged a failed game_players
 * write and still answered ok (the invitation consumed, the captain told the
 * teammate was in), while declineTeamInvite and removeTeamMember threw the
 * delete's result away after the request row was already decided. acceptTeamInvite
 * already answered db_error; now all of them agree.
 */
describe('#2223: roster-skrivingen feiler → ingen falsk suksess', () => {
  const DB_ERR = { message: 'connection reset', code: '' };
  const INVITEE_EMAIL = 'ny.spiller@example.com';
  const CHILD_REQUEST_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  function authedAs(userId: string, email: string): void {
    serverMock = buildSupabaseMock([
      { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null },
    ]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: userId, email } },
    });
  }

  /** The `eq` filters chained right after the first `method` call on `table`. */
  function filtersAfter(table: string, method: string): unknown[][] {
    const calls = adminMock.__fromCalls;
    const start = calls.findIndex((c) => c.table === table && c.method === method);
    if (start === -1) return [];
    const filters: unknown[][] = [];
    for (const call of calls.slice(start + 1)) {
      if (call.method !== 'eq') break;
      filters.push(call.args);
    }
    return filters;
  }

  function writes(table: string, method: string) {
    return adminMock.__fromCalls.filter((c) => c.table === table && c.method === method);
  }

  it.each([
    [
      'kapteinens spillerrad kan ikke leses',
      [{ data: null, error: DB_ERR }],
    ],
    [
      'spillerraden kan ikke skrives',
      [
        { data: { team_number: 1 }, error: null },
        { data: null, error: DB_ERR },
      ],
    ],
  ])('attachToCaptainTeam: %s → db_error, forespørselen rulles tilbake', async (_label, rosterSteps) => {
    authedAs(KNOWN_USER_ID, INVITEE_EMAIL);
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([
      {
        data: { id: 'inv-1', email: INVITEE_EMAIL, game_id: GAME_ID, invited_by: CAPTAIN_ID },
        error: null,
      },
      { data: { email: INVITEE_EMAIL }, error: null },
      {
        data: [
          { id: CAPTAIN_REQUEST_ID, user_id: CAPTAIN_ID, team_name: 'Lag A', status: 'approved' },
        ],
        error: null,
      },
      { data: { id: CHILD_REQUEST_ID }, error: null }, // child insert
      ...(rosterSteps as { data: unknown; error: unknown }[]),
      { data: [{ id: CHILD_REQUEST_ID }], error: null }, // rollback delete .select('id')
    ]);

    const { attachToCaptainTeam } = await import('./teamActions');
    const result = await attachToCaptainTeam('inv-1', SHORT_ID);

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(filtersAfter('game_registration_requests', 'delete')).toEqual([
      ['id', CHILD_REQUEST_ID],
    ]);
    expect(writes('invitations', 'update')).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(serverMock.rpc).not.toHaveBeenCalled();
  });

  it('submitTeamRegistration: kjent medspiller, spillerraden kan ikke skrives → dbError, barnet rulles tilbake', async () => {
    authedAsCaptain();
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
    lookupUserByEmailMock.mockResolvedValue({
      id: KNOWN_USER_ID,
      name: 'Kjent Bruker',
      email: 'kjent@example.com',
    });
    adminMock = buildSupabaseMock(
      [
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        {
          data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
          error: null,
        }, // captain display
        { data: null, error: null }, // child request insert
        { data: null, error: DB_ERR }, // child player upsert
        { data: [{ id: CHILD_REQUEST_ID }], error: null }, // child rollback .select('id')
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

    const { submitTeamRegistration } = await import('./teamActions');
    const result = await submitTeamRegistration({
      shortId: SHORT_ID,
      teamName: 'Birdie-jegerne',
      slots: [{ mode: 'lookup', value: 'kjent@example.com' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slotResults).toEqual([
      expect.objectContaining({ ok: false, reason: 'dbError' }),
    ]);
    expect(filtersAfter('game_registration_requests', 'delete')).toEqual([
      ['team_request_id', CAPTAIN_REQUEST_ID],
      ['user_id', KNOWN_USER_ID],
    ]);
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'declineTeamInvite',
      KNOWN_USER_ID,
      [
        {
          data: {
            id: CHILD_REQUEST_ID,
            game_id: GAME_ID,
            user_id: KNOWN_USER_ID,
            status: 'approved',
            team_request_id: CAPTAIN_REQUEST_ID,
            team_name: 'Lag A',
          },
          error: null,
        },
      ],
    ],
    [
      'removeTeamMember',
      CAPTAIN_ID,
      [
        {
          data: {
            id: CHILD_REQUEST_ID,
            game_id: GAME_ID,
            user_id: KNOWN_USER_ID,
            team_request_id: CAPTAIN_REQUEST_ID,
            status: 'approved',
          },
          error: null,
        },
        { data: { user_id: CAPTAIN_ID, team_name: 'Lag A' }, error: null },
      ],
    ],
  ] as const)(
    '%s: spillerraden kan ikke slettes → db_error, forespørselen står urørt',
    async (action, actorId, lookups) => {
      authedAs(actorId, 'spiller@example.com');
      getGameByShortIdMock.mockResolvedValue(makeGame());
      adminMock = buildSupabaseMock([
        ...lookups,
        { data: null, error: DB_ERR }, // game_players delete
        { data: [{ id: CHILD_REQUEST_ID }], error: null }, // what a request write would consume
      ]);

      const teamActions = await import('./teamActions');
      const result = await teamActions[action](CHILD_REQUEST_ID, SHORT_ID);

      expect(result).toEqual({ ok: false, error: 'db_error' });
      expect(writes('game_players', 'delete')).toHaveLength(1);
      expect(writes('game_registration_requests', 'update')).toEqual([]);
      expect(writes('game_registration_requests', 'delete')).toEqual([]);
      expect(notifyMock).not.toHaveBeenCalled();
    },
  );
});

/**
 * #2358: kapteinsbindet kan gis videre (`transfer_team_captaincy`, 0194).
 *
 * RPC-en er regelens ene hjem — hvem som får overføre, hvem som kan ta imot, og
 * hva som flyttes — og den bevises i `supabase/tests/transfer_team_captaincy_test.sql`.
 * Her bevises bare at actionen sender den EKTE kalleren som aktør, og at
 * utfallene blir koder lagsida kan vise.
 */
describe('#2358: transferCaptaincy', () => {
  const NEW_CAPTAIN_REQUEST = '66666666-6666-6666-6666-666666666666';

  beforeEach(() => {
    authedAsCaptain();
    getGameByShortIdMock.mockResolvedValue(makeGame());
  });

  it('sender kalleren som aktør og spillet fra shortId, og tømmer cachen ved ok', async () => {
    adminMock = buildSupabaseMock([], { transfer_team_captaincy: { outcome: 'ok' } });
    const { transferCaptaincy } = await import('./teamActions');

    expect(await transferCaptaincy(NEW_CAPTAIN_REQUEST, SHORT_ID)).toEqual({ ok: true });
    expect(adminMock.__rpcCalls).toEqual([
      {
        name: 'transfer_team_captaincy',
        params: {
          p_game_id: GAME_ID,
          p_actor_user_id: CAPTAIN_ID,
          p_new_captain_request_id: NEW_CAPTAIN_REQUEST,
        },
      },
    ]);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it.each([
    ['not_approved', 'not_approved'],
    ['game_locked', 'game_locked'],
    ['not_allowed', 'not_found'],
    ['not_a_teammate', 'not_found'],
    ['game_not_found', 'not_found'],
    ['noe_ukjent', 'db_error'],
  ])('utfallet %s → %s, uten cache-tømming', async (outcome, error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], { transfer_team_captaincy: { outcome } });
    const { transferCaptaincy } = await import('./teamActions');

    expect(await transferCaptaincy(NEW_CAPTAIN_REQUEST, SHORT_ID)).toEqual({ ok: false, error });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('en RPC-feil → db_error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], {}, { rpcErrors: { transfer_team_captaincy: { message: 'boom' } } });
    const { transferCaptaincy } = await import('./teamActions');

    expect(await transferCaptaincy(NEW_CAPTAIN_REQUEST, SHORT_ID)).toEqual({ ok: false, error: 'db_error' });
  });

  it('en request-id som ikke er en uuid → not_found, uten RPC', async () => {
    adminMock = buildSupabaseMock([]);
    const { transferCaptaincy } = await import('./teamActions');

    expect(await transferCaptaincy('ikke-en-id', SHORT_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(adminMock.__rpcCalls).toEqual([]);
  });
});

describe('#2358: lagstyringen følger kapteinsbindet', () => {
  const OLD_CAPTAIN_ID = CAPTAIN_ID;
  const NEW_CAPTAIN_ID = '77777777-7777-7777-7777-777777777777';
  const NEW_CAPTAIN_REQUEST = '88888888-8888-8888-8888-888888888888';
  const CHILD_REQUEST = '99999999-9999-9999-9999-999999999999';

  function childRow() {
    return {
      data: {
        id: CHILD_REQUEST,
        game_id: GAME_ID,
        user_id: KNOWN_USER_ID,
        team_request_id: NEW_CAPTAIN_REQUEST,
        team_name: 'Bjørka',
        status: 'approved',
      },
      error: null,
    };
  }

  function actingAs(userId: string) {
    serverMock = buildSupabaseMock([
      { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null },
    ]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: userId, email: 'x@example.com' } },
    });
  }

  beforeEach(() => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
  });

  it('den nye kapteinen kan fjerne et lagmedlem', async () => {
    actingAs(NEW_CAPTAIN_ID);
    adminMock = buildSupabaseMock([
      childRow(),
      { data: { user_id: NEW_CAPTAIN_ID, team_name: 'Bjørka', status: 'approved' }, error: null },
      { data: null, error: null }, // DELETE game_players
      { data: null, error: null }, // DELETE request
    ]);
    const { removeTeamMember } = await import('./teamActions');

    expect(await removeTeamMember(CHILD_REQUEST, SHORT_ID)).toEqual({ ok: true });
  });

  it('den gamle kapteinen kan ikke lenger styre laget → not_found, ingen skriving', async () => {
    actingAs(OLD_CAPTAIN_ID);
    adminMock = buildSupabaseMock([
      childRow(),
      { data: { user_id: NEW_CAPTAIN_ID, team_name: 'Bjørka', status: 'approved' }, error: null },
    ]);
    const { removeTeamMember, resendTeamInvite } = await import('./teamActions');

    expect(await removeTeamMember(CHILD_REQUEST, SHORT_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(adminMock.__fromCalls.filter((c) => c.method === 'delete')).toHaveLength(0);

    actingAs(OLD_CAPTAIN_ID);
    adminMock = buildSupabaseMock([
      childRow(),
      { data: { user_id: NEW_CAPTAIN_ID, team_name: 'Bjørka', status: 'approved' }, error: null },
    ]);
    expect(await resendTeamInvite(CHILD_REQUEST, SHORT_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it('en kaptein som har trukket seg, styrer ikke laget lenger → not_found', async () => {
    actingAs(NEW_CAPTAIN_ID);
    adminMock = buildSupabaseMock([
      childRow(),
      { data: { user_id: NEW_CAPTAIN_ID, team_name: 'Bjørka', status: 'withdrawn' }, error: null },
    ]);
    const { removeTeamMember, resendTeamInvite } = await import('./teamActions');

    expect(await removeTeamMember(CHILD_REQUEST, SHORT_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(adminMock.__fromCalls.filter((c) => c.method === 'delete')).toHaveLength(0);

    actingAs(NEW_CAPTAIN_ID);
    adminMock = buildSupabaseMock([
      childRow(),
      { data: { user_id: NEW_CAPTAIN_ID, team_name: 'Bjørka', status: 'withdrawn' }, error: null },
    ]);
    expect(await resendTeamInvite(CHILD_REQUEST, SHORT_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it('attachToCaptainTeam: invitasjon fra en kaptein som siden ga fra seg bindet → lagets nummer under den nye kapteinen', async () => {
    const INVITEE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const INVITEE_EMAIL = 'ny.spiller@example.com';
    actingAs(INVITEE_ID);
    adminMock = buildSupabaseMock([
      // 1) invitasjonen — sendt av den gamle kapteinen
      {
        data: { id: 'inv-1', email: INVITEE_EMAIL, game_id: GAME_ID, invited_by: OLD_CAPTAIN_ID },
        error: null,
      },
      // 2) e-post-eierskap
      { data: { email: INVITEE_EMAIL }, error: null },
      // 3) aktive kapteiner: bare den nye
      {
        data: [{ id: NEW_CAPTAIN_REQUEST, user_id: NEW_CAPTAIN_ID, team_name: 'Bjørka', status: 'approved' }],
        error: null,
      },
      // 4) lagkartet: den gamle kapteinen står under den nye
      { data: [{ user_id: OLD_CAPTAIN_ID, team_request_id: NEW_CAPTAIN_REQUEST }], error: null },
      // 5) child-insert
      { data: { id: 'child-1' }, error: null },
      // 6) den nye kapteinens plass: lag 3
      { data: { team_number: 3 }, error: null },
      // 7) game_players-upsert
      { data: null, error: null },
      // 8) invitasjonen merkes akseptert
      { data: null, error: null },
    ]);
    const { attachToCaptainTeam } = await import('./teamActions');

    expect(await attachToCaptainTeam('inv-1', SHORT_ID)).toEqual({ ok: true });
    const insert = adminMock.__fromCalls.find(
      (c) => c.method === 'insert' && c.table === 'game_registration_requests',
    );
    expect(insert?.args[0]).toMatchObject({
      user_id: INVITEE_ID,
      team_request_id: NEW_CAPTAIN_REQUEST,
      team_name: 'Bjørka',
      status: 'approved',
    });
    const upsert = adminMock.__fromCalls.find((c) => c.method === 'upsert');
    expect(upsert?.args[0]).toMatchObject({ user_id: INVITEE_ID, team_number: 3 });
  });
});

describe('#2358: declineTeamInvite gjelder bare en invitasjon, ikke en kapteinsrad', () => {
  it('kapteinen kan ikke «avslå» sin egen kapteinsrad → not_found, ingen skriving', async () => {
    // En kapteinsrad avslått ville latt lagkameratene stå under en avvist
    // kaptein. Kapteinen trekker seg via «Trekk meg» (eller gir bindet videre).
    authedAsCaptain();
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([
      {
        data: {
          id: CAPTAIN_REQUEST_ID,
          game_id: GAME_ID,
          user_id: CAPTAIN_ID,
          status: 'approved',
          team_request_id: null,
          team_name: 'Bjørka',
          is_team_captain: true,
        },
        error: null,
      },
    ]);
    const { declineTeamInvite } = await import('./teamActions');

    expect(await declineTeamInvite(CAPTAIN_REQUEST_ID, SHORT_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(
      adminMock.__fromCalls.filter((c) => c.method === 'update' || c.method === 'delete'),
    ).toHaveLength(0);
  });
});

/**
 * #2445: a draft is hidden from everyone but its organiser, and these actions
 * read the game with the service client, so each one answers a draft like a
 * game that does not exist. The reads before getGameByShortId are seeded with
 * rows that pass (this game, the caller as owner or captain, a live status),
 * and so are the steps after it: without the draft check every row reaches a
 * different answer, so the not-found here comes from the draft check.
 */
describe('#2445: et utkast svarer som et spill som ikke finnes', () => {
  const OWN_REQUEST_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const CHILD_REQUEST_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const OTHER_CAPTAIN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const NEW_CAPTAIN_REQUEST_ID = '66666666-6666-6666-6666-666666666666';
  const CALLER_EMAIL = 'kaptein@example.com';

  // The caller's own invitation onto another captain's team (accept/decline).
  const ownInvite = () => ({
    data: {
      id: OWN_REQUEST_ID,
      game_id: GAME_ID,
      user_id: CAPTAIN_ID,
      status: 'pending',
      team_request_id: CAPTAIN_REQUEST_ID,
      team_name: 'Lag A',
      is_team_captain: false,
    },
    error: null,
  });
  // A teammate on the caller's team, and the caller's own captain row (remove/resend).
  const childOnCallersTeam = () => ({
    data: {
      id: CHILD_REQUEST_ID,
      game_id: GAME_ID,
      user_id: KNOWN_USER_ID,
      team_request_id: CAPTAIN_REQUEST_ID,
      team_name: 'Lag A',
      status: 'pending',
    },
    error: null,
  });
  const callerAsCaptain = () => ({
    data: { user_id: CAPTAIN_ID, team_name: 'Lag A', status: 'approved' },
    error: null,
  });

  const rows: Array<{
    name: string;
    error: 'game_not_found' | 'not_found';
    queue: () => QueryResult[];
    rpc?: Record<string, unknown>;
    run: (m: typeof import('./teamActions')) => Promise<{ ok: boolean }>;
  }> = [
    {
      name: 'submitTeamRegistration',
      error: 'game_not_found',
      // What the captain INSERT would answer if the draft got through.
      queue: () => [{ data: null, error: { code: '23505', message: 'duplicate' } }],
      run: (m) =>
        m.submitTeamRegistration({
          shortId: SHORT_ID,
          teamName: 'Lag A',
          slots: [
            { mode: 'email', value: 'a@x' },
            { mode: 'email', value: 'b@x' },
            { mode: 'email', value: 'c@x' },
          ],
        }),
    },
    {
      name: 'acceptTeamInvite',
      error: 'not_found',
      queue: () => [
        ownInvite(),
        { data: { user_id: OTHER_CAPTAIN_ID }, error: null }, // the captain's request, in this game
        { data: null, error: null }, // the captain has no roster row yet
        { data: [{ id: OWN_REQUEST_ID }], error: null }, // the status update
      ],
      run: (m) => m.acceptTeamInvite(OWN_REQUEST_ID, SHORT_ID),
    },
    {
      name: 'declineTeamInvite',
      error: 'not_found',
      queue: () => [ownInvite()],
      run: (m) => m.declineTeamInvite(OWN_REQUEST_ID, SHORT_ID),
    },
    {
      name: 'removeTeamMember',
      error: 'not_found',
      queue: () => [childOnCallersTeam(), callerAsCaptain()],
      run: (m) => m.removeTeamMember(CHILD_REQUEST_ID, SHORT_ID),
    },
    {
      name: 'attachToCaptainTeam',
      error: 'not_found',
      queue: () => [
        {
          data: { id: 'inv-1', email: CALLER_EMAIL, game_id: GAME_ID, invited_by: OTHER_CAPTAIN_ID },
          error: null,
        },
        { data: { email: CALLER_EMAIL }, error: null }, // e-mail ownership
        {
          data: [{ id: CAPTAIN_REQUEST_ID, user_id: OTHER_CAPTAIN_ID, team_name: 'Lag A', status: 'pending' }],
          error: null,
        },
        { data: { id: 'child-1' }, error: null }, // child insert
      ],
      run: (m) => m.attachToCaptainTeam('inv-1', SHORT_ID),
    },
    {
      name: 'resendTeamInvite',
      error: 'not_found',
      queue: () => [childOnCallersTeam(), callerAsCaptain()],
      run: (m) => m.resendTeamInvite(CHILD_REQUEST_ID, SHORT_ID),
    },
    {
      name: 'transferCaptaincy',
      error: 'not_found',
      queue: () => [],
      rpc: { transfer_team_captaincy: { outcome: 'ok' } },
      run: (m) => m.transferCaptaincy(NEW_CAPTAIN_REQUEST_ID, SHORT_ID),
    },
  ];

  it.each(rows)('$name på et utkast → $error, uten skriving, e-post eller RPC', async (row) => {
    authedAsCaptain();
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'draft' }));
    adminMock = buildSupabaseMock(row.queue(), row.rpc ?? {});

    const actions = await import('./teamActions');
    const result = await row.run(actions);

    expect(result).toEqual({ ok: false, error: row.error });
    expect(getGameByShortIdMock).toHaveBeenCalledWith(SHORT_ID);
    expect(
      adminMock.__fromCalls.filter((c) => ['insert', 'update', 'upsert', 'delete'].includes(c.method)),
    ).toEqual([]);
    expect(adminMock.__rpcCalls).toEqual([]);
    expect(serverMock.__rpcCalls).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
    expect(sendTeamInvitationMailMock).not.toHaveBeenCalled();
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });
});
