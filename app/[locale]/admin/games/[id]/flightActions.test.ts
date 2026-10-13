import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import {
  FLIGHT_PLAYER_SELECT,
  FLIGHT_PLAYER_ORDER,
} from './flightPlayerColumns';

/**
 * Unit-tester for flightActions (#543).
 *
 * Dekker tre actions:
 *   - suggestFlightAssignment: authz-reject, happy-path (foreslår og skriver),
 *     compensation when a write fails midway (#2289)
 *   - setPlayerFlight: kapasitets-reject (flight_full), happy-path, the
 *     after-count guard (#2289)
 *   - toggleSignupsClosed: happy-path (steng + gjenåpne), lands on the signups
 *     page (#2288)
 *
 * The two flight actions answer on the Startlista page (#2289); the team
 * actions still answer on the game page.
 *
 * Spørsmålsrekkefølge per action (serverMock → adminMock FIFO):
 *
 * suggestFlightAssignment:
 *   serverMock[0]: auth.getUser
 *   serverMock[1]: users.select(is_admin, email, name).eq.single        (loadRole)
 *   serverMock[2]: games.select(created_by).eq.maybeSingle              (creator-sjekk)
 *   adminMock[0]:  games.select(id, status, game_mode, mode_config).eq.maybeSingle
 *   adminMock[1]:  game_players.select(...).eq.order.order.returns
 *   adminMock[2…]: game_players.update({flight_number}).eq.eq.select (én per aktiv spiller)
 *   then, if a write failed: game_players.update(previous).eq.eq.select per
 *   row already written (compensation, #2289)
 *
 * setPlayerFlight:
 *   serverMock[0..2]: samme som over
 *   adminMock[0]: games.select(id, status, game_mode, mode_config).eq.maybeSingle
 *   adminMock[1]: game_players.select(...).eq.order.order.returns  (vakta, #2290)
 *   adminMock[2]: game_players.select({count}).eq.eq.neq.is    (kapasitetssjekk)
 *   adminMock[3]: game_players.update({flight_number}).eq.eq.select
 *   adminMock[4]: game_players.select({count}).eq.eq.is        (after-count, #2289)
 *   adminMock[5]: game_players.update({flight_number: previous}).eq.eq.select (revert)
 *
 * toggleSignupsClosed (admin):
 *   serverMock[0..1]: auth.getUser + users (isAdmin=true → ingen creator-sjekk)
 *   adminMock[0]: games.select(id, status, registration_mode, group_id).eq.maybeSingle
 *   adminMock[1]: games.update({signups_closed_at}).eq.select
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(arg),
}));
// lib/admin/auth.ts (shared auth gate, out of i18n scope) still redirects via
// next/navigation — route it to the same spy so auth-gate assertions hold.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const GAME_ID = 'game-1111-1111-1111-111111111111';
const USER_ID = 'user-2222-2222-2222-222222222222';
/** Where the flight actions answer (#2289). */
const STARTLISTA = `/admin/games/${GAME_ID}/startlista`;

/** Sett opp serverMock: autentisert admin-bruker (ingen creator-sjekk). */
function authedAdmin(): void {
  serverMock = buildSupabaseMock([
    { data: { is_admin: true, email: 'admin@example.com', name: 'Admin' }, error: null },
  ]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID, email: 'admin@example.com' } },
  });
}

/** Sett opp serverMock: uautentisert. */
function unauthed(): void {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: null },
  });
}

/** Sett opp serverMock: autentisert, men ikke admin og ikke game-creator. */
function authedNonCreator(): void {
  serverMock = buildSupabaseMock([
    { data: { is_admin: false, email: 'player@example.com', name: 'Spiller' }, error: null },
    { data: { created_by: 'someone-else' }, error: null },
  ]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID, email: 'player@example.com' } },
  });
}

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (!arg) return undefined;
  return typeof arg === 'string' ? arg : arg.href;
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock = buildSupabaseMock([]);
  adminMock = buildSupabaseMock([]);
});

/** Planlagt Texas scramble med fire per lag (#2290). */
const TEXAS_GAME = {
  id: GAME_ID,
  status: 'scheduled',
  game_mode: 'texas_scramble',
  mode_config: { kind: 'texas_scramble', team_size: 4 },
};

