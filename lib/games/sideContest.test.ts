import { describe, expect, it } from 'vitest';
import type { CupNamedPlayerRow } from '../cup/cupRoster';
import {
  categoryForCupKind,
  contestsForHole,
  girBallsForGame,
  girQuestionForPar,
  holeForSlot,
  parseClaimDistance,
  parseSideContestHole,
  sideClaimFlightKey,
  sortClaimsForHole,
  sumGirClaimsByTeam,
  toCupSideAwards,
  type CupSideAward,
  type GirClaimInput,
  type GirSumGame,
  type SideHolesConfig,
} from './sideContest';

const plain: SideHolesConfig = {
  sideLdCount: 1,
  sideCtpCount: 1,
  sideLdHoles: [9],
  sideCtpHoles: [7, 11],
  sourceGameId: null,
};

const noSide: SideHolesConfig = { sideLdCount: 0, sideCtpCount: 0, sourceGameId: null };

describe('holeForSlot', () => {
  it('gives the hole for a slot inside the count', () => {
    expect(holeForSlot([7, 11], 2, 1)).toBe(7);
    expect(holeForSlot([7, 11], 2, 2)).toBe(11);
  });

  it('gives no hole past the count, even when the array still holds one', () => {
    expect(holeForSlot([7, 11], 1, 2)).toBeNull();
  });

  it('gives no hole for a slot without one, or without holes at all', () => {
    expect(holeForSlot([null, 11], 2, 1)).toBeNull();
    expect(holeForSlot(null, 2, 1)).toBeNull();
    expect(holeForSlot(undefined, 2, 1)).toBeNull();
    expect(holeForSlot([7], 1, 0)).toBeNull();
  });
});

describe('categoryForCupKind', () => {
  it('maps each cup kind to the category it is reported under', () => {
    expect(categoryForCupKind('ctp')).toBe('closest_to_pin');
    expect(categoryForCupKind('ld')).toBe('longest_drive');
    expect(categoryForCupKind('gir')).toBe('gir');
  });
});

describe('toCupSideAwards', () => {
  it('maps the rows, reads numeric points given as text, and leaves out unknown kinds', () => {
    expect(
      toCupSideAwards([
        { kind: 'ctp', hole_number: 3, points: '2', gir_max_per_team: null },
        { kind: 'gir', hole_number: 5, points: 1.5, gir_max_per_team: 2 },
        { kind: 'eagle', hole_number: 8, points: 1, gir_max_per_team: null },
      ]),
    ).toEqual([
      { kind: 'ctp', holeNumber: 3, points: 2, girMaxPerTeam: null },
      { kind: 'gir', holeNumber: 5, points: 1.5, girMaxPerTeam: 2 },
    ]);
  });
});

