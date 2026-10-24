/**
 * Tests for buildShareCardData (#942 — shareable result-card image data shaping).
 * Written FIRST (TDD); run `npx vitest run lib/games/buildShareCardData` to verify.
 */

import { describe, expect, it } from 'vitest';

import type {
  AceyDeuceyResult,
  BestBallResult,
  BingoBangoBongoResult,
  FourballMatchplayResult,
  ModeResult,
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

import { buildShareCardData } from './buildShareCardData';

// ---------------------------------------------------------------------------
// Helpers for building minimal fixtures
// ---------------------------------------------------------------------------

function names(...pairs: [string, string][]): Map<string, string> {
  return new Map(pairs);
}

/** Par 4 on holes 1–18 (par 72): the course every fixture below plays. */
const PAR_72: ReadonlyMap<number, number> = new Map(
  Array.from({ length: 18 }, (_, i) => [i + 1, 4] as const),
);

// ---------------------------------------------------------------------------
// Test 1: solo_strokeplay, sharer in top 3
// ---------------------------------------------------------------------------
describe('solo_strokeplay — sharer in top 3', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, netToPar: 0, rank: 2, tiedWith: [] },
      { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 79, holesPlayed: 18, netToPar: 3, rank: 3, tiedWith: [] },
      { userId: 'u4', totalNetStrokes: 80, totalGrossStrokes: 84, holesPlayed: 18, netToPar: 8, rank: 4, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie'], ['u4', 'Dave']);

  it('band is placement', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    expect(card.band).toBe('placement');
  });

  it('podium contains top 3 rows', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    expect(card.podium).toHaveLength(3);
    expect(card.podium[0].rank).toBe(1);
    expect(card.podium[1].rank).toBe(2);
    expect(card.podium[2].rank).toBe(3);
  });

  it('winner is rank-1 row', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    expect(card.winners[0].rank).toBe(1);
    expect(card.winners[0].name).toBe('Alice');
  });

  it('a single rank-1 row is the only winner (#2318)', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    expect(card.winners).toHaveLength(1);
    expect(card.winners[0].name).toBe('Alice');
  });

  it('sharer row has isSharer=true', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    const sharerRow = card.podium.find((r) => r.isSharer);
    expect(sharerRow).toBeDefined();
    expect(sharerRow!.name).toBe('Bob');
  });

  it('sharerStrip is null (sharer in top 3)', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    expect(card.sharerStrip).toBeNull();
  });

  it('scores are vs-par (−2, E, +3)', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    // u1: 70 net vs 72 par = −2
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '−2' });
    // u2: 72 net vs 72 par = E
    expect(card.podium[1].score).toEqual({ kind: 'vsPar', label: 'E' });
    // u3: 75 net vs 72 par = +3
    expect(card.podium[2].score).toEqual({ kind: 'vsPar', label: '+3' });
  });

  it('match is null for placement band', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    expect(card.match).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2: sharer outside top 3 → sharerStrip
// ---------------------------------------------------------------------------
describe('solo_strokeplay — sharer outside top 3', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, netToPar: 0, rank: 2, tiedWith: [] },
      { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 79, holesPlayed: 18, netToPar: 3, rank: 3, tiedWith: [] },
      { userId: 'u4', totalNetStrokes: 80, totalGrossStrokes: 84, holesPlayed: 18, netToPar: 8, rank: 4, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie'], ['u4', 'Dave']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u4', parByHole: PAR_72, sideWinners: [] });

  it('podium has top 3 rows', () => {
    expect(card.podium).toHaveLength(3);
  });

  it('sharerStrip is the sharer row with correct label', () => {
    expect(card.sharerStrip).not.toBeNull();
    expect(card.sharerStrip!.rank).toBe(4);
    expect(card.sharerStrip!.name).toBe('Dave');
    expect(card.sharerStrip!.isSharer).toBe(true);
    // u4: 80 net vs 72 par = +8
    expect(card.sharerStrip!.score).toEqual({ kind: 'vsPar', label: '+8' });
  });

  it('no podium row has isSharer', () => {
    expect(card.podium.some((r) => r.isSharer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 3: sharerId null → no isSharer, sharerStrip null
// ---------------------------------------------------------------------------
describe('solo_strokeplay — neutral card (sharerId null)', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, netToPar: 0, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('no row has isSharer', () => {
    expect(card.podium.some((r) => r.isSharer)).toBe(false);
  });

  it('sharerStrip is null', () => {
    expect(card.sharerStrip).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 4: team mode (best_ball), sharer is a team member → isSharer on team row
// ---------------------------------------------------------------------------
describe('best_ball — sharer is team member', () => {
  const result: BestBallResult = {
    kind: 'best_ball',
    ranking: 'net_total',
    teams: [
      { teamNumber: 1, playerIds: ['u1', 'u2'], holes: [], total: 68, missingHoles: [], toPar: null, rank: 1, tiedWith: [] },
      { teamNumber: 2, playerIds: ['u3', 'u4'], holes: [], total: 71, missingHoles: [], toPar: null, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie'], ['u4', 'Dave']);

  it('sharer u2 (rank-1 team) → isSharer on podium row', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].isSharer).toBe(true);
    expect(card.sharerStrip).toBeNull();
  });

  it('sharer u3 (rank-2 team) → isSharer on rank-2 row', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u3', parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[1].isSharer).toBe(true);
  });

  it('team name is joined member names', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].name).toContain('Alice');
    expect(card.podium[0].name).toContain('Bob');
  });
});

// ---------------------------------------------------------------------------
// Test 5: fewer than 3 competitors → podium has only existing rows
// ---------------------------------------------------------------------------
describe('solo_strokeplay — fewer than 3 players', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, netToPar: 0, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('podium has only 2 rows', () => {
    expect(card.podium).toHaveLength(2);
  });

  it('winner is rank-1', () => {
    expect(card.winners[0].rank).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 6: ties (two rank-1) → both appear, stable order
// ---------------------------------------------------------------------------
describe('solo_strokeplay — tied rank-1', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: ['u2'] },
      { userId: 'u2', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: ['u1'] },
      { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 79, holesPlayed: 18, netToPar: 3, rank: 3, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('podium has 3 rows (both rank-1 + rank-3)', () => {
    expect(card.podium).toHaveLength(3);
  });

  it('both rank-1 rows appear', () => {
    const rank1 = card.podium.filter((r) => r.rank === 1);
    expect(rank1).toHaveLength(2);
  });

  it('order is stable: same-rank rows sorted by name', () => {
    // Alice < Bob alphabetically → Alice first
    expect(card.podium[0].name).toBe('Alice');
    expect(card.podium[1].name).toBe('Bob');
  });

  it('both rank-1 rows are winners (#2318)', () => {
    expect(card.winners).toHaveLength(2);
    expect(card.winners.map((r) => r.rank)).toEqual([1, 1]);
    expect(card.winners.map((r) => r.name)).toEqual(['Alice', 'Bob']);
  });
});

// ---------------------------------------------------------------------------
// Test 7: stableford → "{points} poeng" labels
// ---------------------------------------------------------------------------
describe('stableford solo — score labels', () => {
  const result: StablefordResult = {
    kind: 'stableford',
    variant: 'solo',
    ranking: 'net_total',
    holes: [],
    players: [
      { userId: 'u1', totalPoints: 38, rank: 1, holesPlayed: 18, toPar: null, tiedWith: [] },
      { userId: 'u2', totalPoints: 34, rank: 2, holesPlayed: 18, toPar: null, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('band is placement', () => {
    expect(card.band).toBe('placement');
  });

  it('scores carry the points count', () => {
    expect(card.podium[0].score).toEqual({ kind: 'points', value: 38 });
    expect(card.podium[1].score).toEqual({ kind: 'points', value: 34 });
  });
});

// ---------------------------------------------------------------------------
// Test 8: skins band
// ---------------------------------------------------------------------------
describe('skins — band and score labels', () => {
  const result: SkinsResult = {
    kind: 'skins',
    scoring: 'net',
    carriedPot: 0,
    holes: [],
    players: [
      { userId: 'u1', totalSkins: 4, holesWon: 3, rank: 1, tiedWith: [] },
      { userId: 'u2', totalSkins: 2, holesWon: 2, rank: 2, tiedWith: [] },
      { userId: 'u3', totalSkins: 1, holesWon: 1, rank: 3, tiedWith: [] },
      { userId: 'u4', totalSkins: 0, holesWon: 0, rank: 4, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie'], ['u4', 'Dave']);

  it('band is skins', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.band).toBe('skins');
  });

  it('scores carry the skins count', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].score).toEqual({ kind: 'skins', value: 4 });
    expect(card.podium[1].score).toEqual({ kind: 'skins', value: 2 });
    expect(card.podium[2].score).toEqual({ kind: 'skins', value: 1 });
  });

  it('sharerStrip logic same as placement — outside top 3', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u4', parByHole: PAR_72, sideWinners: [] });
    expect(card.sharerStrip).not.toBeNull();
    expect(card.sharerStrip!.name).toBe('Dave');
    expect(card.sharerStrip!.score).toEqual({ kind: 'skins', value: 0 });
  });

  it('the skins leader is the winner (#2318)', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.winners.map((r) => r.name)).toEqual(['Alice']);
  });
});

describe('skins — nobody won a skin (#2318)', () => {
  const result: SkinsResult = {
    kind: 'skins',
    scoring: 'net',
    carriedPot: 6,
    holes: [],
    players: [
      { userId: 'u1', totalSkins: 0, holesWon: 0, rank: 1, tiedWith: ['u2', 'u3'] },
      { userId: 'u2', totalSkins: 0, holesWon: 0, rank: 1, tiedWith: ['u1', 'u3'] },
      { userId: 'u3', totalSkins: 0, holesWon: 0, rank: 1, tiedWith: ['u1', 'u2'] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('has no winners', () => {
    expect(card.winners).toEqual([]);
  });

  it('still lists the field on the podium', () => {
    expect(card.podium.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });
});

// ---------------------------------------------------------------------------
// Test 9: matchplay singles — sharer wins
// ---------------------------------------------------------------------------
describe('singles_matchplay — sharer wins', () => {
  const result: SinglesMatchplayResult = {
    kind: 'singles_matchplay',
    sides: [
      { sideNumber: 1, userId: 'u1', courseHandicap: 5 },
      { sideNumber: 2, userId: 'u2', courseHandicap: 8 },
    ],
    holes: [],
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

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u1', parByHole: PAR_72, sideWinners: [] });

  it('band is matchplay', () => {
    expect(card.band).toBe('matchplay');
  });

  it('podium is empty', () => {
    expect(card.podium).toHaveLength(0);
  });

  it('winners is empty', () => {
    expect(card.winners).toEqual([]);
  });

  it('sharerStrip is null', () => {
    expect(card.sharerStrip).toBeNull();
  });

  it('match.sharerOutcome is won 3&2', () => {
    expect(card.match).not.toBeNull();
    expect(card.match!.sharerOutcome).toEqual({ kind: 'won', margin: '3&2' });
  });

  it('match.headline names the side-1 winner', () => {
    expect(card.match!.headline).toEqual({
      kind: 'winner',
      winnerName: 'Alice',
      margin: '3&2',
    });
  });
});

// ---------------------------------------------------------------------------
// Test 10: matchplay tie → "Uavgjort"
// ---------------------------------------------------------------------------
describe('singles_matchplay — tie', () => {
  const result: SinglesMatchplayResult = {
    kind: 'singles_matchplay',
    sides: [
      { sideNumber: 1, userId: 'u1', courseHandicap: 5 },
      { sideNumber: 2, userId: 'u2', courseHandicap: 8 },
    ],
    holes: [],
    holesUp: 0,
    holesPlayed: 18,
    holesRemaining: 0,
    result: {
      winner: 'tied',
      marginUp: 0,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: 'AS',
    },
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);

  it('sharer outcome is tied', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u1', parByHole: PAR_72, sideWinners: [] });
    expect(card.match!.sharerOutcome).toEqual({ kind: 'tied' });
  });

  it('non-participant sharer → sharerOutcome is null', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.match!.sharerOutcome).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 11: sideTournaments — one null winner (skipped), one won by sharer
// ---------------------------------------------------------------------------
describe('sideTournaments', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, netToPar: 0, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);

  const sideWinners = [
    { label: 'Lengst drive', winnerUserId: null },       // should be skipped
    { label: 'Nærmest pin', winnerUserId: 'u2' },        // won by sharer
  ];

  const card = buildShareCardData({
    result,
    nameByUserId: nameMap,
    sharerId: 'u2',
    parByHole: PAR_72,
    sideWinners,
  });

  it('null winnerUserId entry is skipped', () => {
    expect(card.sideTournaments).toHaveLength(1);
  });

  it('winner entry has correct label and name', () => {
    expect(card.sideTournaments[0].label).toBe('Nærmest pin');
    expect(card.sideTournaments[0].winnerName).toBe('Bob');
  });

  it('isSharer is true when winner is sharer', () => {
    expect(card.sideTournaments[0].isSharer).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional: point modes → "{points} poeng" (wolf example)
// ---------------------------------------------------------------------------
describe('wolf — score labels', () => {
  const result: WolfResult = {
    kind: 'wolf',
    scoring: 'net',
    rotation: 'random_with_trailing',
    holes: [],
    players: [
      { userId: 'u1', teamNumber: 1, totalPoints: 14, wolfHolesPlayed: 4, blindWolfWins: 1, rank: 1, tiedWith: [] },
      { userId: 'u2', teamNumber: 2, totalPoints: 10, wolfHolesPlayed: 3, blindWolfWins: 0, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('scores carry the points count', () => {
    expect(card.podium[0].score).toEqual({ kind: 'points', value: 14 });
    expect(card.podium[1].score).toEqual({ kind: 'points', value: 10 });
  });
});

// ---------------------------------------------------------------------------
// Additional: texas_scramble — team scoreLabel is vs-par
// ---------------------------------------------------------------------------
describe('texas_scramble — team score labels', () => {
  const result: TexasScrambleResult = {
    kind: 'texas_scramble',
    ranking: 'net_total',
    teams: [
      {
        teamNumber: 1,
        members: [
          { userId: 'u1', courseHandicap: 10, isCaptain: true },
          { userId: 'u2', courseHandicap: 8, isCaptain: false },
        ],
        combinedCourseHandicap: 18,
        teamHandicap: 2,
        holes: [],
        totalNet: 68,
        totalGross: 70,
        missingHoles: [],
        toPar: null,
        rank: 1,
        tiedWith: [],
      },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('score is vs-par (−4)', () => {
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '−4' });
  });
});

// ---------------------------------------------------------------------------
// Additional: acey_deucey — "{total} poeng" (can be negative)
// ---------------------------------------------------------------------------
describe('acey_deucey — score labels', () => {
  const result: AceyDeuceyResult = {
    kind: 'acey_deucey',
    scoring: 'net',
    holes: [],
    players: [
      { userId: 'u1', aces: 5, deuces: 1, total: 12, rank: 1, tiedWith: [] },
      { userId: 'u2', aces: 0, deuces: 4, total: -12, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('scores use the total field (can be negative)', () => {
    expect(card.podium[0].score).toEqual({ kind: 'points', value: 12 });
    expect(card.podium[1].score).toEqual({ kind: 'points', value: -12 });
  });
});

// ---------------------------------------------------------------------------
// Additional: nassau — "{units} poeng"
// ---------------------------------------------------------------------------
describe('nassau — score labels', () => {
  const result: NassauResult = {
    kind: 'nassau',
    scoring: 'net',
    ranking: 'net_total',
    sections: {
      front9: { name: 'front9', holeNumbers: [], players: [], winnerUserIds: [], isPending: false },
      back9: { name: 'back9', holeNumbers: [], players: [], winnerUserIds: [], isPending: false },
      total18: { name: 'total18', holeNumbers: [], players: [], winnerUserIds: [], isPending: false },
    },
    holes: [],
    players: [
      { userId: 'u1', units: 2, unitBreakdown: { front9: true, back9: true, total18: false }, total18EffectiveStrokes: 68, total18SectionRank: 1, rank: 1, tiedWith: [] },
      { userId: 'u2', units: 1, unitBreakdown: { front9: false, back9: false, total18: true }, total18EffectiveStrokes: 70, total18SectionRank: 2, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('scores use the units field', () => {
    expect(card.podium[0].score).toEqual({ kind: 'points', value: 2 });
    expect(card.podium[1].score).toEqual({ kind: 'points', value: 1 });
  });
});

// ---------------------------------------------------------------------------
// Additional: round_robin — "{totalHoleWins} poeng"
// ---------------------------------------------------------------------------
describe('round_robin — score labels', () => {
  const result: RoundRobinResult = {
    kind: 'round_robin',
    allowancePct: 85,
    holes: [],
    players: [
      { userId: 'u1', teamNumber: 1, totalHoleWins: 10, totalHolesLost: 5, totalHolesHalved: 3, segments: [], rank: 1, tiedWith: [] },
      { userId: 'u2', teamNumber: 2, totalHoleWins: 8, totalHolesLost: 7, totalHolesHalved: 3, segments: [], rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('scores use totalHoleWins', () => {
    expect(card.podium[0].score).toEqual({ kind: 'points', value: 10 });
    expect(card.podium[1].score).toEqual({ kind: 'points', value: 8 });
  });
});

// ---------------------------------------------------------------------------
// Additional: bingo_bango_bongo — "{totalPoints} poeng"
// ---------------------------------------------------------------------------
describe('bingo_bango_bongo — score labels', () => {
  const result: BingoBangoBongoResult = {
    kind: 'bingo_bango_bongo',
    holes: [],
    players: [
      { userId: 'u1', bingos: 5, bangos: 4, bongos: 3, totalPoints: 12, rank: 1, tiedWith: [] },
      { userId: 'u2', bingos: 4, bangos: 3, bongos: 2, totalPoints: 9, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('scores use totalPoints', () => {
    expect(card.podium[0].score).toEqual({ kind: 'points', value: 12 });
    expect(card.podium[1].score).toEqual({ kind: 'points', value: 9 });
  });
});

// ---------------------------------------------------------------------------
// Additional: nines — "{totalPoints} poeng"
// ---------------------------------------------------------------------------
describe('nines — score labels', () => {
  const result: NinesResult = {
    kind: 'nines',
    variant: 'nines',
    scoring: 'net',
    holes: [],
    players: [
      { userId: 'u1', totalPoints: 90, holesScored: 18, rank: 1, tiedWith: [] },
      { userId: 'u2', totalPoints: 81, holesScored: 18, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it('scores use totalPoints', () => {
    expect(card.podium[0].score).toEqual({ kind: 'points', value: 90 });
    expect(card.podium[1].score).toEqual({ kind: 'points', value: 81 });
  });
});

// ---------------------------------------------------------------------------
// Additional: matchplay, non-participant sharer → sharerOutcomeLabel ""
// ---------------------------------------------------------------------------
describe('singles_matchplay — sharer loses', () => {
  const result: SinglesMatchplayResult = {
    kind: 'singles_matchplay',
    sides: [
      { sideNumber: 1, userId: 'u1', courseHandicap: 5 },
      { sideNumber: 2, userId: 'u2', courseHandicap: 8 },
    ],
    holes: [],
    holesUp: -2,
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

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);

  it('loser sharer gets lost 2up', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u1', parByHole: PAR_72, sideWinners: [] });
    expect(card.match!.sharerOutcome).toEqual({ kind: 'lost', margin: '2up' });
  });

  it('winner sharer gets won 2up', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', parByHole: PAR_72, sideWinners: [] });
    expect(card.match!.sharerOutcome).toEqual({ kind: 'won', margin: '2up' });
  });
});

// ---------------------------------------------------------------------------
// #2217 (D6): «mot par» over the holes that count. Par is counted once per
// ball that counts (shamble/champagne), and only over the holes the competitor
// has a score on — a team with 17–18 missing is not «−6» on a par-4 course.
// ---------------------------------------------------------------------------
describe('vs par over played holes (#2217)', () => {
  const holeNumbers = Array.from({ length: 18 }, (_, i) => i + 1);
  // 14 × 4 + 2 × 5 = 66 over holes 1–16; 17–18 unplayed. Par 64 over 1–16.
  const netFor = (n: number): number | null => (n <= 14 ? 4 : n <= 16 ? 5 : null);
  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Cleo'], ['u4', 'Dag']);

  function shamble(variant: 'shamble' | 'champagne', count: 2 | 3, totalScore: number): ShambleResult {
    return {
      kind: 'shamble',
      ranking: 'net_total',
      variant,
      count,
      scoring: 'net',
      teamSize: 4,
      holes: [],
      teams: [
        { teamNumber: 1, members: ['u1', 'u2', 'u3', 'u4'], totalScore, holesCounted: 18, toPar: null, rank: 1, tiedWith: [] },
      ],
    };
  }

  it('shamble: count 2, 148 → +4 (par for the two balls that count)', () => {
    const card = buildShareCardData({ result: shamble('shamble', 2, 148), nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '+4' });
  });

  it('champagne: count 3, 222 → +6', () => {
    const card = buildShareCardData({ result: shamble('champagne', 3, 222), nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '+6' });
  });

  it('manglende hull: best ball with 17–18 unplayed, 66 → +2', () => {
    const result: BestBallResult = {
      kind: 'best_ball',
      ranking: 'net_total',
      teams: [
        {
          teamNumber: 1,
          playerIds: ['u1', 'u2'],
          holes: holeNumbers.map((n) => ({ holeNumber: n, par: 4, strokeIndex: n, teamNet: netFor(n), contributorIds: [], players: [] })),
          total: 66,
          missingHoles: [17, 18],
          toPar: null,
          rank: 1,
          tiedWith: [],
        },
      ],
    };
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '+2' });
  });

  it('manglende hull: texas_scramble with 17–18 unplayed, 66 → +2', () => {
    const result: TexasScrambleResult = {
      kind: 'texas_scramble',
      ranking: 'net_total',
      teams: [
        {
          teamNumber: 1,
          members: [
            { userId: 'u1', courseHandicap: 0, isCaptain: true },
            { userId: 'u2', courseHandicap: 0, isCaptain: false },
          ],
          combinedCourseHandicap: 0,
          teamHandicap: 0,
          holes: holeNumbers.map((n) => ({ holeNumber: n, par: 4, strokeIndex: n, teamGross: netFor(n), teamExtraStrokes: 0, teamNet: netFor(n) })),
          totalNet: 66,
          totalGross: 66,
          missingHoles: [17, 18],
          toPar: null,
          rank: 1,
          tiedWith: [],
        },
      ],
    };
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '+2' });
  });

  it('manglende hull: solo strokeplay with 17–18 unplayed, 66 → +2', () => {
    const result: SoloStrokeplayResult = {
      kind: 'solo_strokeplay',
      ranking: 'net_total',
      holes: holeNumbers.map((n) => ({
        holeNumber: n,
        par: 4,
        strokeIndex: n,
        // u1 has a cell with net null on 17; on 18 u1 has no cell at all.
        perPlayer: [
          { userId: 'u2', gross: 4, net: 4, par: 4 },
          ...(n === 18 ? [] : [{ userId: 'u1', gross: netFor(n), net: netFor(n), par: 4 }]),
        ],
        bestUserIds: [],
      })),
      players: [
        { userId: 'u1', totalNetStrokes: 66, totalGrossStrokes: 66, holesPlayed: 16, netToPar: 2, rank: 1, tiedWith: [] },
        { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 72, holesPlayed: 18, netToPar: 0, rank: 2, tiedWith: [] },
      ],
    };
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '+2' });
    expect(card.podium[1].score).toEqual({ kind: 'vsPar', label: 'E' });
  });

  it('a competitor with hole rows but no played hole → —', () => {
    const result: BestBallResult = {
      kind: 'best_ball',
      ranking: 'net_total',
      teams: [
        {
          teamNumber: 1,
          playerIds: ['u1', 'u2'],
          holes: holeNumbers.map((n) => ({ holeNumber: n, par: 4, strokeIndex: n, teamNet: null, contributorIds: [], players: [] })),
          total: 0,
          missingHoles: holeNumbers,
          toPar: null,
          rank: 1,
          tiedWith: [],
        },
      ],
    };
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '—' });
  });
});

// #2253: a game ranked on net to par shows each player's own net to par. A
// lady on par 72 who went 73 net is +1, not +2 against the men's par 71.
describe('solo_strokeplay — ranked on net to par', () => {
  const PAR_71: ReadonlyMap<number, number> = new Map(
    Array.from({ length: 18 }, (_, i) => [i + 1, i === 0 ? 3 : 4] as const),
  );
  const result = (ranking: SoloStrokeplayResult['ranking']): SoloStrokeplayResult => ({
    kind: 'solo_strokeplay',
    ranking,
    holes: [],
    players: [
      { userId: 'kari', totalNetStrokes: 73, totalGrossStrokes: 80, holesPlayed: 18, netToPar: 1, rank: 1, tiedWith: ['ola'] },
      { userId: 'ola', totalNetStrokes: 72, totalGrossStrokes: 79, holesPlayed: 18, netToPar: 1, rank: 1, tiedWith: ['kari'] },
    ],
  });
  const nameMap = names(['kari', 'Kari'], ['ola', 'Ola']);

  it('the lady gets her own net to par with the flag', () => {
    const card = buildShareCardData({ result: result('net_to_par'), nameByUserId: nameMap, sharerId: null, parByHole: PAR_71, sideWinners: [] });
    expect(card.podium.map((r) => r.score)).toEqual([
      { kind: 'vsPar', label: '+1' },
      { kind: 'vsPar', label: '+1' },
    ]);
  });

  it('a game without the flag keeps the numbers it had', () => {
    const card = buildShareCardData({ result: result('net_total'), nameByUserId: nameMap, sharerId: null, parByHole: PAR_71, sideWinners: [] });
    expect(card.podium.map((r) => r.score)).toEqual([
      { kind: 'vsPar', label: '+2' },
      { kind: 'vsPar', label: '+1' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// #2319: the result card names every member, and both matchplay sides
// ---------------------------------------------------------------------------
describe('memberNames on placement rows (#2319)', () => {
  const nameMap = names(
    ['u1', 'Alice'],
    ['u2', 'Bob'],
    ['u3', 'Cleo'],
    ['u4', 'Dan'],
    ['u5', 'Eli'],
    ['u6', 'Fay'],
  );

  const solo: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
    ],
  };

  function bestBall(teamSize: number): BestBallResult {
    const ids = ['u1', 'u2', 'u3', 'u4'].slice(0, teamSize);
    return {
      kind: 'best_ball',
      ranking: 'net_total',
      teams: [
        { teamNumber: 1, playerIds: ids, holes: [], total: 70, rank: 1, tiedWith: [] },
      ],
    } as unknown as BestBallResult;
  }

  it.each([
    ['a single player', solo, ['Alice']],
    ['a team of two', bestBall(2), ['Alice', 'Bob']],
    ['a team of four', bestBall(4), ['Alice', 'Bob', 'Cleo', 'Dan']],
  ])('%s keeps one name per member', (_label, result, expected) => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.podium[0].memberNames).toEqual(expected);
    expect(card.podium[0].name).toBe(expected.join(' / '));
  });

  it('a member missing from the name map falls back, never to the id', () => {
    const card = buildShareCardData({
      result: bestBall(2),
      nameByUserId: names(['u1', 'Alice']),
      sharerId: null,
      parByHole: PAR_72,
      sideWinners: [],
      playerFallback: 'Spiller',
    });
    expect(card.podium[0].memberNames).toEqual(['Alice', 'Spiller']);
  });
});

describe('match.sides (#2319)', () => {
  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Cleo'], ['u4', 'Dan']);

  function singles(winner: 'side1' | 'side2' | 'tied' | null): SinglesMatchplayResult {
    return {
      kind: 'singles_matchplay',
      sides: [
        { sideNumber: 1, userId: 'u1', courseHandicap: 5 },
        { sideNumber: 2, userId: 'u2', courseHandicap: 8 },
      ],
      holes: [],
      holesUp: 0,
      holesPlayed: 0,
      holesRemaining: 0,
      result:
        winner === null
          ? null
          : { winner, marginUp: 0, decidedAtHole: 16, remainingAtDecision: 2, formatted: winner === 'tied' ? 'AS' : '3&2' },
    };
  }

  it.each([
    ['side 1 won', 'side1', [true, false]],
    ['side 2 won', 'side2', [false, true]],
    ['halved', 'tied', [false, false]],
    ['no result yet', null, [false, false]],
  ] as const)('singles, %s', (_label, winner, expectedWon) => {
    const card = buildShareCardData({
      result: singles(winner),
      nameByUserId: nameMap,
      sharerId: null,
      parByHole: PAR_72,
      sideWinners: [],
    });
    expect(card.match!.sides).toEqual([
      { name: 'Alice', memberNames: ['Alice'], won: expectedWon[0] },
      { name: 'Bob', memberNames: ['Bob'], won: expectedWon[1] },
    ]);
  });

  it('fourball: two names per side, joined for the display name', () => {
    const result: FourballMatchplayResult = {
      kind: 'fourball_matchplay',
      sides: [
        {
          sideNumber: 1,
          players: [
            { userId: 'u1', courseHandicap: 5, effectiveHandicap: 5 },
            { userId: 'u2', courseHandicap: 8, effectiveHandicap: 8 },
          ],
        },
        {
          sideNumber: 2,
          players: [
            { userId: 'u3', courseHandicap: 5, effectiveHandicap: 5 },
            { userId: 'u4', courseHandicap: 8, effectiveHandicap: 8 },
          ],
        },
      ],
      holes: [],
      holesUp: -2,
      holesPlayed: 18,
      holesRemaining: 0,
      result: { winner: 'side2', marginUp: 2, decidedAtHole: 18, remainingAtDecision: 0, formatted: '2up' },
    };
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });
    expect(card.match!.sides).toEqual([
      { name: 'Alice / Bob', memberNames: ['Alice', 'Bob'], won: false },
      { name: 'Cleo / Dan', memberNames: ['Cleo', 'Dan'], won: true },
    ]);
  });
});

describe('winners past the podium (#2319)', () => {
  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Cleo'], ['u4', 'Dan'], ['u5', 'Eli']);
  const tiedOnTop = (count: number): SoloStrokeplayResult => ({
    kind: 'solo_strokeplay',
    ranking: 'net_total',
    holes: [],
    players: ['u1', 'u2', 'u3', 'u4', 'u5'].map((userId, i) => ({
      userId,
      totalNetStrokes: i < count ? 70 : 80,
      totalGrossStrokes: 74,
      holesPlayed: 18,
      netToPar: i < count ? -2 : 8,
      rank: i < count ? 1 : count + 1,
      tiedWith: [],
    })),
  });

  it.each([[3, 3], [4, 4], [5, 5]])(
    '%i tied on top: the podium shows 3 rows, %i are winners',
    (count, winners) => {
      const card = buildShareCardData({
        result: tiedOnTop(count),
        nameByUserId: nameMap,
        sharerId: null,
        parByHole: PAR_72,
        sideWinners: [],
      });
      expect(card.podium).toHaveLength(3);
      expect(card.winners).toHaveLength(winners);
      expect(card.winners.every((w) => w.rank === 1)).toBe(true);
    },
  );
});

// #2625: a team strokeplay game ranked on net to par shows the team's own to
// par (what it is ranked on), not the sum against the men's par per hole.
describe('team strokeplay — ranked on net to par (#2625)', () => {
  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Cleo'], ['u4', 'Dag']);
  const card = (result: ModeResult) =>
    buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it.each([
    [
      'best_ball',
      {
        kind: 'best_ball',
        ranking: 'net_to_par',
        teams: [
          { teamNumber: 2, playerIds: ['u3', 'u4'], holes: [], total: 17, missingHoles: [], toPar: -7, rank: 1, tiedWith: [] },
          { teamNumber: 1, playerIds: ['u1', 'u2'], holes: [], total: 7, missingHoles: [], toPar: -5, rank: 2, tiedWith: [] },
        ],
      },
    ],
    [
      'texas_scramble',
      {
        kind: 'texas_scramble',
        ranking: 'net_to_par',
        teams: [
          { teamNumber: 2, members: [{ userId: 'u3', courseHandicap: 0, isCaptain: true }], combinedCourseHandicap: 0, teamHandicap: 0, holes: [], totalNet: 17, totalGross: 17, missingHoles: [], toPar: -7, rank: 1, tiedWith: [] },
          { teamNumber: 1, members: [{ userId: 'u1', courseHandicap: 0, isCaptain: true }], combinedCourseHandicap: 0, teamHandicap: 0, holes: [], totalNet: 7, totalGross: 7, missingHoles: [], toPar: -5, rank: 2, tiedWith: [] },
        ],
      },
    ],
    [
      'shamble',
      {
        kind: 'shamble',
        ranking: 'net_to_par',
        variant: 'shamble',
        count: 2,
        scoring: 'net',
        teamSize: 4,
        holes: [],
        teams: [
          { teamNumber: 2, members: ['u3', 'u4'], totalScore: 41, holesCounted: 6, toPar: -7, rank: 1, tiedWith: [] },
          { teamNumber: 1, members: ['u1', 'u2'], totalScore: 19, holesCounted: 3, toPar: -5, rank: 2, tiedWith: [] },
        ],
      },
    ],
  ] as [string, ModeResult][])('%s', (_kind, result) => {
    expect(card(result).podium.map((r) => r.score)).toEqual([
      { kind: 'vsPar', label: '−7' },
      { kind: 'vsPar', label: '−5' },
    ]);
  });
});

// #2625 part 2: a points game ranked on net to par shows the points against
// par pace (what it is ranked on), not the sum of points.
describe('points games — ranked on net to par (#2625)', () => {
  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Cleo'], ['u4', 'Dag']);
  const card = (result: ModeResult) =>
    buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, parByHole: PAR_72, sideWinners: [] });

  it.each([
    [
      'solo stableford',
      {
        kind: 'stableford',
        variant: 'solo',
        ranking: 'net_to_par',
        players: [
          { userId: 'u1', totalPoints: 11, holesPlayed: 3, toPar: 5, rank: 1, tiedWith: [] },
          { userId: 'u2', totalPoints: 13, holesPlayed: 6, toPar: 1, rank: 2, tiedWith: [] },
        ],
        holes: [],
      },
    ],
    [
      'team stableford',
      {
        kind: 'stableford',
        variant: 'team',
        ranking: 'net_to_par',
        teams: [
          { teamNumber: 1, playerIds: ['u1', 'u2'], holes: [], totalPoints: 11, toPar: 5, rank: 1, tiedWith: [] },
          { teamNumber: 2, playerIds: ['u3', 'u4'], holes: [], totalPoints: 13, toPar: 1, rank: 2, tiedWith: [] },
        ],
      },
    ],
    [
      'patsome',
      {
        kind: 'patsome',
        scoring: 'net',
        ranking: 'net_to_par',
        teams: [
          { teamNumber: 1, playerIds: ['u1', 'u2'], captainUserId: 'u1', holes: [], segments: {}, totalPoints: 11, toPar: 5, rank: 1, tiedWith: [] },
          { teamNumber: 2, playerIds: ['u3', 'u4'], captainUserId: 'u3', holes: [], segments: {}, totalPoints: 13, toPar: 1, rank: 2, tiedWith: [] },
        ],
      },
    ],
  ] as unknown as [string, ModeResult][])('%s', (_kind, result) => {
    expect(card(result).podium.map((r) => r.score)).toEqual([
      { kind: 'vsPar', label: '+5' },
      { kind: 'vsPar', label: '+1' },
    ]);
  });
});
