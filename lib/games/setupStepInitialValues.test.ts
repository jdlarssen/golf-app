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

  it('acey_deucey: returnerer tomt objekt (eget setup men ikke i scope for #322)', () => {
    const config = {
      kind: 'acey_deucey',
      team_size: 1,
      acey_deucey_scoring: 'net',
    } satisfies GameModeConfig;

    expect(buildSetupStepInitialValues(config)).toEqual({});
  });
});
