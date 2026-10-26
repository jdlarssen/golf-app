import { describe, it, expect } from 'vitest';
import {
  carryPreservedModeConfigKeys,
  editedModeConfig,
  stampNewGameModeConfig,
} from './modeConfigEdit';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * #1677: edit-skjemaet bygger `mode_config` fra bunnen av, så nøkler ingen
 * skjemafelt eier (cup-generatorens `team_strokes_override`) forsvant ved hver
 * lagring. Denne helperen bærer dem over — og bare dem.
 */

const greensome = (
  extra: Record<string, unknown> = {},
): GameModeConfig =>
  ({
    kind: 'greensome_matchplay',
    team_size: 2,
    teams_count: 2,
    allowance_pct: 100,
    ...extra,
  }) as GameModeConfig;

describe('carryPreservedModeConfigKeys', () => {
  it('bærer over en bevart nøkkel når kind er lik og skjemaet mangler den', () => {
    const existing = greensome({ team_strokes_override: { team1: 8, team2: 3 } });

    expect(carryPreservedModeConfigKeys(existing, greensome())).toEqual(
      greensome({ team_strokes_override: { team1: 8, team2: 3 } }),
    );
  });

  it('bærer ingenting over når modusen er byttet (draft kan skifte format)', () => {
    const existing = greensome({ team_strokes_override: { team1: 8, team2: 3 } });
    const next = {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
    } as GameModeConfig;

    expect(carryPreservedModeConfigKeys(existing, next)).toEqual(next);
  });

  it('returnerer next uendret når existing er null eller ikke et objekt', () => {
    const next = greensome();

    expect(carryPreservedModeConfigKeys(null, next)).toEqual(next);
    expect(carryPreservedModeConfigKeys(undefined, next)).toEqual(next);
    expect(carryPreservedModeConfigKeys('greensome_matchplay', next)).toEqual(
      next,
    );
    expect(carryPreservedModeConfigKeys([], next)).toEqual(next);
  });

  it('lar skjemaets verdi vinne når nøkkelen finnes begge steder', () => {
    const existing = greensome({ team_strokes_override: { team1: 8, team2: 3 } });
    const next = greensome({ team_strokes_override: { team1: 1, team2: 2 } });

    expect(carryPreservedModeConfigKeys(existing, next)).toEqual(next);
  });

  it('bærer over fourball-ens withdrawal_play_on (#1814)', () => {
    const fourball = (extra: Record<string, unknown> = {}): GameModeConfig =>
      ({
        kind: 'fourball_matchplay',
        team_size: 2,
        teams_count: 2,
        allowance_pct: 85,
        ...extra,
      }) as GameModeConfig;
    const existing = fourball({ withdrawal_play_on: true });

    const result = carryPreservedModeConfigKeys(existing, fourball()) as Record<
      string,
      unknown
    >;
    expect(result.withdrawal_play_on).toBe(true);
  });

  it('bærer ikke over nøkler utenfor lista (skjemaet eier resten)', () => {
    const existing = greensome({
      allowance_pct: 60,
      kr_per_unit: 50,
      team_strokes_override: { team1: 8, team2: 3 },
    });
    const next = greensome({ allowance_pct: 100 });

    const result = carryPreservedModeConfigKeys(existing, next) as Record<
      string,
      unknown
    >;
    expect(result.kr_per_unit).toBeUndefined();
    expect(result.allowance_pct).toBe(100);
    expect(result.team_strokes_override).toEqual({ team1: 8, team2: 3 });
  });
});

describe('stampNewGameModeConfig (#2253)', () => {
  const strokeplay = { kind: 'solo_strokeplay', team_size: 1 } as GameModeConfig;
  const flagged = {
    kind: 'solo_strokeplay',
    team_size: 1,
    ranking: 'net_to_par',
  } as GameModeConfig;

  it('stamps net-to-par ranking on a new solo strokeplay game', () => {
    expect(stampNewGameModeConfig(strokeplay)).toEqual(flagged);
  });

  it.each<GameModeConfig>([
    { kind: 'skins', team_size: 1, skins_scoring: 'net' },
    greensome({ team_strokes_override: { team1: 8, team2: 3 } }),
  ])('leaves every other format unchanged ($kind)', (config) => {
    expect(stampNewGameModeConfig(config)).toBe(config);
  });

  it('an edit of a game without the flag does not add it', () => {
    expect(carryPreservedModeConfigKeys(strokeplay, strokeplay)).toEqual(strokeplay);
  });

  it('an edit of a game with the flag keeps it', () => {
    expect(carryPreservedModeConfigKeys(flagged, strokeplay)).toEqual(flagged);
  });

  it('an edit that switches a flagged game to another format drops it', () => {
    const stableford = {
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    } as GameModeConfig;

    expect(carryPreservedModeConfigKeys(flagged, stableford)).toEqual(stableford);
  });
});

