// Native N4 (#1828): adapteren fra appens data til den delte motoren.
//
// Det som må holde er kartleggingen, ikke matematikken — den er dekket av
// 1176 tester i `lib/scoring`. Her låses de fire tingene appen kan gjøre feil:
// hvilke spillere som er med, hvilket par som følger hvilket kjønn, at slag
// blir til gross, og at et spill vi ikke kan regne på svarer «nei» i stedet
// for å kaste.
import type { LocalScore } from '../data/db';
import type { BundlePlayer, GameBundle } from '../data/gameBundle';
import { buildScoringContext, computeGameLeaderboard } from './scoringContext';

const GAME = 'game-1';

function player(overrides: Partial<BundlePlayer> = {}): BundlePlayer {
  return {
    userId: 'user-a',
    name: 'Spiller A',
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 12,
    teeGender: 'mens',
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    ...overrides,
  };
}

function bundle(overrides: Partial<GameBundle> = {}): GameBundle {
  return {
    game: {
      id: GAME,
      name: 'Testrunden',
      status: 'active',
      gameMode: 'stableford',
      modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      courseId: 'course-1',
      teeBoxId: 'tee-1',
      requirePeerApproval: false,
      scheduledTeeOffAt: null,
      holeSegment: 'full',
      sourceGameId: null,
      createdBy: 'user-a',
      scoreVisibility: 'live',
      tournamentId: null,
      foursomesSide1TeeStarterUserId: null,
      foursomesSide2TeeStarterUserId: null,
      ...overrides.game,
    },
    players: overrides.players ?? [player()],
    courseName: 'Testbanen',
    teeBoxName: 'Gul',
    holes:
      overrides.holes ??
      Array.from({ length: 18 }, (_, i) => ({
        holeNumber: i + 1,
        parMens: 4,
        parLadies: 5,
        parJuniors: 3,
        strokeIndex: i + 1,
      })),
    fetchedAt: '2026-08-30T10:00:00.000Z',
  };
}

function score(overrides: Partial<LocalScore> = {}): LocalScore {
  return {
    id: `${GAME}:user-a:1`,
    gameId: GAME,
    userId: 'user-a',
    holeNumber: 1,
    strokes: 5,
    putts: 2,
    enteredBy: 'user-a',
    clientUpdatedAt: '2026-08-30T10:00:00.000Z',
    serverUpdatedAt: null,
    ...overrides,
  };
}

function unwrap(outcome: ReturnType<typeof buildScoringContext>) {
  if (!outcome.ok) throw new Error(`forventet kontekst, fikk ${outcome.problem}`);
  return outcome.ctx;
}

