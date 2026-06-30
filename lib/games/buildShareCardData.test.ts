/**
 * Tests for buildShareCardData (#942 — shareable result-card image data shaping).
 * Written FIRST (TDD); run `npx vitest run lib/games/buildShareCardData` to verify.
 */

import { describe, expect, it } from 'vitest';

import type {
  AceyDeuceyResult,
  BestBallResult,
  BingoBangoBongoResult,
  NassauResult,
  NinesResult,
  RoundRobinResult,
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

// ---------------------------------------------------------------------------
// Test 1: solo_strokeplay, sharer in top 3
// ---------------------------------------------------------------------------
describe('solo_strokeplay — sharer in top 3', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, rank: 2, tiedWith: [] },
      { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 79, holesPlayed: 18, rank: 3, tiedWith: [] },
      { userId: 'u4', totalNetStrokes: 80, totalGrossStrokes: 84, holesPlayed: 18, rank: 4, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie'], ['u4', 'Dave']);

  it('band is placement', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    expect(card.band).toBe('placement');
  });

  it('podium contains top 3 rows', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    expect(card.podium).toHaveLength(3);
    expect(card.podium[0].rank).toBe(1);
    expect(card.podium[1].rank).toBe(2);
    expect(card.podium[2].rank).toBe(3);
  });

  it('winner is rank-1 row', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    expect(card.winner).not.toBeNull();
    expect(card.winner!.rank).toBe(1);
    expect(card.winner!.name).toBe('Alice');
  });

  it('sharer row has isSharer=true', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    const sharerRow = card.podium.find((r) => r.isSharer);
    expect(sharerRow).toBeDefined();
    expect(sharerRow!.name).toBe('Bob');
  });

  it('sharerStrip is null (sharer in top 3)', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    expect(card.sharerStrip).toBeNull();
  });

  it('scores are vs-par (−2, E, +3)', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    // u1: 70 net vs 72 par = −2
    expect(card.podium[0].score).toEqual({ kind: 'vsPar', label: '−2' });
    // u2: 72 net vs 72 par = E
    expect(card.podium[1].score).toEqual({ kind: 'vsPar', label: 'E' });
    // u3: 75 net vs 72 par = +3
    expect(card.podium[2].score).toEqual({ kind: 'vsPar', label: '+3' });
  });

  it('match is null for placement band', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    expect(card.match).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2: sharer outside top 3 → sharerStrip
// ---------------------------------------------------------------------------
describe('solo_strokeplay — sharer outside top 3', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, rank: 2, tiedWith: [] },
      { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 79, holesPlayed: 18, rank: 3, tiedWith: [] },
      { userId: 'u4', totalNetStrokes: 80, totalGrossStrokes: 84, holesPlayed: 18, rank: 4, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie'], ['u4', 'Dave']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u4', coursePar: 72, sideWinners: [] });

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
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
    teams: [
      { teamNumber: 1, playerIds: ['u1', 'u2'], holes: [], total: 68, missingHoles: [], rank: 1, tiedWith: [] },
      { teamNumber: 2, playerIds: ['u3', 'u4'], holes: [], total: 71, missingHoles: [], rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie'], ['u4', 'Dave']);

  it('sharer u2 (rank-1 team) → isSharer on podium row', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    expect(card.podium[0].isSharer).toBe(true);
    expect(card.sharerStrip).toBeNull();
  });

  it('sharer u3 (rank-2 team) → isSharer on rank-2 row', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u3', coursePar: 72, sideWinners: [] });
    expect(card.podium[1].isSharer).toBe(true);
  });

  it('team name is joined member names', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });
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
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, rank: 2, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

  it('podium has only 2 rows', () => {
    expect(card.podium).toHaveLength(2);
  });

  it('winner is rank-1', () => {
    expect(card.winner!.rank).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 6: ties (two rank-1) → both appear, stable order
// ---------------------------------------------------------------------------
describe('solo_strokeplay — tied rank-1', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, rank: 1, tiedWith: ['u2'] },
      { userId: 'u2', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, rank: 1, tiedWith: ['u1'] },
      { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 79, holesPlayed: 18, rank: 3, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob'], ['u3', 'Charlie']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
});

// ---------------------------------------------------------------------------
// Test 7: stableford → "{points} poeng" labels
// ---------------------------------------------------------------------------
describe('stableford solo — score labels', () => {
  const result: StablefordResult = {
    kind: 'stableford',
    variant: 'solo',
    holes: [],
    players: [
      { userId: 'u1', totalPoints: 38, rank: 1, holesPlayed: 18, tiedWith: [] },
      { userId: 'u2', totalPoints: 34, rank: 2, holesPlayed: 18, tiedWith: [] },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });
    expect(card.band).toBe('skins');
  });

  it('scores carry the skins count', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });
    expect(card.podium[0].score).toEqual({ kind: 'skins', value: 4 });
    expect(card.podium[1].score).toEqual({ kind: 'skins', value: 2 });
    expect(card.podium[2].score).toEqual({ kind: 'skins', value: 1 });
  });

  it('sharerStrip logic same as placement — outside top 3', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u4', coursePar: 72, sideWinners: [] });
    expect(card.sharerStrip).not.toBeNull();
    expect(card.sharerStrip!.name).toBe('Dave');
    expect(card.sharerStrip!.score).toEqual({ kind: 'skins', value: 0 });
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
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u1', coursePar: 72, sideWinners: [] });

  it('band is matchplay', () => {
    expect(card.band).toBe('matchplay');
  });

  it('podium is empty', () => {
    expect(card.podium).toHaveLength(0);
  });

  it('winner is null', () => {
    expect(card.winner).toBeNull();
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
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u1', coursePar: 72, sideWinners: [] });
    expect(card.match!.sharerOutcome).toEqual({ kind: 'tied' });
  });

  it('non-participant sharer → sharerOutcome is null', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });
    expect(card.match!.sharerOutcome).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 11: sideTournaments — one null winner (skipped), one won by sharer
// ---------------------------------------------------------------------------
describe('sideTournaments', () => {
  const result: SoloStrokeplayResult = {
    kind: 'solo_strokeplay',
    holes: [],
    players: [
      { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 74, holesPlayed: 18, rank: 1, tiedWith: [] },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 76, holesPlayed: 18, rank: 2, tiedWith: [] },
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
    coursePar: 72,
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
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
        rank: 1,
        tiedWith: [],
      },
    ],
  };

  const nameMap = names(['u1', 'Alice'], ['u2', 'Bob']);
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
  const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: null, coursePar: 72, sideWinners: [] });

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
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u1', coursePar: 72, sideWinners: [] });
    expect(card.match!.sharerOutcome).toEqual({ kind: 'lost', margin: '2up' });
  });

  it('winner sharer gets won 2up', () => {
    const card = buildShareCardData({ result, nameByUserId: nameMap, sharerId: 'u2', coursePar: 72, sideWinners: [] });
    expect(card.match!.sharerOutcome).toEqual({ kind: 'won', margin: '2up' });
  });
});
