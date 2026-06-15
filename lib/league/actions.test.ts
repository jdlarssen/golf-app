import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, makeRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * Regression test for #647 Bug 1 + Bug 2: startLeagueRoundFlight could never
 * create a flight in prod. The game_players insert sent `status: 'active'` —
 * a column the table does not have (Bug 1) — and `team_number: 1` without a
 * `flight_number`, violating game_players_team_flight_consistency (Bug 2).
 * Either alone rejects the insert, so no league round could ever be played.
 *
 * The corrected payload: no `status`, `team_number: null` (league is solo), and
 * accepted_at via acceptedAtForActor (the #463 confirmation semantics — only
 * the player who starts the flight is confirmed, co-players stay pending).
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({
  revalidatePath: vi.fn(),
}));
// Flip-to-active succeeds → the action redirects right after the insert we
// want to inspect, so the flow stops cleanly without driving more queries.
vi.mock('@/lib/games/startScheduledGame', () => ({
  startScheduledGame: async () => ({ ok: true }),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startLeagueRoundFlight — game_players insert (#647)', () => {
  it('inserts with no status column and team_number null', async () => {
    supabaseMock = buildSupabaseMock([
      // 1. league_rounds.maybeSingle — wide window so the gate always passes
      {
        data: {
          id: 'r1',
          league_id: 'l1',
          course_id: 'c1',
          tee_box_id: 'tb1',
          opens_at: '2000-01-01T00:00:00Z',
          closes_at: '2099-01-01T00:00:00Z',
          original_closes_at: '2099-01-01T00:00:00Z',
        },
      },
      // 2. leagues.maybeSingle
      { data: { id: 'l1', name: 'Test-liga', course_id: 'c1', tee_box_id: 'tb1', status: 'active', format: 'stroke' } },
      // 3. league_players (membership)
      { data: [{ user_id: 'u1' }, { user_id: 'u2' }] },
      // 4. games (prior finished flights → none)
      { data: [] },
      // 5. users (tee_gender roster)
      { data: [{ id: 'u1', gender: 'male' }, { id: 'u2', gender: 'female' }] },
      // 6. games.insert(...).select('id').single
      { data: { id: 'g1' }, error: null },
      // 7. game_players.insert (the payload under test)
      { error: null },
    ]);
    setUser('u1');

    const { startLeagueRoundFlight } = await import('./actions');
    await expect(startLeagueRoundFlight('r1', ['u2'])).rejects.toBeInstanceOf(RedirectError);

    const gpInsert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'insert',
    );
    expect(gpInsert, 'game_players insert was issued').toBeDefined();
    const rows = gpInsert!.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // The non-existent `status` column must never be sent again (Bug 1).
    expect(rows.every((r) => !('status' in r))).toBe(true);
    // Solo → team_number null satisfies team_flight_consistency (Bug 2).
    expect(rows.every((r) => r.team_number === null)).toBe(true);
    // #463: actor confirmed now, co-player pending (acceptedAtForActor).
    const actor = rows.find((r) => r.user_id === 'u1')!;
    const coPlayer = rows.find((r) => r.user_id === 'u2')!;
    expect(typeof actor.accepted_at).toBe('string');
    expect(coPlayer.accepted_at).toBeNull();
  });
});
