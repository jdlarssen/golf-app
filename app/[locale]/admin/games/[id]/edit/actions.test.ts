import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the edit-game server actions.
 *
 * Mode-lock (#41): updateGameInternal must reject game_mode changes once the
 * game has left 'draft'. #428: the actions are now gated on
 * requireAdminOrCreator — admins keep their Sekretariat redirects, a game's
 * creator gets /games/[id]/rediger + /games/[id]. #2441: a player who has
 * not finished their profile no longer stops publish or update_scheduled;
 * the start gate (startScheduledGameCore) is the one place that waits.
 *
 * Query-sekvens (publish/update_scheduled):
 *   1. auth.getUser                        // loadRole
 *   2. users.select(is_admin,name)         // loadRole
 *   3. games.select(created_by)            // requireAdminOrCreator — ONLY when not admin
 *   4. games.select(status, game_mode, mode_config, tournament_id, group_id)
 *      // #2433: read BEFORE the payload (its club makes the roster optional),
 *      // so every test queues it, also the ones that return early (payload
 *      // error, tee_off_required, tee_off_in_past, side-tournament errors).
 *      // Then mode-lock + cup lock.
 *   5. game_players.select('*')            // prior roster, read BEFORE games.update (#2210)
 *   6. games.update                        // optimistic-lock på status
 *   7. game_players.update × n             // plan.updates, each .select('user_id')
 *   8. game_players.insert                 // plan.inserts, .select('user_id')
 *   9. game_players.delete                 // plan.deletes, .select('user_id')
 *  10. (publish) notifyRosterInvites; (update_scheduled) notify new rows
 *  11. revalidateTag + redirect
 *
 * On a failed roster write the compensation runs via the (mocked) admin
 * client: game_players.delete of the attempted ids, then a re-insert of their
 * prior rows.
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
// lib/admin/auth.ts (shared auth gate, out of i18n scope) still redirects via
// next/navigation — route it to the same spy so auth-gate assertions hold.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyInvitedToGameMock = vi.fn<
  (...args: unknown[]) => Promise<void>
>(async () => undefined);
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (...args: unknown[]) =>
    notifyInvitedToGameMock(...args),
}));

// #2445: publishing a draft notifies the roster through notifyRosterInvites
// (who gets the notice is tested there); here only when the action calls it.
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

// #1009: edit-stien slår opp gjeste-ids (service-role) for å rute gjeste-
// rader forbi 0115-guarden. Ingen gjester i disse fixturene → tomt sett, så
// hele rosteret går request-klient-veien som før.
vi.mock('@/lib/games/createGuestPlayer', () => ({
  findGuestIds: vi.fn(async () => new Set<string>()),
}));

// #1009: rollback-re-insertet går via service-role (snapshotet kan inneholde
// gjeste-rader som 0115-guarden ville avvist på request-klienten). Testene
// deler mock-klient så insert-kallene fortsatt telles i __fromCalls.
// #2321: a test can swap in a separate service client to prove the request
// client is the one handed on.
let adminClientOverride: unknown = null;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminClientOverride ?? supabaseMock,
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

/** Stub `auth.getUser` to return a signed-in user with the given id. */
function signIn(id: string, email?: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, ...(email ? { email } : {}) } },
  });
}

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

/** Full best-ball publish-payload med 8 balanserte spillere. */
function fullBestBallFormData(
  overrides: Record<string, string> = {},
): FormData {
  const base: Record<string, string> = {
    name: 'Vinter-cup',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    hcp_allowance_pct: '100',
    scheduled_tee_off_at: FUTURE_TEE_OFF,
    side_tournament_enabled: 'false',
    game_mode: 'best_ball',
  };
  for (let i = 0; i < 8; i++) {
    base[`player_${i}_id`] = `u${i}`;
    base[`player_${i}_team`] = String(Math.floor(i / 2) + 1);
    base[`player_${i}_flight`] = String(Math.floor(i / 2) < 2 ? 1 : 2);
  }
  for (const [k, v] of Object.entries(overrides)) base[k] = v;
  return fd(base);
}

/** Full greensome-payload: 4 spillere, 2-2 på sidene (2v2-validatoren krever det). */
function fullGreensomeFormData(
  overrides: Record<string, string> = {},
): FormData {
  const base: Record<string, string> = {
    name: 'Cup-kamp',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    hcp_allowance_pct: '100',
    greensome_allowance_pct: '100',
    scheduled_tee_off_at: FUTURE_TEE_OFF,
    side_tournament_enabled: 'false',
    game_mode: 'greensome_matchplay',
  };
  for (let i = 0; i < 4; i++) {
    base[`player_${i}_id`] = `u${i}`;
    base[`player_${i}_team`] = String((i % 2) + 1);
  }
  for (const [k, v] of Object.entries(overrides)) base[k] = v;
  return fd(base);
}

