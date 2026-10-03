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
 * FIRST (so it knows `isAdmin`, which decides where success lands), then
 * validates. There is no service-role bypass anymore — creator-owned RLS
 * (migration 0071) covers a non-admin's writes on the request-scoped client.
 *
 * #2441: a player who has not finished their profile no longer stops the
 * publish. The rule lives at the start (startScheduledGameCore), so publish
 * never calls `incomplete_profile_ids`.
 *
 * #1379: validation and DB failures are RETURNED as `{ error: <code> }`, never
 * redirected. The wizard keeps its whole state client-side, so a redirect back
 * to the create route remounted the form and wiped course, tee-off, format,
 * players and teams. Only success (and the dead-session auth gate) redirects —
 * a returned value therefore always means something went wrong.
 *
 * Sequence for the publish-mode happy path:
 *   1. auth.getUser  → redirect /login if absent
 *   2. users.is_admin lookup (the gate)
 *   3. buildGameInsertPayload (pure)
 *   4. isValidActiveGameMode
 *   5. parseOsloDateTimeLocal — required for publish
 *   6. parseSideTournamentFromFormData (pure)
 *   7. games.insert(...).select('id').single
 *   8. game_players.insert(rows)
 *   9. (publish only) notifyRosterInvites
 *  10. redirect (admin → /admin/games/[id], else → /games/[id])
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));
// A match added to a cup expires the cup caches before the redirect.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

const notifyInvitedToGameMock = vi.fn<
  (...args: unknown[]) => Promise<void>
>(async () => undefined);
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (...args: unknown[]) =>
    notifyInvitedToGameMock(...args),
}));

// #2445: publishing notifies the roster through notifyRosterInvites (who gets
// the notice is tested there); here only that the action calls it, when, and
// that a failure never stops the publish.
const notifyRosterInvitesMock = vi.fn<
  (...args: unknown[]) => Promise<{ ok: true; invited: number } | { ok: false; reason: string }>
