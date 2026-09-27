import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/leaderboard';
import { bestBallBoardInput, type BestBallRosterRow } from './bestBallInput';

// Type A (#2217 D3): the best-ball board, «Hull for hull» and the CSV export
// read the same roster through one helper, so a withdrawn player and their
// strokes stay out of all three — the board already did this, the other two
// counted them.

const holeRows = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: i === 0 ? 5 : 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

function row(
  user_id: string,
  team_number: number,
  opts: Partial<BestBallRosterRow> = {},
): BestBallRosterRow {
  return {
    user_id,
    team_number,
    course_handicap: 0,
    tee_gender: 'mens',
    withdrawn_at: null,
    users: { name: user_id, nickname: null },
    ...opts,
  };
}

const roster: BestBallRosterRow[] = [
  row('per', 1),
  row('paal', 1),
  row('kari', 2, { course_handicap: 14 }),
  // Ola withdrew after hole 6; his strokes stay in the scores table.
  row('ola', 2, { withdrawn_at: '2026-09-25T10:00:00Z' }),
  // A deleted account: no users row.
  row('ghost', 2, { users: null }),
];

const scoreRows = [
  ...holeRows.map((h) => ({ user_id: 'per', hole_number: h.hole_number, strokes: 4 })),
  ...holeRows.map((h) => ({ user_id: 'kari', hole_number: h.hole_number, strokes: 5 })),
  // Ola beat Kari on holes 1–6 before withdrawing.
  ...holeRows
    .filter((h) => h.hole_number <= 6)
    .map((h) => ({ user_id: 'ola', hole_number: h.hole_number, strokes: 3 })),
];

const base = {
  gameMode: 'best_ball' as const,
  modeConfig: { kind: 'best_ball' as const, team_size: 2 as const, teams_count: 2 },
  roster,
  holeRows,
  scoreRows,
  unknownPlayer: 'Ukjent',
};

describe('bestBallBoardInput', () => {
  it('keeps a withdrawn player out of players and scores, and lists them as withdrawn', () => {
    const input = bestBallBoardInput(base);

    expect(input.players.map((p) => p.userId)).toEqual(['per', 'paal', 'kari']);
    expect(input.withdrawn).toEqual([{ user_id: 'ola', display_name: 'ola' }]);
    expect(input.scores.some((s) => s.userId === 'ola')).toBe(false);
    expect(input.scores).toHaveLength(36);
  });

  it('gives team 2 Kari’s total on the board, not a best ball with Ola’s holes', () => {
    const input = bestBallBoardInput(base);
    const lines = computeLeaderboard({ mode: 'brutto', ...input });
    const team2 = lines.find((l) => l.teamNumber === 2)!;

    // Kari alone: 18 × 5. With Ola's 3s on 1–6 it would have been 78.
    expect(team2.total).toBe(90);
    expect(team2.players.map((p) => p.userId)).toEqual(['kari']);
  });

  it('drops a player without a users row from both players and withdrawn', () => {
    const input = bestBallBoardInput({
      ...base,
      roster: [...roster, row('ghost-wd', 2, { users: null, withdrawn_at: '2026-09-25T10:00:00Z' })],
    });

    expect(input.players.map((p) => p.userId)).not.toContain('ghost');
    expect(input.withdrawn.map((p) => p.user_id)).not.toContain('ghost-wd');
  });

  it('maps holes with par_mens as par and the per-gender pars', () => {
    const { holes } = bestBallBoardInput(base);

    expect(holes[0]).toEqual({
      holeNumber: 1,
      par: 4,
      parByGender: { mens: 4, ladies: 5, juniors: 4 },
      strokeIndex: 1,
    });
  });

  it('uses the unknown-player name when the users row has no name', () => {
    const input = bestBallBoardInput({
      ...base,
      roster: [row('anon', 1, { users: { name: null, nickname: 'Anon' } })],
    });

    expect(input.players[0]).toMatchObject({ name: 'Ukjent', nickname: 'Anon' });
  });

  it('gives best ball the raw course handicap, and 0 for a null one', () => {
    const input = bestBallBoardInput({
      ...base,
      roster: [row('kari', 2, { course_handicap: 14 }), row('nil', 2, { course_handicap: null })],
    });

    expect(input.players.map((p) => p.courseHandicap)).toEqual([14, 0]);
  });
});