/**
 * #2210: a full stored game_players row matching slot i of
 * fullBestBallFormData (same team and flight), so the roster plan sees no
 * change for it.
 */
function storedBestBallRow(i: number, extra: Record<string, unknown> = {}) {
  return {
    game_id: 'game-1',
    user_id: `u${i}`,
    team_number: Math.floor(i / 2) + 1,
    flight_number: Math.floor(i / 2) < 2 ? 1 : 2,
    tee_gender: 'mens',
    course_handicap: null,
    accepted_at: '2026-09-01T10:00:00Z',
    paid_at: i < 3 ? '2026-09-02T10:00:00Z' : null,
    withdrawn_at: null,
    withdrawn_by_user_id: null,
    signup_source: i === 5 ? 'public_page' : null,
    approved_at: null,
    approved_by_user_id: null,
    submitted_at: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * #1445: two lookups in updateGameInternal folded a failed query into the same
 * `?error=not_editable` bounce as a genuine miss. The second one was the worse
 * of the pair — it used `.single()`, so an optimistic-lock miss (0 rows because
 * the status flipped in another tab) arrived as a PGRST116 *error*, which is
 * exactly the shape a real outage takes. `.maybeSingle()` separates them: a
 * lock miss is 0 rows and keeps the bounce, a failure throws.
 */
describe('updateGameInternal — feil vs. fravær (#1445)', () => {
  const DB_ERR = { message: 'AbortError: This operation was aborted', code: '' };

  it('mode-lock-oppslaget feiler → kaster (ikke ?error=not_editable)', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        { data: null, error: DB_ERR }, // mode-lock fetch
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toMatchObject({
      message: expect.stringContaining('AbortError'),
    });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(
      supabaseMock.__fromCalls.filter((c) =>
        ['update', 'insert', 'delete'].includes(c.method),
      ),
    ).toHaveLength(0);
  });

  it('ekte 0-rad på mode-lock-oppslaget beholder ?error=not_editable', async () => {
    // strictSingle (#1693): låser .maybeSingle()-byttet på mode-lock-fetchen.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null },
        { data: null, error: null }, // mode-lock fetch: spillet finnes ikke
      ],
      {},
      { strictSingle: true },
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=not_editable');
  });

  it('selve update-en feiler → kaster (ikke ?error=not_editable)', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null },
        { data: { status: 'scheduled', game_mode: 'best_ball' }, error: null },
        { data: [], error: null }, // prior roster
        { data: null, error: DB_ERR }, // games.update
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toMatchObject({
      message: expect.stringContaining('AbortError'),
    });
    expect(redirectMock).not.toHaveBeenCalled();
    // Rosteret ble ikke rørt — vi stoppet før delete/insert.
    expect(
      supabaseMock.__fromCalls.filter((c) =>
        ['insert', 'delete'].includes(c.method),
      ),
    ).toHaveLength(0);
  });

  it('optimistic-lock-miss (0 rader, ingen feil) beholder ?error=not_editable', async () => {
    // strictSingle (#1693): låser .maybeSingle()-byttet på update-terminatoren.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null },
        { data: { status: 'scheduled', game_mode: 'best_ball' }, error: null },
        { data: [], error: null }, // prior roster
        // games.update traff ingen rad: status flippet i en annen fane.
        { data: null, error: null },
      ],
      {},
      { strictSingle: true },
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=not_editable');
    expect(
      supabaseMock.__fromCalls.filter((c) =>
        ['insert', 'delete'].includes(c.method),
      ),
    ).toHaveLength(0);
  });
});

