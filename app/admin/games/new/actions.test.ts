import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the "create game" server actions.
 *
 * The module exports two entry points (`createGameDraft`, `createAndPublishGame`)
 * that both delegate to a private `createGameInternal(formData, mode)`. The
 * mode determines whether the full validation set runs (publish) or just
 * the loose draft subset.
 *
 * Sequence for the publish-mode happy path:
 *   1. buildGameInsertPayload (pure) — validates name/course/tee/team-balance
 *   2. parseOsloDateTimeLocal — required for publish
 *   3. parseSideTournamentFromFormData (pure)
 *   4. auth.getUser
 *   5. users.is_admin lookup
 *   6. (publish only) users.in(roster ids) — pending-profile gate
 *   7. games.insert(...).select('id').single
 *   8. game_players.insert(rows) — resolves
 *   9. redirect
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const notifyInvitedToGameMock = vi.fn<
  (...args: unknown[]) => Promise<void>
>(async () => undefined);
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (...args: unknown[]) =>
    notifyInvitedToGameMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

// #230: trusted-non-admin creators write through the service-role client to
// bypass is_admin()-RLS on games/game_players. A separate mock client lets the
// tests assert *which* client the privileged path used — the assertion the
// original #198 test lacked, which is exactly why the RLS gap shipped
// undetected (mocking games.insert to succeed hid that the write would have
// failed against real RLS).
let adminMock: ReturnType<typeof buildSupabaseMock>;
const getAdminClientMock = vi.fn(() => adminMock);
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => getAdminClientMock(),
}));

