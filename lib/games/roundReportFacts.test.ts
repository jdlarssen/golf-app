/**
 * Tests for buildRoundReportFacts (#1008 — AI round-report fact-builder).
 * Written FIRST (TDD); run `npx vitest run lib/games/roundReportFacts.test.ts`.
 *
 * Fasit criterion: every number that appears in `facts` MUST equal the
 * corresponding number in the `ModeResult` fixture — these tests assert
 * that equality directly, not via a snapshot, so a scoring regression fails
 * loudly here rather than silently drifting into the LLM prompt.
 */

import { describe, expect, it } from 'vitest';

import type {
  AceyDeuceyResult,
  BestBallResult,
  BingoBangoBongoResult,
  FourballMatchplayResult,
  NassauResult,
  NinesResult,
  RoundRobinResult,
  ShambleResult,
  SinglesMatchplayResult,
  SkinsResult,
  SoloStrokeplayResult,
  StablefordResult,
  TexasScrambleResult,
  WolfResult,
} from '@/lib/scoring/modes/types';

import { buildRoundReportFacts, type RoundReportMatchplayFacts } from './roundReportFacts';

/** Narrows the decided-match branch so tests can read winnerName/margin/momentum directly. */
function decided(
  facts: RoundReportMatchplayFacts | undefined,
): Extract<RoundReportMatchplayFacts, { undecided: false }> {
  if (!facts || facts.undecided) throw new Error('expected a decided match in the fixture');
  return facts;
}

function names(...pairs: [string, string][]): Map<string, string> {
  return new Map(pairs);
}

const BASE = {
  gameName: 'Lørdagscup',
  courseName: 'Oslo GK',
  endedAt: '2026-07-01T18:00:00.000Z',
  coursePar: 72,
};

// ---------------------------------------------------------------------------
// Placement band — solo_strokeplay
// ---------------------------------------------------------------------------
describe('solo_strokeplay — placement band + checkpoints', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    holes: [
      {
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        perPlayer: [
          { userId: 'u1', gross: 4, net: 4, par: 4 },
          { userId: 'u2', gross: 5, net: 5, par: 4 },
        ],
        bestUserIds: ['u1'],
      },
      {
        holeNumber: 2,
        par: 4,
        strokeIndex: 2,
        perPlayer: [
          { userId: 'u1', gross: 4, net: 4, par: 4 },
          { userId: 'u2', gross: null, net: null, par: 4 },
        ],
        bestUserIds: ['u1'],
      },
    ],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 75, totalGrossStrokes: 79, holesPlayed: 18, rank: 2, tiedWith: [] },
    ],
  };
  const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob']);

  it('band is placement', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'solo_strokeplay',
      ...BASE,
    });
    expect(facts.band).toBe('placement');
  });

  it('formatLabel comes from MODE_LABELS[gameMode]', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'solo_strokeplay',
      ...BASE,
    });
    expect(facts.formatLabel).toBe('Slagspill');
  });

  it('winner name + standings numbers match the ModeResult totals', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'solo_strokeplay',
      ...BASE,
    });
    expect(facts.winnerName).toBe('Alice');
    expect(facts.standings).toEqual([
      { rank: 1, name: 'Alice', scoreLabel: '−2' },
      { rank: 2, name: 'Bob', scoreLabel: '+3' },
    ]);
  });

  it('scoredHoles counts holes with at least one recorded gross', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'solo_strokeplay',
      ...BASE,
    });
    // Both hole 1 and hole 2 have at least one non-null gross.
    expect(facts.scoredHoles).toBe(2);
  });

  it('never emits raw userIds — missing name falls back', () => {
    const sparseNames = names(['u1', 'Alice']); // u2 missing
    const facts = buildRoundReportFacts({
      result,
      nameByUserId: sparseNames,
      gameMode: 'solo_strokeplay',
      ...BASE,
    });
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toContain('u2');
    expect(facts.standings[1].name).not.toBe('u2');
  });
});

