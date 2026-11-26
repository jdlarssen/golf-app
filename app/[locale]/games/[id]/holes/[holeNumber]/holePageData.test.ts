import { describe, expect, it } from 'vitest';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { fetchHolePageData, planSideContestReads, readCupSideAwards } from './holePageData';

// #2283 (part D2) — Type A: what the hole page's render wave reads for the side
// contests, and when it reads nothing.

const TOURNAMENT = '44444444-4444-4444-8444-444444444444';

type PlanGame = Parameters<typeof planSideContestReads>[0];

function planGame(patch: Partial<PlanGame> = {}): PlanGame {
  return {
    side_ld_count: 0,
    side_ctp_count: 0,
    side_ld_holes: null,
    side_ctp_holes: null,
    source_game_id: null,
    tournament_id: null,
    ...patch,
  };
}

describe('planSideContestReads', () => {
  it('reads nothing for a normal round', () => {
    expect(planSideContestReads(planGame(), 7, true)).toEqual({ awards: false, claims: null });
  });

  it('reads nothing on a hole that is no contest hole of the game\'s own slots', () => {
    const game = planGame({ side_ctp_count: 1, side_ctp_holes: [7] });
    expect(planSideContestReads(game, 3, true)).toEqual({ awards: false, claims: null });
  });

  it('reads the side claims, and no awards and no GIR, on the game\'s own contest hole', () => {
    const game = planGame({ side_ctp_count: 1, side_ctp_holes: [7] });
    expect(planSideContestReads(game, 7, true)).toEqual({ awards: false, claims: { side: true, gir: false } });
  });

  it('does not count a slot past the count, as the rpc does not', () => {
    const game = planGame({ side_ctp_count: 1, side_ctp_holes: [3, 7] });
    expect(planSideContestReads(game, 7, true)).toEqual({ awards: false, claims: null });
  });

  it('reads the awards and both claim tables on every hole of a cup game, in the same wave', () => {
    const game = planGame({ tournament_id: TOURNAMENT });
    expect(planSideContestReads(game, 3, true)).toEqual({ awards: true, claims: { side: true, gir: true } });
  });

  it('reads no claims for someone who cannot report, but still the cup awards', () => {
    expect(planSideContestReads(planGame({ side_ctp_count: 1, side_ctp_holes: [7] }), 7, false)).toEqual({
      awards: false,
      claims: null,
    });
    expect(planSideContestReads(planGame({ tournament_id: TOURNAMENT }), 7, false)).toEqual({
      awards: true,
      claims: null,
    });
  });

  it('reads nothing for a derived game, which has no contests', () => {
    const game = planGame({ source_game_id: 'host', tournament_id: TOURNAMENT, side_ctp_count: 1, side_ctp_holes: [7] });
    expect(planSideContestReads(game, 7, true)).toEqual({ awards: false, claims: null });
  });
});

describe('readCupSideAwards', () => {
  it('reads the cup\'s three kinds with the columns that carry no winner and no counters', async () => {
    const fake = createAdminClientMock({
      respond: () => ({
        data: [
          { kind: 'ctp', hole_number: 7, points: '2', gir_max_per_team: null },
          { kind: 'gir', hole_number: 5, points: 1, gir_max_per_team: 2 },
          { kind: 'mystery', hole_number: 5, points: 1, gir_max_per_team: null },
        ],
      }),
    });

    const result = await readCupSideAwards(fake.client as never, TOURNAMENT);

    expect(fake.ops[0]).toMatchObject({ table: 'tournament_side_awards', columns: 'kind, hole_number, points, gir_max_per_team' });
    expect(fake.ops[0].columns).not.toMatch(/winner|count/);
    expect(fake.ops[0].filters).toEqual([
      { op: 'eq', column: 'tournament_id', value: TOURNAMENT },
      { op: 'in', column: 'kind', value: ['ctp', 'ld', 'gir'] },
    ]);
    expect(result).toEqual({
      ok: true,
      awards: [
        { kind: 'ctp', holeNumber: 7, points: 2, girMaxPerTeam: null },
        { kind: 'gir', holeNumber: 5, points: 1, girMaxPerTeam: 2 },
      ],
    });
  });

  it('answers ok: false instead of throwing when the read fails or the request throws', async () => {
    const failing = createAdminClientMock({ respond: () => ({ data: null, error: { message: 'boom' } }) });
    expect(await readCupSideAwards(failing.client as never, TOURNAMENT)).toMatchObject({ ok: false });

    const throwing = createAdminClientMock({
      respond: () => {
        throw new Error('network down');
      },
    });
    expect(await readCupSideAwards(throwing.client as never, TOURNAMENT)).toMatchObject({ ok: false });
  });
});