// F2 (#272): server-action kaller isValidActiveGameMode før insert. Mocker
// til true så happy-path-testene fortsatt slipper gjennom; egne tester for
// validerings-stien er i lib/formats/validateGameMode.test.ts.
const validateGameModeMock = vi.fn<(slug: string) => Promise<boolean>>(
  async () => true,
);
vi.mock('@/lib/formats/validateGameMode', () => ({
  isValidActiveGameMode: (slug: string) => validateGameModeMock(slug),
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

/** Build a FormData with key/value pairs (and any duplicates via append). */
function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

/** Build a "minimum-valid publish payload" with 8 balanced players. */
function fullPublishFormData(overrides: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    name: 'Vinter-cup',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    hcp_allowance_pct: '100',
    scheduled_tee_off_at: '2026-06-15T09:00',
    side_tournament_enabled: 'false',
  };
  for (let i = 0; i < 8; i++) {
    base[`player_${i}_id`] = `u${i}`;
    base[`player_${i}_team`] = String(Math.floor(i / 2) + 1);
    base[`player_${i}_flight`] = String(Math.floor(i / 2) < 2 ? 1 : 2);
  }
  for (const [k, v] of Object.entries(overrides)) base[k] = v;
  return fd(base);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createGameDraft', () => {
  it('auth gate: redirects to /login when no user is authenticated', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { createGameDraft } = await import('./actions');

    await expect(createGameDraft(fd({ name: 'Test' }))).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('validation: redirects with ?error=name_required when name is empty', async () => {
    // No Supabase calls expected — buildGameInsertPayload short-circuits before
    // any client work. Auth is reached only after the pure-validation pass.
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createGameDraft } = await import('./actions');

    await expect(createGameDraft(fd({ name: '   ' }))).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin/games/new?error=name_required');
  });

  // F2 (#272): isValidActiveGameMode gating før insert. Tester at avvist
  // slug short-circuiter til ?error=invalid_game_mode uten å treffe DB
  // game-insert.
  it('validation: redirects with ?error=invalid_game_mode when slug not in formats table', async () => {
    supabaseMock = buildSupabaseMock([]);
    validateGameModeMock.mockResolvedValueOnce(false);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createGameDraft } = await import('./actions');

    await expect(
      createGameDraft(fd({ name: 'Tester', side_tournament_enabled: 'false' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new?error=invalid_game_mode');
    expect(validateGameModeMock).toHaveBeenCalled();
  });

  it('happy path (draft): inserts game row + game_players, redirects with ?status=draft_created', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: { id: 'new-game-1' }, error: null }, // games.insert(...).select.single
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createGameDraft } = await import('./actions');

    await expect(
      createGameDraft(
        fd({
          name: 'Vinter-cup-draft',
          // Draft doesn't require course/tee/full roster — minimal payload OK.
          side_tournament_enabled: 'false',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/new-game-1?status=draft_created');
  });
});

describe('createGameDraft — trusted creator gate (#198)', () => {
  it('trusted non-admin: is_admin=false + allowlist → writes via admin client (RLS bypass, #230)', async () => {
    // Role lookup runs on the request-scoped client (loadRole). The game +
    // game_players writes must go through the service-role client because
    // games-RLS only grants writes to is_admin() — routing them through the
    // request-scoped client (the pre-#230 bug) would fail against real RLS.
    supabaseMock = buildSupabaseMock([
      // users select returns { is_admin: false, email: 'fornes.even@yahoo.no' }
      // — the helper computes isTrusted from email, allowing the action through
      { data: { is_admin: false, email: 'fornes.even@yahoo.no' }, error: null },
    ]);
    adminMock = buildSupabaseMock([
      { data: { id: 'new-game-trusted-1' }, error: null }, // games.insert
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'trusted-1', email: 'fornes.even@yahoo.no' } },
    });

    const { createGameDraft } = await import('./actions');

    await expect(
      createGameDraft(
        fd({ name: 'Trusted-cup', side_tournament_enabled: 'false' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // #363: trusted-non-admin lander på game-home, ikke /admin/* (som ville
    // bounce-et dem til `/`). Admin-flyten beholder /admin/games/[id] (egen test).
    expect(lastRedirect()).toBe('/games/new-game-trusted-1');

    // The privileged path resolved the service-role client exactly once...
    expect(getAdminClientMock).toHaveBeenCalledTimes(1);

    // ...and both writes landed on it, NOT on the request-scoped client. This
    // is the assertion the original #198 test lacked.
    const adminGamesInsert = adminMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    expect(adminGamesInsert).toBeDefined();
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'game_players' && c.method === 'insert',
      ),
    ).toBe(true);
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toBe(false);

    // created_by still captures the trusted user's id, not an admin's.
    const insertRow = adminGamesInsert!.args[0] as { created_by: string };
    expect(insertRow.created_by).toBe('trusted-1');
  });

  it('non-admin not on allowlist: is_admin=false + unknown email → redirects to /', async () => {
    supabaseMock = buildSupabaseMock([
      // is_admin=false AND email not on allowlist → helper redirects to /
      { data: { is_admin: false, email: 'random@example.com' }, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'random-1', email: 'random@example.com' } },
    });

    const { createGameDraft } = await import('./actions');

    await expect(
      createGameDraft(
        fd({ name: 'Sneak-cup', side_tournament_enabled: 'false' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('admin still allowed: is_admin=true → inserts (admin path unchanged)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no' }, error: null },
      { data: { id: 'new-game-admin-1' }, error: null },
      { data: null, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@tornygolf.no' } },
    });

    const { createGameDraft } = await import('./actions');

    await expect(
      createGameDraft(
        fd({ name: 'Admin-cup', side_tournament_enabled: 'false' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(
      '/admin/games/new-game-admin-1?status=draft_created',
    );

    // Admin path never resolves the service-role client — writes stay on the
    // request-scoped client so RLS still applies to them.
    expect(getAdminClientMock).not.toHaveBeenCalled();
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toBe(true);
  });
});

describe('createAndPublishGame — trusted creator (#230)', () => {
  it('trusted non-admin publish: pending-players gate read + writes all run on admin client', async () => {
    // Publish runs the pending-players gate via a `users.in(rosterIds)` read.
    // For a brand-new game the added players don't yet share a game with the
    // creator, so the request-scoped client's RLS would hide them and silently
    // skip the gate. #230 routes that read through the service-role client too,
    // so the gate sees the full roster — the same behaviour an admin gets.
    supabaseMock = buildSupabaseMock([
      // loadRole's users.eq(id).single — role lookup only.
      { data: { is_admin: false, email: 'fornes.even@yahoo.no' }, error: null },
    ]);
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-05-01T00:00:00Z',
    }));
    adminMock = buildSupabaseMock([
      { data: completedRoster, error: null }, // users.in(rosterIds) — gate read
      { data: { id: 'new-game-trusted-pub' }, error: null }, // games.insert
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'trusted-1', email: 'fornes.even@yahoo.no' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    // #363: trusted-non-admin lander på game-home etter publisering, ikke /admin/*.
    expect(lastRedirect()).toBe('/games/new-game-trusted-pub');
    expect(getAdminClientMock).toHaveBeenCalledTimes(1);

    // Gate read (`users.in(...)`) ran on the admin client...
    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'users' && c.method === 'in',
      ),
    ).toBe(true);
    // ...not on the request-scoped client (which only did the role lookup).
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'users' && c.method === 'in',
      ),
    ).toBe(false);
  });
});

describe('createAndPublishGame', () => {
  it('validation: redirects with ?error=course_required when course is missing on publish', async () => {
    // Publish-mode requires course_id. The validation happens in
    // buildGameInsertPayload before any Supabase work, so no queue entries needed.
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(
        fullPublishFormData({ course_id: '' }), // drop course
      ),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new?error=course_required');
  });

  it('edge case (publish guard): redirects with ?error=pending_players when a roster player has no completed profile', async () => {
    // The publish path runs a defensive query against `users` to ensure every
    // roster player has completed onboarding. A null `profile_completed_at`
    // blocks the publish — the action redirects before the games.insert call.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      {
        // users.in([u0..u7]) — pending-profile gate
        data: [
          {
            id: 'u0',
            email: 'u0@example.com',
            profile_completed_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'u1',
            email: 'u1@example.com',
            profile_completed_at: null, // pending
          },
          // ...other users present and completed; one pending is enough.
        ],
        error: null,
      },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new?error=pending_players');
  });

  it('happy path (publish): inserts scheduled game, redirects with ?status=scheduled', async () => {
    // Build a roster where ALL profiles are completed.
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: completedRoster, error: null }, // users.in(roster ids) — pending gate clears
      { data: { id: 'new-game-2' }, error: null }, // games.insert.select.single
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new-game-2?status=scheduled');
  });

  it('happy path (fourball publish): persists mode_config with allowance_pct from form', async () => {
    // Fourball matchplay (#217): 4 spillere fordelt 2-2 på side 1/2. Wizard
    // pre-fyller `fourball_allowance_pct` fra cup-radens
    // `tournaments.fourball_allowance_pct`. Validator-en (`validateFourballMatchplay`)
    // leser feltet og persisterer det inn i `mode_config.allowance_pct`.
    const completedRoster = Array.from({ length: 4 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: completedRoster, error: null }, // users.in roster
      { data: { id: 'new-game-4ball' }, error: null }, // games.insert.select.single
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(
        fd({
          name: 'Fourball 1',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          hcp_allowance_pct: '100',
          scheduled_tee_off_at: '2026-06-15T09:00',
          side_tournament_enabled: 'false',
          game_mode: 'fourball_matchplay',
          fourball_allowance_pct: '85',
          player_0_id: 'u0',
          player_0_team: '1',
          player_0_flight: '1',
          player_1_id: 'u1',
          player_1_team: '1',
          player_1_flight: '1',
          player_2_id: 'u2',
          player_2_team: '2',
          player_2_flight: '2',
          player_3_id: 'u3',
          player_3_team: '2',
          player_3_flight: '2',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/new-game-4ball?status=scheduled');

    const insertCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    expect(insertCall).toBeDefined();
    const insertRow = insertCall!.args[0] as { game_mode: string; mode_config: unknown };
    expect(insertRow.game_mode).toBe('fourball_matchplay');
    expect(insertRow.mode_config).toEqual({
      kind: 'fourball_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 85,
    });
  });

  it('fourball publish uten allowance: redirects med ?error=bad_allowance', async () => {
    // Validator-en (`validateFourballMatchplay`) krever eksplisitt
    // `fourball_allowance_pct` ved publish. Tom/manglende verdi → bad_allowance.
    // Wizarden pre-fyller alltid feltet, så denne stien rammer kun
    // DevTools-tampering eller scenarier der hidden input-en faller bort.
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(
        fd({
          name: 'Fourball uten allowance',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          hcp_allowance_pct: '100',
          scheduled_tee_off_at: '2026-06-15T09:00',
          side_tournament_enabled: 'false',
          game_mode: 'fourball_matchplay',
          // Bevisst dropper fourball_allowance_pct
          player_0_id: 'u0',
          player_0_team: '1',
          player_0_flight: '1',
          player_1_id: 'u1',
          player_1_team: '1',
          player_1_flight: '1',
          player_2_id: 'u2',
          player_2_team: '2',
          player_2_flight: '2',
          player_3_id: 'u3',
          player_3_team: '2',
          player_3_flight: '2',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/new?error=bad_allowance');
  });

  it('happy path (stableford publish): inserts solo game with mode_config={team_size:1}', async () => {
    // Stableford solo: 2 spillere uten lag-tildeling, payload-builderen
    // returnerer game_mode='stableford' + mode_config={team_size:1,
    // points_table:'standard'}. Roster-gate kjører som vanlig.
    const completedRoster = [
      { id: 'u1', email: 'u1@example.com', profile_completed_at: '2026-01-01T00:00:00Z' },
      { id: 'u2', email: 'u2@example.com', profile_completed_at: '2026-01-01T00:00:00Z' },
    ];

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: completedRoster, error: null }, // users.in roster
      { data: { id: 'new-game-stbl' }, error: null }, // games.insert.select.single
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(
        fd({
          name: 'Solo Cup',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          hcp_allowance_pct: '100',
          scheduled_tee_off_at: '2026-06-15T09:00',
          side_tournament_enabled: 'false',
          game_mode: 'stableford',
          player_0_id: 'u1',
          player_1_id: 'u2',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/new-game-stbl?status=scheduled');

    // Verifiser at games.insert ble kalt med riktig game_mode + mode_config.
    const insertCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    expect(insertCall).toBeDefined();
    const insertRow = (insertCall!.args[0] as { game_mode: string; mode_config: unknown });
    expect(insertRow.game_mode).toBe('stableford');
    expect(insertRow.mode_config).toEqual({
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    });

    // Game_players-raden skal ha null team/flight for stableford.
    const playersInsertCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'insert',
    );
    expect(playersInsertCall).toBeDefined();
    const rows = playersInsertCall!.args[0] as Array<{ team_number: number | null; flight_number: number | null }>;
    expect(rows.every((r) => r.team_number === null)).toBe(true);
    expect(rows.every((r) => r.flight_number === null)).toBe(true);
  });
});

describe('backfill invite-notify (#182)', () => {
  it('publish: fyrer notifyInvitedToGame for hver ny spiller, skipper inviter-self', async () => {
    // Inviter-en (admin-1) er IKKE på spillerlista. 8 spillere skal varsles.
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: completedRoster, error: null },
      { data: { id: 'game-with-notify' }, error: null },
      { data: null, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');
    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(8);
    for (let i = 0; i < 8; i++) {
      expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
        recipientUserId: `u${i}`,
        gameId: 'game-with-notify',
        inviterUserId: 'admin-1',
      });
    }
  });

  it('publish med admin på rosteren: notify fyres for de andre, ikke admin selv', async () => {
    // admin-1 er nå spiller u0 — den raden skal IKKE få varsel.
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: i === 0 ? 'admin-1' : `u${i}`,
      email: i === 0 ? 'admin@tornygolf.no' : `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: completedRoster, error: null },
      { data: { id: 'game-admin-plays' }, error: null },
      { data: null, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@tornygolf.no' } },
    });

    const formWithAdminAsPlayer = fullPublishFormData({
      player_0_id: 'admin-1',
    });

    const { createAndPublishGame } = await import('./actions');
    await expect(
      createAndPublishGame(formWithAdminAsPlayer),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(7);
    const calledIds = notifyInvitedToGameMock.mock.calls.map(
      (c) => (c[0] as { recipientUserId: string }).recipientUserId,
    );
    expect(calledIds).not.toContain('admin-1');
  });

  it('game-creation lykkes selv om notify-helperen kaster', async () => {
    // notifyInvitedToGame skal aldri kaste (intern try/catch), men test
    // for defence-in-depth — Promise.allSettled fanger eventuell rejection.
    notifyInvitedToGameMock.mockRejectedValueOnce(new Error('boom'));

    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: completedRoster, error: null },
      { data: { id: 'game-notify-rejected' }, error: null },
      { data: null, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');
    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    // Redirect treffer success-stien — game-creation har lykkes til tross
    // for at notify-kallet rejecter.
    expect(lastRedirect()).toBe(
      '/admin/games/game-notify-rejected?status=scheduled',
    );
  });

  it('draft uten spillere: ingen notify-kall fyres', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: { id: 'empty-draft' }, error: null },
      { data: null, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createGameDraft } = await import('./actions');
    await expect(
      createGameDraft(fd({ name: 'Tom-cup', side_tournament_enabled: 'false' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });
});