describe('updateScheduledAction — mode-lock', () => {
  it('blocks mode-bytte når spillet er scheduled (mode_locked_after_publish)', async () => {
    // Admin har publisert en best-ball-runde og prøver nå å sende en
    // stableford-payload via edit-flyten. Mode-lock-guarden må returnere
    // den eksplisitte feilen i stedet for å tillate skriving.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole: users.select
        // games.select(status, game_mode).single — mode-lock-fetch
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        },
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');

    // Payload har 1 spiller + game_mode='stableford'. Builderen aksepterer
    // dette (min 1 for stableford), så guarden er det som må stoppe det.
    await expect(
      updateScheduledAction(
        'game-1',
        fd({
          name: 'Switched mode',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          hcp_allowance_pct: '100',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          side_tournament_enabled: 'false',
          game_mode: 'stableford',
          player_0_id: 'u1',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/admin/games/game-1/edit?error=mode_locked_after_publish',
    );

    // Sanity: ingen update / delete / insert ble dispatchet.
    const writeMethods = supabaseMock.__fromCalls.filter((c) =>
      ['update', 'insert', 'delete'].includes(c.method),
    );
    expect(writeMethods).toHaveLength(0);
  });

  it('update_scheduled med tee-off i fortid: redirects med ?error=tee_off_in_past (#902)', async () => {
    // Guarden fyrer etter tee-off-parsingen, før prior roster og enhver
    // skriving. #2433: existing-raden leses før payloaden, så den står i køen.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole: users.select
      { data: { status: 'scheduled', game_mode: 'best_ball' }, error: null }, // existing
    ]);
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');

    await expect(
      updateScheduledAction(
        'game-1',
        fullBestBallFormData({ scheduled_tee_off_at: '2020-01-01T09:00' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/admin/games/game-1/edit?error=tee_off_in_past',
    );
    const writes = supabaseMock.__fromCalls.filter((c) =>
      ['update', 'insert', 'delete'].includes(c.method),
    );
    expect(writes).toHaveLength(0);
  });

  it('tillater oppdatering når payload-mode matcher eksisterende game_mode', async () => {
    // Samme mode på begge sider: guarden passerer, og updaten skjer
    // som vanlig. Vi bryr oss bare om at den ikke blir avvist.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        }, // games.select
        { data: [], error: null }, // game_players.select (prior roster)
        { data: { id: 'game-1' }, error: null }, // games.update
        { data: Array.from({ length: 8 }, (_, i) => ({ user_id: `u${i}` })), error: null }, // game_players.insert (all 8 new)
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');

    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/game-1?status=updated');
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
  });
});

describe('updateScheduledAction — start_type (#2258)', () => {
  // The edit form posts the «Shotgun-start» mirror; the update writes it, and
  // a form without it (an older tab) writes the first-tee default.
  it.each([
    ['shotgun', 'shotgun'],
    [undefined, 'first_tee'],
  ] as const)('form start_type %j → games.update start_type %s', async (raw, expected) => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        { data: { status: 'scheduled', game_mode: 'best_ball' }, error: null }, // games.select
        { data: [], error: null }, // game_players.select (prior roster)
        { data: { id: 'game-1' }, error: null }, // games.update
        { data: Array.from({ length: 8 }, (_, i) => ({ user_id: `u${i}` })), error: null }, // game_players.insert
      ],
    );
    signIn('admin-1');
    const form = fullBestBallFormData();
    if (raw !== undefined) form.set('start_type', raw);

    const { updateScheduledAction } = await import('./actions');
    await expect(updateScheduledAction('game-1', form)).rejects.toBeInstanceOf(RedirectError);

    const gameUpdate = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'update',
    );
    expect((gameUpdate?.args[0] as { start_type: unknown }).start_type).toBe(expected);
  });
});

describe('updateScheduledAction — mode_config-nøkler skjemaet ikke eier (#1677)', () => {
  it('beholder team_strokes_override på en planlagt cup-greensome', async () => {
    // Cup-generatoren har skrevet arrangørens manuelle lag-slag inn i
    // mode_config. Edit-skjemaet har ikke noe felt for dem, så validator-
    // outputen mangler nøkkelen — før #1677 slettet enhver lagring den.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        {
          data: {
            status: 'scheduled',
            game_mode: 'greensome_matchplay',
            mode_config: {
              kind: 'greensome_matchplay',
              team_size: 2,
              teams_count: 2,
              allowance_pct: 100,
              team_strokes_override: { team1: 8, team2: 3 },
            },
          },
          error: null,
        }, // mode-lock-fetch (leser nå også mode_config)
        { data: [], error: null }, // prior roster
        { data: { id: 'game-cup' }, error: null }, // games.update
        {
          data: Array.from({ length: 4 }, (_, i) => ({ user_id: `u${i}` })),
          error: null,
        }, // insert (all 4 new)
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-cup', fullGreensomeFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/game-cup?status=updated');

    const gameUpdate = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'update',
    );
    expect(
      (gameUpdate?.args[0] as { mode_config: unknown }).mode_config,
    ).toEqual({
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100,
      team_strokes_override: { team1: 8, team2: 3 },
    });
  });
});

