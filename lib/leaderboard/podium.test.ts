import { describe, expect, it } from 'vitest';
import { buildShareCardData } from '@/lib/games/buildShareCardData';
import { PLACE_TIER, podiumFor, podiumPlace, type PodiumRow } from './podium';
import { soloResultBoard, teamResultBoard } from './resultBoard';
import type {
  AceyDeuceyResult,
  BestBallResult,
  BingoBangoBongoResult,
  ModeResult,
  NassauResult,
  NinesResult,
  PatsomeResult,
  RoundRobinResult,
  ShambleResult,
  SkinsResult,
  SoloStrokeplayResult,
  StablefordSoloResult,
  StablefordTeamResult,
  TexasScrambleResult,
  WolfResult,
} from '@/lib/scoring/modes/types';

// Type A (#2756): the top of the finished board comes from the same fields as
// the format's own row, in the engine's order, with no sorting of its own.

const solo = (rows: [string, number, number, number?][]): StablefordSoloResult =>
  ({
    kind: 'stableford',
    variant: 'solo',
    holes: [],
    players: rows.map(([userId, totalPoints, rank, holesPlayed = 18]) => ({
      userId,
      totalPoints,
      rank,
      holesPlayed,
      tiedWith: [],
      decidedBy: null,
    })),
  }) as unknown as StablefordSoloResult;

const STABLEFORD = solo([
  ['a', 38, 1],
  ['b', 34, 2],
  ['c', 34, 2],
  ['d', 31, 4],
  ['e', 29, 5],
]);

const figures = (rows: readonly PodiumRow[] | undefined) => rows?.map((row) => row.total);

describe('podiumFor: the same number as the row', () => {
  it('solo stableford: the points the board shows', () => {
    const podium = podiumFor(STABLEFORD)!;
    const board = soloResultBoard(STABLEFORD, []);
    expect(figures(podium.rows)).toEqual(board.rows.slice(0, 3).map((row) => row.total));
    expect(podium.rows[0]).toMatchObject({ rank: 1, tied: false, memberIds: ['a'], unit: 'points', teamNumber: null });
  });

  it.each([
    ['net', 'gross_to_net' as const, 'net'],
    ['net to par', 'net_to_par' as const, 'toPar'],
  ])('solo strokeplay on %s', (_name, ranking, unit) => {
    const result = {
      kind: 'solo_strokeplay',
      ranking,
      holes: [],
      players: [
        { userId: 'a', rank: 1, holesPlayed: 18, totalNetStrokes: 68, netToPar: -4, tiedWith: [], decidedBy: null },
        { userId: 'b', rank: 2, holesPlayed: 18, totalNetStrokes: 70, netToPar: -2, tiedWith: [], decidedBy: null },
      ],
    } as unknown as SoloStrokeplayResult;
    const podium = podiumFor(result)!;
    expect(figures(podium.rows)).toEqual(soloResultBoard(result, []).rows.map((row) => row.total));
    expect(podium.rows[0].unit).toBe(unit);
  });

  const teamCases: [string, ModeResult, string][] = [
    [
      'texas',
      {
        kind: 'texas_scramble',
        holes: [],
        teams: [
          { teamNumber: 3, rank: 1, totalNet: 62, toPar: -10, teamHandicap: 7, members: [{ userId: 'a' }, { userId: 'b' }], holes: [{ strokes: 4 }], missingHoles: [], decidedBy: null },
          { teamNumber: 1, rank: 2, totalNet: 63, toPar: -9, teamHandicap: 8, members: [{ userId: 'c' }], holes: [{ strokes: 4 }], missingHoles: [], decidedBy: null },
        ],
      } as unknown as TexasScrambleResult,
      'net',
    ],
    [
      'best ball',
      {
        kind: 'best_ball',
        holes: [],
        teams: [
          { teamNumber: 2, rank: 1, total: 60, toPar: -12, playerIds: ['a', 'b'], holes: [{ bestNet: 4 }], missingHoles: [], decidedBy: null },
          { teamNumber: 1, rank: 2, total: 61, toPar: -11, playerIds: ['c', 'd'], holes: [{ bestNet: 4 }], missingHoles: [], decidedBy: null },
        ],
      } as unknown as BestBallResult,
      'net',
    ],
    [
      'shamble',
      {
        kind: 'shamble',
        scoring: 'gross',
        count: 2,
        holes: [],
        teams: [
          { teamNumber: 1, rank: 1, totalScore: 130, toPar: -14, members: ['a', 'b'], holesCounted: 18, decidedBy: null },
          { teamNumber: 2, rank: 2, totalScore: 133, toPar: -11, members: ['c', 'd'], holesCounted: 18, decidedBy: null },
        ],
      } as unknown as ShambleResult,
      'gross',
    ],
    [
      'team stableford',
      {
        kind: 'stableford',
        variant: 'team',
        holes: [],
        teams: [
          { teamNumber: 2, rank: 1, totalPoints: 71, playerIds: ['a', 'b'], holes: [{ players: [{ gross: 4 }] }], decidedBy: null },
          { teamNumber: 1, rank: 2, totalPoints: 66, playerIds: ['c', 'd'], holes: [{ players: [{ gross: 5 }] }], decidedBy: null },
        ],
      } as unknown as StablefordTeamResult,
      'points',
    ],
  ];

  it.each(teamCases)('%s: the team board\'s total, not the card\'s score', (_name, result, unit) => {
    const board = teamResultBoard(result as never, () => '');
    const podium = podiumFor(result)!;
    expect(figures(podium.rows)).toEqual(board.rows.map((row) => row.total));
    expect(podium.rows[0].unit).toBe(unit);
    expect(podium.rows[0].teamNumber).toBe(board.rows[0].teamNumber);
    expect(podium.rows[0].memberIds).toEqual(board.rows[0].memberIds);
  });

  it('a team strokeplay game: never the card\'s against-par figure', () => {
    // The card says −10 on this team; the board says 62 netto.
    const [, result] = teamCases[0];
    const card = buildShareCardData({
      result,
      nameByUserId: new Map(),
      sharerId: null,
      parByHole: new Map([[1, 72]]),
      sideWinners: [],
    });
    expect(card.podium[0].score.kind).toBe('vsPar');
    expect(podiumFor(result)!.rows[0]).toMatchObject({ total: 62, unit: 'net' });
  });

  const fieldCases: [string, ModeResult, number, string][] = [
    ['wolf', { kind: 'wolf', players: [{ userId: 'a', rank: 1, totalPoints: 14 }] } as unknown as WolfResult, 14, 'points'],
    ['bingo bango bongo', { kind: 'bingo_bango_bongo', players: [{ userId: 'a', rank: 1, totalPoints: 9 }] } as unknown as BingoBangoBongoResult, 9, 'points'],
    ['nines', { kind: 'nines', players: [{ userId: 'a', rank: 1, totalPoints: 40 }] } as unknown as NinesResult, 40, 'points'],
    ['round robin', { kind: 'round_robin', players: [{ userId: 'a', rank: 1, totalHoleWins: 7 }] } as unknown as RoundRobinResult, 7, 'holes'],
    ['acey deucey', { kind: 'acey_deucey', players: [{ userId: 'a', rank: 1, total: -3 }] } as unknown as AceyDeuceyResult, -3, 'points'],
    ['skins', { kind: 'skins', players: [{ userId: 'a', rank: 1, totalSkins: 6 }] } as unknown as SkinsResult, 6, 'skins'],
    ['nassau', { kind: 'nassau', players: [{ userId: 'a', rank: 1, units: 2 }] } as unknown as NassauResult, 2, 'points'],
    ['patsome', { kind: 'patsome', scoring: 'net', teams: [{ teamNumber: 4, rank: 1, totalPoints: 41, playerIds: ['a', 'b'] }] } as unknown as PatsomeResult, 41, 'points'],
  ];

  it.each(fieldCases)('%s: the field its view shows', (_name, result, total, unit) => {
    expect(podiumFor(result)!.rows[0]).toMatchObject({ total, unit, rank: 1 });
  });
});