describe('contestsForHole', () => {
  it('a game without holes chosen has no contests anywhere (the behaviour before #2283)', () => {
    for (let hole = 1; hole <= 18; hole++) {
      expect(contestsForHole({ ...plain, sideLdHoles: null, sideCtpHoles: null }, [], hole)).toEqual([]);
      expect(contestsForHole(noSide, null, hole)).toEqual([]);
    }
  });

  it('puts closest to pin on its hole and longest drive on its hole, and nothing on the others', () => {
    expect(contestsForHole(plain, [], 7)).toEqual([{ category: 'closest_to_pin', source: 'game' }]);
    expect(contestsForHole(plain, [], 9)).toEqual([{ category: 'longest_drive', source: 'game' }]);
    expect(contestsForHole(plain, [], 6)).toEqual([]);
  });

  it('ignores a slot past the count', () => {
    expect(contestsForHole(plain, [], 11)).toEqual([]);
  });

  it('gives both categories when the game has both on one hole', () => {
    const both: SideHolesConfig = { ...plain, sideLdHoles: [7] };
    expect(contestsForHole(both, [], 7)).toEqual([
      { category: 'closest_to_pin', source: 'game' },
      { category: 'longest_drive', source: 'game' },
    ]);
  });

  it('an older cached bundle without the hole fields reads as no holes', () => {
    const old = { sideLdCount: 1, sideCtpCount: 1, sourceGameId: null } satisfies SideHolesConfig;
    expect(contestsForHole(old, undefined, 7)).toEqual([]);
  });

  const cup: CupSideAward[] = [
    { kind: 'ctp', holeNumber: 3, points: 2, girMaxPerTeam: null },
    { kind: 'ctp', holeNumber: 3, points: 2, girMaxPerTeam: null },
    { kind: 'gir', holeNumber: 3, points: 1.5, girMaxPerTeam: 2 },
    { kind: 'ld', holeNumber: 12, points: 1, girMaxPerTeam: null },
  ];

  it('gives the cup contests with their points, one per category, closest to pin before GIR', () => {
    expect(contestsForHole(noSide, cup, 3)).toEqual([
      { category: 'closest_to_pin', source: 'cup', points: 2 },
      { category: 'gir', source: 'cup', points: 1.5, maxPerTeam: 2 },
    ]);
    expect(contestsForHole(noSide, cup, 12)).toEqual([{ category: 'longest_drive', source: 'cup', points: 1 }]);
    expect(contestsForHole(noSide, cup, 4)).toEqual([]);
  });

  it('the cup wins over the game on the same category and hole', () => {
    const game: SideHolesConfig = { ...noSide, sideCtpCount: 1, sideCtpHoles: [3] };
    expect(contestsForHole(game, cup, 3)[0]).toEqual({ category: 'closest_to_pin', source: 'cup', points: 2 });
  });

  it('a derived cup game has no contests', () => {
    expect(contestsForHole({ ...noSide, sourceGameId: 'host' }, cup, 3)).toEqual([]);
  });
});

describe('parseSideContestHole', () => {
  it('takes whole numbers 1–18', () => {
    expect(parseSideContestHole('1')).toBe(1);
    expect(parseSideContestHole(' 18 ')).toBe(18);
    expect(parseSideContestHole('07')).toBe(7);
  });

  it('refuses anything else', () => {
    for (const raw of ['0', '19', '-1', '7.5', '7.0', 'x', '', '1e1', '100']) {
      expect(parseSideContestHole(raw)).toBeNull();
    }
  });
});

describe('parseClaimDistance', () => {
  it('takes comma and point, and an empty field is no distance', () => {
    expect(parseClaimDistance('2,4')).toEqual({ ok: true, distanceM: 2.4 });
    expect(parseClaimDistance('2.4')).toEqual({ ok: true, distanceM: 2.4 });
    expect(parseClaimDistance('  ')).toEqual({ ok: true, distanceM: null });
  });

  it('rounds to one decimal like round(x, 1) in Postgres', () => {
    expect(parseClaimDistance('2,46')).toEqual({ ok: true, distanceM: 2.5 });
    expect(parseClaimDistance('0,15')).toEqual({ ok: true, distanceM: 0.2 });
    expect(parseClaimDistance('0,05')).toEqual({ ok: true, distanceM: 0.1 });
  });

  it('holds 0,1–99,9 after rounding', () => {
    expect(parseClaimDistance('0,1')).toEqual({ ok: true, distanceM: 0.1 });
    expect(parseClaimDistance('99,9')).toEqual({ ok: true, distanceM: 99.9 });
    expect(parseClaimDistance('0,04')).toEqual({ ok: false });
    expect(parseClaimDistance('0')).toEqual({ ok: false });
    expect(parseClaimDistance('99,95')).toEqual({ ok: false });
    expect(parseClaimDistance('100')).toEqual({ ok: false });
  });

  it('takes at most two decimals, so the rounding never differs from Postgres', () => {
    expect(parseClaimDistance('2,45')).toEqual({ ok: true, distanceM: 2.5 });
    expect(parseClaimDistance('2,449999999')).toEqual({ ok: false });
    expect(parseClaimDistance('0,0499999999')).toEqual({ ok: false });
    expect(parseClaimDistance('2,449')).toEqual({ ok: false });
  });

  it('refuses text, signs and units', () => {
    for (const raw of ['abc', '-2', '2,4 m', '2,,4', ',5', '1e1']) {
      expect(parseClaimDistance(raw)).toEqual({ ok: false });
    }
  });
});