describe('backfill invite-notify (#182) — edit-flyten', () => {
  it('diff-add: notify fyres kun for nye spillere, ikke for eksisterende', async () => {
    // Eksisterende roster har u0, u1, u2, u3. Edit-en sender u0-u7 — så
    // u4, u5, u6, u7 er nye og skal varsles. u0-u3 var med fra før og
    // skal IKKE få ny notifikasjon (de ble varslet ved første add).
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        },
        // game_players.select (prior roster) — u0..u3 var med fra før
        { data: [0, 1, 2, 3].map((i) => storedBestBallRow(i)), error: null },
        { data: { id: 'game-diff' }, error: null }, // games.update
        {
          data: [4, 5, 6, 7].map((i) => ({ user_id: `u${i}` })),
          error: null,
        }, // insert (u4..u7)
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-diff', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(4);
    const calledIds = notifyInvitedToGameMock.mock.calls.map(
      (c) => (c[0] as { recipientUserId: string }).recipientUserId,
    );
    expect(calledIds.sort()).toEqual(['u4', 'u5', 'u6', 'u7']);
    // #2445: a scheduled game notifies only the new rows, never the roster.
    expect(notifyRosterInvitesMock).not.toHaveBeenCalled();
  });

  it('roster uendret: ingen notify fyres', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        },
        // prior roster identisk med payload → ingen skriving på game_players
        {
          data: Array.from({ length: 8 }, (_, i) => storedBestBallRow(i)),
          error: null,
        },
        { data: { id: 'game-same' }, error: null }, // games.update
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-same', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('skipper inviter-self når admin legger seg selv til som ny spiller', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        },
        // prior roster: u1..u7, admin-1 er ny i diff-en
        {
          data: Array.from({ length: 7 }, (_, i) => storedBestBallRow(i + 1)),
          error: null,
        },
        { data: { id: 'game-self' }, error: null }, // games.update
        { data: [{ user_id: 'admin-1' }], error: null }, // insert (admin-1)
      ],
    );
    signIn('admin-1', 'admin@tornygolf.no');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction(
        'game-self',
        fullBestBallFormData({ player_0_id: 'admin-1' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });
});

describe('invite-notify når et utkast publiseres (#2445)', () => {
  // A draft notified nobody when it was saved, so publishing sends the whole
  // roster its notice once — including the players who stood on the draft.
  function draftFixture(extra: { data: unknown; error: unknown }[] = []) {
    return buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      { data: { status: 'draft', game_mode: 'best_ball', tournament_id: null }, error: null },
      { data: [0, 1, 2, 3].map((i) => storedBestBallRow(i)), error: null }, // prior roster
      { data: { id: 'game-1' }, error: null }, // games.update
      ...extra,
    ]);
  }
  const insertU4toU7 = {
    data: [4, 5, 6, 7].map((i) => ({ user_id: `u${i}` })),
    error: null,
  };

  it('publish kaller notifyRosterInvites én gang, og notifyInvitedToGame aldri', async () => {
    supabaseMock = draftFixture([insertU4toU7]);
    signIn('admin-1');

    const { publishFromDraftAction } = await import('./actions');
    await expect(
      publishFromDraftAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyRosterInvitesMock).toHaveBeenCalledTimes(1);
    expect(notifyRosterInvitesMock).toHaveBeenCalledWith({
      gameId: 'game-1',
      inviterUserId: 'admin-1',
    });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe('/admin/games/game-1?status=scheduled');
  });

  it('save_draft med nye spillere varsler ingen', async () => {
    supabaseMock = draftFixture([insertU4toU7]);
    signIn('admin-1');

    const { saveDraftAction } = await import('./actions');
    await expect(
      saveDraftAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'game_players' && c.method === 'insert',
      ),
    ).toBe(true);
    expect(notifyRosterInvitesMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe('/admin/games/game-1?status=updated');
  });

  it('publish der rosterskrivingen feiler: varslene går likevel, så db_players', async () => {
    // games.update (draft → scheduled) has committed. The next save runs as
    // update_scheduled and notifies only its own inserts, so this is the
    // last chance for the draft's players to hear about the game.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = draftFixture([
      { data: null, error: { message: 'insert boom' } }, // insert u4..u7 FAILS
      { data: null, error: null }, // compensation delete
    ]);
    signIn('admin-1');

    const { publishFromDraftAction } = await import('./actions');
    await expect(
      publishFromDraftAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyRosterInvitesMock).toHaveBeenCalledTimes(1);
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe('/admin/games/game-1/edit?error=db_players&step=5');
    consoleError.mockRestore();
  });

  it('notifyRosterInvites som kaster stopper ikke publiseringen', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyRosterInvitesMock.mockRejectedValueOnce(new Error('boom'));
    supabaseMock = draftFixture([insertU4toU7]);
    signIn('admin-1');

    const { publishFromDraftAction } = await import('./actions');
    await expect(
      publishFromDraftAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyRosterInvitesMock).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[updateGameInternal] roster invites failed',
      expect.objectContaining({ gameId: 'game-1' }),
    );
    expect(lastRedirect()).toBe('/admin/games/game-1?status=scheduled');
    consoleError.mockRestore();
  });
});

