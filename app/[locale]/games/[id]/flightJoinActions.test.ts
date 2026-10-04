import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Unit-tester for joinFlight (#543 — selvbetjening i venterommet).
 *
 * Dekker:
 *   - not_authed: uautentisert bruker
 *   - not_member: bruker som ikke er deltaker (eller trukket)
 *   - flight_full: full flight (race-guard)
 *   - happy path: vellykket valg av flight
 *
 * Spørsmålsrekkefølge (adminMock FIFO):
 *   adminMock[0]: game_players.select(user_id, withdrawn_at, flight_number, team_number).eq.eq.maybeSingle
 *   adminMock[1]: games.select(status, game_mode, mode_config).eq.maybeSingle
 *   adminMock[2]: game_players.select({count}).eq.eq.neq.is    (before-count)
 *   adminMock[3]: game_players.update({flight_number}).eq.eq.select
 *   adminMock[4]: game_players.select({count}).eq.eq.is        (after-count, race-guard)
 */

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const getUserMock = vi.fn();
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: () => getUserMock(),
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const GAME_ID = 'game-3333-3333-3333-333333333333';
const USER_ID = 'user-4444-4444-4444-444444444444';

/** Planlagt solo-stableford: flighten er en fri gruppering. */
const SOLO_GAME = {
  status: 'scheduled',
  game_mode: 'stableford',
  mode_config: { kind: 'stableford', team_size: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = buildSupabaseMock([]);
  getUserMock.mockResolvedValue(USER_ID);
});

describe('joinFlight', () => {
  it('uautentisert bruker → not_authed', async () => {
    getUserMock.mockResolvedValue(null);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'not_authed' });
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it('spiller ikke i spillet → not_member', async () => {
    adminMock = buildSupabaseMock([
      { data: null, error: null }, // game_players.maybeSingle → ingen rad
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'not_member' });
  });

  it('spiller med lag → flight_bound_to_team (laget er flighten, #2009)', async () => {
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: null, flight_number: 2, team_number: 2 },
        error: null,
      }, // membership i et lag-format: flight = lag
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'flight_bound_to_team' });
    // Ingen skriv: kun membership-oppslaget ble gjort.
    expect(adminMock.from).toHaveBeenCalledTimes(1);
  });

  it('spiller uten lag i Texas → flight_bound_to_team uten skriving (#2290)', async () => {
    // Solo-påmelding i et lagformat: laget er ikke fordelt ennå, men flighten
    // er fortsatt laget. Et valg her ville blitt stående når lagene fordeles.
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: null, flight_number: null, team_number: null },
        error: null,
      },
      {
        data: {
          status: 'scheduled',
          game_mode: 'texas_scramble',
          mode_config: { kind: 'texas_scramble', team_size: 4 },
        },
        error: null,
      },
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'flight_bound_to_team' });
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('trukket spiller → not_member', async () => {
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: '2026-01-01T00:00:00Z', flight_number: null },
        error: null,
      }, // membership (trukket)
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'not_member' });
  });

  it('flight full (4 i target-flight) → flight_full uten race', async () => {
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: null, flight_number: null },
        error: null,
      }, // membership (aktiv)
      { data: SOLO_GAME, error: null },   // games
      { data: null, error: null, count: 4 } as { data: null; error: null; count: number }, // before-count = 4 (full)
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'flight_full' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('happy path: spiller velger flight → ok + revalidateTag', async () => {
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: null, flight_number: null },
        error: null,
      }, // membership
      { data: SOLO_GAME, error: null },   // games
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number }, // before-count = 2
      { data: [{ user_id: USER_ID }], error: null }, // update
      { data: null, error: null, count: 3 } as { data: null; error: null; count: number }, // after-count = 3 (≤ 4)
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 2);

    expect(result).toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('race-guard: after-count > 4 → angrer rad, returnerer flight_full', async () => {
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: null, flight_number: null },
        error: null,
      }, // membership
      { data: SOLO_GAME, error: null },   // games
      { data: null, error: null, count: 3 } as { data: null; error: null; count: number }, // before-count = 3
      { data: [{ user_id: USER_ID }], error: null }, // update (skriv vår flight)
      { data: null, error: null, count: 5 } as { data: null; error: null; count: number }, // after-count = 5 (over 4 — vi tapte racen)
      { data: [{ user_id: USER_ID }], error: null }, // revert-update
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'flight_full' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('skriving som treffer 0 rader (spilleren ble fjernet) → not_member (#2293)', async () => {
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: null, flight_number: null },
        error: null,
      }, // membership
      { data: SOLO_GAME, error: null }, // games
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number }, // before-count
      { data: [], error: null }, // update traff 0 rader
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 2);

    expect(result).toEqual({ ok: false, error: 'not_member' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('after-count feiler → angrer raden og svarer db_error (#2293)', async () => {
    // Capacity cannot be confirmed: the flight may be overfull, so the write is
    // undone exactly as when the race is lost.
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: null, flight_number: 1 },
        error: null,
      }, // membership (flight 1 fra før)
      { data: SOLO_GAME, error: null }, // games
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number }, // before-count
      { data: [{ user_id: USER_ID }], error: null }, // update
      { data: null, error: { message: 'boom' }, count: null }, // after-count feiler
      { data: [{ user_id: USER_ID }], error: null }, // revert-update
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 2);

    expect(result).toEqual({ ok: false, error: 'db_error' });
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates.map((c) => c.args[0])).toEqual([{ flight_number: 2 }, { flight_number: 1 }]);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      read: 'medlemskap',
      queue: [{ data: null, error: { message: 'boom' } }],
    },
    {
      read: 'spill',
      queue: [
        { data: { user_id: USER_ID, withdrawn_at: null, flight_number: null }, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    },
  ])('lesefeil på $read → db_error, ikke not_member/game_not_scheduled (#2293)', async ({ queue }) => {
    adminMock = buildSupabaseMock(queue);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
  });
});
