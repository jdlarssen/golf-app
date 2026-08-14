import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getActiveGameCardData, type ActiveGameForCard } from './getActiveGameCardData';

type ScoreRow = { game_id: string; hole_number: number; user_id: string };
type MateRow = {
  game_id: string;
  user_id: string;
  team_number: number | null;
  withdrawn_at?: string | null;
};

/**
 * Minimal fake mirroring exactly the query chain getActiveGameCardData
 * issues: `.from('scores').select().in().in().not()` and
 * `.from('game_players').select().in()`.
 *
 * Both `.in()` filters are applied for real (#1538): the scores query now asks
 * for {viewer, team captain} rather than the viewer alone, so a fake that
 * ignored the user filter would let a test pass on rows PostgREST would never
 * have returned — and would hide the per-game attribution the helper does.
 */
function fakeSupabase(
  scoreRows: ScoreRow[],
  mateRows: MateRow[] = [],
): SupabaseClient<Database> {
  const fake = {
    from(table: string) {
      if (table === 'scores') {
        return {
          select: () => ({
            in: (_gameCol: string, gameIds: string[]) => ({
              in: (_userCol: string, userIds: string[]) => ({
                not: () =>
                  Promise.resolve({
                    data: scoreRows.filter(
                      (r) =>
                        gameIds.includes(r.game_id) && userIds.includes(r.user_id),
                    ),
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === 'game_players') {
        return {
          select: () => ({
            in: (_gameCol: string, gameIds: string[]) =>
              Promise.resolve({
                data: mateRows.filter((r) => gameIds.includes(r.game_id)),
                error: null,
              }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return fake as unknown as SupabaseClient<Database>;
}

function baseGame(overrides: Partial<ActiveGameForCard> = {}): ActiveGameForCard {
  return {
    id: 'g1',
    game_mode: 'best_ball',
    require_peer_approval: false,
    submitted_at: null,
    withdrawn_at: null,
    approved_at: null,
    hole_segment: 'full',
    ...overrides,
  };
}

/** Score rows default to the viewer ('u1') — the pre-#1538 fixture shape. */
function holes(
  gameId: string,
  holeNumbers: number[],
  userId = 'u1',
): ScoreRow[] {
  return holeNumbers.map((hole_number) => ({
    game_id: gameId,
    hole_number,
    user_id: userId,
  }));
}

describe('getActiveGameCardData — hole-segment scope (#1441)', () => {
  it('full-round game with no scores → next hole is 1 (unchanged default behavior)', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase([]),
      'u1',
      [baseGame({ hole_segment: 'full' })],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/holes/1');
  });

  it('back9 game with no scores yet → next hole is 10, not 1 (regression: the naive 1..N loop used to land out of scope)', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase([]),
      'u1',
      [baseGame({ hole_segment: 'back9' })],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/holes/10');
  });

  it('back9 game with hole 10 filled → next hole is 11', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase(holes('g1', [10])),
      'u1',
      [baseGame({ hole_segment: 'back9' })],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/holes/11');
  });

  it('back9 game with all 9 holes (10-18) filled → links to /submit, not stuck waiting for 18 scores', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase(holes('g1', [10, 11, 12, 13, 14, 15, 16, 17, 18])),
      'u1',
      [baseGame({ hole_segment: 'back9' })],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/submit');
  });

  it('front9 game with all 9 holes (1-9) filled → links to /submit', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase(holes('g1', [1, 2, 3, 4, 5, 6, 7, 8, 9])),
      'u1',
      [baseGame({ hole_segment: 'front9' })],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/submit');
  });
});

describe('getActiveGameCardData — team-collapsed rounds count the captain’s rows (#1538)', () => {
  // Greensome: one ball per team, so every tap lands on the captain's row —
  // the lex-min user_id, 'u1' here. 'u2' is the mate, who owns nothing.
  const greensome = baseGame({
    id: 'g1',
    game_mode: 'greensome_matchplay',
    hole_segment: 'front9',
  });
  const greensomeRoster: MateRow[] = [
    { game_id: 'g1', user_id: 'u1', team_number: 1 },
    { game_id: 'g1', user_id: 'u2', team_number: 1 },
  ];

  it('mate of a captain who filled all 9 holes gets /submit — the same card the captain sees', async () => {
    const scores = holes('g1', [1, 2, 3, 4, 5, 6, 7, 8, 9], 'u1');

    const mate = await getActiveGameCardData(
      fakeSupabase(scores, greensomeRoster),
      'u2',
      [greensome],
    );
    const captain = await getActiveGameCardData(
      fakeSupabase(scores, greensomeRoster),
      'u1',
      [greensome],
    );

    expect(mate.get('g1')?.href).toBe('/games/g1/submit');
    expect(mate.get('g1')?.nextHole).toBeNull();
    expect(mate.get('g1')).toEqual(captain.get('g1'));
  });

  it('mate is sent to hole 4 after the captain has filled 3 holes, not back to hole 1', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase(holes('g1', [1, 2, 3], 'u1'), greensomeRoster),
      'u2',
      [greensome],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/holes/4');
    expect(result.get('g1')?.nextHole).toBe(4);
  });

  it('viewer with no team_number falls back to their own rows (today’s behavior)', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase(holes('g1', [1, 2, 3], 'u1'), [
        { game_id: 'g1', user_id: 'u1', team_number: 1 },
        { game_id: 'g1', user_id: 'u2', team_number: null },
      ]),
      'u2',
      [greensome],
    );
    expect(result.get('g1')?.nextHole).toBe(1);
  });

  it('unreadable roster (RLS returns nothing) degrades to own rows instead of throwing', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase(holes('g1', [1, 2, 3], 'u1'), []),
      'u2',
      [greensome],
    );
    expect(result.get('g1')?.nextHole).toBe(1);
  });

  it('per-player formats still count only the viewer’s rows (best ball is not collapsed)', async () => {
    const result = await getActiveGameCardData(
      fakeSupabase(holes('g1', [1, 2, 3], 'u1'), [
        { game_id: 'g1', user_id: 'u1', team_number: 1 },
        { game_id: 'g1', user_id: 'u2', team_number: 1 },
      ]),
      'u2',
      [baseGame({ id: 'g1', game_mode: 'best_ball' })],
    );
    expect(result.get('g1')?.nextHole).toBe(1);
  });

  it('a captain in one game does not leak into a game where they are an ordinary player', async () => {
    // g1: greensome — u1 is captain, u2 the mate, 3 holes on the shared card.
    // g2: best ball — u1 and u2 both play, each on their own card. u1 has
    // raced ahead to hole 9; u2 has only hole 1. The scores query asks for
    // {u2, u1} across BOTH games, so u1's g2 rows come back too — they must
    // not be counted as u2's progress there.
    const result = await getActiveGameCardData(
      fakeSupabase(
        [
          ...holes('g1', [1, 2, 3], 'u1'),
          ...holes('g2', [1, 2, 3, 4, 5, 6, 7, 8, 9], 'u1'),
          ...holes('g2', [1], 'u2'),
        ],
        greensomeRoster,
      ),
      'u2',
      [greensome, baseGame({ id: 'g2', game_mode: 'best_ball' })],
    );

    expect(result.get('g1')?.nextHole).toBe(4);
    expect(result.get('g2')?.nextHole).toBe(2);
  });

  it('patsome counts own rows on the 4BBB half and the captain’s only from hole 7', async () => {
    // Patsome changes shape mid-round: 1-6 is 4BBB (every player owns their
    // own ball) and 7-18 is foursomes (one shared card on the captain's row).
    // u2 has 1-3 of their own; captain u1 has 4-5 of THEIR own 4BBB ball
    // (which says nothing about u2's progress) plus the shared 7-8.
    const result = await getActiveGameCardData(
      fakeSupabase(
        [
          ...holes('g1', [1, 2, 3], 'u2'),
          ...holes('g1', [4, 5], 'u1'),
          ...holes('g1', [7, 8], 'u1'),
        ],
        [
          { game_id: 'g1', user_id: 'u1', team_number: 1 },
          { game_id: 'g1', user_id: 'u2', team_number: 1 },
        ],
      ),
      'u2',
      [baseGame({ id: 'g1', game_mode: 'patsome', hole_segment: 'full' })],
    );
    // Holes 4-5 belong to u1 alone, so u2 is still sent to hole 4.
    expect(result.get('g1')?.nextHole).toBe(4);
  });

  it('withdrawn captain is skipped — the next active member owns the card', async () => {
    // Theoretical admin path (withdrawal is not offered in these modes), but
    // the owner rule must not hand the card to a withdrawn member.
    const result = await getActiveGameCardData(
      fakeSupabase(holes('g1', [1, 2, 3], 'u2'), [
        { game_id: 'g1', user_id: 'u1', team_number: 1, withdrawn_at: '2026-08-14T10:00:00Z' },
        { game_id: 'g1', user_id: 'u2', team_number: 1 },
        { game_id: 'g1', user_id: 'u3', team_number: 1 },
      ]),
      'u3',
      [greensome],
    );
    // Lex-min among the ACTIVE members is u2, whose rows carry the team.
    expect(result.get('g1')?.nextHole).toBe(4);
  });
});
