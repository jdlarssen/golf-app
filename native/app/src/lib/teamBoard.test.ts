// #2579 PR 2 (Type A): lagtavla i appen. Tallene er motorens og tavlas
// (testet i `lib/leaderboard/`); her låses hva appen setter sammen av dem:
// når lagtavla finnes, båndets linje, pillen, kortene, «Ditt lag på hull N»,
// låskortet og stripa, og utslagsdelene fra #2580. Par 4 og indeks lik hullnummeret overalt
// (`homeBundle`), banehandicap 0 der ikke annet står.
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import type { LocalScore } from '../data/db';
import { hasTeamBoard, teamBoardBand, teamBoardFor } from './teamBoard';

const ME = 'me';

/** Hver spiller på laget fører de samme slagene (laget spiller én ball i scramble). */
function teamScores(userIds: string[], strokes: number[], from = 1): LocalScore[] {
  return userIds.flatMap((userId) =>
    strokes.flatMap((value, i) => holeScores('g-live', userId, from + i, value, from + i)),
  );
}

const TEXAS = { kind: 'texas_scramble', team_size: 2, teams_count: 3, team_handicap_pct: 0 };
const BEST_BALL = { kind: 'best_ball', team_size: 2, teams_count: 3 };

const teams = [
  homePlayer({ userId: ME, name: 'Sigrid Aas', teamNumber: 1 }),
  homePlayer({ userId: 'marte', name: 'Marte Lie', teamNumber: 1 }),
  homePlayer({ userId: 'jonas', name: 'Jonas Berg', teamNumber: 2 }),
  homePlayer({ userId: 'kari', name: 'Kari Nord', teamNumber: 2 }),
  homePlayer({ userId: 'ola', name: 'Ola Dahl', teamNumber: 3 }),
  homePlayer({ userId: 'per', name: 'Per Holm', teamNumber: 3 }),
];

