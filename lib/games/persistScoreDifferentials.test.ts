import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { GameMode } from '@/lib/scoring/modes/types';

// Type A (#2273). The service-role client is the DB boundary and is mocked;
// the differential formula runs for real. In a team-ball format every stroke
// lies on the captain, so the captain's 18 «own» holes are the team's ball and
// must never be frozen as a personal WHS differential.
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

import { persistScoreDifferentials } from './persistScoreDifferentials';

const GAME_ID = 'game-2273';
const CAPTAIN = 'captain';
const TEAMMATE = 'teammate';

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

const TEE = {
  slope_mens: 113,
  course_rating_mens: 72,
  par_total_mens: 72,
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

function eighteenHoles(userId: string) {
  return HOLES.map((h) => ({ user_id: userId, hole_number: h.hole_number, strokes: 5 }));
}

/**
 * One game, two players with course handicap 18. `scoredUsers` decides who
 * has 18 scores rows: in a team-ball game only the captain does.
 */
function mockGame(gameMode: GameMode, scoredUsers: string[]) {
  const players = [CAPTAIN, TEAMMATE].map((user_id) => ({
    user_id,
    tee_gender: 'mens',
    course_handicap: 18,
  }));
  adminMock = buildSupabaseMock([], {}, {
    byTable: {
      games: [
        {
          data: { course_id: 'course-1', tee_box_id: 'tee-1', game_mode: gameMode },
          error: null,
        },
      ],
      // First entry answers the players read; the rest answer the updates.
      game_players: [
        { data: players, error: null },
        ...scoredUsers.map((user_id) => ({ data: [{ user_id }], error: null })),
      ],
      scores: [{ data: scoredUsers.flatMap(eighteenHoles), error: null }],
      course_holes: [{ data: HOLES, error: null }],
      tee_boxes: [{ data: TEE, error: null }],
    },
  });
}

function updates() {
  return adminMock.__fromCalls.filter((c) => c.method === 'update');
}

function tablesRead() {
  return adminMock.from.mock.calls.map(([table]) => table);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('persistScoreDifferentials — team-ball rounds (#2273)', () => {
  it.each<GameMode>(['texas_scramble', 'foursomes_matchplay', 'patsome'])(
    '%s: the captain’s 18 holes are the team’s ball — no write, returns 0',
    async (mode) => {
      mockGame(mode, [CAPTAIN]);

      const written = await persistScoreDifferentials(GAME_ID);

      expect(written).toBe(0);
      expect(updates()).toHaveLength(0);
      // Returns before the course and tee lookups: nothing left to compute.
      expect(tablesRead()).not.toContain('course_holes');
      expect(tablesRead()).not.toContain('tee_boxes');
    },
  );

  it('solo_strokeplay: still freezes one differential per player', async () => {
    mockGame('solo_strokeplay', [CAPTAIN, TEAMMATE]);

    const written = await persistScoreDifferentials(GAME_ID);

    expect(written).toBe(2);
    const writes = updates();
    expect(writes).toHaveLength(2);
    // 18 × 5 on par-72, slope 113, CR 72 → (113/113) × (90 − 72).
    for (const w of writes) {
      expect(w.args[0]).toEqual({ score_differential: 18 });
    }
  });
});