describe('saveDraftAction — mode-lock', () => {
  it('tillater mode-bytte når spillet fortsatt er draft', async () => {
    // Drafts er fortsatt under bygging — admin må fritt kunne veksle modus
    // før spillet publiseres. Mode-lock-guarden skal kun aktiveres når
    // status !== 'draft'. save_draft kjører ingen pending-gate (ingen RPC).
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      { data: { status: 'draft', game_mode: 'best_ball' }, error: null }, // games.select
      { data: [], error: null }, // game_players.select (prior roster)
      { data: { id: 'draft-1' }, error: null }, // games.update
      // Ingen skriving på game_players: tomt roster før og etter.
    ]);
    signIn('admin-1');

    const { saveDraftAction } = await import('./actions');

    await expect(
      saveDraftAction(
        'draft-1',
        fd({
          name: 'Switched mid-draft',
          side_tournament_enabled: 'false',
          game_mode: 'stableford',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/draft-1?status=updated');
  });
});

describe('requireAdminOrCreator gate (#428) — creator-flaten', () => {
  it('oppretter (ikke-admin, eier spillet) lander på /games/[id] etter update_scheduled', async () => {
    // loadRole gir is_admin:false → requireAdminOrCreator leser games.created_by
    // og matcher userId. Writes går på request-scoped klient (creator-RLS 0071),
    // og redirect-basen forgrenes til /games/* i stedet for /admin/games/*.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // loadRole: not admin
        { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        }, // mode-lock
        { data: [], error: null }, // prior roster
        { data: { id: 'game-1' }, error: null }, // games.update
        {
          data: Array.from({ length: 8 }, (_, i) => ({ user_id: `u${i}` })),
          error: null,
        }, // insert (all 8 new)
      ],
    );
    signIn('creator-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?status=updated');
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
  });

  it('oppretter publiserer med en spiller uten fullført profil (#2441)', async () => {
    // The fixture would answer u1 as pending if anything asked: publish must
    // not ask. The start gate is where a missing profile stops the round.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // loadRole
        { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
        { data: { status: 'draft', game_mode: 'best_ball' }, error: null }, // mode-lock
        { data: [], error: null }, // prior roster
        { data: { id: 'game-1' }, error: null }, // games.update
        {
          data: Array.from({ length: 8 }, (_, i) => ({ user_id: `u${i}` })),
          error: null,
        }, // insert (all 8 new)
      ],
      { incomplete_profile_ids: [{ id: 'u1' }] },
    );
    signIn('creator-1');

    const { publishFromDraftAction } = await import('./actions');
    await expect(
      publishFromDraftAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?status=scheduled');
    expect(supabaseMock.__rpcCalls.map((c) => c.name)).not.toContain('incomplete_profile_ids');
  });

  it('admin publiserer med spillere uten fullført profil: ingen pending= eller error= (#2441)', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        { data: { status: 'draft', game_mode: 'best_ball' }, error: null }, // mode-lock
        { data: [], error: null }, // prior roster
        { data: { id: 'game-1' }, error: null }, // games.update
        {
          data: Array.from({ length: 8 }, (_, i) => ({ user_id: `u${i}` })),
          error: null,
        }, // insert (all 8 new)
      ],
      { incomplete_profile_ids: [{ id: 'u1' }, { id: 'u2' }] },
    );
    signIn('admin-1');

    const { publishFromDraftAction } = await import('./actions');
    await expect(
      publishFromDraftAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/game-1?status=scheduled');
    expect(lastRedirect()).not.toMatch(/pending=|error=/);
    expect(supabaseMock.__rpcCalls.map((c) => c.name)).not.toContain('incomplete_profile_ids');
  });

  it('update_scheduled med en spiller uten fullført profil lagres (#2441)', async () => {
    // A game published with a pending friend must stay editable: moving the
    // tee-off cannot wait for the friend's profile.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // loadRole
        { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
        { data: { status: 'scheduled', game_mode: 'best_ball' }, error: null }, // mode-lock
        { data: Array.from({ length: 8 }, (_, i) => storedBestBallRow(i)), error: null }, // prior roster
        { data: { id: 'game-1' }, error: null }, // games.update
      ],
      { incomplete_profile_ids: [{ id: 'u1' }] },
    );
    signIn('creator-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?status=updated');
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'games' && c.method === 'update'),
    ).toBe(true);
    expect(supabaseMock.__rpcCalls.map((c) => c.name)).not.toContain('incomplete_profile_ids');
  });

  it('ikke-eier ikke-admin → redirect /', async () => {
    // requireAdminOrCreator: loadRole gir is_admin:false, og games.created_by
    // matcher ikke userId → redirect('/'). Ingen skriv.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // loadRole
      { data: { created_by: 'someone-else' }, error: null }, // gate owner-check ✗
    ]);
    signIn('creator-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/');
    const writeMethods = supabaseMock.__fromCalls.filter((c) =>
      ['update', 'insert', 'delete'].includes(c.method),
    );
    expect(writeMethods).toHaveLength(0);
  });
});

