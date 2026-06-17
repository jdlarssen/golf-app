import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Regression test for #647 Bug 3: getLigaSnapshot crashed the whole
 * `/liga/[id]` season table with a 500 (Postgres 42703 `column
 * course_holes.par does not exist`) as soon as one round had a finished
 * flight, because the course_holes select still referenced the `par` column
 * dropped in migration 0040 (replaced by par_mens/par_ladies/par_juniors).
 *
 * The runtime crash only reproduces against real Postgres (live proof = K5),
 * so this test locks the column-name contract: it drives a minimal league
 * with one finished flight through the loader and asserts the course_holes
 * select requests the per-gender columns and never a standalone `par`.
 */

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => supabaseMock,
}));

describe('getLigaSnapshot — course_holes par-select (#647)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects per-gender par columns, never the dropped `par`', async () => {
    supabaseMock = buildSupabaseMock([
      // 1. leagues.maybeSingle
      {
        data: {
          id: 'l1',
          name: 'Test-liga',
          season_start: '2026-06-01',
          season_end: '2026-09-01',
          format: 'stroke',
          scoring: 'net',
          standings_model: 'total',
          missed_round_policy: 'must_play_all',
          penalty_kind: 'worst_plus_one',
          penalty_fixed_over_par: null,
          best_n_count: null,
          course_scope: 'single_course',
          course_id: 'c1',
          tee_box_id: 'tb1',
          status: 'active',
          created_by: 'admin',
          created_at: '2026-06-01T00:00:00Z',
          started_at: '2026-06-01T00:00:00Z',
          finished_at: null,
          group_id: null,
        },
      },
      // 2. Promise.all → league_rounds, league_players (array order)
      {
        data: [
          {
            id: 'r1',
            sequence: 1,
            label: 'Runde 1',
            course_id: 'c1',
            tee_box_id: 'tb1',
            opens_at: '2026-06-15T04:00:00Z',
            closes_at: '2026-06-15T20:00:00Z',
            original_closes_at: '2026-06-15T20:00:00Z',
            window_overridden_at: null,
          },
        ],
      },
      { data: [] }, // league_players
      // 3. games (roundIds.length > 0 → runs; course_id triggers course_holes fetch)
      {
        data: [
          {
            id: 'g1',
            status: 'finished',
            course_id: 'c1',
            tee_box_id: 'tb1',
            league_round_id: 'r1',
            delivered_outside_window: false,
          },
        ],
      },
      // 4. Promise.all → game_players, scores, course_holes, tee_boxes (array order)
      { data: [] }, // game_players
      { data: [] }, // scores
      {
        data: [
          { course_id: 'c1', hole_number: 1, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 1 },
        ],
      },
      { data: [{ id: 'tb1', par_total_mens: 72, par_total_ladies: 74, par_total_juniors: 72 }] },
    ]);

    const { getLigaSnapshot } = await import('@/lib/league/getLigaSnapshot');
    const snap = await getLigaSnapshot('l1');
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

describe('getLigaSnapshot — stableford per-gender par (#677)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scores a ladies player against ladies par, not mens par', async () => {
    // Two-player stableford flight, both CH 0 (net = gross, no stroke allocation).
    // Hole 1: par_mens 4 / par_ladies 5. Hole 2: par_mens 4 / par_ladies 4.
    // Both score gross {5, 4}. Standard stableford points = max(0, 2 + par − net):
    //   Ladies F:  h1 par5 net5 → 2 pts; h2 par4 net4 → 2 pts; total 4.
    //   Mens  M:   h1 par4 net5 → 1 pt;  h2 par4 net4 → 2 pts; total 3.
    // With the men's-par bug, F would also score h1 as par4 net5 → 1 pt → total 3.
    // So a correct snapshot ranks F (4) above M (3); the bug ties them at 3.
    supabaseMock = buildSupabaseMock([
      // 1. leagues.maybeSingle
      {
        data: {
          id: 'l1',
          name: 'Stableford-liga',
          season_start: '2026-06-01',
          season_end: '2026-09-01',
          format: 'stableford',
          scoring: 'net',
          standings_model: 'total',
          missed_round_policy: 'penalty',
          penalty_kind: 'worst_plus_one',
          penalty_fixed_over_par: null,
          best_n_count: null,
          course_scope: 'single_course',
          course_id: 'c1',
          tee_box_id: 'tb1',
          status: 'active',
          created_by: 'admin',
          created_at: '2026-06-01T00:00:00Z',
          started_at: '2026-06-01T00:00:00Z',
          finished_at: null,
          group_id: null,
        },
      },
      // 2. Promise.all → league_rounds, league_players
      {
        data: [
          {
            id: 'r1',
            sequence: 1,
            label: 'Runde 1',
            course_id: 'c1',
            tee_box_id: 'tb1',
            opens_at: '2026-06-15T04:00:00Z',
            closes_at: '2026-06-15T20:00:00Z',
            original_closes_at: '2026-06-15T20:00:00Z',
            window_overridden_at: null,
          },
        ],
      },
      {
        data: [
          { user_id: 'F', accepted_at: '2026-06-01T00:00:00Z', users: { name: 'Frida', nickname: null } },
          { user_id: 'M', accepted_at: '2026-06-01T00:00:00Z', users: { name: 'Magnus', nickname: null } },
        ],
      },
      // 3. games
      {
        data: [
          {
            id: 'g1',
            status: 'finished',
            course_id: 'c1',
            tee_box_id: 'tb1',
            league_round_id: 'r1',
            delivered_outside_window: false,
          },
        ],
      },
      // 4. Promise.all → game_players, scores, course_holes, tee_boxes
      {
        data: [
          { game_id: 'g1', user_id: 'F', course_handicap: 0, tee_gender: 'ladies', submitted_at: '2026-06-15T18:00:00Z', withdrawn_at: null },
          { game_id: 'g1', user_id: 'M', course_handicap: 0, tee_gender: 'mens', submitted_at: '2026-06-15T18:00:00Z', withdrawn_at: null },
        ],
      },
      {
        data: [
          { game_id: 'g1', user_id: 'F', hole_number: 1, strokes: 5 },
          { game_id: 'g1', user_id: 'F', hole_number: 2, strokes: 4 },
          { game_id: 'g1', user_id: 'M', hole_number: 1, strokes: 5 },
          { game_id: 'g1', user_id: 'M', hole_number: 2, strokes: 4 },
        ],
      },
      {
        data: [
          { course_id: 'c1', hole_number: 1, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 1 },
          { course_id: 'c1', hole_number: 2, par_mens: 4, par_ladies: 4, par_juniors: 4, stroke_index: 2 },
        ],
      },
      { data: [{ id: 'tb1', par_total_mens: 72, par_total_ladies: 74, par_total_juniors: 72 }] },
    ]);

    const { getLigaSnapshot } = await import('@/lib/league/getLigaSnapshot');
    const snap = await getLigaSnapshot('l1');
    expect(snap).not.toBeNull();

    const net = snap!.standings.net!;
    const fRow = net.rows.find((r) => r.userId === 'F')!;
    const mRow = net.rows.find((r) => r.userId === 'M')!;
    // Ladies par on hole 1 earns F a point M doesn't get.
    expect(fRow.value).toBe(4);
    expect(mRow.value).toBe(3);
    expect(net.rows[0].userId).toBe('F'); // F ranks first on her correct ladies par
  });
});
