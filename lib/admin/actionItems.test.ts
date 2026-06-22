import { describe, it, expect } from 'vitest';
import {
  computeActionItemCounts,
  totalActionableGames,
  type ActiveGameInput,
  type ActivePlayerInput,
} from './actionItems';

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<ActiveGameInput> = {}): ActiveGameInput {
  return {
    id: 'g1',
    name: 'Tirsdagsrunde',
    requirePeerApproval: false,
    ...overrides,
  };
}

function makePlayer(
  gameId: string,
  overrides: Partial<Omit<ActivePlayerInput, 'gameId'>> = {},
): ActivePlayerInput {
  return {
    gameId,
    submittedAt: null,
    approvedAt: null,
    withdrawnAt: null,
    holesFilled: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('computeActionItemCounts', () => {
  it('returns empty lists when there are no active games', () => {
    const result = computeActionItemCounts([], []);
    expect(result).toEqual({ unsubmitted: [], pendingApproval: [] });
  });

  it('returns empty lists when a game has no players', () => {
    const result = computeActionItemCounts([makeGame()], []);
    expect(result).toEqual({ unsubmitted: [], pendingApproval: [] });
  });

  it.each([
    ['not_started (0 holes)', 0],
    ['playing (mid-round, 9 holes)', 9],
    ['playing (17 holes)', 17],
  ])('does not count a mid-round player (%s)', (_label, holesFilled) => {
    const result = computeActionItemCounts(
      [makeGame()],
      [makePlayer('g1', { holesFilled })],
    );
    expect(result).toEqual({ unsubmitted: [], pendingApproval: [] });
  });

  it('counts a game with a ready_not_delivered player as unsubmitted', () => {
    const result = computeActionItemCounts(
      [makeGame()],
      [makePlayer('g1', { holesFilled: 18 })],
    );
    expect(result.unsubmitted).toEqual([{ gameId: 'g1', name: 'Tirsdagsrunde' }]);
    expect(result.pendingApproval).toEqual([]);
  });

  it('does not count a game in unsubmitted when the only player has already submitted', () => {
    const result = computeActionItemCounts(
      [makeGame()],
      [makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' })],
    );
    expect(result.unsubmitted).toEqual([]);
  });

  it('counts a submitted-not-approved player in pendingApproval when requirePeerApproval=true', () => {
    const result = computeActionItemCounts(
      [makeGame({ requirePeerApproval: true })],
      [makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' })],
    );
    expect(result.pendingApproval).toEqual([{ gameId: 'g1', name: 'Tirsdagsrunde' }]);
    expect(result.unsubmitted).toEqual([]);
  });

  it('does NOT count a submitted-not-approved player when requirePeerApproval=false', () => {
    const result = computeActionItemCounts(
      [makeGame({ requirePeerApproval: false })],
      [makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' })],
    );
    expect(result).toEqual({ unsubmitted: [], pendingApproval: [] });
  });

  it('excludes withdrawn players from both lists', () => {
    const result = computeActionItemCounts(
      [makeGame({ requirePeerApproval: true })],
      [
        makePlayer('g1', {
          holesFilled: 18,
          withdrawnAt: '2024-01-01T09:00:00Z',
        }),
      ],
    );
    expect(result).toEqual({ unsubmitted: [], pendingApproval: [] });
  });

  it('puts a game in both lists when different players trigger each condition', () => {
    const result = computeActionItemCounts(
      [makeGame({ requirePeerApproval: true })],
      [
        // ready_not_delivered → unsubmitted
        makePlayer('g1', { holesFilled: 18, submittedAt: null }),
        // submitted, not approved → pendingApproval
        makePlayer('g1', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' }),
      ],
    );
    expect(result.unsubmitted).toEqual([{ gameId: 'g1', name: 'Tirsdagsrunde' }]);
    expect(result.pendingApproval).toEqual([{ gameId: 'g1', name: 'Tirsdagsrunde' }]);
  });

  it('deduplicates: a game appears once even when multiple players trigger the same condition', () => {
    const result = computeActionItemCounts(
      [makeGame()],
      [
        makePlayer('g1', { holesFilled: 18 }),
        makePlayer('g1', { holesFilled: 18 }),
      ],
    );
    expect(result.unsubmitted).toHaveLength(1);
  });

  it('handles multiple games independently', () => {
    const games: ActiveGameInput[] = [
      makeGame({ id: 'g1', name: 'Spill 1' }),
      makeGame({ id: 'g2', name: 'Spill 2', requirePeerApproval: true }),
      makeGame({ id: 'g3', name: 'Spill 3' }), // all clean
    ];
    const players: ActivePlayerInput[] = [
      makePlayer('g1', { holesFilled: 18 }), // ready_not_delivered
      makePlayer('g2', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z' }), // pending_approval
      makePlayer('g3', { holesFilled: 18, submittedAt: '2024-01-01T10:00:00Z', approvedAt: '2024-01-01T11:00:00Z' }), // delivered
    ];
    const result = computeActionItemCounts(games, players);
    expect(result.unsubmitted).toEqual([{ gameId: 'g1', name: 'Spill 1' }]);
    expect(result.pendingApproval).toEqual([{ gameId: 'g2', name: 'Spill 2' }]);
  });

  it('count===1 case: returns the actual gameId and name for single-game navigation', () => {
    const result = computeActionItemCounts(
      [makeGame({ id: 'abc-123', name: 'Cupfinale' })],
      [makePlayer('abc-123', { holesFilled: 18 })],
    );
    expect(result.unsubmitted[0]).toEqual({ gameId: 'abc-123', name: 'Cupfinale' });
  });
});

describe('totalActionableGames', () => {
  it('returns 0 when both lists are empty', () => {
    expect(totalActionableGames({ unsubmitted: [], pendingApproval: [] })).toBe(0);
  });

  it('deduplicates when a game appears in both lists', () => {
    const counts = {
      unsubmitted: [{ gameId: 'g1', name: 'X' }],
      pendingApproval: [{ gameId: 'g1', name: 'X' }],
    };
    expect(totalActionableGames(counts)).toBe(1);
  });

  it('counts distinct games across both lists', () => {
    const counts = {
      unsubmitted: [{ gameId: 'g1', name: 'X' }],
      pendingApproval: [{ gameId: 'g2', name: 'Y' }],
    };
    expect(totalActionableGames(counts)).toBe(2);
  });
});
