import { describe, it, expect } from 'vitest';
import {
  buildUniformContext,
  type UniformContextHoleRow,
  type UniformContextPlayerRow,
  type UniformContextScoreRow,
} from './buildUniformContext';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

// #1831 — Type A-lås på den uniforme context-byggingen for lag-/side-formatene
// uten dedikert builder (best ball, matchplay-familien, scramble-familien,
// shamble, patsome). Fila ble flyttet ut av `buildModeResultForGame.ts`
// (server-only) så native-appen kan dele DEN samme mappingen i stedet for en
// kopi; testene her låser mappingen og de to filtrene, ikke selve golf-matten.

const BEST_BALL_CONFIG: GameModeConfig = {
  kind: 'best_ball',
  team_size: 2,
  teams_count: 2,
};

function player(
  overrides: Partial<UniformContextPlayerRow> & { user_id: string },
): UniformContextPlayerRow {
  return {
    team_number: 1,
    course_handicap: 10,
    tee_gender: 'mens',
    withdrawn_at: null,
    users: { name: 'Spiller', nickname: null },
    ...overrides,
  };
}

const HOLES: UniformContextHoleRow[] = [
  {
    hole_number: 1,
    par_mens: 4,
    par_ladies: 5,
    par_juniors: 3,
    stroke_index: 7,
  },
  {
    hole_number: 2,
    par_mens: 3,
    par_ladies: 4,
    par_juniors: 3,
    stroke_index: 15,
  },
];

function build(opts: {
  players: UniformContextPlayerRow[];
  scoresRows?: UniformContextScoreRow[];
  holesRows?: UniformContextHoleRow[];
  gameMode?: GameMode;
  modeConfig?: GameModeConfig;
}) {
  return buildUniformContext({
    gameId: 'game-1',
    gameMode: opts.gameMode ?? 'best_ball',
    modeConfig: opts.modeConfig ?? BEST_BALL_CONFIG,
    players: opts.players,
    holesRows: opts.holesRows ?? HOLES,
    scoresRows: opts.scoresRows ?? [],
  });
}

