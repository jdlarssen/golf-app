import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fixtures per table — overridden per test. The admin mock routes from(table)
// through .select().eq().single()/.returns() to the matching fixture.
type Fixture = { data: unknown; error: unknown };
let fixtures: Record<string, Fixture>;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => fixtures[table],
          returns: () => Promise.resolve(fixtures[table]),
        }),
      }),
    }),
  }),
}));

const notifyMock = vi.fn().mockResolvedValue({ shouldAlsoSendMail: false });
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

import { notifyAchievementUnlocks } from './notifyAchievementUnlocks';

const GAME = '11111111-1111-1111-1111-111111111111';
const par4 = (hole_number: number) => ({
  hole_number,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: hole_number,
});

beforeEach(() => {
  notifyMock.mockClear();
});

describe('notifyAchievementUnlocks', () => {
  it('notifies only non-withdrawn players who unlocked ≥1 notable moment', async () => {
    fixtures = {
      games: { data: { name: 'Lørdagscup', course_id: 'course1' }, error: null },
      game_players: {
        data: [
          { user_id: 'ace', tee_gender: 'mens', withdrawn_at: null }, // hole-in-one
          { user_id: 'par', tee_gender: 'mens', withdrawn_at: null }, // nothing notable
          { user_id: 'wd', tee_gender: 'mens', withdrawn_at: '2026-01-01' }, // ace but WD
        ],
        error: null,
      },
      scores: {
        data: [
          { user_id: 'ace', hole_number: 1, strokes: 1 }, // ace on a par 4
          { user_id: 'ace', hole_number: 2, strokes: 4 },
          { user_id: 'par', hole_number: 1, strokes: 4 },
          { user_id: 'par', hole_number: 2, strokes: 4 },
          { user_id: 'wd', hole_number: 1, strokes: 1 },
        ],
        error: null,
      },
      course_holes: { data: [par4(1), par4(2)], error: null },
    };

    const sent = await notifyAchievementUnlocks(GAME);

    expect(sent).toBe(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'ace',
      kind: 'achievement_unlocked',
      payload: {
        game_id: GAME,
        game_name: 'Lørdagscup',
        // The implicit eagle of the ace is collapsed (selectNotableMoments).
        moments: [{ kind: 'hole_in_one', count: 1 }],
      },
    });
  });

  it('is a no-op (no notifications) when the game fetch errors', async () => {
    fixtures = {
      games: { data: null, error: { message: 'boom' } },
      game_players: { data: [], error: null },
      scores: { data: [], error: null },
      course_holes: { data: [], error: null },
    };

    const sent = await notifyAchievementUnlocks(GAME);

    expect(sent).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
