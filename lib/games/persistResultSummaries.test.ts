import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { ModeResult } from '@/lib/scoring/modes/types';
import type { GameForScoring } from '@/lib/scoring/buildModeResultForGame';

// Type A (#2213, D6). The module's DB boundary is mocked: the service-role
// client and the ModeResult read. `computeResultSummaries` runs for real, so
// the summaries (and the ranked user ids) come from the actual mapping.
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const buildModeResultForGameMock = vi.fn();
vi.mock('@/lib/scoring/buildModeResultForGame', () => ({
  buildModeResultForGame: (...args: unknown[]) => buildModeResultForGameMock(...args),
}));

import { persistResultSummaries } from './persistResultSummaries';

const GAME_ID = 'game-2213';
const GAME: GameForScoring = {
  id: GAME_ID,
  game_mode: 'solo_strokeplay',
  mode_config: { kind: 'solo_strokeplay', team_size: 1 },
  course_id: 'course-1',
};

function soloStrokeplayResult(userIds: string[]): ModeResult {
  return {
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: userIds.map((userId, i) => ({
      userId,
      totalNetStrokes: 70 + i,
      totalGrossStrokes: 74 + i,
      holesPlayed: 18,
      netToPar: -2 + i,
      rank: i + 1,
      tiedWith: [],
    })),
  };
}

type Call = (typeof adminMock.__fromCalls)[number];

/** Splits the recorded builder calls into one chain per `.update(...)`. */
function updateChains(): Call[][] {
  const chains: Call[][] = [];
  for (const call of adminMock.__fromCalls) {
    if (call.method === 'update') chains.push([call]);
    else if (chains.length > 0) chains[chains.length - 1].push(call);
  }
  return chains;
}

function cleanupChains(): Call[][] {
  return updateChains().filter(
    (chain) =>
      JSON.stringify(chain[0].args[0]) === JSON.stringify({ result_summary: null }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = buildSupabaseMock([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('persistResultSummaries — stale placements (#2213)', () => {
  it('clears result_summary for every player outside the ranked set, once', async () => {
    buildModeResultForGameMock.mockResolvedValue(soloStrokeplayResult(['u1', 'u2']));

    const written = await persistResultSummaries(GAME);

    expect(written).toBe(2);
    const cleanups = cleanupChains();
    expect(cleanups).toHaveLength(1);
    const [cleanup] = cleanups;
    expect(cleanup).toContainEqual({
      table: 'game_players',
      method: 'eq',
      args: ['game_id', GAME_ID],
    });
    expect(cleanup).toContainEqual({
      table: 'game_players',
      method: 'not',
      args: ['user_id', 'in', '(u1,u2)'],
    });
    expect(cleanup).toContainEqual({
      table: 'game_players',
      method: 'not',
      args: ['result_summary', 'is', null],
    });
    // The ranked players still get their own summary written.
    expect(updateChains()).toHaveLength(3);
  });

  it.each([
    ['result is null', null],
    ['nobody is ranked', soloStrokeplayResult([])],
  ])('%s: clears every stale summary in the game, with no user_id filter', async (_label, result) => {
    buildModeResultForGameMock.mockResolvedValue(result);

    const written = await persistResultSummaries(GAME);

    expect(written).toBe(0);
    const chains = updateChains();
    expect(chains).toHaveLength(1);
    const [cleanup] = chains;
    expect(cleanup[0].args[0]).toEqual({ result_summary: null });
    expect(cleanup).toContainEqual({
      table: 'game_players',
      method: 'eq',
      args: ['game_id', GAME_ID],
    });
    expect(cleanup).toContainEqual({
      table: 'game_players',
      method: 'not',
      args: ['result_summary', 'is', null],
    });
    expect(cleanup.some((c) => c.method === 'not' && c.args[0] === 'user_id')).toBe(false);
  });

  it('touches nothing when the result read throws', async () => {
    buildModeResultForGameMock.mockRejectedValue(new Error('read failed'));

    const written = await persistResultSummaries(GAME);

    expect(written).toBe(0);
    expect(updateChains()).toHaveLength(0);
  });
});
