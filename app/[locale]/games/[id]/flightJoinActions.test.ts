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
 *   adminMock[0]: game_players.select(user_id, withdrawn_at, flight_number).eq.eq.maybeSingle
 *   adminMock[1]: games.select(status).eq.maybeSingle
 *   adminMock[2]: game_players.select({count}).eq.eq.neq.is    (before-count)
 *   adminMock[3]: game_players.update({flight_number}).eq.eq
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
      { data: { status: 'scheduled' }, error: null },   // games
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
      { data: { status: 'scheduled' }, error: null },   // games
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number }, // before-count = 2
      { data: null, error: null }, // update
      { data: null, error: null, count: 3 } as { data: null; error: null; count: number }, // after-count = 3 (≤ 4)
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 2);

    expect(result).toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
  });

  it('race-guard: after-count > 4 → angrer rad, returnerer flight_full', async () => {
    adminMock = buildSupabaseMock([
      {
        data: { user_id: USER_ID, withdrawn_at: null, flight_number: null },
        error: null,
      }, // membership
      { data: { status: 'scheduled' }, error: null },   // games
      { data: null, error: null, count: 3 } as { data: null; error: null; count: number }, // before-count = 3
      { data: null, error: null }, // update (skriv vår flight)
      { data: null, error: null, count: 5 } as { data: null; error: null; count: number }, // after-count = 5 (over 4 — vi tapte racen)
      { data: null, error: null }, // revert-update
    ]);

    const { joinFlight } = await import('./flightJoinActions');
    const result = await joinFlight(GAME_ID, 1);

    expect(result).toEqual({ ok: false, error: 'flight_full' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
