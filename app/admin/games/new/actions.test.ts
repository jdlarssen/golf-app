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
 * #427: creation is open to ANY logged-in user. The action authenticates
 * FIRST (so it knows `isAdmin`, which decides where errors bounce and where
 * success lands), then validates. There is no service-role bypass anymore —
 * creator-owned RLS (migration 0071) covers a non-admin's writes on the
 * request-scoped client, and the publish pending-gate uses a SECURITY DEFINER
 * RPC (`incomplete_profiles_for_ids`) instead of a service-role roster read.
 *
 * Sequence for the publish-mode happy path:
 *   1. auth.getUser  → redirect /login if absent
 *   2. users.is_admin lookup (the gate)
 *   3. buildGameInsertPayload (pure)
 *   4. isValidActiveGameMode
 *   5. parseOsloDateTimeLocal — required for publish
 *   6. parseSideTournamentFromFormData (pure)
 *   7. (publish only) rpc('incomplete_profiles_for_ids', {ids}) — pending gate
 *   8. games.insert(...).select('id').single
 *   9. game_players.insert(rows)
 *  10. redirect (admin → /admin/games/[id], else → /games/[id])
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

/** Stub `auth.getUser` to return a signed-in user with the given id/email. */
function signIn(id: string, email?: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: email ? { id, email } : { id } },
  });
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

  it('validation (admin): redirects to /admin/games/new?error=name_required', async () => {
    // Gate runs first (reads is_admin), THEN buildGameInsertPayload rejects the
    // empty name. Admin → errors bounce to /admin/games/new.
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    signIn('admin-1');

    const { createGameDraft } = await import('./actions');

    await expect(createGameDraft(fd({ name: '   ' }))).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin/games/new?error=name_required');
  });

  // F2 (#272): isValidActiveGameMode gating før insert.
  it('validation (admin): redirects to ?error=invalid_game_mode when slug not in formats table', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    validateGameModeMock.mockResolvedValueOnce(false);
    signIn('admin-1');

    const { createGameDraft } = await import('./actions');

    await expect(
      createGameDraft(fd({ name: 'Tester', side_tournament_enabled: 'false' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new?error=invalid_game_mode');
    expect(validateGameModeMock).toHaveBeenCalled();
  });

  it('happy path (admin draft): inserts game row + game_players, redirects with ?status=draft_created', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // gate: users.is_admin
      { data: { id: 'new-game-1' }, error: null }, // games.insert(...).select.single
      { data: null, error: null }, // game_players.insert
    ]);
    signIn('admin-1');

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

describe('createGameInternal — open to any logged-in user (#427)', () => {
  it('regular non-admin: creates draft on the request-scoped client, lands on game-home', async () => {
    // Was redirected to `/` pre-#427 (admin/trusted-only). Now allowed: the
    // write runs on the request-scoped client (creator-owned RLS covers it),
    // created_by captures the user, and they land on the player game-home.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // gate: not admin
      { data: { id: 'reg-game-1' }, error: null }, // games.insert
      { data: null, error: null }, // game_players.insert
    ]);
    signIn('reg-1', 'random@example.com');

    const { createGameDraft } = await import('./actions');

    await expect(
      createGameDraft(fd({ name: 'Kompis-cup', side_tournament_enabled: 'false' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Non-admin success → game-home, not /admin/*.
    expect(lastRedirect()).toBe('/games/reg-game-1');

    // The write landed on the request-scoped client (no service-role bypass).
    const gamesInsert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    expect(gamesInsert).toBeDefined();
    expect((gamesInsert!.args[0] as { created_by: string }).created_by).toBe(
      'reg-1',
    );
  });

  it('regular non-admin: validation errors bounce back to /opprett-spill (not /admin/*)', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: false }, error: null }]);
    signIn('reg-1', 'random@example.com');

    const { createGameDraft } = await import('./actions');

    await expect(createGameDraft(fd({ name: '   ' }))).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/opprett-spill?error=name_required');
  });

  it('regular non-admin publish: pending player bounces to /opprett-spill?error=pending_players', async () => {
    supabaseMock = buildSupabaseMock(
      [{ data: { is_admin: false }, error: null }], // gate only — RPC blocks before insert
      { incomplete_profiles_for_ids: [{ id: 'u1', email: 'u1@example.com' }] },
    );
    signIn('reg-1', 'random@example.com');

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/opprett-spill?error=pending_players');
  });
});

describe('createAndPublishGame', () => {
  it('validation (admin): redirects with ?error=course_required when course is missing on publish', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(
        fullPublishFormData({ course_id: '' }), // drop course
      ),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new?error=course_required');
  });

  it('edge case (publish guard): redirects with ?error=pending_players when a roster player has no completed profile', async () => {
    // The publish path calls the incomplete_profiles_for_ids RPC, which returns
    // ONLY the rows that still lack a completed profile. A non-empty result
    // blocks the publish — the action redirects before the games.insert call.
    supabaseMock = buildSupabaseMock(
      [{ data: { is_admin: true }, error: null }], // gate
      {
        incomplete_profiles_for_ids: [
          { id: 'u1', email: 'u1@example.com' }, // one pending is enough
        ],
      },
    );
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new?error=pending_players');
  });

  it('happy path (publish): inserts scheduled game, redirects with ?status=scheduled', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // gate
        { data: { id: 'new-game-2' }, error: null }, // games.insert.select.single
        { data: null, error: null }, // game_players.insert
      ],
      { incomplete_profiles_for_ids: [] }, // no pending players → gate clears
    );
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new-game-2?status=scheduled');
  });

  it('happy path (fourball publish): persists mode_config with allowance_pct from form', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // gate
        { data: { id: 'new-game-4ball' }, error: null }, // games.insert.select.single
        { data: null, error: null }, // game_players.insert
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1');

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
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    signIn('admin-1');

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
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // gate
        { data: { id: 'new-game-stbl' }, error: null }, // games.insert.select.single
        { data: null, error: null }, // game_players.insert
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1');

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
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null },
        { data: { id: 'game-with-notify' }, error: null },
        { data: null, error: null },
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1');

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
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null },
        { data: { id: 'game-admin-plays' }, error: null },
        { data: null, error: null },
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1', 'admin@tornygolf.no');

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
    notifyInvitedToGameMock.mockRejectedValueOnce(new Error('boom'));

    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null },
        { data: { id: 'game-notify-rejected' }, error: null },
        { data: null, error: null },
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');
    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

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
    signIn('admin-1');

    const { createGameDraft } = await import('./actions');
    await expect(
      createGameDraft(fd({ name: 'Tom-cup', side_tournament_enabled: 'false' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });
});