// The wave itself, through `fetchHolePageData` with a recording client: which
// tables are touched for which game, and that a failed side-contest read does
// not fell the page.
describe('fetchHolePageData, side-contest reads', () => {
  const HOLE_ROW = { hole_number: 7, par_mens: 4, par_ladies: 4, par_juniors: 4, stroke_index: 5 };

  function respondFor(sideContest: (op: QueryOp) => QueryResponse | null) {
    return (op: QueryOp): QueryResponse => {
      const own = sideContest(op);
      if (own) return own;
      if (op.table === 'course_holes') return { data: HOLE_ROW };
      if (op.table === 'courses') return { data: { name: 'Bane' } };
      return { data: [] };
    };
  }

  async function run(gamePatch: Partial<GameForHole>, canReport: boolean, respond: (op: QueryOp) => QueryResponse | null) {
    const fake = createAdminClientMock({ respond: respondFor(respond) });
    const game = {
      id: 'g1',
      course_id: 'c1',
      game_mode: 'stableford',
      // NOT NULL in games, default '{}' (#2941 reads it for the par strokes).
      mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      tournament_id: null,
      source_game_id: null,
      side_ld_count: 0,
      side_ctp_count: 0,
      side_ld_holes: null,
      side_ctp_holes: null,
      ...gamePatch,
    } as GameForHole;
    const data = await fetchHolePageData({
      supabase: fake.client as never,
      gameId: 'g1',
      holeNumber: 7,
      userId: 'u1',
      game,
      me: { user_id: 'u1', team_number: 1 } as PlayerForHole,
      playerIds: ['u1'],
      myTeamScoreOwnerId: null,
      myFormerTeamRowOwnerIds: [],
      flightFormerRowOwnerIds: [],
      siblingMatch: null,
      modes: { isWolf: false, isSkins: false, isBBB: false, isPatsome: false },
      canReportSideClaims: canReport,
    });
    return { fake, data };
  }

  const touched = (fake: { ops: QueryOp[] }) => fake.ops.map((op) => op.table);

  it('touches no side-contest table in a normal round', async () => {
    const { fake, data } = await run({}, true, () => null);
    expect(touched(fake)).not.toContain('tournament_side_awards');
    expect(touched(fake)).not.toContain('game_side_claims');
    expect(touched(fake)).not.toContain('game_gir_claims');
    expect(data.cupAwardsRes).toBeNull();
    expect(data.holeClaimsRes).toBeNull();
  });

  it('reads the hole\'s side claims, filtered on game and hole, on a contest hole of the game\'s own', async () => {
    const claim = { category: 'closest_to_pin', hole_number: 7, winner_user_id: 'u2', distance_m: 3.1, entered_by: 'u1', updated_at: 'x' };
    const { fake, data } = await run({ side_ctp_count: 1, side_ctp_holes: [7] }, true, (op) =>
      op.table === 'game_side_claims' ? { data: [claim] } : null,
    );
    const op = fake.ops.find((o) => o.table === 'game_side_claims');
    expect(op?.filters).toEqual([
      { op: 'eq', column: 'game_id', value: 'g1' },
      { op: 'eq', column: 'hole_number', value: 7 },
    ]);
    expect(touched(fake)).not.toContain('game_gir_claims');
    expect(touched(fake)).not.toContain('tournament_side_awards');
    expect(data.holeClaimsRes).toMatchObject({ ok: true, side: [{ winnerUserId: 'u2', distanceM: 3.1 }], gir: undefined });
  });

  it('reads the cup awards and both claim tables in a cup game', async () => {
    const { fake, data } = await run({ tournament_id: TOURNAMENT }, true, (op) =>
      op.table === 'tournament_side_awards'
        ? { data: [{ kind: 'gir', hole_number: 7, points: 1, gir_max_per_team: 2 }] }
        : null,
    );
    expect(touched(fake)).toEqual(expect.arrayContaining(['tournament_side_awards', 'game_side_claims', 'game_gir_claims']));
    expect(data.cupAwardsRes).toMatchObject({ ok: true, awards: [{ kind: 'gir', holeNumber: 7 }] });
    expect(data.holeClaimsRes).toMatchObject({ ok: true, side: [], gir: [] });
  });

  it('reads no claims for someone who cannot report', async () => {
    const { fake, data } = await run({ side_ctp_count: 1, side_ctp_holes: [7] }, false, () => null);
    expect(touched(fake)).not.toContain('game_side_claims');
    expect(data.holeClaimsRes).toBeNull();
  });

  it('does not throw when the claim or award reads fail: they come back as ok: false', async () => {
    const { data } = await run({ tournament_id: TOURNAMENT }, true, (op) =>
      op.table === 'tournament_side_awards' || op.table === 'game_side_claims'
        ? { data: null, error: { message: 'boom' } }
        : null,
    );
    expect(data.cupAwardsRes).toMatchObject({ ok: false });
    expect(data.holeClaimsRes).toMatchObject({ ok: false });
    expect(data.hole).toEqual(HOLE_ROW);
  });
});