describe('updateScheduledAction — roster-kompensasjon (#907 → #2210)', () => {
  // games.update has committed. A roster write then fails: the rows this save
  // tried to write must be put back to their snapshot (trap 5), so the roster
  // is never left half-written.
  //
  // Prior: u0 (lag 1) and u1 on lag 2 with a ladies tee. The form moves u1 to
  // lag 1 (one update) and adds u2..u7 (inserts). The insert fails.
  const priorRows = [
    storedBestBallRow(0),
    storedBestBallRow(1, {
      team_number: 2,
      flight_number: 1,
      tee_gender: 'ladies',
      paid_at: '2026-09-02T10:00:00Z',
    }),
  ];

  it('en feilet spillerskriving gir før-tilstanden tilbake og redirect db_players', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        { data: { status: 'scheduled', game_mode: 'best_ball' }, error: null }, // existing
        { data: priorRows, error: null }, // prior roster
        { data: { id: 'game-1' }, error: null }, // games.update
        { data: [{ user_id: 'u1' }], error: null }, // update u1 (ok)
        { data: null, error: { message: 'insert boom' } }, // insert u2..u7 FAILS
        { data: null, error: null }, // compensation delete (ok)
        { data: null, error: null }, // compensation re-insert (ok)
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    const deletes = supabaseMock.__fromCalls.filter(
      (c) => c.table === 'game_players' && c.method === 'delete',
    );
    expect(deletes).toHaveLength(1);
    // The compensation deletes exactly the rows this save tried to write…
    const deleteIn = supabaseMock.__fromCalls.find(
      (c) => c.method === 'in' && c.table === 'game_players',
    );
    expect(deleteIn?.args).toEqual([
      'user_id',
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'],
    ]);
    // …and puts back the snapshot of the one that existed (every column).
    const inserts = supabaseMock.__fromCalls.filter(
      (c) => c.table === 'game_players' && c.method === 'insert',
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[1]!.args[0]).toEqual([priorRows[1]]);
    expect(lastRedirect()).toBe('/admin/games/game-1/edit?error=db_players');
    // Notify never fires — the failure path redirects before it.
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('kompensasjon som også feiler logges, og redirecten er fortsatt db_players', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        { data: { status: 'scheduled', game_mode: 'best_ball' }, error: null }, // existing
        { data: priorRows, error: null }, // prior roster
        { data: { id: 'game-1' }, error: null }, // games.update
        { data: [{ user_id: 'u1' }], error: null }, // update u1 (ok)
        { data: null, error: { message: 'insert boom' } }, // insert FAILS
        { data: null, error: null }, // compensation delete (ok)
        { data: null, error: { message: 'rollback boom' } }, // re-insert FAILS too
      ],
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(consoleError).toHaveBeenCalledWith(
      '[updateGameInternal] roster rollback failed',
      { message: 'rollback boom' },
    );
    expect(lastRedirect()).toBe('/admin/games/game-1/edit?error=db_players');
    consoleError.mockRestore();
  });
});

/**
 * #2210: the roster is saved as a diff. A save that only moves the tee-off
 * writes nothing on game_players, so paid/accepted/withdrawn/signup survive —
 * and a non-admin organiser cannot change who plays in a cup match here.
 */
