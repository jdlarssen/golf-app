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
    full_course_handicap: 18,
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

// F1 in docs/regelbok-gjennomgang.md: NGF 3.1b (s. 31) sets every net double
// bogey from the full course handicap (100 %). The league example: 75 % with a
// cap of 32 on tee 125/70,0/72, index 30,0 → course handicap 31, playing
// handicap 23. Bogey on 17 holes and a 9 on the par 4 with index 6 → cap 8,
// AGS 93, differential 20,8 (the playing handicap would give 19,9).
describe('persistScoreDifferentials — netto dobbeltbogey av fullt banehandicap (F1)', () => {
  const LEAGUE_TEE = { ...TEE, slope_mens: 125, course_rating_mens: 70, par_total_mens: 72 };

  function mockLeagueGame(
    players: Array<{ user_id: string; full_course_handicap: number | null; course_handicap?: number }>,
    lookup: {
      users?: Array<{ id: string; hcp_index: number | string | null }>;
      history?: Array<{ user_id: string; hcp_index: number | string; recorded_at: string }>;
    } = {},
  ) {
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        games: [
          {
            data: {
              course_id: 'course-1',
              tee_box_id: 'tee-1',
              game_mode: 'stableford',
              hcp_allowance_pct: 75,
              hcp_max_strokes: 32,
              started_at: '2026-10-10T10:00:00Z',
              scheduled_tee_off_at: '2026-10-10T10:00:00Z',
              created_at: '2026-10-01T10:00:00Z',
            },
            error: null,
          },
        ],
        game_players: [
          {
            data: players.map((p) => ({ course_handicap: 23, ...p, tee_gender: 'mens' })),
            error: null,
          },
          ...players.map(({ user_id }) => ({ data: [{ user_id }], error: null })),
        ],
        scores: [
          {
            data: players.flatMap(({ user_id }) =>
              HOLES.map((h) => ({
                user_id,
                hole_number: h.hole_number,
                strokes: h.hole_number === 6 ? 9 : 5,
              })),
            ),
            error: null,
          },
        ],
        course_holes: [{ data: HOLES, error: null }],
        tee_boxes: [{ data: LEAGUE_TEE, error: null }],
        users: [{ data: lookup.users ?? [], error: null }],
        handicap_history: [{ data: lookup.history ?? [], error: null }],
      },
    });
  }

  it('freezes the differential from the full course handicap (20,8, not 19,9)', async () => {
    mockLeagueGame([{ user_id: CAPTAIN, full_course_handicap: 31 }]);

    const written = await persistScoreDifferentials(GAME_ID);

    expect(written).toBe(1);
    expect(updates().map((u) => u.args[0])).toEqual([{ score_differential: 20.8 }]);
    // Every row has the full number: no index lookup.
    expect(tablesRead()).not.toContain('users');
    expect(tablesRead()).not.toContain('handicap_history');
  });

  // A round started by an app build from before #2215 (bundled start code)
  // has no full number. The finish recovers it the way the backfill does:
  // only an index that reproduces the frozen playing handicap, and only when
  // every such index agrees on the full number.
  it('no full number: an index that reproduces the frozen 23 gives 31, frozen with the differential', async () => {
    mockLeagueGame([{ user_id: CAPTAIN, full_course_handicap: null }], {
      users: [{ id: CAPTAIN, hcp_index: '30.0' }],
    });

    const written = await persistScoreDifferentials(GAME_ID);

    expect(written).toBe(1);
    expect(updates().map((u) => u.args[0])).toEqual([
      { score_differential: 20.8, full_course_handicap: 31 },
    ]);
  });

  it('no full number and no index that reproduces it → no differential rather than a wrong one', async () => {
    mockLeagueGame([{ user_id: CAPTAIN, full_course_handicap: null }], {
      users: [{ id: CAPTAIN, hcp_index: 12.1 }], // 75 % of 11,4 → 9 ≠ 23
    });

    const written = await persistScoreDifferentials(GAME_ID);

    expect(written).toBe(0);
    expect(updates()).toHaveLength(0);
  });

  it('no full number and indexes that disagree under the cap → no differential', async () => {
    // Frozen 32 under the cap: index 54 (full 58) at the start and 50 (full
    // 53) on the profile both reproduce it.
    mockLeagueGame([{ user_id: CAPTAIN, full_course_handicap: null, course_handicap: 32 }], {
      users: [{ id: CAPTAIN, hcp_index: 50 }],
      history: [{ user_id: CAPTAIN, hcp_index: 54, recorded_at: '2026-09-01T10:00:00Z' }],
    });

    const written = await persistScoreDifferentials(GAME_ID);

    expect(written).toBe(0);
    expect(updates()).toHaveLength(0);
  });
});
