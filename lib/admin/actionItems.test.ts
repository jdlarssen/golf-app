import { describe, it, expect } from 'vitest';
import {
  computeActionItemCounts,
  holesFilledByGame,
  totalActionableGames,
  type ActiveGameInput,
  type ActivePlayerInput,
  type HolesRosterRow,
  type HolesScoreRow,
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

  // #1441 (F5 polish): a segment game (front9/back9) is "ready" at 9 holes,
  // not 18 — without expectedHoles a finished split-day round never surfaced.
  it('counts a finished 9-hole segment game (expectedHoles=9) as ready_not_delivered at 9 holes', () => {
    const result = computeActionItemCounts(
      [makeGame({ expectedHoles: 9 })],
      [makePlayer('g1', { holesFilled: 9 })],
    );
    expect(result.unsubmitted).toEqual([{ gameId: 'g1', name: 'Tirsdagsrunde' }]);
  });

  it('does not count a 9-hole segment game as ready at 17 holes (still 18-hole thinking without expectedHoles)', () => {
    const result = computeActionItemCounts(
      [makeGame({ expectedHoles: 9 })],
      [makePlayer('g1', { holesFilled: 8 })],
    );
    expect(result.unsubmitted).toEqual([]);
  });

  it('defaults to 18 expected holes when expectedHoles is omitted (full-18 games unchanged)', () => {
    const result = computeActionItemCounts(
      [makeGame()],
      [makePlayer('g1', { holesFilled: 9 })],
    );
    expect(result.unsubmitted).toEqual([]);
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

// ─── holesFilledByGame (#2045) ────────────────────────────────────────────

/**
 * Type A: stripa teller hull med samme hjem som purringen (#2017) —
 * `filledHolesByPlayer`, gruppert per spill med spillets modus. Eierskaps-
 * reglene har egne suiter; her bevises at limet grupperer og spør riktig.
 */
describe('holesFilledByGame', () => {
  type Roster = HolesRosterRow;
  type Score = HolesScoreRow;

  const member = (
    game_id: string,
    user_id: string,
    team_number: number | null,
    withdrawn_at: string | null = null,
  ): Roster => ({ game_id, user_id, team_number, withdrawn_at });

  const rows = (game_id: string, user_id: string, from: number, to: number): Score[] =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      game_id,
      user_id,
      hole_number: from + i,
    }));

  const asObject = (m: Map<string, number>) => Object.fromEntries(m);

  it('patsome: makkeren med 1–6 og kapteinens 7–18 er ferdig, og spillet flagges når kapteinen har levert', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'patsome' }],
      players: [member('g1', 'a', 1), member('g1', 'b', 1)],
      scores: [...rows('g1', 'a', 1, 18), ...rows('g1', 'b', 1, 6)],
    });

    expect(asObject(holes)).toEqual({ 'g1:a': 18, 'g1:b': 18 });

    const counts = computeActionItemCounts(
      [makeGame({ id: 'g1' })],
      [
        makePlayer('g1', { holesFilled: holes.get('g1:a')!, submittedAt: '2026-09-17T10:00:00Z' }),
        makePlayer('g1', { holesFilled: holes.get('g1:b')! }),
      ],
    );
    expect(counts.unsubmitted).toEqual([{ gameId: 'g1', name: 'Tirsdagsrunde' }]);
  });

  it('patsome: makkerens løse rader på 7–18 og kapteinens rader på 1–6 teller ikke for makkeren', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'patsome' }],
      players: [member('g1', 'a', 1), member('g1', 'b', 1)],
      // Kapteinen har bare 4BBB-halvdelen; b har egne 1–5 og data-rester på 7–18.
      scores: [...rows('g1', 'a', 1, 6), ...rows('g1', 'b', 1, 5), ...rows('g1', 'b', 7, 18)],
    });

    expect(asObject(holes)).toEqual({ 'g1:a': 6, 'g1:b': 5 });
  });

  it('patsome: makker med 5 egne rader og ferdig lagkort er fortsatt midt i runden', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'patsome' }],
      players: [member('g1', 'a', 1), member('g1', 'b', 1)],
      scores: [...rows('g1', 'a', 1, 18), ...rows('g1', 'b', 1, 5)],
    });

    expect(holes.get('g1:b')).toBe(17);
    const counts = computeActionItemCounts(
      [makeGame({ id: 'g1' })],
      [
        makePlayer('g1', { holesFilled: holes.get('g1:a')!, submittedAt: '2026-09-17T10:00:00Z' }),
        makePlayer('g1', { holesFilled: holes.get('g1:b')! }),
      ],
    );
    expect(counts.unsubmitted).toEqual([]);
  });

  it('scramble: lagkameraten uten egne rader får kapteinens 18', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'texas_scramble' }],
      players: [member('g1', 'a', 1), member('g1', 'b', 1)],
      scores: rows('g1', 'a', 1, 18),
    });

    expect(asObject(holes)).toEqual({ 'g1:a': 18, 'g1:b': 18 });
  });

  it('flere spill med ulike modi telles hver for seg, uten lekkasje mellom spill', () => {
    const holes = holesFilledByGame({
      games: [
        { id: 'g1', game_mode: 'solo_strokeplay' },
        { id: 'g2', game_mode: 'patsome' },
      ],
      players: [
        // Samme brukere i begge spill, og i g1 har de team_number satt.
        member('g1', 'a', 1),
        member('g1', 'b', 1),
        member('g2', 'a', 1),
        member('g2', 'b', 1),
      ],
      scores: [
        ...rows('g1', 'a', 1, 18),
        ...rows('g1', 'b', 1, 4),
        ...rows('g2', 'a', 1, 9),
        ...rows('g2', 'b', 1, 6),
      ],
    });

    expect(asObject(holes)).toEqual({
      // Slagspill kollapser ikke: egne rader.
      'g1:a': 18,
      'g1:b': 4,
      // Patsome: b har 6 egne + kapteinens 7–9.
      'g2:a': 9,
      'g2:b': 9,
    });
  });

  it('trukket kaptein: eierskapet går videre, og den trukne havner aldri i unsubmitted', () => {
    const holes = holesFilledByGame({
      games: [{ id: 'g1', game_mode: 'texas_scramble' }],
      players: [
        member('g1', 'a', 1, '2026-09-17T09:00:00Z'),
        member('g1', 'b', 1),
        member('g1', 'c', 1),
      ],
      // a (trukket, lex-min) har bare 1–9; b er ny eier og har 18. Hadde a
      // fortsatt eid radene, ville c stått på 9.
      scores: [...rows('g1', 'a', 1, 9), ...rows('g1', 'b', 1, 18)],
    });

    expect(holes.get('g1:b')).toBe(18);
    expect(holes.get('g1:c')).toBe(18);

    const counts = computeActionItemCounts(
      [makeGame({ id: 'g1' })],
      [
        makePlayer('g1', {
          holesFilled: holes.get('g1:a')!,
          withdrawnAt: '2026-09-17T09:00:00Z',
        }),
        makePlayer('g1', { holesFilled: holes.get('g1:b')!, submittedAt: '2026-09-17T10:00:00Z' }),
        makePlayer('g1', { holesFilled: holes.get('g1:c')!, submittedAt: '2026-09-17T10:00:00Z' }),
      ],
    );
    expect(counts.unsubmitted).toEqual([]);
  });
});