describe('updateGameInternal — lagrer bare endringene i rosteret (#2210)', () => {
  const BEST_BALL_IDS = Array.from({ length: 8 }, (_, i) => `u${i}`);

  function rosterWrites() {
    return supabaseMock.__fromCalls.filter(
      (c) =>
        c.table === 'game_players' &&
        ['update', 'insert', 'delete', 'upsert'].includes(c.method),
    );
  }

  it('ny tee-off på et planlagt spill gjør ingen delete eller insert på game_players', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        {
          data: { status: 'scheduled', game_mode: 'best_ball', tournament_id: null },
          error: null,
        }, // existing
        { data: BEST_BALL_IDS.map((_, i) => storedBestBallRow(i)), error: null }, // prior roster
        { data: { id: 'game-1' }, error: null }, // games.update
      ],
    );
    signIn('admin-1');

    const form = fullBestBallFormData();
    form.set('roster_loaded_ids', BEST_BALL_IDS.join(','));

    const { updateScheduledAction } = await import('./actions');
    await expect(updateScheduledAction('game-1', form)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/admin/games/game-1?status=updated');
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'update',
      ),
    ).toBe(true);
    expect(rosterWrites()).toEqual([]);
  });

  it('arrangør (ikke admin) som fjerner en spiller i en cupkamp får cup_roster_locked før games.update', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // loadRole
        { data: { created_by: 'creator-1' }, error: null }, // gate owner-check
        {
          data: { status: 'scheduled', game_mode: 'best_ball', tournament_id: 'cup-1' },
          error: null,
        }, // existing
        { data: BEST_BALL_IDS.map((_, i) => storedBestBallRow(i)), error: null }, // prior roster
      ],
    );
    signIn('creator-1');

    // The organiser dropped team 4 (u6 + u7) from the form.
    const form = fullBestBallFormData();
    for (const i of [6, 7]) {
      form.delete(`player_${i}_id`);
      form.delete(`player_${i}_team`);
      form.delete(`player_${i}_flight`);
    }
    form.set('roster_loaded_ids', BEST_BALL_IDS.join(','));

    const { updateScheduledAction } = await import('./actions');
    await expect(updateScheduledAction('game-1', form)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/games/game-1/rediger?error=cup_roster_locked');
    expect(
      supabaseMock.__fromCalls.filter((c) =>
        ['update', 'insert', 'delete'].includes(c.method),
      ),
    ).toEqual([]);
  });

  it('arrangør (ikke admin) som bare flytter tee-off på en planlagt cupsingles lagrer uten å røre rosteret', async () => {
    // The cup draw put both sides in flight 1; the singles validator sends
    // flight = side (1 and 2). The stored flight must stand.
    const priorRows = [
      { ...storedBestBallRow(0), team_number: 1, flight_number: 1 },
      { ...storedBestBallRow(1), team_number: 2, flight_number: 1 },
    ];
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // loadRole
        { data: { created_by: 'creator-1' }, error: null }, // gate owner-check
        {
          data: {
            status: 'scheduled',
            game_mode: 'singles_matchplay',
            tournament_id: 'cup-1',
          },
          error: null,
        }, // existing
        { data: priorRows, error: null }, // prior roster
        { data: { id: 'game-1' }, error: null }, // games.update
      ],
    );
    signIn('creator-1');

    const form = fd({
      name: 'Cup: runde 1',
      course_id: 'course-1',
      tee_box_id: 'tee-1',
      hcp_allowance_pct: '100',
      scheduled_tee_off_at: FUTURE_TEE_OFF,
      side_tournament_enabled: 'false',
      game_mode: 'singles_matchplay',
      player_0_id: 'u0',
      player_0_team: '1',
      player_0_flight: '1',
      player_1_id: 'u1',
      player_1_team: '2',
      player_1_flight: '2',
      roster_loaded_ids: 'u0,u1',
    });

    const { updateScheduledAction } = await import('./actions');
    await expect(updateScheduledAction('game-1', form)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/games/game-1?status=updated');
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'update',
      ),
    ).toBe(true);
    expect(rosterWrites()).toEqual([]);
  });
});