describe('hasTeamBoard', () => {
  it.each([
    ['texas_scramble', TEXAS, true],
    ['ambrose', { kind: 'ambrose', team_size: 2 }, true],
    ['florida_scramble', { kind: 'florida_scramble', team_size: 2 }, true],
    ['best_ball', BEST_BALL, true],
    ['shamble', { kind: 'shamble', team_size: 3 }, true],
    ['stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, true],
    ['modified_stableford', { kind: 'modified_stableford', team_size: 2, points_table: 'modified' }, true],
    ['stableford', {}, false],
    ['solo_strokeplay', { kind: 'solo_strokeplay', team_size: 1 }, false],
    ['fourball_matchplay', { kind: 'fourball_matchplay' }, false],
  ])('%s %o → %s', (gameMode, modeConfig, expected) => {
    expect(hasTeamBoard({ gameMode, modeConfig })).toBe(expected);
  });
});

describe('teamBoardBand', () => {
  it('gives the game alone, and the format with the teams and the unit', () => {
    expect(
      teamBoardBand(homeBundle({ game: { gameMode: 'texas_scramble', modeConfig: TEXAS }, players: teams })),
    ).toEqual({ kicker: 'Torsdagsrunden', subtitle: 'Texas scramble · 3 lag à 2 · netto' });
  });

  it('leaves out the size when the teams differ, and says points or gross', () => {
    const uneven = [...teams, homePlayer({ userId: 'nina', name: 'Nina Lund', teamNumber: 3 })];
    expect(
      teamBoardBand(
        homeBundle({
          game: { gameMode: 'stableford', modeConfig: { kind: 'stableford', team_size: 2, points_table: 'standard' } },
          players: uneven,
        }),
      ).subtitle,
    ).toBe('Stableford · 3 lag · poeng');
    expect(
      teamBoardBand(
        homeBundle({
          game: {
            gameMode: 'shamble',
            modeConfig: { kind: 'shamble', team_size: 3, shamble_variant: 'champagne', shamble_count: 1, shamble_scoring: 'gross' },
          },
          players: teams,
        }),
      ).subtitle,
    ).toBe('Shamble / Champagne Scramble · 3 lag à 2 · brutto');
  });
});

describe('teamBoardFor — live scramble', () => {
  // Lag 2 leder på 16. Laget ditt tok birdie på hull 5 (19) og gikk forbi
  // Lag 3, som har fire hull (21).
  const scores = [
    ...teamScores([ME, 'marte'], [4, 4, 4, 4, 3]),
    ...teamScores(['jonas', 'kari'], [3, 3, 3, 3, 4]),
    ...teamScores(['ola', 'per'], [4, 4, 5, 8]),
  ];
  const bundle = homeBundle({ game: { gameMode: 'texas_scramble', modeConfig: TEXAS }, players: teams });
  const model = teamBoardFor({ bundle, scores, userId: ME })!;

  it('names you first, then the rest of the team by name', () => {
    const named = teamBoardFor({
      bundle: homeBundle({
        game: { gameMode: 'texas_scramble', modeConfig: TEXAS },
        players: [
          homePlayer({ userId: 'zz', name: 'Anders Moe', teamNumber: 1 }),
          homePlayer({ userId: ME, name: 'Sigrid Aas', teamNumber: 1 }),
          homePlayer({ userId: 'aa', name: 'Marte Lie', teamNumber: 1 }),
          ...teams.slice(2),
        ],
      }),
      scores: [...teamScores(['aa'], [4, 4, 4, 4, 3]), ...scores.filter((s) => s.userId !== ME && s.userId !== 'marte')],
      userId: ME,
    })!;
    const mine = named.rows.find((r) => r.you)!;
    expect([mine.members, mine.initials]).toEqual(['Deg, Anders og Marte', ['SA', 'AM', 'ML']]);
  });

  it('reads the cards: place, leader with initials, your team with the names line', () => {
    expect(model).toMatchObject({ variant: 'live', pill: { text: 'Live · etter 5 hull', live: true }, viewerTeam: 1 });
    expect(
      model.rows.map((r) => [r.teamNumber, r.name, r.place, r.leader, r.you, r.members, r.initials, r.total, r.under]),
    ).toEqual([
      [2, 'Lag 2', '1', true, false, 'Jonas og Kari', ['JB', 'KN'], '16', 'netto'],
      [1, 'Lag 1', '2', false, true, 'Deg og Marte', ['SA', 'ML'], '19', 'netto'],
      [3, 'Lag 3', '3', false, false, 'Ola og Per', ['OD', 'PH'], '21', 'hull 4'],
    ]);
  });

  it('gives dots, «hull N» and the movement to the leader and your team only', () => {
    expect(model.rows.map((r) => [r.dots, r.holesNote, r.movement])).toEqual([
      [['under', 'under', 'under', 'under', 'par'], 'hull 5', 0],
      [['par', 'par', 'par', 'par', 'under'], 'hull 5', 1],
      [null, null, null],
    ]);
  });

  it('reads a card aloud as one line, with the team’s names', () => {
    expect(model.rows[1].a11y).toBe(
      'Lag 1. Deg og Marte. 2. plass. 19 slag netto. Opp 1 plass siden forrige hull. Siste hull: par, par, par, par, under par. 5 hull spilt. Dette er laget ditt',
    );
  });

  it('says what your team did on its last hole, in strokes and the word for them', () => {
    expect(model.holeCard).toEqual({ heading: 'Ditt lag på hull 5', lead: null, score: '3 slag, birdie' });
    expect(model.halves).toBeNull();
    expect(model.lock).toBeNull();
  });

  it('#2580: names whose tee shot the team used on that hole, «deg» for your own', () => {
    const withSetting = homeBundle({
      game: { gameMode: 'texas_scramble', modeConfig: { ...TEXAS, min_tee_shots: 3 } },
      players: teams,
    });
    const pick = (teeShotBy: string) => [{ teamNumber: 1, holeNumber: 5, teeShotBy }];
    expect(teamBoardFor({ bundle: withSetting, scores, userId: ME, teeShots: pick('marte') })!.holeCard).toEqual({
      heading: 'Ditt lag på hull 5',
      lead: { before: 'Utslaget til ', names: 'Marte', after: ' ble brukt' },
      score: '3 slag, birdie',
    });
    expect(teamBoardFor({ bundle: withSetting, scores, userId: ME, teeShots: pick(ME) })!.holeCard?.lead?.names).toBe(
      'deg',
    );
    // Uten valg på hullet, eller uten innstillingen, står bare scoren.
    expect(teamBoardFor({ bundle: withSetting, scores, userId: ME, teeShots: [] })!.holeCard?.lead).toBeNull();
    expect(teamBoardFor({ bundle, scores, userId: ME, teeShots: pick('marte') })!.holeCard?.lead).toBeNull();
  });

  it('gives the strip the place, the gap in strokes to the leading team, and the next hole', () => {
    expect(model.strip).toEqual({
      kicker: 'Laget ditt',
      place: '2. plass',
      detail: '3 slag bak Lag 2',
      action: { kind: 'hole', holeNumber: 6, label: 'Hull 6 →' },
    });
  });

  it('gives your team no dots before its first hole, only «hull 0» under the sum', () => {
    const fresh = teamBoardFor({ bundle, scores: scores.filter((s) => s.userId !== ME && s.userId !== 'marte'), userId: ME })!;
    const mine = fresh.rows.find((r) => r.you)!;
    expect([mine.dots, mine.holesNote, mine.movement, mine.under, mine.total]).toEqual([null, null, null, 'hull 0', '—']);
  });

  it('has no hole card or strip for a viewer without a team', () => {
    const outside = teamBoardFor({ bundle, scores, userId: 'organiser' })!;
    expect([outside.viewerTeam, outside.holeCard, outside.strip]).toEqual([null, null, null]);
  });
});

describe('teamBoardFor — a scramble ranked on net to par (#2625)', () => {
  // Issuets eksempel: laget ditt −5 etter 3 hull, Lag 2 −7 etter 6. Lag 3
  // har spilt ett hull på par. Rekkefølgen og tallet er mot par.
  const FLAGGED = { ...TEXAS, ranking: 'net_to_par' };
  const bundle = homeBundle({ game: { gameMode: 'texas_scramble', modeConfig: FLAGGED }, players: teams });
  const scores = [
    ...teamScores([ME, 'marte'], [2, 2, 3]),
    ...teamScores(['jonas', 'kari'], [3, 3, 3, 3, 3, 2]),
    ...teamScores(['ola', 'per'], [4]),
  ];
  const model = teamBoardFor({ bundle, scores, userId: ME })!;

  it('the band says «mot par»', () => {
    expect(teamBoardBand(bundle).subtitle).toBe('Texas scramble · 3 lag à 2 · mot par');
  });

  it('ranks on to par and shows it, with «mot par» under the marked cards', () => {
    expect(model.rows.map((r) => [r.teamNumber, r.place, r.total, r.under])).toEqual([
      [2, '1', '\u22127', 'mot par'],
      [1, '2', '\u22125', 'mot par'],
      [3, '3', 'E', 'hull 1'],
    ]);
  });

  it('reads the number aloud as to par, and the strip gives the gap across holes', () => {
    expect(model.rows[1].a11y).toContain('5 under par');
    expect(model.strip?.detail).toBe('2 slag bak Lag 2');
  });
});

describe('teamBoardFor — team stableford ranked on points against par pace (#2625)', () => {
  // Laget ditt +5 etter 3 hull (4, 4, 3 poeng = 11), Lag 2 +1 etter 6 (13
  // poeng), Lag 3 har spilt ett hull på par. Makkeren tar ett slag mer og
  // teller aldri.
  const FLAGGED = { kind: 'stableford', team_size: 2, points_table: 'standard', ranking: 'net_to_par' };
  const bundle = homeBundle({ game: { gameMode: 'stableford', modeConfig: FLAGGED }, players: teams });
  const scores = [
    ...teamScores([ME], [2, 2, 3]),
    ...teamScores(['marte'], [3, 3, 4]),
    ...teamScores(['jonas'], [3, 4, 4, 4, 4, 4]),
    ...teamScores(['kari'], [4, 5, 5, 5, 5, 5]),
    ...teamScores(['ola', 'per'], [4]),
  ];
  const model = teamBoardFor({ bundle, scores, userId: ME })!;

  it('the band says «mot par»', () => {
    expect(teamBoardBand(bundle).subtitle).toBe('Stableford · 3 lag à 2 · mot par');
  });

  it('ranks on points against par pace and shows it with «+»', () => {
    expect(model.rows.map((r) => [r.teamNumber, r.place, r.total])).toEqual([
      [1, '1', '+5'],
      [2, '2', '+1'],
      [3, '3', 'E'],
    ]);
    expect(model.rows[0].under).toBe('mot par');
  });

  it('reads the number aloud in points, and the strip gives the gap in points across holes', () => {
    expect(model.rows[0].a11y).toContain('5 poeng over par');
    const second = teamBoardFor({ bundle, scores, userId: 'jonas' })!;
    expect(second.strip?.detail).toBe('4 poeng bak Lag 1');
  });
});

describe('teamBoardFor — best ball, first half', () => {
  // Lag 2 har spilt de ni første (27). Laget ditt har åtte: par på 1–7, og på
  // hull 8 talte Marte sin ball, én over. Slagene på 10–12 skal ikke synes.
  const bestBall = [
    homePlayer({ userId: ME, name: 'Sigrid Aas', teamNumber: 1 }),
    homePlayer({ userId: 'marte', name: 'Marte Lie', teamNumber: 1 }),
    ...teams.slice(2),
  ];
  const scores = [
    ...teamScores([ME], [4, 4, 4, 4, 4, 4, 4, 6]),
    ...teamScores(['marte'], [4, 4, 4, 4, 4, 4, 4, 5]),
    ...teamScores(['jonas'], Array(9).fill(4)),
    ...teamScores(['kari'], Array(9).fill(3)),
    ...teamScores(['ola', 'per'], Array(9).fill(4)),
    ...teamScores(['jonas', 'kari', ME, 'marte'], [2, 2, 2], 10),
  ];
  const model = teamBoardFor({
    bundle: homeBundle({ game: { gameMode: 'best_ball', modeConfig: BEST_BALL }, players: bestBall }),
    scores,
    userId: ME,
  })!;

  it('shows holes 1–9 on every card, and never a hole after 9', () => {
    expect(model).toMatchObject({
      variant: 'first-half',
      pill: { text: 'Live · etter 9 hull', live: true },
      halves: { shown: 'HULL 1–9', hidden: 'Hull 10–18 er skjult' },
      lock: { heading: 'Vi sees ved hull 18', sub: 'Hull 10–18 vises når arrangøren avslutter spillet.' },
    });
    expect(model.rows.map((r) => [r.teamNumber, r.place, r.total, r.under, r.dots?.length, r.holesNote])).toEqual([
      [2, '1', '27', '9 av 9', 9, null],
      [1, '2', '33', '8 av 9', 9, null],
      [3, '3', '36', '9 av 9', 9, null],
    ]);
    expect(model.rows[1].dots).toEqual(['par', 'par', 'par', 'par', 'par', 'par', 'par', 'over1', 'unset']);
  });

  it('names whose ball counted on your team’s last hole of the first half', () => {
    expect(model.holeCard).toEqual({
      heading: 'Ditt lag på hull 8',
      lead: { before: 'Ballen til ', names: 'Marte', after: ' talte' },
      score: 'netto 5, bogey',
    });
  });

  it('says «deg» in the middle of the sentence when your own ball counted', () => {
    const card = (me8: number, marte8: number) =>
      teamBoardFor({
        bundle: homeBundle({ game: { gameMode: 'best_ball', modeConfig: BEST_BALL }, players: bestBall }),
        scores: [
          ...scores.filter((s) => !((s.userId === ME || s.userId === 'marte') && s.holeNumber === 8)),
          ...holeScores('g-live', ME, 8, me8, 8),
          ...holeScores('g-live', 'marte', 8, marte8, 8),
        ],
        userId: ME,
      })!.holeCard?.lead?.names;
    expect(card(4, 5)).toBe('deg');
    expect(card(4, 4)).toBe('deg og Marte');
  });

  it('gives the strip the holes played of nine', () => {
    expect(model.strip).toMatchObject({ place: '2. plass', detail: '8 av 9 hull', action: { kind: 'hole', holeNumber: 9 } });
  });
});

describe('teamBoardFor — finished scramble', () => {
  // Lag-hcp 50 %: 7, 8 og 6. Lag 2 vinner på 64. Lag 3 og laget ditt har 70
  // netto hver; Lag 3 spilte siste ni best.
  const handicaps = { [ME]: 10, marte: 4, jonas: 8, kari: 8, ola: 6, per: 6 };
  const players = teams.map((p) => ({ ...p, courseHandicap: handicaps[p.userId as keyof typeof handicaps] }));
  const scores = [
    ...teamScores([ME, 'marte'], [...Array(9).fill(4), 5, 5, 5, 5, 5, 4, 4, 4, 4]),
    ...teamScores(['jonas', 'kari'], Array(18).fill(4)),
    ...teamScores(['ola', 'per'], [5, 5, 5, 5, 4, 4, 4, 4, 4, ...Array(9).fill(4)]),
  ];
  const model = teamBoardFor({
    bundle: homeBundle({
      game: { gameMode: 'texas_scramble', status: 'finished', modeConfig: { ...TEXAS, team_handicap_pct: 50 } },
      players,
    }),
    scores,
    userId: ME,
  })!;

  it('crowns the winning team, gives the team handicap under the sum, and the tie note', () => {
    expect(model).toMatchObject({ variant: 'finished', pill: { text: 'Sluttresultat · 18 hull', live: false } });
    expect(model.rows.map((r) => [r.teamNumber, r.place, r.leader, r.total, r.under, r.note, r.dots])).toEqual([
      [2, '1', true, '64', 'netto · lag-hcp 8', null, null],
      [3, '2', false, '70', 'netto · lag-hcp 6', null, null],
      [1, '3', false, '70', 'netto · lag-hcp 7', 'Likt med Lag 3 · avgjort på siste ni', null],
    ]);
    expect(model.holeCard).toBeNull();
  });

  it('adds the holes to every card when a team did not play them all (#1982)', () => {
    const short = teamBoardFor({
      bundle: homeBundle({
        game: { gameMode: 'texas_scramble', status: 'finished', modeConfig: { ...TEXAS, team_handicap_pct: 50 } },
        players,
      }),
      scores: scores.filter((s) => !(s.userId === 'ola' || s.userId === 'per') || s.holeNumber <= 16),
      userId: ME,
    })!;
    expect(short.rows.find((r) => r.teamNumber === 3)?.under).toBe('netto · lag-hcp 6 · hull 16');
    expect(short.rows.find((r) => r.teamNumber === 2)?.under).toBe('netto · lag-hcp 8 · hull 18');
  });

  it('#2580: counts your team’s tee shots, most first, with the one under the minimum marked', () => {
    const withSetting = homeBundle({
      game: {
        gameMode: 'texas_scramble',
        status: 'finished',
        modeConfig: { ...TEXAS, team_handicap_pct: 50, min_tee_shots: 3 },
      },
      players,
    });
    const picks = (owners: string[]) => owners.map((teeShotBy, i) => ({ teamNumber: 1, holeNumber: i + 1, teeShotBy }));
    const short = teamBoardFor({
      bundle: withSetting,
      scores,
      userId: ME,
      teeShots: picks([...Array<string>(16).fill('marte'), ME, ME]),
    })!;
    expect(short.teeShotCard).toEqual({
      heading: 'Utslag som ble brukt · ditt lag',
      minimum: 'minst 3 hver',
      players: [
        { userId: 'marte', count: 16, name: 'Marte', short: null, a11y: 'Marte, har 16 utslag' },
        { userId: ME, count: 2, name: 'Deg', short: 'minst 3', a11y: 'Deg, 2 av 3 utslag' },
      ],
    });
    // Likt antall: navnelinjas rekkefølge, deg først.
    const tied = teamBoardFor({
      bundle: withSetting,
      scores,
      userId: ME,
      teeShots: picks([...Array<string>(9).fill('marte'), ...Array<string>(9).fill(ME)]),
    })!;
    expect(tied.teeShotCard?.players.map((p) => p.name)).toEqual(['Deg', 'Marte']);
    // Uten radene, eller uten innstillingen: ingen kort.
    expect(teamBoardFor({ bundle: withSetting, scores, userId: ME })!.teeShotCard).toBeNull();
    expect(model.teeShotCard).toBeNull();
  });

  it('gives the long gap and the scorecard', () => {
    expect(model.strip).toEqual({
      kicker: 'Laget ditt',
      place: '3. plass',
      detail: '6 slag bak Lag 2',
      action: { kind: 'scorecard', label: 'Scorekortet →' },
    });
  });
});

describe('teamBoardFor — modified stableford reads its own table', () => {
  it('a birdie is 2 points there, and the dot says under', () => {
    // Par 4: my 3 is a birdie (2 points in the modified table), Marte's 5 a
    // bogey (−1). The team gets 2 on hole 1 and 0 (my par) on hole 2.
    const model = teamBoardFor({
      bundle: homeBundle({
        game: {
          gameMode: 'modified_stableford',
          modeConfig: { kind: 'modified_stableford', team_size: 2, points_table: 'modified' },
        },
        players: teams,
      }),
      scores: [...teamScores([ME], [3, 4]), ...teamScores(['marte'], [5, 5]), ...teamScores(['jonas', 'kari', 'ola', 'per'], [5, 5])],
      userId: ME,
    })!;
    expect(model.rows.find((r) => r.you)?.dots).toEqual(['under', 'par']);
  });
});

describe('teamBoardFor — units without a team handicap', () => {
  it('says «poeng» for team stableford and «brutto» for gross shamble', () => {
    const scores = teamScores(teams.map((p) => p.userId), [4, 4]);
    const stableford = teamBoardFor({
      bundle: homeBundle({
        game: { status: 'finished', modeConfig: { kind: 'stableford', team_size: 2, points_table: 'standard' } },
        players: teams,
      }),
      scores,
      userId: ME,
    })!;
    expect(stableford.rows[0].under).toBe('poeng');
    expect(stableford.strip?.detail).toBeNull();
    const shamble = teamBoardFor({
      bundle: homeBundle({
        game: {
          gameMode: 'shamble',
          modeConfig: { kind: 'shamble', team_size: 3, shamble_variant: 'champagne', shamble_count: 1, shamble_scoring: 'gross' },
        },
        players: teams,
      }),
      scores,
      userId: ME,
    })!;
    expect(shamble.rows.find((r) => r.you)?.under).toBe('brutto');
  });
});

describe('teamBoardFor — when the screen shows something else', () => {
  const texas = { gameMode: 'texas_scramble', modeConfig: TEXAS };
  const scores = teamScores([ME, 'marte'], [4, 4, 4]);
  it.each([
    ['no strokes yet', homeBundle({ game: texas, players: teams }), []],
    ['solo stableford', homeBundle({ players: teams }), scores],
    ['a reveal round still hiding net', homeBundle({ game: { ...texas, scoreVisibility: 'reveal' }, players: teams }), scores],
    [
      'best ball before any team has played nine',
      homeBundle({ game: { gameMode: 'best_ball', modeConfig: BEST_BALL }, players: teams }),
      scores,
    ],
  ])('%s → null', (_name, bundle, rows) => {
    expect(teamBoardFor({ bundle, scores: rows, userId: ME })).toBeNull();
  });
});
