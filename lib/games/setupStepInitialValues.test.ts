import { describe, it, expect } from 'vitest';
import { buildSetupStepInitialValues } from './setupStepInitialValues';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

describe('buildSetupStepInitialValues', () => {
  it('wolf: returnerer wolf_scoring fra config', () => {
    const config = {
      kind: 'wolf',
      team_size: 1,
      teams_count: 4,
      wolf_scoring: 'gross',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      wolf_scoring: 'gross',
    });
  });

  it('wolf: net-variant', () => {
    const config = {
      kind: 'wolf',
      team_size: 1,
      teams_count: 4,
      wolf_scoring: 'net',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      wolf_scoring: 'net',
    });
  });

  it('nassau: returnerer nassau_scoring fra config', () => {
    const config = {
      kind: 'nassau',
      team_size: 1,
      nassau_scoring: 'gross',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      nassau_scoring: 'gross',
    });
  });

  it('skins: returnerer skins_scoring fra config', () => {
    const config = {
      kind: 'skins',
      team_size: 1,
      skins_scoring: 'net',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      skins_scoring: 'net',
    });
  });

  it('nines: returnerer nines_variant og nines_scoring fra config', () => {
    const config = {
      kind: 'nines',
      team_size: 1,
      nines_variant: 'split_sixes',
      nines_scoring: 'gross',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      nines_variant: 'split_sixes',
      nines_scoring: 'gross',
    });
  });

  it('nines: nines-variant med net-scoring', () => {
    const config = {
      kind: 'nines',
      team_size: 1,
      nines_variant: 'nines',
      nines_scoring: 'net',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      nines_variant: 'nines',
      nines_scoring: 'net',
    });
  });

  it('shamble: returnerer team_size, shamble_variant, shamble_count og shamble_scoring', () => {
    const config = {
      kind: 'shamble',
      team_size: 4,
      teams_count: 2,
      shamble_variant: 'champagne',
      shamble_count: 3,
      shamble_scoring: 'gross',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      team_size: 4,
      shamble_variant: 'champagne',
      shamble_count: 3,
      shamble_scoring: 'gross',
    });
  });

  it('shamble: 3-mannslag klassisk shamble', () => {
    const config = {
      kind: 'shamble',
      team_size: 3,
      teams_count: 3,
      shamble_variant: 'shamble',
      shamble_count: 2,
      shamble_scoring: 'net',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      team_size: 3,
      shamble_variant: 'shamble',
      shamble_count: 2,
      shamble_scoring: 'net',
    });
  });

  // #937: kr_per_unit må overleve edit-round-trip for veddemålsformatene.
  it('skins: restaurerer kr_per_unit når satt', () => {
    const config = {
      kind: 'skins',
      team_size: 1,
      skins_scoring: 'net',
      kr_per_unit: 200,
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      skins_scoring: 'net',
      kr_per_unit: 200,
    });
  });

  it('bingo_bango_bongo: restaurerer kr_per_unit (ingen scoring-toggle)', () => {
    const config = {
      kind: 'bingo_bango_bongo',
      team_size: 1,
      kr_per_unit: 100,
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({ kr_per_unit: 100 });
  });

  it('acey_deucey: restaurerer scoring og kr_per_unit (audit 20.11, p11)', () => {
    const config = {
      kind: 'acey_deucey',
      team_size: 1,
      acey_deucey_scoring: 'gross',
      kr_per_unit: 50,
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      acey_deucey_scoring: 'gross',
      kr_per_unit: 50,
    });
  });

  it('best_ball: returnerer tomt objekt (ingen setup-seksjon)', () => {
    const config = {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 4,
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({});
  });

  it('texas_scramble: returnerer tomt objekt (ingen setup-seksjon)', () => {
    const config = {
      kind: 'texas_scramble',
      team_size: 4,
      teams_count: 2,
      team_handicap_pct: 10,
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({});
  });

  it('stableford: returnerer tomt objekt', () => {
    const config = {
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({});
  });

  it('acey_deucey: net-variant uten innsats', () => {
    const config = {
      kind: 'acey_deucey',
      team_size: 1,
      acey_deucey_scoring: 'net',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({ acey_deucey_scoring: 'net' });
  });

  it('patsome: returnerer patsome_scoring fra config (audit 20.11, p11)', () => {
    const config = {
      kind: 'patsome',
      team_size: 2,
      teams_count: 2,
      patsome_scoring: 'gross',
    } satisfies GameModeConfig;

    // #3002: a game without `fourball_allowance_pct` reads as null, so the
    // edit form posts no share and the game keeps the full course handicap.
    expect(buildSetupStepInitialValues(config)).toEqual({
      patsome_scoring: 'gross',
      patsome_fourball_allowance_pct: null,
    });
  });

  it('patsome: returnerer andelen på hull 1–6 fra config (#3002, F24)', () => {
    const config = {
      kind: 'patsome',
      team_size: 2,
      teams_count: 2,
      patsome_scoring: 'net',
      fourball_allowance_pct: 85,
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({
      patsome_scoring: 'net',
      patsome_fourball_allowance_pct: 85,
    });
  });
});