// ---------------------------------------------------------------------------
// Placement band — team format (best_ball) — standings + margin only, no checkpoints
// ---------------------------------------------------------------------------
describe('best_ball — team placement, no checkpoints field', () => {
  const result: BestBallResult = {
    kind: 'best_ball',
    teams: [
      {
        teamNumber: 1,
        playerIds: ['u1', 'u2'],
        holes: [
          {
            holeNumber: 1,
            par: 4,
            strokeIndex: 1,
            teamNet: 3,
            contributorIds: ['u1'],
            players: [
              { userId: 'u1', gross: 3, extraStrokes: 0, net: 3, isContributor: true, par: 4 },
              { userId: 'u2', gross: 5, extraStrokes: 0, net: 5, isContributor: false, par: 4 },
            ],
          },
        ],
        total: 68,
        missingHoles: [],
        rank: 1,
        tiedWith: [],
      },
      {
        teamNumber: 2,
        playerIds: ['u3', 'u4'],
        holes: [],
        total: 71,
        missingHoles: [],
        rank: 2,
        tiedWith: [],
      },
    ],
  };
  const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Carl'], ['u4', 'Dana']);

  it('standings numbers match team totals vs par', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'best_ball',
      ...BASE,
    });
    expect(facts.band).toBe('placement');
    expect(facts.winnerName).toBe('Alice / Bob');
    expect(facts.standings).toEqual([
      { rank: 1, name: 'Alice / Bob', scoreLabel: '−4' },
      { rank: 2, name: 'Carl / Dana', scoreLabel: '−1' },
    ]);
  });

  it('has no checkpoints field (only solo strokeplay/stableford get checkpoints)', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'best_ball',
      ...BASE,
    });
    expect(facts.checkpoints).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Matchplay band
// ---------------------------------------------------------------------------
describe('singles_matchplay — decided match', () => {
  const result: SinglesMatchplayResult = {
    kind: 'singles_matchplay',
    sides: [
      { sideNumber: 1, userId: 'u1', courseHandicap: 5 },
      { sideNumber: 2, userId: 'u2', courseHandicap: 8 },
    ],
    holes: [
      { holeNumber: 1, par: 4, side1Par: 4, side2Par: 4, strokeIndex: 1, side1Gross: 4, side2Gross: 5, side1Net: 4, side2Net: 5, side1Extra: 0, side2Extra: 0, result: 'side1_wins' },
      { holeNumber: 2, par: 4, side1Par: 4, side2Par: 4, strokeIndex: 2, side1Gross: 5, side2Gross: 4, side1Net: 5, side2Net: 4, side1Extra: 0, side2Extra: 0, result: 'side2_wins' },
      { holeNumber: 3, par: 4, side1Par: 4, side2Par: 4, strokeIndex: 3, side1Gross: 3, side2Gross: 5, side1Net: 3, side2Net: 5, side1Extra: 0, side2Extra: 0, result: 'side1_wins' },
    ],
    holesUp: 3,
    holesPlayed: 16,
    holesRemaining: 2,
    result: {
      winner: 'side1',
      marginUp: 3,
      decidedAtHole: 16,
      remainingAtDecision: 2,
      formatted: '3&2',
    },
  };
  const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob']);

  it('band is matchplay', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'singles_matchplay',
      ...BASE,
    });
    expect(facts.band).toBe('matchplay');
  });

  it('margin + decidedAtHole match the ModeResult exactly', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'singles_matchplay',
      ...BASE,
    });
    expect(facts.matchplay).toMatchObject({
      undecided: false,
      margin: '3&2',
      decidedAtHole: 16,
      winnerName: 'Alice',
    });
  });

  it('momentum: leadChanges + biggest lead computed from runningMatchStatus', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'singles_matchplay',
      ...BASE,
    });
    // running status after each hole: +1, 0, +1 — side1 never trails, so 0 lead changes.
    const matchplay = decided(facts.matchplay);
    expect(matchplay.leadChanges).toBe(0);
    expect(matchplay.biggestLeadSide1).toBe(1);
    expect(matchplay.biggestLeadSide2).toBe(0);
  });
});

