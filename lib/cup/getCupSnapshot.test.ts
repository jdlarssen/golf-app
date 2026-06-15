import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Regression test for #642: getCupSnapshot crashed with a 500 (Postgres 42703
 * `column course_holes.par does not exist`) for any cup with ≥1 match, because
 * the `course_holes` select still referenced the `par` column dropped in
 * migration 0040 (replaced by par_mens/par_ladies/par_juniors).
 *
 * The actual runtime crash only reproduces against real Postgres, so the live
 * proof is the Supabase schema check (K3). This test locks the column-name
 * contract so a revert to bare `par` fails CI: it drives a minimal 1-match cup
 * through the loader and asserts the course_holes select requests the per-gender
 * columns and never a standalone `par`.
 */

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => supabaseMock,
}));

describe('getCupSnapshot — course_holes par-select (#642)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects per-gender par columns, never the dropped `par`', async () => {
    supabaseMock = buildSupabaseMock([
      // 1. tournaments.maybeSingle
      {
        data: {
          id: 't1',
          name: 'Test-cup',
          team_1_name: 'Lag A',
          team_2_name: 'Lag B',
          points_to_win: 1,
          status: 'active',
          winner_team: null,
          created_by: 'admin',
          created_at: '2026-06-15T10:00:00Z',
          started_at: null,
          finished_at: null,
          group_id: null,
        },
      },
      // 2. games (≥1 → triggers the course_holes fetch that used to crash)
      {
        data: [
          {
            id: 'g1',
            name: 'Test-cup – Match 1',
            status: 'finished',
            game_mode: 'singles_matchplay',
            mode_config: null,
            tournament_match_label: 'Match 1',
            course_id: 'c1',
            tee_box_id: 'tb1',
            created_at: '2026-06-15T10:05:00Z',
          },
        ],
      },
      // 3. Promise.all → game_players, scores, course_holes (in array order)
      {
        data: [
          { game_id: 'g1', user_id: 'u1', team_number: 1, course_handicap: 0, users: { name: 'Spiller 1', nickname: null } },
          { game_id: 'g1', user_id: 'u2', team_number: 2, course_handicap: 0, users: { name: 'Spiller 2', nickname: null } },
        ],
      },
      { data: [] }, // scores
      {
        data: [
          { course_id: 'c1', hole_number: 1, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 1 },
        ],
      },
    ]);

    const { getCupSnapshot } = await import('@/lib/cup/getCupSnapshot');
    const snap = await getCupSnapshot('t1');
    expect(snap).not.toBeNull();

    const holesSelect = supabaseMock.__fromCalls.find(
      (c) => c.table === 'course_holes' && c.method === 'select',
    );
    expect(holesSelect, 'course_holes select was issued').toBeDefined();
    const cols = holesSelect!.args[0] as string;
    expect(cols).toContain('par_mens');
    expect(cols).toContain('par_ladies');
    expect(cols).toContain('par_juniors');
    // No standalone `par` token — that would re-introduce the 42703 crash.
    expect(cols).not.toMatch(/(^|[\s,])par($|[\s,])/);
  });
});