describe('podiumFor: the rows', () => {
  it('stops at three rows, in the engine\'s order', () => {
    expect(podiumFor(STABLEFORD)!.rows.map((row) => row.memberIds[0])).toEqual(['a', 'b', 'c']);
  });

  it('marks a shared place from the rank, not the position (#1372)', () => {
    const { rows } = podiumFor(STABLEFORD)!;
    expect(rows.map((row) => [row.rank, row.tied])).toEqual([
      [1, false],
      [2, true],
      [2, true],
    ]);
  });

  it('names every winner, also past the third row', () => {
    const tied = solo([
      ['a', 36, 1],
      ['b', 36, 1],
      ['c', 36, 1],
      ['d', 36, 1],
      ['e', 30, 5],
    ]);
    const podium = podiumFor(tied)!;
    expect(podium.rows).toHaveLength(3);
    expect(podium.winners.map((row) => row.memberIds[0])).toEqual(['a', 'b', 'c', 'd']);
    expect(podium.winners.every((row) => row.tied)).toBe(true);
  });

  it('one or two rows give one or two rows, and nothing empty', () => {
    expect(podiumFor(solo([['a', 38, 1]]))!.rows).toHaveLength(1);
    expect(podiumFor(solo([['a', 38, 1], ['b', 34, 2]]))!.rows).toHaveLength(2);
  });
});

describe('podiumFor: no top to show', () => {
  it.each(['singles_matchplay', 'fourball_matchplay', 'foursomes_matchplay'])('%s', (kind) => {
    expect(podiumFor({ kind } as unknown as ModeResult)).toBeNull();
  });

  it('an empty field', () => {
    expect(podiumFor(solo([]))).toBeNull();
  });

  it('a league round played alone (#2712)', () => {
    const alone = solo([['a', 34, 1]]);
    expect(podiumFor(alone, { leagueFlight: true })).toBeNull();
    expect(podiumFor(alone, { leagueFlight: false })).not.toBeNull();
    // Two in the league flight are a real field.
    expect(podiumFor(solo([['a', 34, 1], ['b', 30, 2]]), { leagueFlight: true })).not.toBeNull();
  });

  it('skins where nobody took a skin', () => {
    const result = {
      kind: 'skins',
      players: [
        { userId: 'a', rank: 1, totalSkins: 0 },
        { userId: 'b', rank: 1, totalSkins: 0 },
      ],
    } as unknown as SkinsResult;
    expect(podiumFor(result)).toBeNull();
  });

  it('bingo bango bongo with no points handed out', () => {
    const result = {
      kind: 'bingo_bango_bongo',
      players: [
        { userId: 'a', rank: 1, totalPoints: 0 },
        { userId: 'b', rank: 1, totalPoints: 0 },
      ],
    } as unknown as BingoBangoBongoResult;
    expect(podiumFor(result)).toBeNull();
  });
});

describe('the medallion follows the place', () => {
  it('clamps to the three places and gives the tier', () => {
    expect([1, 2, 3, 9].map(podiumPlace)).toEqual([1, 2, 3, 3]);
    expect(PLACE_TIER[podiumPlace(2)]).toBe('silver');
  });
});