describe('singles_matchplay — undecided (result null)', () => {
  const result: SinglesMatchplayResult = {
    kind: 'singles_matchplay',
    sides: [
      { sideNumber: 1, userId: 'u1', courseHandicap: 5 },
      { sideNumber: 2, userId: 'u2', courseHandicap: 8 },
    ],
    holes: [],
    holesUp: 1,
    holesPlayed: 6,
    holesRemaining: 12,
    result: null,
  };
  const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob']);

  it('facts say undecided, no margin/decidedAtHole', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'singles_matchplay',
      ...BASE,
    });
    expect(facts.matchplay).toEqual({ undecided: true });
  });
});

describe('fourball_matchplay — reuses matchplay band via buildShareCardData headline', () => {
  const result: FourballMatchplayResult = {
    kind: 'fourball_matchplay',
    sides: [
      {
        sideNumber: 1,
        players: [
          { userId: 'u1', courseHandicap: 5, effectiveHandicap: 4 },
          { userId: 'u2', courseHandicap: 6, effectiveHandicap: 5 },
        ],
      },
      {
        sideNumber: 2,
        players: [
          { userId: 'u3', courseHandicap: 8, effectiveHandicap: 7 },
          { userId: 'u4', courseHandicap: 9, effectiveHandicap: 8 },
        ],
      },
    ],
    holes: [],
    holesUp: 2,
    holesPlayed: 18,
    holesRemaining: 0,
    result: {
      winner: 'side2',
      marginUp: 2,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: '2up',
    },
  };
  const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Carl'], ['u4', 'Dana']);

  it('winnerName joins the winning side, margin matches', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'fourball_matchplay',
      ...BASE,
    });
    const matchplay = decided(facts.matchplay);
    expect(matchplay.winnerName).toBe('Carl / Dana');
    expect(matchplay.margin).toBe('2up');
  });
});