describe('e-mail invitations when a draft is published (#2321)', () => {
  it('publish sends them once with the game id and the request client; a failure adds invites_failed; a draft save sends none', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true, name: 'Ola' }, error: null }, // loadRole
        { data: { status: 'draft', game_mode: 'best_ball', tournament_id: null }, error: null },
        // prior roster identical to the payload → no game_players writes
        { data: Array.from({ length: 8 }, (_, i) => storedBestBallRow(i)), error: null },
        { data: { id: 'game-inv' }, error: null }, // games.update
      ],
    );
    signIn('admin-1');
    sendPublishInvitesMock.mockResolvedValueOnce({ failed: 2 });
    // The service client is a different object here, so handing it on by
    // mistake fails the client/viewer asserts below.
    adminClientOverride = buildSupabaseMock([]);

    const { publishFromDraftAction, saveDraftAction } = await import('./actions');
    const publishData = fullBestBallFormData();
    publishData.append('invite_email', 'a@example.com');

    await expect(publishFromDraftAction('game-inv', publishData)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(sendPublishInvitesMock).toHaveBeenCalledTimes(1);
    const [call] = sendPublishInvitesMock.mock.calls[0] as [Record<string, unknown>];
    expect(call).toMatchObject({
      gameId: 'game-inv',
      inviterUserId: 'admin-1',
      isAdmin: true,
      emails: ['a@example.com'],
    });
    expect(call.client).toBe(supabaseMock);
    expect(call.viewer).toBe(supabaseMock);
    expect(call.client).not.toBe(adminClientOverride);
    expect(lastRedirect()).toBe('/admin/games/game-inv?status=scheduled&error=invites_failed');
    adminClientOverride = null;

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Ola' }, error: null },
      { data: { status: 'draft', game_mode: 'best_ball', tournament_id: null }, error: null },
      { data: [], error: null },
      { data: { id: 'draft-inv' }, error: null },
    ]);
    signIn('admin-1');
    sendPublishInvitesMock.mockClear();
    const draftData = fd({ name: 'Utkast', side_tournament_enabled: 'false', game_mode: 'best_ball' });
    draftData.append('invite_email', 'a@example.com');

    await expect(saveDraftAction('draft-inv', draftData)).rejects.toBeInstanceOf(RedirectError);
    expect(sendPublishInvitesMock).not.toHaveBeenCalled();
  });
});

describe('klubb-turnering uten spillere (#2433)', () => {
  // A club tournament (group_id, no cup) with individual signup saves with an
  // empty roster: the members sign up themselves. The club signal is the
  // stored group_id read in the same call, never a form field.
  function clubFormData(overrides: Record<string, string> = {}): FormData {
    return fd({
      name: 'Klubbmesterskap',
      course_id: 'course-1',
      tee_box_id: 'tee-1',
      hcp_allowance_pct: '100',
      scheduled_tee_off_at: FUTURE_TEE_OFF,
      side_tournament_enabled: 'false',
      game_mode: 'stableford',
      registration_mode: 'invite_only',
      registration_type: 'solo',
      ...overrides,
    });
  }
  function existingRow(status: 'draft' | 'scheduled', extra: Record<string, unknown> = {}) {
    return {
      data: {
        status,
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
        tournament_id: null,
        group_id: 'club-1',
        ...extra,
      },
      error: null,
    };
  }
  function gamesUpdate() {
    return supabaseMock.__fromCalls.find((c) => c.table === 'games' && c.method === 'update');
  }

  it('updateScheduledAction med klubb og 0 spillere lagrer', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      existingRow('scheduled'),
      { data: [], error: null }, // prior roster
      { data: { id: 'game-1' }, error: null }, // games.update
    ]);
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(updateScheduledAction('game-1', clubFormData())).rejects.toBeInstanceOf(RedirectError);

    expect(gamesUpdate()).toBeDefined();
    expect(lastRedirect()).toBe('/admin/games/game-1?status=updated');
  });

  it('publishFromDraftAction med klubb og 0 spillere publiserer og varsler lista én gang', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      existingRow('draft'),
      { data: [], error: null }, // prior roster
      { data: { id: 'game-1' }, error: null }, // games.update
    ]);
    signIn('admin-1');

    const { publishFromDraftAction } = await import('./actions');
    await expect(publishFromDraftAction('game-1', clubFormData())).rejects.toBeInstanceOf(RedirectError);

    expect((gamesUpdate()!.args[0] as { status: string }).status).toBe('scheduled');
    expect(notifyRosterInvitesMock).toHaveBeenCalledTimes(1);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=scheduled');
  });

  it('uten klubb krever invite_only fortsatt spillere', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      existingRow('scheduled', { group_id: null }),
    ]);
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(updateScheduledAction('game-1', clubFormData())).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/game-1/edit?error=min_players_for_mode');
    expect(gamesUpdate()).toBeUndefined();
  });

  it('en match i en klubb-cup (group_id og tournament_id) krever full liste, også for admin', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      existingRow('scheduled', {
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2, allowance_pct: 100 },
        tournament_id: 'cup-1',
      }),
    ]);
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction(
        'game-1',
        clubFormData({ game_mode: 'singles_matchplay', player_0_id: 'u0', player_0_team: '1' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/game-1/edit?error=min_players_for_mode');
    expect(gamesUpdate()).toBeUndefined();
  });
});
