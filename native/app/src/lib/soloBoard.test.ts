// #2579 (Type A): tavla i appen. Tallene er motorens og tavlas (testet i
// `lib/`); her låses hva appen setter sammen av dem: når tavla finnes, båndets
// linje, pillen, radene og stripa, og «Likt med X · avgjort på siste ni».
// Par 4 og banehandicap 0 overalt: 3 slag gir 3 poeng, 4 gir 2 og 5 gir 1.
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { boardBand, hasSoloBoard, soloBoardFor } from './soloBoard';

const ME = 'me';
const players = [
  homePlayer({ userId: 'marte', name: 'Marte Lie' }),
  homePlayer({ userId: ME, name: 'Sigrid Aas', flightNumber: 2 }),
  homePlayer({ userId: 'jonas', name: 'Jonas Berg', flightNumber: 3 }),
];

describe('hasSoloBoard', () => {
  it.each([
    ['solo_strokeplay', { kind: 'solo_strokeplay', team_size: 1 }, true],
    ['stableford', { kind: 'stableford', team_size: 1, points_table: 'standard' }, true],
    ['modified_stableford', { kind: 'modified_stableford', team_size: 1, points_table: 'modified' }, true],
    ['stableford', {}, true],
    ['stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, false],
    ['best_ball', { kind: 'best_ball', team_size: 2, teams_count: 2 }, false],
    ['wolf', { kind: 'wolf', team_size: 1 }, false],
  ])('%s %o → %s', (gameMode, modeConfig, expected) => {
    expect(hasSoloBoard({ gameMode, modeConfig })).toBe(expected);
  });
});

describe('boardBand', () => {
  it('gives the game and course, and the format with players and flights', () => {
    expect(boardBand(homeBundle({ players }))).toEqual({
      kicker: 'Torsdagsrunden · Losby',
      subtitle: 'Stableford · 3 spillere · 3 flighter',
    });
  });

  it('leaves out one flight and a withdrawn player', () => {
    const band = boardBand(
      homeBundle({
        game: { gameMode: 'solo_strokeplay' },
        players: [
          homePlayer({ userId: 'a' }),
          homePlayer({ userId: 'b', withdrawnAt: '2026-09-29T10:00:00.000Z', flightNumber: 2 }),
        ],
      }),
    );
    expect(band.subtitle).toBe('Slagspill · 1 spiller');
  });
});

describe('soloBoardFor — live', () => {
  const scores = [
    ...holeScores('g-live', 'marte', 7, 3),
    ...holeScores('g-live', ME, 7, 4),
    ...holeScores('g-live', 'jonas', 7, 5),
  ];
  const model = soloBoardFor({ bundle: homeBundle({ players }), scores, userId: ME })!;

  it('reads the board: place, leader, you, number and the last five holes', () => {
    expect(model).toMatchObject({
      variant: 'live',
      pill: { text: 'Live · etter 7 hull', live: true },
      totalHeading: 'Poeng',
      showHoles: true,
      viewerId: ME,
    });
    expect(model.rows.map((r) => [r.userId, r.place, r.leader, r.you, r.total, r.recent.length])).toEqual([
      ['marte', '1', true, false, '21', 5],
      [ME, '2', false, true, '14', 5],
      ['jonas', '3', false, false, '7', 5],
    ]);
  });

  it('gives the strip the place, the gap to the leader by first name, and the next hole', () => {
    expect(model.strip).toEqual({
      kicker: 'Din runde',
      text: '2. plass · 7 poeng bak Marte',
      action: { kind: 'hole', holeNumber: 8, label: 'Hull 8 →' },
    });
  });

  it('has only the place for the leader, and no strip for someone not on the board', () => {
    const leader = soloBoardFor({ bundle: homeBundle({ players }), scores, userId: 'marte' })!;
    expect(leader.strip?.text).toBe('1. plass');
    expect(soloBoardFor({ bundle: homeBundle({ players }), scores, userId: 'organiser' })?.strip).toBeNull();
  });
});

describe('soloBoardFor — finished', () => {
  // Marte 54 poeng. Sigrid og Jonas har 36 hver; Jonas tok sine på siste ni.
  const scores = [
    ...holeScores('g-live', 'marte', 18, 3),
    ...holeScores('g-live', ME, 9, 3),
    ...holeScores('g-live', ME, 18, 5, 10),
    ...holeScores('g-live', 'jonas', 9, 5),
    ...holeScores('g-live', 'jonas', 18, 3, 10),
  ];
  const model = soloBoardFor({
    bundle: homeBundle({ game: { status: 'finished' }, players }),
    scores,
    userId: ME,
  })!;

  it('crowns the winner and says what split the tie, on the lower row', () => {
    expect(model).toMatchObject({
      variant: 'finished',
      pill: { text: 'Sluttresultat · 18 hull', live: false },
      showHoles: false,
    });
    expect(model.rows.map((r) => [r.userId, r.place, r.leader, r.total, r.note])).toEqual([
      ['marte', '1', true, '54', null],
      ['jonas', '2', false, '36', null],
      [ME, '3', false, '36', 'Likt med Jonas · avgjort på siste ni'],
    ]);
  });

  it('gives the short gap and the scorecard', () => {
    expect(model.strip).toEqual({
      kicker: 'Ditt resultat',
      text: '3. plass · 18 bak Marte',
      action: { kind: 'scorecard', label: 'Scorekortet →' },
    });
  });

  it('has only the place when level on total with the row ahead', () => {
    const level = soloBoardFor({
      bundle: homeBundle({ game: { status: 'finished' }, players: players.slice(1) }),
      scores: scores.filter((s) => s.userId !== 'marte'),
      userId: ME,
    })!;
    expect(level.strip?.text).toBe('2. plass');
  });
});

describe('soloBoardFor — when the screen shows something else', () => {
  const scores = holeScores('g-live', ME, 3, 4);
  it.each([
    ['no strokes yet', homeBundle({ players }), []],
    ['team stableford', homeBundle({ game: { modeConfig: { kind: 'stableford', team_size: 2 } }, players }), scores],
    ['a nine-hole game the app does not run', homeBundle({ game: { holeSegment: 'front9' }, players }), scores],
    ['a reveal round still hiding net', homeBundle({ game: { scoreVisibility: 'reveal' }, players }), scores],
  ])('%s → null', (_name, bundle, rows) => {
    expect(soloBoardFor({ bundle, scores: rows, userId: ME })).toBeNull();
  });
});