describe('buildUniformContext — game-feltene', () => {
  it('sender gameId, gameMode og modeConfig gjennom uendret', () => {
    const ctx = build({ players: [player({ user_id: 'a' })] });

    expect(ctx.game).toStrictEqual({
      id: 'game-1',
      game_mode: 'best_ball',
      mode_config: BEST_BALL_CONFIG,
    });
  });

  // Alle 12 modiene deler denne byggingen — ingen av dem skal se en annen
  // game_mode/mode_config enn den kalleren sendte inn.
  const MODE_CASES: Array<[GameMode, GameModeConfig]> = [
    ['best_ball', BEST_BALL_CONFIG],
    ['singles_matchplay', { kind: 'singles_matchplay', team_size: 1, teams_count: 2 }],
    [
      'fourball_matchplay',
      { kind: 'fourball_matchplay', team_size: 2, teams_count: 2, allowance_pct: 85 },
    ],
    [
      'foursomes_matchplay',
      { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 },
    ],
    [
      'greensome_matchplay',
      { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 },
    ],
    [
      'chapman_matchplay',
      { kind: 'chapman_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 },
    ],
    [
      'gruesome_matchplay',
      { kind: 'gruesome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 },
    ],
    [
      'texas_scramble',
      { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 },
    ],
    ['ambrose', { kind: 'ambrose', team_size: 2, teams_count: 2, team_handicap_pct: 25 }],
    [
      'florida_scramble',
      { kind: 'florida_scramble', team_size: 4, teams_count: 2, team_handicap_pct: 10 },
    ],
    [
      'shamble',
      {
        kind: 'shamble',
        team_size: 4,
        teams_count: 2,
        shamble_variant: 'shamble',
        shamble_count: 2,
        shamble_scoring: 'net',
      },
    ],
    [
      'patsome',
      { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net' },
    ],
  ];

  it.each(MODE_CASES)('beholder %s uendret i game-feltet', (gameMode, modeConfig) => {
    const ctx = build({
      players: [player({ user_id: 'a' })],
      gameMode,
      modeConfig,
    });

    expect(ctx.game.game_mode).toBe(gameMode);
    expect(ctx.game.mode_config).toStrictEqual(modeConfig);
  });
});

describe('buildUniformContext — spiller-mapping', () => {
  it('mapper rå rad til ScoringPlayer med team_number verbatim og flightNumber null', () => {
    const ctx = build({
      players: [
        player({
          user_id: 'a',
          team_number: 2,
          course_handicap: 18,
          tee_gender: 'ladies',
        }),
      ],
    });

    expect(ctx.players).toStrictEqual([
      {
        userId: 'a',
        teamNumber: 2,
        flightNumber: null,
        courseHandicap: 18,
        teeGender: 'ladies',
      },
    ]);
  });

  it('kollapser course_handicap null til 0', () => {
    const ctx = build({
      players: [player({ user_id: 'a', course_handicap: null })],
    });

    expect(ctx.players[0].courseHandicap).toBe(0);
  });

  it.each([
    ['mens' as const],
    ['ladies' as const],
    ['juniors' as const],
  ])('sender tee_gender %s gjennom for per-kjønn-par', (teeGender) => {
    const ctx = build({ players: [player({ user_id: 'a', tee_gender: teeGender })] });

    expect(ctx.players[0].teeGender).toBe(teeGender);
  });

  it('bevarer rekkefølgen på spillerne', () => {
    const ctx = build({
      players: [
        player({ user_id: 'c', team_number: 2 }),
        player({ user_id: 'a', team_number: 1 }),
        player({ user_id: 'b', team_number: 2 }),
      ],
    });

    expect(ctx.players.map((p) => p.userId)).toStrictEqual(['c', 'a', 'b']);
  });
});

describe('buildUniformContext — hull-mapping', () => {
  it('mapper hull med par_mens som par og full parByGender', () => {
    const ctx = build({ players: [player({ user_id: 'a' })] });

    expect(ctx.holes).toStrictEqual([
      {
        number: 1,
        par: 4,
        parByGender: { mens: 4, ladies: 5, juniors: 3 },
        strokeIndex: 7,
      },
      {
        number: 2,
        par: 3,
        parByGender: { mens: 3, ladies: 4, juniors: 3 },
        strokeIndex: 15,
      },
    ]);
  });

  it('gir tom hull-liste når ingen hull er sendt inn', () => {
    const ctx = build({ players: [player({ user_id: 'a' })], holesRows: [] });

    expect(ctx.holes).toStrictEqual([]);
  });
});

describe('buildUniformContext — score-mapping', () => {
  it('mapper strokes til gross og beholder null (uspilt hull)', () => {
    const ctx = build({
      players: [player({ user_id: 'a' })],
      scoresRows: [
        { user_id: 'a', hole_number: 1, strokes: 5 },
        { user_id: 'a', hole_number: 2, strokes: null },
      ],
    });

    expect(ctx.scores).toStrictEqual([
      { userId: 'a', holeNumber: 1, gross: 5 },
      { userId: 'a', holeNumber: 2, gross: null },
    ]);
  });
});

describe('buildUniformContext — WD- og users-null-filtrering', () => {
  it('utelater trukne spillere fra players', () => {
    const ctx = build({
      players: [
        player({ user_id: 'a' }),
        player({ user_id: 'wd', withdrawn_at: '2026-08-30T10:00:00Z' }),
      ],
    });

    expect(ctx.players.map((p) => p.userId)).toStrictEqual(['a']);
  });

  it('utelater scorene til trukne spillere', () => {
    const ctx = build({
      players: [
        player({ user_id: 'a' }),
        player({ user_id: 'wd', withdrawn_at: '2026-08-30T10:00:00Z' }),
      ],
      scoresRows: [
        { user_id: 'a', hole_number: 1, strokes: 4 },
        { user_id: 'wd', hole_number: 1, strokes: 6 },
        { user_id: 'wd', hole_number: 2, strokes: 3 },
      ],
    });

    expect(ctx.scores).toStrictEqual([{ userId: 'a', holeNumber: 1, gross: 4 }]);
  });

  it('utelater spillere uten users-join (slettet bruker)', () => {
    const ctx = build({
      players: [player({ user_id: 'a' }), player({ user_id: 'ghost', users: null })],
    });

    expect(ctx.players.map((p) => p.userId)).toStrictEqual(['a']);
  });

  // Bevisst asymmetri (samme mønster som buildStablefordContext): scores
  // filtreres KUN på trukne spillere. En users-null-rad som ikke er trukket
  // mister spiller-raden, men scorene blir stående — laget den spilte på skal
  // ikke miste hull-bidrag fordi bruker-raden forsvant.
  it('beholder scorene til en users-null-spiller som ikke er trukket', () => {
    const ctx = build({
      players: [player({ user_id: 'a' }), player({ user_id: 'ghost', users: null })],
      scoresRows: [
        { user_id: 'a', hole_number: 1, strokes: 4 },
        { user_id: 'ghost', hole_number: 1, strokes: 5 },
      ],
    });

    expect(ctx.players.map((p) => p.userId)).toStrictEqual(['a']);
    expect(ctx.scores).toStrictEqual([
      { userId: 'a', holeNumber: 1, gross: 4 },
      { userId: 'ghost', holeNumber: 1, gross: 5 },
    ]);
  });

  it('utelater scorene til en spiller som både er trukket og mangler users', () => {
    const ctx = build({
      players: [
        player({ user_id: 'a' }),
        player({ user_id: 'ghost-wd', users: null, withdrawn_at: '2026-08-30T10:00:00Z' }),
      ],
      scoresRows: [
        { user_id: 'a', hole_number: 1, strokes: 4 },
        { user_id: 'ghost-wd', hole_number: 1, strokes: 5 },
      ],
    });

    expect(ctx.players.map((p) => p.userId)).toStrictEqual(['a']);
    expect(ctx.scores).toStrictEqual([{ userId: 'a', holeNumber: 1, gross: 4 }]);
  });

  it('gir tomme spiller- og score-lister når hele feltet er trukket', () => {
    const ctx = build({
      players: [
        player({ user_id: 'a', withdrawn_at: '2026-08-30T10:00:00Z' }),
        player({ user_id: 'b', withdrawn_at: '2026-08-30T11:00:00Z' }),
      ],
      scoresRows: [{ user_id: 'a', hole_number: 1, strokes: 4 }],
    });

    expect(ctx.players).toStrictEqual([]);
    expect(ctx.scores).toStrictEqual([]);
  });
});