>(async () => ({ ok: true, invited: 0 }));
vi.mock('@/lib/games/notifyRosterInvites', () => ({
  notifyRosterInvites: (...args: unknown[]) => notifyRosterInvitesMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

// #1009: publish-stien slår opp gjeste-ids (service-role) for å rute
// gjeste-rader forbi 0115-guarden. Ingen gjester i disse fixturene → tomt
// sett, så hele rosteren går request-klient-veien som før.
vi.mock('@/lib/games/createGuestPlayer', () => ({
  findGuestIds: vi.fn(async () => new Set<string>()),
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

// #2321: the wizard's e-mail invitations. The sender has its own tests; here
// only who calls it, with what, and where the organiser lands.
const sendPublishInvitesMock = vi.fn<(...args: unknown[]) => Promise<{ failed: number }>>(
  async () => ({ failed: 0 }),
);
vi.mock('@/lib/games/sendPublishInvites', () => ({
  sendPublishInvites: (...args: unknown[]) => sendPublishInvitesMock(...args),
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

// #902: a tee-off comfortably in the future so the past-tee-off guard never
// rejects these fixtures. Computed relative to now so it can't go stale the way
// a hard-coded date did. No test asserts the persisted tee-off value.
const FUTURE_TEE_OFF = (() => {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();

/** Build a "minimum-valid publish payload" with 8 balanced players. */
function fullPublishFormData(overrides: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    name: 'Vinter-cup',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    hcp_allowance_pct: '100',
    scheduled_tee_off_at: FUTURE_TEE_OFF,
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

  it('validation (admin): returns { error: name_required } without navigating', async () => {
    // Gate runs first (reads is_admin), THEN buildGameInsertPayload rejects the
    // empty name. #1379: the code comes back as a return value — no redirect,
    // so the wizard stays mounted with everything the organiser filled in.
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    signIn('admin-1');

    const { createGameDraft } = await import('./actions');

    const res = await createGameDraft(fd({ name: '   ' }));
    expect(res).toEqual({ error: 'name_required' });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  // F2 (#272): isValidActiveGameMode gating før insert.
  it('validation (admin): returns { error: invalid_game_mode } when slug not in formats table', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    validateGameModeMock.mockResolvedValueOnce(false);
    signIn('admin-1');

    const { createGameDraft } = await import('./actions');

    const res = await createGameDraft(
      fd({ name: 'Tester', side_tournament_enabled: 'false' }),
    );
    expect(res).toEqual({ error: 'invalid_game_mode' });
    expect(redirectMock).not.toHaveBeenCalled();
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

  it('regular non-admin: validation errors come back as a code, not a navigation', async () => {
    // Pre-#1379 this asserted WHERE the error bounced (/opprett-spill vs
    // /admin/games/new). There is no bounce anymore — the same code reaches
    // both routes as a return value, so the question is now "right code, no
    // navigation".
    supabaseMock = buildSupabaseMock([{ data: { is_admin: false }, error: null }]);
    signIn('reg-1', 'random@example.com');

    const { createGameDraft } = await import('./actions');

    const res = await createGameDraft(fd({ name: '   ' }));
    expect(res).toEqual({ error: 'name_required' });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('regular non-admin publish: a pending player does not stop the publish (#2441)', async () => {
    // The fixture would answer u1 as pending if anything asked: publish must
    // not ask. The start gate is where a missing profile stops the round.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // gate
        { data: { id: 'reg-game-pending' }, error: null }, // games.insert
        { data: null, error: null }, // game_players.insert
      ],
      { incomplete_profile_ids: [{ id: 'u1' }] },
    );
    signIn('reg-1', 'random@example.com');

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'games' && c.method === 'insert'),
    ).toBe(true);
    expect(supabaseMock.__rpcCalls.map((c) => c.name)).not.toContain('incomplete_profile_ids');
    expect(lastRedirect()).toBe('/games/reg-game-pending');
  });
});

describe('createGameDraft — start_type (#2258)', () => {
  // The insert writes the wizard's «Shotgun-start»; without the field (an older
  // tab) a new round starts from the first tee.
  it.each([
    ['shotgun', 'shotgun'],
    [undefined, 'first_tee'],
  ] as const)('form start_type %j → games.insert start_type %s', async (raw, expected) => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // gate: not admin
      { data: { id: 'st-game-1' }, error: null }, // games.insert
      { data: null, error: null }, // game_players.insert
    ]);
    signIn('reg-1', 'random@example.com');
    const fields: Record<string, string> = { name: 'Høstscramble', side_tournament_enabled: 'false' };
    if (raw !== undefined) fields.start_type = raw;

    const { createGameDraft } = await import('./actions');
    await expect(createGameDraft(fd(fields))).rejects.toBeInstanceOf(RedirectError);

    const gamesInsert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    expect((gamesInsert!.args[0] as { start_type: string }).start_type).toBe(expected);
  });
});

describe('cup link (#2207)', () => {
  function gamesInsertPayload() {
    const insert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    return insert?.args[0] as { tournament_id: string | null; tournament_match_label: string | null };
  }

  it('a cup the caller does not manage: the game is created without the link', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // gate
        { data: { id: 'reg-game-cup' }, error: null }, // games.insert
        { data: null, error: null }, // game_players.insert
      ],
      { can_manage_tournament: false },
    );
    signIn('reg-1', 'random@example.test');

    const { createGameDraft } = await import('./actions');
    await expect(
      createGameDraft(
        fd({
          name: 'Kompis-cup',
          side_tournament_enabled: 'false',
          tournament_id: 'someone-elses-cup',
          tournament_match_label: 'Kamp 1',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(supabaseMock.__rpcCalls).toContainEqual({
      name: 'can_manage_tournament',
      params: { p_tournament_id: 'someone-elses-cup' },
    });
    expect(gamesInsertPayload()).toMatchObject({ tournament_id: null, tournament_match_label: null });
  });

  it('the cup organiser: the game is linked to the cup', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null },
        { data: { id: 'org-game-cup' }, error: null },
        { data: null, error: null },
      ],
      { can_manage_tournament: true },
    );
    signIn('org-1', 'organiser@example.test');

    const { createGameDraft } = await import('./actions');
    await expect(
      createGameDraft(
        fd({
          name: 'Kamp',
          side_tournament_enabled: 'false',
          tournament_id: 'my-cup',
          tournament_match_label: 'Kamp 1',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(gamesInsertPayload()).toMatchObject({ tournament_id: 'my-cup', tournament_match_label: 'Kamp 1' });
    expect(lastRedirect()).toBe('/admin/cup/my-cup?status=match_added');
  });
});

describe('createAndPublishGame', () => {
  it('validation (admin): returns { error: course_required } when course is missing on publish', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');

    const res = await createAndPublishGame(
      fullPublishFormData({ course_id: '' }), // drop course
    );
    expect(res).toEqual({ error: 'course_required' });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('a roster player without a completed profile does not stop the publish (#2441)', async () => {
    // The fixture would answer u1 as pending if anything asked. Publishing
    // goes through; the round starts once the profile is done.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // gate
        { data: { id: 'game-pending' }, error: null }, // games.insert.select.single
        { data: null, error: null }, // game_players.insert
      ],
      { incomplete_profile_ids: [{ id: 'u1' }] },
    );
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    const insert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    expect((insert!.args[0] as { status: string }).status).toBe('scheduled');
    expect(supabaseMock.__rpcCalls.map((c) => c.name)).not.toContain('incomplete_profile_ids');
    expect(lastRedirect()).toBe('/admin/games/game-pending?status=scheduled');
  });

  it('happy path (publish): inserts scheduled game, redirects with ?status=scheduled', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // gate
        { data: { id: 'new-game-2' }, error: null }, // games.insert.select.single
        { data: null, error: null }, // game_players.insert
      ],
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
          scheduled_tee_off_at: FUTURE_TEE_OFF,
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

  it('fourball publish uten allowance: returnerer { error: bad_allowance }', async () => {
    // Validator-en (`validateFourballMatchplay`) krever eksplisitt
    // `fourball_allowance_pct` ved publish. Tom/manglende verdi → bad_allowance.
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');

    const res = await createAndPublishGame(
      fd({
        name: 'Fourball uten allowance',
        course_id: 'course-1',
        tee_box_id: 'tee-1',
        hcp_allowance_pct: '100',
        scheduled_tee_off_at: FUTURE_TEE_OFF,
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
    );

    expect(res).toEqual({ error: 'bad_allowance' });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('publish med tee-off i fortid: returnerer { error: tee_off_in_past } (#902)', async () => {
    // The guard fires after the tee-off parse, before the pending-gate RPC and
    // the games.insert — so only the is_admin gate row is consumed, and no write
    // should happen.
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');

    const res = await createAndPublishGame(
      fullPublishFormData({ scheduled_tee_off_at: '2020-01-01T09:00' }),
    );

    expect(res).toEqual({ error: 'tee_off_in_past' });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(
      supabaseMock.__fromCalls.find(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toBeUndefined();
  });

  it('happy path (stableford publish): inserts solo game with mode_config={team_size:1}', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // gate
        { data: { id: 'new-game-stbl' }, error: null }, // games.insert.select.single
        { data: null, error: null }, // game_players.insert
      ],
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
          scheduled_tee_off_at: FUTURE_TEE_OFF,
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
  it('happy path (strokeplay publish): stamps net-to-par ranking on the new game (#2253)', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // gate
        { data: { id: 'new-game-sp' }, error: null }, // games.insert.select.single
        { data: null, error: null }, // game_players.insert
      ],
    );
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(
        fd({
          name: 'Slagspill',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          hcp_allowance_pct: '100',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          side_tournament_enabled: 'false',
          game_mode: 'solo_strokeplay',
          player_0_id: 'u1',
          player_1_id: 'u2',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    const insertCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    const insertRow = insertCall!.args[0] as { game_mode: string; mode_config: unknown };
    expect(insertRow.game_mode).toBe('solo_strokeplay');
    expect(insertRow.mode_config).toEqual({
      kind: 'solo_strokeplay',
      team_size: 1,
      ranking: 'net_to_par',
    });
  });
});

describe('invite-notify ved publisering (#182 → #2445)', () => {
  it('publish: kaller notifyRosterInvites én gang med spillet og kalleren', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null },
        { data: { id: 'game-with-notify' }, error: null },
        { data: null, error: null },
      ],
    );
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');
    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyRosterInvitesMock).toHaveBeenCalledTimes(1);
    expect(notifyRosterInvitesMock).toHaveBeenCalledWith({
      gameId: 'game-with-notify',
      inviterUserId: 'admin-1',
    });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('utkast med spillere: ingen varsler', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: { id: 'draft-with-players' }, error: null },
      { data: null, error: null },
    ]);
    signIn('admin-1');

    const { createGameDraft } = await import('./actions');
    await expect(
      createGameDraft(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    const playersInsert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'insert',
    );
    expect(playersInsert!.args[0]).toHaveLength(8);
    expect(notifyRosterInvitesMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe('/admin/games/draft-with-players?status=draft_created');
  });

  it('publiseringen går gjennom selv om notifyRosterInvites kaster', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyRosterInvitesMock.mockRejectedValueOnce(new Error('boom'));

    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null },
        { data: { id: 'game-notify-rejected' }, error: null },
        { data: null, error: null },
      ],
    );
    signIn('admin-1');

    const { createAndPublishGame } = await import('./actions');
    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'games' && c.method === 'insert'),
    ).toBe(true);
    expect(notifyRosterInvitesMock).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[createGameInternal] roster invites failed',
      expect.objectContaining({ gameId: 'game-notify-rejected' }),
    );
    expect(lastRedirect()).toBe(
      '/admin/games/game-notify-rejected?status=scheduled',
    );
    consoleError.mockRestore();
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
    expect(notifyRosterInvitesMock).not.toHaveBeenCalled();
  });
});

/**
 * #737 chaos-injection: createGameInternal inserted `games` then `game_players`
 * with NO rollback. A failed player insert after the game row committed left an
 * orphan game with no players — the creator saw an empty, broken round in their
 * lists. The fix deletes the committed game (the creator has DELETE-RLS on own
 * games, 0071; game_players follow via FK cascade), mirroring #675.
 */
describe('createGameInternal — rollback on player-insert failure (#737)', () => {
  it('deletes the committed games row when game_players insert fails, then shows db_players', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // gate: users.is_admin
      { data: { id: 'g-orphan' }, error: null }, // games.insert(...).select.single
      { data: null, error: { message: 'boom' } }, // game_players.insert FAILS
      { data: null, error: null }, // rollback: games.delete().eq('id','g-orphan')
    ]);
    signIn('admin-1');

    const { createGameDraft } = await import('./actions');
    const res = await createGameDraft(
      fd({ name: 'Orphan-test', side_tournament_enabled: 'false' }),
    );

    // The committed game row is rolled back — no half-built game is left behind.
    const del = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'delete',
    );
    expect(del, 'games.delete issued for rollback').toBeDefined();
    const eqCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'eq',
    );
    expect(eqCall!.args).toEqual(['id', 'g-orphan']);
    // A localized error surfaces (never a silent orphan) — as a return value,
    // so the wizard can show it without losing what the organiser typed.
    expect(res).toEqual({ error: 'db_players' });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('e-mail invitations at publish (#2321)', () => {
  it('publish sends them once with the game id and the request client; a failure adds invites_failed; a draft sends none', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true, name: 'Ola' }, error: null }, // gate
        { data: { id: 'game-inv' }, error: null }, // games.insert.select.single
        { data: null, error: null }, // game_players.insert
      ],
    );
    signIn('admin-1');
    sendPublishInvitesMock.mockResolvedValueOnce({ failed: 1 });

    const { createAndPublishGame, createGameDraft } = await import('./actions');
    const publishData = fullPublishFormData();
    publishData.append('invite_email', 'a@example.com');
    publishData.append('invite_email', 'b@example.com');

    await expect(createAndPublishGame(publishData)).rejects.toBeInstanceOf(RedirectError);

    expect(sendPublishInvitesMock).toHaveBeenCalledTimes(1);
    const [call] = sendPublishInvitesMock.mock.calls[0] as [Record<string, unknown>];
    expect(call).toMatchObject({
      gameId: 'game-inv',
      inviterUserId: 'admin-1',
      inviterName: 'Ola',
      isAdmin: true,
      emails: ['a@example.com', 'b@example.com'],
    });
    expect(call.client).toBe(supabaseMock);
    expect(call.viewer).toBe(supabaseMock);
    expect(lastRedirect()).toBe('/admin/games/game-inv?status=scheduled&error=invites_failed');

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Ola' }, error: null },
      { data: { id: 'draft-inv' }, error: null },
      { data: null, error: null },
    ]);
    signIn('admin-1');
    sendPublishInvitesMock.mockClear();
    const draftData = fd({ name: 'Utkast', side_tournament_enabled: 'false' });
    draftData.append('invite_email', 'a@example.com');

    await expect(createGameDraft(draftData)).rejects.toBeInstanceOf(RedirectError);
    expect(sendPublishInvitesMock).not.toHaveBeenCalled();
  });
});