// #2941: a new match with the par rule needs every hole's par per tee for the
// extra strokes, as the engine sums them; any other game reads only this hole.
describe('fetchHolePageData, the holes for the par strokes', () => {
  const HOLE_ROW = { hole_number: 7, par_mens: 4, par_ladies: 4, par_juniors: 4, stroke_index: 5 };
  const ALL_HOLES = [HOLE_ROW, { hole_number: 8, par_mens: 4, par_ladies: 5, par_juniors: 4, stroke_index: 1 }];

  async function run(modeConfig: Record<string, unknown>) {
    const fake = createAdminClientMock({
      respond: (op) => {
        if (op.table === 'course_holes') {
          const single = op.filters.some((f) => f.column === 'hole_number');
          return { data: single ? HOLE_ROW : ALL_HOLES };
        }
        if (op.table === 'courses') return { data: { name: 'Bane' } };
        return { data: [] };
      },
    });
    const game = {
      id: 'g1',
      course_id: 'c1',
      game_mode: 'singles_matchplay',
      mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2, match_strokes: 'difference', ...modeConfig },
      tournament_id: null,
      source_game_id: null,
      side_ld_count: 0,
      side_ctp_count: 0,
      side_ld_holes: null,
      side_ctp_holes: null,
    } as unknown as GameForHole;
    const data = await fetchHolePageData({
      supabase: fake.client as never,
      gameId: 'g1',
      holeNumber: 7,
      userId: 'u1',
      game,
      me: { user_id: 'u1', team_number: 1 } as PlayerForHole,
      playerIds: ['u1'],
      myTeamScoreOwnerId: null,
      myFormerTeamRowOwnerIds: [],
      flightFormerRowOwnerIds: [],
      siblingMatch: null,
      modes: { isWolf: false, isSkins: false, isBBB: false, isPatsome: false },
      canReportSideClaims: false,
    });
    return { fake, data };
  }

  it('reads every hole of the course for a new match with the par rule', async () => {
    const { fake, data } = await run({ par_strokes: 'difference' });
    const listReads = fake.ops.filter(
      (op) => op.table === 'course_holes' && !op.filters.some((f) => f.column === 'hole_number'),
    );
    expect(listReads).toHaveLength(1);
    expect(listReads[0].filters).toEqual([{ op: 'eq', column: 'course_id', value: 'c1' }]);
    expect(data.parHoles).toEqual(ALL_HOLES);
  });

  it('reads only this hole for a match created before', async () => {
    const { fake, data } = await run({});
    expect(fake.ops.filter((op) => op.table === 'course_holes')).toHaveLength(1);
    expect(data.parHoles).toEqual([]);
  });
});