// ---------------------------------------------------------------------------
// Skins band
// ---------------------------------------------------------------------------
describe('skins — carryover + big-skin holes', () => {
  const result: SkinsResult = {
    kind: 'skins',
    scoring: 'net',
    holes: [
      {
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        carriedIn: 0,
        atStake: 1,
        outcome: 'carryover',
        winnerUserId: null,
        skinsAwarded: 0,
        perPlayer: [
          { userId: 'u1', gross: 4, effectiveScore: 4, isWinner: true },
          { userId: 'u2', gross: 4, effectiveScore: 4, isWinner: true },
        ],
      },
      {
        holeNumber: 2,
        par: 4,
        strokeIndex: 2,
        carriedIn: 1,
        atStake: 2,
        outcome: 'won',
        winnerUserId: 'u1',
        skinsAwarded: 2,
        perPlayer: [
          { userId: 'u1', gross: 3, effectiveScore: 3, isWinner: true },
          { userId: 'u2', gross: 5, effectiveScore: 5, isWinner: false },
        ],
      },
    ],
    players: [
      { userId: 'u1', totalSkins: 2, holesWon: 1, rank: 1, tiedWith: [] },
      { userId: 'u2', totalSkins: 0, holesWon: 0, rank: 2, tiedWith: [] },
    ],
    carriedPot: 0,
  };
  const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob']);

  it('band is skins', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'skins',
      ...BASE,
    });
    expect(facts.band).toBe('skins');
  });

  it('bigSkinHoles lists holes with skinsAwarded >= 2, numbers match', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'skins',
      ...BASE,
    });
    expect(facts.skins?.bigSkinHoles).toEqual([
      { holeNumber: 2, skinsAwarded: 2, winnerName: 'Alice', carriedIn: 1 },
    ]);
  });

  it('carriedPot mirrors the ModeResult value', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'skins',
      ...BASE,
    });
    expect(facts.skins?.carriedPot).toBe(0);
  });

  it('standings totals match totalSkins', () => {
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'skins',
      ...BASE,
    });
    expect(facts.standings).toEqual([
      { rank: 1, name: 'Alice', scoreLabel: '2 skins' },
      { rank: 2, name: 'Bob', scoreLabel: '0 skins' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// scoredHoles thin-data guard input (band coverage sanity for remaining kinds)
// ---------------------------------------------------------------------------
describe('band coverage — remaining placement kinds produce a placement band', () => {
  it.each<[string, () => { result: StablefordResult | TexasScrambleResult | WolfResult | NassauResult | BingoBangoBongoResult | NinesResult | RoundRobinResult | AceyDeuceyResult | ShambleResult; gameMode: 'stableford' | 'texas_scramble' | 'wolf' | 'nassau' | 'bingo_bango_bongo' | 'nines' | 'round_robin' | 'acey_deucey' | 'shamble' }]>([
    [
      'stableford solo',
      () => ({
        gameMode: 'stableford',
        result: {
          kind: 'stableford',
          variant: 'solo',
          holes: [],
          players: [
            { userId: 'u1', totalPoints: 30, rank: 1, holesPlayed: 18, tiedWith: [] },
            { userId: 'u2', totalPoints: 25, rank: 2, holesPlayed: 18, tiedWith: [] },
          ],
        },
      }),
    ],
    [
      'texas_scramble',
      () => ({
        gameMode: 'texas_scramble',
        result: {
          kind: 'texas_scramble',
          teams: [
            {
              teamNumber: 1,
              members: [{ userId: 'u1', courseHandicap: 5, isCaptain: true }],
              combinedCourseHandicap: 5,
              teamHandicap: 1,
              holes: [],
              totalNet: 68,
              totalGross: 70,
              missingHoles: [],
              rank: 1,
              tiedWith: [],
            },
          ],
        },
      }),
    ],
    [
      'wolf',
      () => ({
        gameMode: 'wolf',
        result: {
          kind: 'wolf',
          scoring: 'net',
          rotation: 'random_with_trailing',
          holes: [],
          players: [
            { userId: 'u1', teamNumber: 1, totalPoints: 10, wolfHolesPlayed: 4, blindWolfWins: 0, rank: 1, tiedWith: [] },
          ],
        },
      }),
    ],
    [
      'nassau',
      () => ({
        gameMode: 'nassau',
        result: {
          kind: 'nassau',
          scoring: 'net',
          sections: {
            front9: { name: 'front9', holeNumbers: [], players: [], winnerUserIds: [], isPending: false },
            back9: { name: 'back9', holeNumbers: [], players: [], winnerUserIds: [], isPending: false },
            total18: { name: 'total18', holeNumbers: [], players: [], winnerUserIds: [], isPending: false },
          },
          players: [
            { userId: 'u1', units: 2, unitBreakdown: { front9: true, back9: true, total18: false }, total18EffectiveStrokes: 70, total18SectionRank: 1, rank: 1, tiedWith: [] },
          ],
          holes: [],
        },
      }),
    ],
    [
      'bingo_bango_bongo',
      () => ({
        gameMode: 'bingo_bango_bongo',
        result: {
          kind: 'bingo_bango_bongo',
          holes: [],
          players: [{ userId: 'u1', bingos: 2, bangos: 1, bongos: 1, totalPoints: 4, rank: 1, tiedWith: [] }],
        },
      }),
    ],
    [
      'nines',
      () => ({
        gameMode: 'nines',
        result: {
          kind: 'nines',
          variant: 'nines',
          scoring: 'net',
          holes: [],
          players: [{ userId: 'u1', totalPoints: 20, holesScored: 9, rank: 1, tiedWith: [] }],
        },
      }),
    ],
    [
      'round_robin',
      () => ({
        gameMode: 'round_robin',
        result: {
          kind: 'round_robin',
          allowancePct: 85,
          holes: [],
          players: [
            { userId: 'u1', teamNumber: 1, totalHoleWins: 5, totalHolesLost: 3, totalHolesHalved: 1, segments: [], rank: 1, tiedWith: [] },
          ],
        },
      }),
    ],
    [
      'acey_deucey',
      () => ({
        gameMode: 'acey_deucey',
        result: {
          kind: 'acey_deucey',
          scoring: 'net',
          holes: [],
          players: [{ userId: 'u1', aces: 2, deuces: 1, total: 3, rank: 1, tiedWith: [] }],
        },
      }),
    ],
    [
      'shamble',
      () => ({
        gameMode: 'shamble',
        result: {
          kind: 'shamble',
          variant: 'shamble',
          count: 2,
          scoring: 'net',
          teamSize: 4,
          holes: [],
          teams: [
            { teamNumber: 1, members: ['u1', 'u2', 'u3', 'u4'], totalScore: 68, holesCounted: 18, rank: 1, tiedWith: [] },
          ],
        },
      }),
    ],
  ])('%s produces a placement band with a winner', (_label, build) => {
    const { result, gameMode } = build();
    const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Carl'], ['u4', 'Dana']);
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode,
      ...BASE,
    });
    expect(facts.band).toBe('placement');
    expect(facts.winnerName).toContain('Alice');
  });
});

// ---------------------------------------------------------------------------
// scoredHoles across kinds — deterministic count of holes with any recorded score
// ---------------------------------------------------------------------------
describe('scoredHoles — deterministic per-kind hole counting', () => {
  it('skins counts holes present in the holes array (all have scores by construction)', () => {
    const result: SkinsResult = {
      kind: 'skins',
      scoring: 'net',
      holes: [
        {
          holeNumber: 1,
          par: 4,
          strokeIndex: 1,
          carriedIn: 0,
          atStake: 1,
          outcome: 'won',
          winnerUserId: 'u1',
          skinsAwarded: 1,
          perPlayer: [
            { userId: 'u1', gross: 4, effectiveScore: 4, isWinner: true },
            { userId: 'u2', gross: 5, effectiveScore: 5, isWinner: false },
          ],
        },
        {
          holeNumber: 2,
          par: 4,
          strokeIndex: 2,
          carriedIn: 0,
          atStake: 1,
          outcome: 'pending',
          winnerUserId: null,
          skinsAwarded: 0,
          perPlayer: [
            { userId: 'u1', gross: null, effectiveScore: null, isWinner: false },
            { userId: 'u2', gross: null, effectiveScore: null, isWinner: false },
          ],
        },
      ],
      players: [
        { userId: 'u1', totalSkins: 1, holesWon: 1, rank: 1, tiedWith: [] },
        { userId: 'u2', totalSkins: 0, holesWon: 0, rank: 2, tiedWith: [] },
      ],
      carriedPot: 0,
    };
    const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob']);
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'skins',
      ...BASE,
    });
    expect(facts.scoredHoles).toBe(1);
  });

  it('singles_matchplay counts holes where at least one side has gross', () => {
    const result: SinglesMatchplayResult = {
      kind: 'singles_matchplay',
      sides: [
        { sideNumber: 1, userId: 'u1', courseHandicap: 5 },
        { sideNumber: 2, userId: 'u2', courseHandicap: 8 },
      ],
      holes: [
        { holeNumber: 1, par: 4, side1Par: 4, side2Par: 4, strokeIndex: 1, side1Gross: 4, side2Gross: null, side1Net: 4, side2Net: null, side1Extra: 0, side2Extra: 0, result: 'unplayed' },
        { holeNumber: 2, par: 4, side1Par: 4, side2Par: 4, strokeIndex: 2, side1Gross: null, side2Gross: null, side1Net: null, side2Net: null, side1Extra: 0, side2Extra: 0, result: 'unplayed' },
      ],
      holesUp: 0,
      holesPlayed: 0,
      holesRemaining: 18,
      result: null,
    };
    const nameByUserId = names(['u1', 'Alice'], ['u2', 'Bob']);
    const facts = buildRoundReportFacts({
      result,
      nameByUserId,
      gameMode: 'singles_matchplay',
      ...BASE,
    });
    expect(facts.scoredHoles).toBe(1);
  });
});