describe('sortClaimsForHole', () => {
  it('puts the shortest distance first and reports without one last, by flight', () => {
    const claims = [
      { flightNumber: 1, distanceM: null },
      { flightNumber: 2, distanceM: 2.4 },
      { flightNumber: 3, distanceM: 1.1 },
      { flightNumber: 4, distanceM: 2.4 },
      { flightNumber: 0, distanceM: null },
    ];
    expect(sortClaimsForHole(claims).map((c) => c.flightNumber)).toEqual([3, 2, 4, 0, 1]);
  });

  it('does not change the input, and handles none and one', () => {
    const one = [{ flightNumber: 1, distanceM: 3 }];
    expect(sortClaimsForHole(one)).not.toBe(one);
    expect(sortClaimsForHole(one)).toEqual(one);
    expect(sortClaimsForHole([])).toEqual([]);
  });
});

describe('girQuestionForPar', () => {
  it('asks for the green in par minus two strokes', () => {
    expect(girQuestionForPar(3)).toBe('afterTeeShot');
    expect(girQuestionForPar(4)).toBe('onTwo');
    expect(girQuestionForPar(5)).toBe('onThree');
    expect(girQuestionForPar(6)).toBe('onFour');
  });

  it('clamps a par outside 3–6', () => {
    expect(girQuestionForPar(2)).toBe('afterTeeShot');
    expect(girQuestionForPar(7)).toBe('onFour');
  });
});

describe('sideClaimFlightKey', () => {
  const player = (user_id: string, flight_number: number | null, withdrawn_at: string | null = null) => ({
    user_id,
    flight_number,
    withdrawn_at,
  });
  const twoFlights = [
    player('me', 2),
    player('a', 1),
    player('b', 1),
    player('c', 1),
    player('d', 1),
    player('e', 2),
  ];

  it('is 0 in a single-flight game, whatever the flight number says', () => {
    expect(sideClaimFlightKey('stableford', [player('me', 3), player('a', 1)], 'me')).toBe(0);
    expect(sideClaimFlightKey('wolf', [...twoFlights, player('f', 2)], 'me')).toBe(0);
  });

  it('is the caller’s flight number with more than four active players', () => {
    expect(sideClaimFlightKey('stableford', twoFlights, 'me')).toBe(2);
  });

  it('counts only active players towards the four', () => {
    const withdrawn = [player('me', 2), player('a', 1), player('b', 1), player('c', 1), player('d', 1, '2026-11-15')];
    expect(sideClaimFlightKey('stableford', withdrawn, 'me')).toBe(0);
  });

  it('is null without a flight in a bigger game, for a withdrawn caller and for a non-player', () => {
    const noFlight = twoFlights.map((p) => (p.user_id === 'me' ? player('me', null) : p));
    expect(sideClaimFlightKey('stableford', noFlight, 'me')).toBeNull();
    expect(sideClaimFlightKey('stableford', [player('me', 1, '2026-11-15'), player('a', 1)], 'me')).toBeNull();
    expect(sideClaimFlightKey('stableford', twoFlights, 'stranger')).toBeNull();
  });
});

describe('girBallsForGame', () => {
  const four = [
    { userId: 'ole', teamNumber: 1 },
    { userId: 'kari', teamNumber: 1 },
    { userId: 'per', teamNumber: 2 },
    { userId: 'liv', teamNumber: 2 },
  ];

  it('singles: one ball per player', () => {
    expect(girBallsForGame('singles_matchplay', four.slice(0, 1).concat(four[2]))).toEqual([
      { key: 'ole', userIds: ['ole'] },
      { key: 'per', userIds: ['per'] },
    ]);
  });

  it('fourball: one ball per player, sides or not', () => {
    expect(girBallsForGame('fourball_matchplay', four).map((b) => b.userIds)).toEqual([
      ['ole'],
      ['kari'],
      ['per'],
      ['liv'],
    ]);
  });

  it('foursomes and the rest of the family: one ball per side', () => {
    for (const mode of ['foursomes_matchplay', 'greensome_matchplay', 'chapman_matchplay', 'gruesome_matchplay'] as const) {
      expect(girBallsForGame(mode, four)).toEqual([
        { key: 'side-1', userIds: ['ole', 'kari'] },
        { key: 'side-2', userIds: ['per', 'liv'] },
      ]);
    }
  });

  it('a player without a side in foursomes still gets a ball', () => {
    expect(girBallsForGame('foursomes_matchplay', [{ userId: 'ole', teamNumber: null }])).toEqual([
      { key: 'ole', userIds: ['ole'] },
    ]);
  });
});