/** Tre lag à fire, flight = lag, i påmeldingsrekkefølge. */
function texasRoster() {
  return Array.from({ length: 12 }, (_, i) => ({
    user_id: `u${i + 1}`,
    team_number: Math.floor(i / 4) + 1,
    flight_number: Math.floor(i / 4) + 1,
    withdrawn_at: null,
    accepted_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }));
}

/** Planlagt solo-stableford (team_size 1). */
const SOLO_STABLEFORD_GAME = {
  id: GAME_ID,
  status: 'scheduled',
  game_mode: 'stableford',
  mode_config: { kind: 'stableford', team_size: 1 },
};

/** Åtte solo-spillere uten flight. */
function soloRoster() {
  return Array.from({ length: 8 }, (_, i) => ({
    user_id: i === 0 ? 'target-user' : `u${i + 1}`,
    flight_number: null,
    withdrawn_at: null,
    accepted_at: `2026-01-0${i + 1}T00:00:00Z`,
  }));
}

// ─── suggestFlightAssignment ────────────────────────────────────────────────

describe('suggestFlightAssignment', () => {
  it('uautentisert → redirect til /login', async () => {
    unauthed();

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/login');
  });

  it('ikke-admin og ikke-oppretter → redirect til /', async () => {
    authedNonCreator();

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('happy path: admin foreslår inndeling → skriver flight_number per spiller og redirect til ?status=flight_suggested', async () => {
    authedAdmin();

    // 5 aktive spillere: 4 → flight 1, 1 → flight 2
    const players = Array.from({ length: 5 }, (_, i) => ({
      user_id: `u${i + 1}`,
      flight_number: null,
      withdrawn_at: null,
      accepted_at: `2026-01-0${i + 1}T00:00:00Z`,
    }));

    adminMock = buildSupabaseMock([
      { data: { id: GAME_ID, status: 'scheduled', game_mode: 'skins' }, error: null }, // games
      { data: players, error: null }, // game_players
      { data: [{ user_id: 'u1' }], error: null }, // update u1
      { data: [{ user_id: 'u2' }], error: null }, // update u2
      { data: [{ user_id: 'u3' }], error: null }, // update u3
      { data: [{ user_id: 'u4' }], error: null }, // update u4
      { data: [{ user_id: 'u5' }], error: null }, // update u5
    ]);

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${STARTLISTA}?status=flight_suggested`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  // Writes before the failing one are already saved, so they are written
  // back (#2289), and the cache is expired before the error redirect: a page
  // view between the partial write and the write-back may have cached the
  // half-done split.
  it.each([
    { failingWrite: 1, cacheExpired: false },
    { failingWrite: 2, cacheExpired: true },
  ])('0-rad-skriving nr. $failingWrite rapporteres som feil, cache tømt: $cacheExpired (#2293)', async ({ failingWrite, cacheExpired }) => {
    authedAdmin();

    const players = Array.from({ length: 5 }, (_, i) => ({
      user_id: `u${i + 1}`,
      flight_number: i === 0 ? 3 : null,
      withdrawn_at: null,
      accepted_at: `2026-01-0${i + 1}T00:00:00Z`,
    }));

    adminMock = buildSupabaseMock([
      { data: { id: GAME_ID, status: 'scheduled', game_mode: 'skins' }, error: null },
      { data: players, error: null },
      ...(failingWrite === 2 ? [{ data: [{ user_id: 'u1' }], error: null }] : []),
      { data: [], error: null }, // this update hits 0 rows
      ...(failingWrite === 2 ? [{ data: [{ user_id: 'u1' }], error: null }] : []), // write-back of u1
    ]);

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${STARTLISTA}?error=db_players`);
    expect(revalidateTagMock.mock.calls.length > 0).toBe(cacheExpired);
    // u1 goes back to the flight it had before the split; nothing to undo
    // when the first write failed.
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update').map((c) => c.args[0]);
    expect(updates).toEqual(
      failingWrite === 2
        ? [{ flight_number: 1 }, { flight_number: 1 }, { flight_number: 3 }]
        : [{ flight_number: 1 }],
    );
  });

  it('tilbakeskrivingen feiler også → svaret er fortsatt db_players, og cachen er tømt (#2289)', async () => {
    authedAdmin();

    const players = Array.from({ length: 5 }, (_, i) => ({
      user_id: `u${i + 1}`,
      flight_number: null,
      withdrawn_at: null,
      accepted_at: `2026-01-0${i + 1}T00:00:00Z`,
    }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    adminMock = buildSupabaseMock([
      { data: { id: GAME_ID, status: 'scheduled', game_mode: 'skins' }, error: null },
      { data: players, error: null },
      { data: [{ user_id: 'u1' }], error: null },
      { data: [], error: null }, // u2 hits 0 rows
      { data: null, error: { message: 'boom' } }, // write-back of u1 fails
    ]);

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${STARTLISTA}?error=db_players`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    expect(errorSpy).toHaveBeenCalledWith('[suggestFlightAssignment] revert failed', expect.anything());
    errorSpy.mockRestore();
  });

  it('Texas med tre lag à fire → ingen ny inndeling, redirect til detaljsiden (#2290)', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: TEXAS_GAME, error: null },
      { data: texasRoster(), error: null },
    ]);

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    // The Startlista page sends a game without a Startlista on to the game.
    expect(lastRedirect()).toBe(STARTLISTA);
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
  });
});

// ─── kolonne-lockstep mot game_players (#1685) ───────────────────────────────

/**
 * #1669 sorterte på `created_at` — en kolonne `game_players` ikke har — og
 * «Foreslå inndeling» feilet med 42703 i prod. Stubben over godtar enhver
 * streng, så testene var grønne hele veien. Kolonnenavnene bor nå i
 * `flightPlayerColumns.ts` og er typesjekket mot `Database`-raden (tsc er
 * første gate). Denne testen er den andre: den binder spørringen til
 * konstantene, så en framtidig litteral rett i `.select()`/`.order()` blir rød
 * i vitest og ikke bare når noen husker å se på typene. Samme lockstep-mønster
 * som `lib/loops/prCard.test.ts:158-169`.
 */
describe('fetchFlightPlayers — kolonne-lockstep', () => {
  it('leser og sorterer kun kolonner som finnes på game_players', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: { id: GAME_ID, status: 'scheduled', game_mode: 'skins' }, error: null },
      { data: [], error: null }, // game_players — tomt roster holder for å fange argumentene
    ]);

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);

    const playerRead = adminMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'select',
    );
    expect(playerRead?.args[0]).toBe(FLIGHT_PLAYER_SELECT.join(', '));

    const orderCols = adminMock.__fromCalls
      .filter((c) => c.table === 'game_players' && c.method === 'order')
      .map((c) => c.args[0]);
    expect(orderCols.length).toBeGreaterThan(0);
    for (const col of orderCols) {
      expect(FLIGHT_PLAYER_ORDER).toContain(col);
    }
  });
});

// ─── setPlayerFlight ─────────────────────────────────────────────────────────

describe('setPlayerFlight', () => {
  it('kapasitetsgrense nådd (4 i target-flight) → redirect til ?error=flight_full', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: SOLO_STABLEFORD_GAME, error: null }, // games
      { data: soloRoster(), error: null }, // game_players (vakta)
      { data: null, error: null, count: 4 } as { data: null; error: null; count: number }, // count = 4 (full)
    ]);

    const { setPlayerFlight } = await import('./flightActions');
    await expect(setPlayerFlight(GAME_ID, 'target-user', 1)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${STARTLISTA}?error=flight_full`);
  });

  it('happy path: admin setter spiller til ny flight → redirect til ?status=flight_updated&flight=2', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: SOLO_STABLEFORD_GAME, error: null }, // games
      { data: soloRoster(), error: null }, // game_players (vakta)
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number }, // count = 2 (har plass)
      { data: [{ user_id: 'target-user' }], error: null }, // update
      { data: null, error: null, count: 3 } as { data: null; error: null; count: number }, // after-count = 3
    ]);

    const { setPlayerFlight } = await import('./flightActions');
    await expect(setPlayerFlight(GAME_ID, 'target-user', 2)).rejects.toBeInstanceOf(RedirectError);
    // The flight in the URL lets the page put focus on it (#2289).
    expect(lastRedirect()).toBe(`${STARTLISTA}?status=flight_updated&flight=2`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates.map((c) => c.args[0])).toEqual([{ flight_number: 2 }]);
  });

  // Two organisers moving into a flight of three at the same time both pass
  // the count before the write. The count after it catches the loser (#2289).
  it.each([
    { name: 'flighten ble overfull', afterCount: { data: null, error: null, count: 5 }, error: 'flight_full' },
    { name: 'etter-tellingen feilet', afterCount: { data: null, error: { message: 'boom' }, count: null }, error: 'db_roster' },
  ])('$name → forrige flight skrives tilbake, cachen er tømt, ?error=$error', async ({ afterCount, error }) => {
    authedAdmin();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const roster = soloRoster().map((p) => (p.user_id === 'target-user' ? { ...p, flight_number: 1 } : p));

    adminMock = buildSupabaseMock([
      { data: SOLO_STABLEFORD_GAME, error: null }, // games
      { data: roster, error: null }, // game_players (vakta)
      { data: null, error: null, count: 3 } as { data: null; error: null; count: number }, // before-count = 3
      { data: [{ user_id: 'target-user' }], error: null }, // update
      afterCount as { data: null; error: null; count: number },
      { data: [{ user_id: 'target-user' }], error: null }, // revert
    ]);

    const { setPlayerFlight } = await import('./flightActions');
    await expect(setPlayerFlight(GAME_ID, 'target-user', 2)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${STARTLISTA}?error=${error}`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates.map((c) => c.args[0])).toEqual([{ flight_number: 2 }, { flight_number: 1 }]);
    errorSpy.mockRestore();
  });

  it('spilleren er ikke i spillet → ?error=player_missing, ingen skriving', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: SOLO_STABLEFORD_GAME, error: null },
      { data: soloRoster(), error: null },
    ]);

    const { setPlayerFlight } = await import('./flightActions');
    await expect(setPlayerFlight(GAME_ID, 'finnes-ikke', 2)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${STARTLISTA}?error=player_missing`);
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
  });

  it('0-rad-skriving rapporteres som feil, ikke suksess (#2293)', async () => {
    // The player was removed in another tab: the row is gone and the UPDATE
    // matches nothing. PostgREST answers that with error null.
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: SOLO_STABLEFORD_GAME, error: null }, // games
      { data: soloRoster(), error: null }, // game_players (vakta)
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number },
      { data: [], error: null }, // update traff 0 rader
    ]);

    const { setPlayerFlight } = await import('./flightActions');
    await expect(setPlayerFlight(GAME_ID, 'target-user', 2)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${STARTLISTA}?error=db_players`);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('Texas med tre lag à fire → ingen skriving, redirect til detaljsiden (#2290)', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: TEXAS_GAME, error: null },
      { data: texasRoster(), error: null },
    ]);

    const { setPlayerFlight } = await import('./flightActions');
    await expect(setPlayerFlight(GAME_ID, 'u1', 2)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(STARTLISTA);
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
  });
});

// ─── suggestTeamAssignment (#1669) ───────────────────────────────────────────

/**
 * Kø-rekkefølge for lag-actionene:
 *
 * suggestTeamAssignment:
 *   adminMock[0]:  games.select(id, status, game_mode, mode_config).eq.maybeSingle
 *   adminMock[1]:  game_players.select(...).eq.order.order.returns
 *   adminMock[2…]: game_players.update({team_number, flight_number}).eq.eq.select
 *   then, if a write failed: the write-back per row already written (#2289)
 *
 * setPlayerTeam:
 *   adminMock[0]: games.select(id, status, game_mode, mode_config).eq.maybeSingle
 *   adminMock[1]: game_players.select(...).eq.order.order.returns  (hele rosteret, #2290)
 *   adminMock[2]: game_players.select({count}).eq.eq.neq.is  (kapasitetssjekk)
 *   adminMock[3]: game_players.update({...}).eq.eq.select
 *   adminMock[4]: game_players.select({count}).eq.eq.is      (after-count, #2289)
 *   adminMock[5]: game_players.update(previous).eq.eq.select (revert)
 */
const BEST_BALL_GAME = {
  id: GAME_ID,
  status: 'scheduled',
  game_mode: 'best_ball',
  mode_config: { kind: 'best_ball', team_size: 2 },
};

/** En rad slik `fetchTeamPlayers` leser den. */
function teamRow(user_id: string, team_number: number | null, flight_number: number | null) {
  return { user_id, team_number, flight_number, withdrawn_at: null };
}

describe('suggestTeamAssignment', () => {
  it('uautentisert → redirect til /login', async () => {
    unauthed();

    const { suggestTeamAssignment } = await import('./flightActions');
    await expect(suggestTeamAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/login');
  });

  it('ikke-admin og ikke-oppretter → redirect til /', async () => {
    authedNonCreator();

    const { suggestTeamAssignment } = await import('./flightActions');
    await expect(suggestTeamAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('happy path: fire uten lag → to lag skrives, redirect til ?status=team_suggested', async () => {
    authedAdmin();

    const players = Array.from({ length: 4 }, (_, i) => ({
      user_id: `u${i + 1}`,
      team_number: null,
      flight_number: null,
      withdrawn_at: null,
    }));

    adminMock = buildSupabaseMock([
      { data: BEST_BALL_GAME, error: null },
      { data: players, error: null },
      { data: [{ user_id: 'u1' }], error: null },
      { data: [{ user_id: 'u2' }], error: null },
      { data: [{ user_id: 'u3' }], error: null },
      { data: [{ user_id: 'u4' }], error: null },
    ]);

    const { suggestTeamAssignment } = await import('./flightActions');
    await expect(suggestTeamAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=team_suggested`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });

    // Lag OG flight må skrives sammen — CHECK-en krever begge.
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates.map((c) => c.args[0])).toEqual([
      { team_number: 1, flight_number: 1 },
      { team_number: 1, flight_number: 1 },
      { team_number: 2, flight_number: 2 },
      { team_number: 2, flight_number: 2 },
    ]);
  });

  it.each([
    { failingWrite: 1, cacheExpired: false },
    { failingWrite: 2, cacheExpired: true },
  ])('0-rad-skriving nr. $failingWrite rapporteres som feil, cache tømt: $cacheExpired', async ({ failingWrite, cacheExpired }) => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: BEST_BALL_GAME, error: null },
      {
        data: [
          { user_id: 'u1', team_number: null, flight_number: null, withdrawn_at: null },
          { user_id: 'u2', team_number: null, flight_number: null, withdrawn_at: null },
        ],
        error: null,
      },
      ...(failingWrite === 2 ? [{ data: [{ user_id: 'u1' }], error: null }] : []),
      { data: [], error: null }, // this update hits 0 rows
      ...(failingWrite === 2 ? [{ data: [{ user_id: 'u1' }], error: null }] : []), // write-back of u1
    ]);

    const { suggestTeamAssignment } = await import('./flightActions');
    await expect(suggestTeamAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=db_players`);
    expect(revalidateTagMock.mock.calls.length > 0).toBe(cacheExpired);
    // u1 gets its team and flight back (#2289): both, so the CHECK holds.
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update').map((c) => c.args[0]);
    expect(updates).toEqual(
      failingWrite === 2
        ? [
            { team_number: 1, flight_number: 1 },
            { team_number: 1, flight_number: 1 },
            { team_number: null, flight_number: null },
          ]
        : [{ team_number: 1, flight_number: 1 }],
    );
  });

  it('solo-format → no-op-redirect uten skriving', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: {
          id: GAME_ID,
          status: 'scheduled',
          game_mode: 'skins',
          mode_config: { kind: 'skins', team_size: 1 },
        },
        error: null,
      },
    ]);

    const { suggestTeamAssignment } = await import('./flightActions');
    await expect(suggestTeamAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}`);
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
  });

  it('ferdig spill → redirect til ?error=not_active', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: { ...BEST_BALL_GAME, status: 'finished' }, error: null },
    ]);

    const { suggestTeamAssignment } = await import('./flightActions');
    await expect(suggestTeamAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=not_active`);
  });
});

// ─── setPlayerTeam (#1669) ───────────────────────────────────────────────────

describe('setPlayerTeam', () => {
  it('lagnummer under 1 → redirect til ?error=bad_team', async () => {
    authedAdmin();

    const { setPlayerTeam } = await import('./flightActions');
    await expect(setPlayerTeam(GAME_ID, 'target-user', 0)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=bad_team`);
  });

  it('laget er fullt (team_size 2) → redirect til ?error=team_full', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: BEST_BALL_GAME, error: null },
      { data: [teamRow('target-user', null, null)], error: null },
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number },
    ]);

    const { setPlayerTeam } = await import('./flightActions');
    await expect(setPlayerTeam(GAME_ID, 'target-user', 1)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=team_full`);
  });

  it('happy path: spiller uten flight får flight = lag', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: BEST_BALL_GAME, error: null },
      { data: [teamRow('target-user', null, null)], error: null },
      { data: null, error: null, count: 1 } as { data: null; error: null; count: number },
      { data: [{ user_id: 'target-user' }], error: null },
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number }, // after-count
    ]);

    const { setPlayerTeam } = await import('./flightActions');
    await expect(setPlayerTeam(GAME_ID, 'target-user', 3)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=team_updated`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });

    const update = adminMock.__fromCalls.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ team_number: 3, flight_number: 3 });
  });

  it('spiller med flight fra før beholder flighten sin', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: BEST_BALL_GAME, error: null },
      { data: [teamRow('target-user', null, 7)], error: null },
      { data: null, error: null, count: 0 } as { data: null; error: null; count: number },
      { data: [{ user_id: 'target-user' }], error: null },
      { data: null, error: null, count: 1 } as { data: null; error: null; count: number }, // after-count
    ]);

    const { setPlayerTeam } = await import('./flightActions');
    await expect(setPlayerTeam(GAME_ID, 'target-user', 2)).rejects.toBeInstanceOf(
      RedirectError,
    );
    const update = adminMock.__fromCalls.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ team_number: 2, flight_number: 7 });
  });

  it('Texas: spiller i lag 1/flight 1 flyttes til lag 2 → flighten følger laget (#2290)', async () => {
    authedAdmin();

    // Lag 2 har én ledig plass (u8 er ikke påmeldt), så byttet får plass.
    adminMock = buildSupabaseMock([
      { data: TEXAS_GAME, error: null },
      { data: texasRoster().filter((p) => p.user_id !== 'u8'), error: null },
      { data: null, error: null, count: 3 } as { data: null; error: null; count: number },
      { data: [{ user_id: 'u1' }], error: null },
      { data: null, error: null, count: 4 } as { data: null; error: null; count: number }, // after-count
    ]);

    const { setPlayerTeam } = await import('./flightActions');
    await expect(setPlayerTeam(GAME_ID, 'u1', 2)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=team_updated`);
    const update = adminMock.__fromCalls.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ team_number: 2, flight_number: 2 });
  });

  it('best ball: til et lag der partneren har flight 1 → flight 1 (#2290)', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: BEST_BALL_GAME, error: null },
      {
        data: [
          teamRow('target-user', 3, 3),
          teamRow('partner', 2, 1),
          teamRow('annen', 1, 1),
          teamRow('fjerde', 1, 1),
        ],
        error: null,
      },
      { data: null, error: null, count: 1 } as { data: null; error: null; count: number },
      { data: [{ user_id: 'target-user' }], error: null },
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number }, // after-count
    ]);

    const { setPlayerTeam } = await import('./flightActions');
    await expect(setPlayerTeam(GAME_ID, 'target-user', 2)).rejects.toBeInstanceOf(
      RedirectError,
    );
    const update = adminMock.__fromCalls.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ team_number: 2, flight_number: 1 });
  });

  // Same race as setPlayerFlight (#2289): the count after the write catches
  // the loser, who gets the team and the flight they had back.
  it.each([
    { name: 'laget ble overfullt', afterCount: { data: null, error: null, count: 3 }, error: 'team_full' },
    { name: 'etter-tellingen feilet', afterCount: { data: null, error: { message: 'boom' }, count: null }, error: 'db_roster' },
  ])('$name → lag og flight skrives tilbake, cachen er tømt, ?error=$error', async ({ afterCount, error }) => {
    authedAdmin();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    adminMock = buildSupabaseMock([
      { data: BEST_BALL_GAME, error: null },
      { data: [teamRow('target-user', 3, 3), teamRow('partner', 2, 2)], error: null },
      { data: null, error: null, count: 1 } as { data: null; error: null; count: number }, // before-count
      { data: [{ user_id: 'target-user' }], error: null }, // update
      afterCount as { data: null; error: null; count: number },
      { data: [{ user_id: 'target-user' }], error: null }, // revert
    ]);

    const { setPlayerTeam } = await import('./flightActions');
    await expect(setPlayerTeam(GAME_ID, 'target-user', 2)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=${error}`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates.map((c) => c.args[0])).toEqual([
      { team_number: 2, flight_number: 2 },
      { team_number: 3, flight_number: 3 },
    ]);
    errorSpy.mockRestore();
  });

  it('spilleren er ikke i spillet → ?error=player_missing, ingen skriving', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: BEST_BALL_GAME, error: null },
      { data: [teamRow('partner', 2, 2)], error: null },
    ]);

    const { setPlayerTeam } = await import('./flightActions');
    await expect(setPlayerTeam(GAME_ID, 'target-user', 2)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=player_missing`);
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
  });
});

// ─── toggleSignupsClosed ─────────────────────────────────────────────────────

describe('toggleSignupsClosed', () => {
  it('stenger påmeldingen → redirect til ?status=signups_closed', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: { id: GAME_ID, status: 'scheduled', registration_mode: 'open' },
        error: null,
      },
      { data: [{ id: GAME_ID }], error: null }, // games.update
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, true)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}/signups?status=signups_closed`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('gjenåpner påmeldingen → redirect til ?status=signups_reopened', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: {
          id: GAME_ID,
          status: 'scheduled',
          registration_mode: 'manual_approval',
        },
        error: null,
      },
      { data: [{ id: GAME_ID }], error: null }, // games.update
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, false)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}/signups?status=signups_reopened`);
  });

  it('0-rad-skriving rapporteres som feil, ikke suksess (#2293)', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: { id: GAME_ID, status: 'scheduled', registration_mode: 'open' },
        error: null,
      },
      { data: [], error: null }, // games.update traff 0 rader
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, true)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}/signups?error=db_game`);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('ikke-scheduled spill → redirect til ?error=signups_not_scheduled', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: { id: GAME_ID, status: 'active', registration_mode: 'open' },
        error: null,
      },
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, true)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}/signups?error=signups_not_scheduled`);
  });

  // Owner's answer 2026-10-12: a club round on «bare inviterte» is open to
  // its members, so the organiser can close it too.
  it('klubbrunde med bare inviterte → stenges, redirect til ?status=signups_closed', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: {
          id: GAME_ID,
          status: 'scheduled',
          registration_mode: 'invite_only',
          group_id: 'group-1',
        },
        error: null,
      },
      { data: [{ id: GAME_ID }], error: null }, // games.update
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, true)).rejects.toBeInstanceOf(RedirectError);
    expect(adminMock.from).toHaveBeenCalledTimes(2);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}/signups?status=signups_closed`);
  });

  it('bare inviterte uten klubb → ingen skriving, tilbake til påmeldingssiden', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: { id: GAME_ID, status: 'scheduled', registration_mode: 'invite_only', group_id: null },
        error: null,
      },
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, true)).rejects.toBeInstanceOf(RedirectError);
    expect(adminMock.from).toHaveBeenCalledTimes(1);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}/signups`);
  });
});

// ─── spill-lesingen: feil ≠ fravær (#2293) ───────────────────────────────────

/**
 * A failed game read is a DB error, not «the game was not found» (#1441). The
 * mock runs with `strictSingle`, so a rollback from `.maybeSingle()` to
 * `.single()` turns the no-row case into PGRST116 → `db_game`, and goes red.
 */
describe('spill-lesingen i flight- og lag-handlingene', () => {
  // Each action with the page it sends errors to: the signups page for
  // toggleSignupsClosed (#2288), the Startlista for the flight actions
  // (#2289), the game page for the team actions.
  const ACTIONS = {
    suggestFlightAssignment: {
      run: (m: typeof import('./flightActions')) => m.suggestFlightAssignment(GAME_ID),
      path: STARTLISTA,
    },
    setPlayerFlight: {
      run: (m: typeof import('./flightActions')) => m.setPlayerFlight(GAME_ID, 'target-user', 2),
      path: STARTLISTA,
    },
    toggleSignupsClosed: {
      run: (m: typeof import('./flightActions')) => m.toggleSignupsClosed(GAME_ID, true),
      path: `/admin/games/${GAME_ID}/signups`,
    },
    // Reads the game through loadTeamGame (shared with setPlayerTeam).
    suggestTeamAssignment: {
      run: (m: typeof import('./flightActions')) => m.suggestTeamAssignment(GAME_ID),
      path: `/admin/games/${GAME_ID}`,
    },
  };
  const CASES = (Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]).flatMap((action) => [
    { action, read: { data: null, error: { message: 'boom' } }, expected: 'db_game' },
    { action, read: { data: null, error: null }, expected: 'not_found' },
  ]);

  it.each(CASES)('$action: lesing $read.error → ?error=$expected', async ({ action, read, expected }) => {
    authedAdmin();
    adminMock = buildSupabaseMock([read], {}, { strictSingle: true });

    const mod = await import('./flightActions');
    await expect(ACTIONS[action].run(mod)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`${ACTIONS[action].path}?error=${expected}`);
  });
});
