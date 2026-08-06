import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getActiveGameCardData, type ActiveGameForCard } from './getActiveGameCardData';

/**
 * Minimal fake mirroring exactly the query chain getActiveGameCardData
 * issues: `.from('scores').select().in().eq().not()` and
 * `.from('game_players').select().in()`. No approval-games in these fixtures
 * (require_peer_approval: false everywhere), so the game_players branch is
 * never exercised — it still needs a shape that resolves.
 */
function fakeSupabase(
  scoreRows: { game_id: string; hole_number: number }[],
): SupabaseClient<Database> {
  const fake = {
    from(table: string) {
      if (table === 'scores') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                not: () => Promise.resolve({ data: scoreRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'game_players') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
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
      fakeSupabase([{ game_id: 'g1', hole_number: 10 }]),
      'u1',
      [baseGame({ hole_segment: 'back9' })],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/holes/11');
  });

  it('back9 game with all 9 holes (10-18) filled → links to /submit, not stuck waiting for 18 scores', async () => {
    const scoreRows = Array.from({ length: 9 }, (_, i) => ({
      game_id: 'g1',
      hole_number: 10 + i,
    }));
    const result = await getActiveGameCardData(
      fakeSupabase(scoreRows),
      'u1',
      [baseGame({ hole_segment: 'back9' })],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/submit');
  });

  it('front9 game with all 9 holes (1-9) filled → links to /submit', async () => {
    const scoreRows = Array.from({ length: 9 }, (_, i) => ({
      game_id: 'g1',
      hole_number: 1 + i,
    }));
    const result = await getActiveGameCardData(
      fakeSupabase(scoreRows),
      'u1',
      [baseGame({ hole_segment: 'front9' })],
    );
    expect(result.get('g1')?.href).toBe('/games/g1/submit');
  });
});