describe('sumGirClaimsByTeam', () => {
  const row = (user_id: string, team_number: number): CupNamedPlayerRow => ({
    user_id,
    team_number,
    users: { name: user_id, nickname: null },
    withdrawn_at: null,
  });

  const fourball: GirSumGame = {
    id: 'm1',
    status: 'active',
    gameMode: 'fourball_matchplay',
    holeSegment: 'full',
    sourceGameId: null,
    players: [row('ole', 1), row('kari', 1), row('per', 2), row('liv', 2)],
  };
  const foursomes: GirSumGame = {
    id: 'm2',
    status: 'active',
    gameMode: 'foursomes_matchplay',
    holeSegment: 'full',
    sourceGameId: null,
    players: [row('ola', 1), row('kim', 1), row('pia', 2), row('tor', 2)],
  };
  const silent: GirSumGame = {
    id: 'm3',
    status: 'active',
    gameMode: 'singles_matchplay',
    holeSegment: 'full',
    sourceGameId: null,
    players: [row('ane', 1), row('bo', 2)],
  };

  const claim = (gameId: string, userId: string, hit: boolean, holeNumber = 5): GirClaimInput => ({
    gameId,
    holeNumber,
    userId,
    hit,
  });

  it('sums two matches per team, counts a shared foursomes ball once, and names a match without reports', () => {
    const claims = [
      claim('m1', 'ole', true),
      claim('m1', 'kari', true),
      claim('m1', 'per', false),
      claim('m1', 'liv', true),
      claim('m2', 'ola', true),
      claim('m2', 'kim', true),
      claim('m2', 'pia', false),
      claim('m2', 'tor', false),
      claim('m1', 'per', true, 6),
    ];
    const sum = sumGirClaimsByTeam(5, claims, [fourball, foursomes, silent]);

    expect(sum.team1.count).toBe(3);
    expect(sum.team1.balls.map((ball) => ball.map((p) => p.userId))).toEqual([['ole'], ['kari'], ['ola', 'kim']]);
    expect(sum.team2.count).toBe(1);
    expect(sum.team2.balls.map((ball) => ball.map((p) => p.userId))).toEqual([['liv']]);
    expect(sum.reportedGameIds).toEqual(['m1', 'm2']);
    expect(sum.missingGameIds).toEqual(['m3']);
  });

  it('nobody reported: zero per team and every match missing', () => {
    const sum = sumGirClaimsByTeam(5, [], [fourball, silent]);
    expect(sum.team1).toEqual({ count: 0, balls: [] });
    expect(sum.team2).toEqual({ count: 0, balls: [] });
    expect(sum.missingGameIds).toEqual(['m1', 'm3']);
  });

  it('«Ingen traff greenen» is reported, with no hits', () => {
    const claims = ['ane', 'bo'].map((userId) => claim('m3', userId, false));
    const sum = sumGirClaimsByTeam(5, claims, [silent]);
    expect(sum.reportedGameIds).toEqual(['m3']);
    expect(sum.team1.count + sum.team2.count).toBe(0);
  });

  it('a derived game and a half of a split day without the hole neither count nor go missing', () => {
    const derived: GirSumGame = { ...silent, id: 'd1', sourceGameId: 'm1' };
    const back9: GirSumGame = { ...silent, id: 'b9', holeSegment: 'back9' };
    const sum = sumGirClaimsByTeam(5, [], [derived, back9]);
    expect(sum.missingGameIds).toEqual([]);
    expect(sum.reportedGameIds).toEqual([]);
  });
});
