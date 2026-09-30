// Hjem v2 (#2385): poengene i «Forrige runde» (Type A).
//
// Hvor mange poeng en runde gir, er motorens sak og testet der. Her låses bare
// hvilke runder som får poeng (de der tavla viser en poengkolonne), og at
// tallet er det tavla viser for deg.
import type { BundlePlayer } from '../data/gameBundle';
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { lastRoundPoints } from './lastRound';
import { computeGameLeaderboard } from './scoringContext';

const PLAYERS = [homePlayer({ userId: 'me' }), homePlayer({ userId: 'marte' })];

function finished(
  gameMode: string,
  opts: { modeConfig?: unknown; players?: BundlePlayer[]; holeSegment?: string } = {},
) {
  return homeBundle({
    game: {
      id: 'last',
      status: 'finished',
      gameMode,
      modeConfig: opts.modeConfig ?? {},
      holeSegment: opts.holeSegment ?? 'full',
    },
    players: opts.players ?? PLAYERS,
  });
}

/** Tre spillere der du er best på hvert hull: 3, 4 og 5 slag på par 4. */
const TRIO = [
  homePlayer({ userId: 'me', teamNumber: 1 }),
  homePlayer({ userId: 'ola', teamNumber: 2 }),
  homePlayer({ userId: 'kari', teamNumber: 3 }),
];
const TRIO_SCORES = [
  ...holeScores('last', 'me', 18, 3),
  ...holeScores('last', 'ola', 18, 4),
  ...holeScores('last', 'kari', 18, 5),
];

it('gir dine stableford-poeng for runden, regnet av appens motor', () => {
  // Par 4 og handicap 0: fire slag gir 2 poeng, fem gir 1.
  const scores = [...holeScores('last', 'me', 18, 4), ...holeScores('last', 'marte', 18, 5)];
  expect(lastRoundPoints(finished('stableford'), scores, 'me')).toBe(36);
  expect(lastRoundPoints(finished('stableford'), scores, 'marte')).toBe(18);
});

it('modifisert stableford teller med sin egen tabell, også når summen er 0', () => {
  const scores = holeScores('last', 'me', 18, 4);
  expect(lastRoundPoints(finished('modified_stableford'), scores, 'me')).toBe(0);
});

it('lag-stableford gir lagets poeng, som tavla', () => {
  const players = [
    homePlayer({ userId: 'me', teamNumber: 1 }),
    homePlayer({ userId: 'marte', teamNumber: 1 }),
    homePlayer({ userId: 'ola', teamNumber: 2 }),
    homePlayer({ userId: 'kari', teamNumber: 2 }),
  ];
  const bundle = finished('stableford', {
    modeConfig: { kind: 'stableford', team_size: 2, points_table: 'standard' },
    players,
  });
  // Beste ball per hull: dine fire slag (2 poeng) teller for laget.
  const scores = [
    ...holeScores('last', 'me', 18, 4),
    ...holeScores('last', 'marte', 18, 5),
    ...holeScores('last', 'ola', 18, 5),
    ...holeScores('last', 'kari', 18, 5),
  ];
  expect(lastRoundPoints(bundle, scores, 'me')).toBe(36);
  expect(lastRoundPoints(bundle, scores, 'marte')).toBe(36);
  expect(lastRoundPoints(bundle, scores, 'ola')).toBe(18);
});

it('nassau gir seksjonene du vant, som tavlas «Poeng»', () => {
  const bundle = finished('nassau', {
    modeConfig: { kind: 'nassau', team_size: 1, nassau_scoring: 'gross' },
    players: TRIO,
  });
  expect(lastRoundPoints(bundle, TRIO_SCORES, 'me')).toBe(3);
  expect(lastRoundPoints(bundle, TRIO_SCORES, 'kari')).toBe(0);
});

it('nines og acey deucey gir tallet i tavlas poengkolonne', () => {
  const nines = finished('nines', {
    modeConfig: { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: 'gross' },
    players: TRIO,
  });
  // Best på hvert hull: 5 av 9 poeng, 18 ganger.
  expect(lastRoundPoints(nines, TRIO_SCORES, 'me')).toBe(90);

  const acey = finished('acey_deucey', {
    modeConfig: { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: 'gross' },
    players: [...TRIO, homePlayer({ userId: 'per', teamNumber: 4 })],
  });
  const scores = [...TRIO_SCORES, ...holeScores('last', 'per', 18, 6)];
  const outcome = computeGameLeaderboard(acey, scores);
  if (!outcome.ok || outcome.result.kind !== 'acey_deucey') throw new Error('acey');
  const board = outcome.result.players.find((p) => p.userId === 'me')?.total;
  expect(board).toBeGreaterThan(0);
  expect(lastRoundPoints(acey, scores, 'me')).toBe(board);
});

it('wolf og bingo bango bongo trenger valgene; uten dem står brutto', () => {
  const bbb = finished('bingo_bango_bongo', {
    modeConfig: { kind: 'bingo_bango_bongo', team_size: 1 },
    players: TRIO,
  });
  const holes = [1, 2, 3].map((holeNumber) => ({
    holeNumber,
    bingoUserId: 'me',
    bangoUserId: null,
    bongoUserId: null,
  }));
  expect(lastRoundPoints(bbb, TRIO_SCORES, 'me', { bingoBangoBongoHoles: holes })).toBe(3);
  expect(lastRoundPoints(bbb, TRIO_SCORES, 'me')).toBeNull();

  const wolf = finished('wolf', {
    modeConfig: { kind: 'wolf', team_size: 1, teams_count: 3, wolf_scoring: 'gross' },
    players: TRIO,
  });
  const extras = { wolfChoices: [] };
  const outcome = computeGameLeaderboard(wolf, TRIO_SCORES, extras);
  if (!outcome.ok || outcome.result.kind !== 'wolf') throw new Error('wolf');
  const board = outcome.result.players.find((p) => p.userId === 'me')?.totalPoints;
  expect(lastRoundPoints(wolf, TRIO_SCORES, 'me', extras)).toBe(board);
  expect(board).toEqual(expect.any(Number));
  expect(lastRoundPoints(wolf, TRIO_SCORES, 'me')).toBeNull();
});

it('gir ingen poeng for formater som teller slag, uten egne slag, eller når tavla er stengt', () => {
  const scores = holeScores('last', 'me', 18, 4);
  expect(lastRoundPoints(finished('solo_strokeplay'), scores, 'me')).toBeNull();
  expect(lastRoundPoints(finished('stableford'), holeScores('last', 'marte', 18, 4), 'me')).toBeNull();
  expect(lastRoundPoints(finished('stableford'), scores, 'ikke-med')).toBeNull();
  // Patsome og avledede spill regner appens motor ikke på.
  expect(lastRoundPoints(finished('patsome'), scores, 'me')).toBeNull();
});

// #2265: motoren regner en ni-hullsrunde på nierne, som webbens tavle
// (`scoringContext.ts`), så runden får poengene sine, som i designet for
// Rundedagboka («9 hull · 18 p»).
it('gir poeng for en ni-hullsrunde, regnet på nierne', () => {
  const scores = holeScores('last', 'me', 18, 4);
  expect(lastRoundPoints(finished('stableford', { holeSegment: 'front9' }), scores, 'me')).toBe(18);
  expect(lastRoundPoints(finished('stableford', { holeSegment: 'back9' }), scores, 'me')).toBe(18);
});