describe('buildScoringContext', () => {
  it('tar med spillerens frosne banehandicap, lag og tee-kjønn', () => {
    const ctx = unwrap(
      buildScoringContext(
        bundle({
          game: { ...bundle().game, gameMode: 'best_ball', modeConfig: { kind: 'best_ball', team_size: 2, teams_count: 2 } },
          players: [
            player({ userId: 'a', teamNumber: 1, flightNumber: 2, courseHandicap: 7 }),
            player({ userId: 'b', teamNumber: 2, courseHandicap: null, teeGender: 'ladies' }),
          ],
        }),
        [],
      ),
    );

    expect(ctx.players).toEqual([
      { userId: 'a', teamNumber: 1, flightNumber: null, courseHandicap: 7, teeGender: 'mens' },
      // Banehandicap null = spilleren har ikke fått et frosset tall ennå.
      // Motoren regner med 0, den gjetter aldri.
      { userId: 'b', teamNumber: 2, flightNumber: null, courseHandicap: 0, teeGender: 'ladies' },
    ]);
  });

  it('sender par per kjønn videre — én rad per hull, tre par-verdier', () => {
    const ctx = unwrap(
      buildScoringContext(
        bundle({
          holes: [{ holeNumber: 3, parMens: 4, parLadies: 5, parJuniors: 3, strokeIndex: 11 }],
        }),
        [],
      ),
    );

    expect(ctx.holes).toEqual([
      {
        number: 3,
        // `par` er herre-par som fallback, akkurat som på web; motoren velger
        // riktig variant per spiller via `parByGender`.
        par: 4,
        parByGender: { mens: 4, ladies: 5, juniors: 3 },
        strokeIndex: 11,
      },
    ]);
  });

  it('gjør slag om til gross og tar med ALLE spillets rader, ikke bare mine', () => {
    const ctx = unwrap(
      buildScoringContext(
        bundle({ players: [player({ userId: 'a' }), player({ userId: 'b' })] }),
        [
          score({ userId: 'a', holeNumber: 1, strokes: 5 }),
          score({ userId: 'b', holeNumber: 1, strokes: 4, putts: 1 }),
          // Et påbegynt hull uten slag: motoren skal se null, ikke 0.
          score({ userId: 'a', holeNumber: 2, strokes: null }),
        ],
      ),
    );

    expect(ctx.scores).toEqual([
      { userId: 'a', holeNumber: 1, gross: 5 },
      { userId: 'b', holeNumber: 1, gross: 4 },
      { userId: 'a', holeNumber: 2, gross: null },
    ]);
  });

  it('holder trukne spillere ute — og slagene deres med', () => {
    const ctx = unwrap(
      buildScoringContext(
        bundle({
          players: [
            player({ userId: 'a' }),
            player({ userId: 'wd', withdrawnAt: '2026-08-30T09:00:00.000Z' }),
          ],
        }),
        [
          score({ userId: 'a', holeNumber: 1, strokes: 5 }),
          score({ userId: 'wd', holeNumber: 1, strokes: 3 }),
        ],
      ),
    );

    expect(ctx.players.map((p) => p.userId)).toEqual(['a']);
    // Uten dette ville en trukket spiller med tre gode hull fortsatt kunnet
    // vinne et skins-hull eller flytte et lag-best.
    expect(ctx.scores.map((s) => s.userId)).toEqual(['a']);
  });

  it('gir en tom score-liste for et spill ingen har begynt på', () => {
    const ctx = unwrap(buildScoringContext(bundle(), []));
    expect(ctx.scores).toEqual([]);
    expect(ctx.players).toHaveLength(1);
  });

  it('lar de delte hjelperne eie lag-regelen per format', () => {
    const solo = unwrap(
      buildScoringContext(bundle({ players: [player({ teamNumber: 3 })] }), []),
    );
    // Solo-stableford: laget skal IKKE følge med, ellers narrower motoren feil.
    expect(solo.players[0]!.teamNumber).toBeNull();

    const rotation = unwrap(
      buildScoringContext(
        bundle({
          game: {
            ...bundle().game,
            gameMode: 'round_robin',
            modeConfig: {
              kind: 'round_robin',
              team_size: 1,
              teams_count: 4,
              allowance_pct: 85,
            },
          },
          players: [player({ teamNumber: 3 })],
        }),
        [],
      ),
    );
    // Round robin bruker samme kolonne som rotasjons-slot — den MÅ følge med.
    expect(rotation.players[0]!.teamNumber).toBe(3);
  });

  it.each<[string, Partial<GameBundle>, string]>([
    [
      'et format denne app-versjonen ikke kjenner',
      { game: { ...bundle().game, gameMode: 'kølleskrekk' } },
      'unknown-mode',
    ],
    [
      'mode_config mangler helt',
      { game: { ...bundle().game, modeConfig: null } },
      'missing-config',
    ],
    [
      'mode_config peker på et annet format enn game_mode',
      { game: { ...bundle().game, modeConfig: { kind: 'skins', team_size: 1, skins_scoring: 'net' } } },
      'missing-config',
    ],
    [
      'wolf — per-hull-valgene henter appen ikke',
      {
        game: {
          ...bundle().game,
          gameMode: 'wolf',
          modeConfig: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' },
        },
      },
      'needs-choices',
    ],
    ['banen er ikke satt ennå', { holes: [] }, 'no-course'],
    [
      'alle spillerne er trukket',
      { players: [player({ withdrawnAt: '2026-08-30T09:00:00.000Z' })] },
      'no-players',
    ],
  ])('svarer nei uten å kaste: %s', (_label, overrides, problem) => {
    const outcome = buildScoringContext(bundle(overrides), []);
    expect(outcome).toEqual({ ok: false, problem });
  });
});

describe('computeGameLeaderboard', () => {
  it('kjører den delte motoren og gir resultatet med riktig kind', () => {
    const outcome = computeGameLeaderboard(
      bundle({
        players: [
          player({ userId: 'a', courseHandicap: 0 }),
          player({ userId: 'b', courseHandicap: 0 }),
        ],
      }),
      [
        // Par-4 med CH 0: 4 slag = 2 stablefordpoeng, 6 slag = 0.
        score({ userId: 'a', holeNumber: 1, strokes: 4 }),
        score({ userId: 'b', holeNumber: 1, strokes: 6 }),
      ],
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe('stableford');
    if (outcome.result.kind !== 'stableford' || outcome.result.variant !== 'solo') return;
    expect(outcome.result.players.map((p) => [p.userId, p.totalPoints, p.rank])).toEqual([
      ['a', 2, 1],
      ['b', 0, 2],
    ]);
  });

  it('sender problemet videre uten å røre motoren', () => {
    const outcome = computeGameLeaderboard(bundle({ holes: [] }), []);
    expect(outcome).toEqual({ ok: false, problem: 'no-course' });
  });
});