describe('stampNewGameModeConfig (#2625)', () => {
  // The team strokeplay formats rank on net to par from #2625 — on new games
  // only, so they are stamped at creation like solo strokeplay.
  it.each<GameModeConfig>([
    { kind: 'best_ball', team_size: 2, teams_count: 2 },
    { kind: 'texas_scramble', team_size: 4, teams_count: 2, team_handicap_pct: 10 },
    { kind: 'ambrose', team_size: 4, teams_count: 2, team_handicap_pct: 12.5 },
    { kind: 'florida_scramble', team_size: 3, teams_count: 2, team_handicap_pct: 15 },
    {
      kind: 'shamble',
      team_size: 4,
      teams_count: 2,
      shamble_variant: 'shamble',
      shamble_count: 2,
      shamble_scoring: 'net',
    },
  ])('stamps net-to-par ranking on a new $kind game', (config) => {
    expect(stampNewGameModeConfig(config)).toEqual({ ...config, ranking: 'net_to_par' });
  });
});

describe('stampNewGameModeConfig (#2625, part 2)', () => {
  // The points formats and Nassau rank on net to par from #2625 part 2 — on
  // new games only, so they are stamped at creation too.
  it.each<GameModeConfig>([
    { kind: 'stableford', team_size: 1, points_table: 'standard' },
    { kind: 'stableford', team_size: 2, points_table: 'standard' },
    { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
    { kind: 'modified_stableford', team_size: 2, points_table: 'modified' },
    { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net' },
    { kind: 'nassau', team_size: 1, nassau_scoring: 'gross' },
  ])('stamps net-to-par ranking on a new $kind game (team size $team_size)', (config) => {
    expect(stampNewGameModeConfig(config)).toEqual({ ...config, ranking: 'net_to_par' });
  });
});

describe('editedModeConfig (#2625)', () => {
  const texas = {
    kind: 'texas_scramble',
    team_size: 4,
    teams_count: 2,
    team_handicap_pct: 10,
  } as GameModeConfig;
  const stableford = { kind: 'stableford', team_size: 1, points_table: 'standard' } as GameModeConfig;

  it('a draft that switches format is still a new game: the new format is stamped', () => {
    expect(editedModeConfig(stableford, texas)).toEqual({ ...texas, ranking: 'net_to_par' });
  });

  it('the same format keeps the rule the game was created with', () => {
    expect(editedModeConfig(texas, texas)).toEqual(texas);
    expect(editedModeConfig({ ...texas, ranking: 'net_to_par' }, texas)).toEqual({
      ...texas,
      ranking: 'net_to_par',
    });
  });

  it('a draft that switches to a points format is stamped too', () => {
    const nassau = { kind: 'nassau', team_size: 1, nassau_scoring: 'net' } as GameModeConfig;
    expect(editedModeConfig(texas, stableford)).toEqual({ ...stableford, ranking: 'net_to_par' });
    expect(editedModeConfig(texas, nassau)).toEqual({ ...nassau, ranking: 'net_to_par' });
  });

  it('a stableford game created without the flag keeps its rule through an edit', () => {
    expect(editedModeConfig(stableford, stableford)).toEqual(stableford);
  });

  it('a stored config that is not an object is passed through as before', () => {
    expect(editedModeConfig(null, texas)).toBe(texas);
  });
});

describe('stampNewGameModeConfig (#2314)', () => {
  // A new wolf game goes by the catch-up rule for the last holes; a game
  // created before #2314 keeps the rule it was played under.
  const wolf = { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' } as GameModeConfig;
  const flaggedWolf = { ...wolf, wolf_rotation: 'catch_up' } as GameModeConfig;

  it('stamps the catch-up rule on a new wolf game', () => {
    expect(stampNewGameModeConfig(wolf)).toEqual(flaggedWolf);
  });

  it('an edit of a wolf game without the flag does not add it', () => {
    expect(editedModeConfig(wolf, wolf)).toEqual(wolf);
    expect(editedModeConfig(wolf, wolf)).not.toHaveProperty('wolf_rotation');
  });

  it('an edit of a wolf game with the flag keeps it', () => {
    expect(editedModeConfig(flaggedWolf, wolf)).toEqual(flaggedWolf);
  });

  it('a draft that switches to wolf is stamped as the new game it is', () => {
    const stableford = { kind: 'stableford', team_size: 1, points_table: 'standard' } as GameModeConfig;
    expect(editedModeConfig(stableford, wolf)).toEqual(flaggedWolf);
  });

  it('a draft that switches away from wolf drops the flag', () => {
    const skins = { kind: 'skins', team_size: 1, skins_scoring: 'net' } as GameModeConfig;
    expect(carryPreservedModeConfigKeys(flaggedWolf, skins)).toEqual(skins);
  });
});
