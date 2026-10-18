import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import { ALL_CUP_MATCH_FORMATS, cupMatchAllowance } from '@/lib/cup/cupMatchAllowance';
import {
  effectiveHcpAllowancePct,
  hcpAllowanceInPlay,
  showsGeneralAllowanceField,
  usesGameHcpAllowance,
} from './hcpAllowance';

/**
 * #2210 — which formats use the general `games.hcp_allowance_pct`. Formats
 * with their own percentage in `mode_config` must never have an old general
 * percentage deducted on top of theirs.
 *
 * The expectation table is a `Record<GameMode, boolean>`, so a new format is
 * a compile error here until someone decides which side it is on.
 */
const EXPECTED: Record<GameMode, boolean> = {
  best_ball: true,
  stableford: true,
  modified_stableford: true,
  singles_matchplay: true,
  solo_strokeplay: true,
  texas_scramble: false,
  ambrose: false,
  florida_scramble: false,
  fourball_matchplay: false,
  foursomes_matchplay: false,
  greensome_matchplay: false,
  chapman_matchplay: false,
  wolf: false,
  nassau: false,
  skins: false,
  bingo_bango_bongo: false,
  nines: false,
  round_robin: false,
  acey_deucey: false,
  // #2570: shamble and champagne scramble (a shamble variant) take the
  // general percentage too.
  shamble: true,
  patsome: false,
  gruesome_matchplay: false,
};

describe('usesGameHcpAllowance (#2210)', () => {
  it.each(Object.entries(EXPECTED))('%s → %s', (mode, expected) => {
    expect(usesGameHcpAllowance(mode)).toBe(expected);
  });

  it('an unknown format does not use it', () => {
    expect(usesGameHcpAllowance('not_a_mode')).toBe(false);
    expect(usesGameHcpAllowance('toString')).toBe(false);
  });
});

describe('effectiveHcpAllowancePct (#2210)', () => {
  it.each<[string, number, number]>([
    ['stableford', 85, 85],
    ['best_ball', 0, 0],
    ['fourball_matchplay', 85, 100],
    ['skins', 0, 100],
    ['texas_scramble', 150, 100],
    ['shamble', 85, 85],
    ['not_a_mode', 85, 100],
  ])('%s with stored %i → %i', (mode, stored, expected) => {
    expect(effectiveHcpAllowancePct(mode, stored)).toBe(expected);
  });
});

// Trap 4 (one rule, one home): the cup generator already pins
// games.hcp_allowance_pct to 100 for every format that carries its own
// percentage. The game-side rule must agree with it.
describe('usesGameHcpAllowance agrees with the cup generator (#2210)', () => {
  const PCTS = {
    fourball: 90,
    foursomes: 50,
    greensome: 60,
    chapman: 60,
    gruesome: 50,
    bestBall: 85,
  };
  it.each(ALL_CUP_MATCH_FORMATS.filter((f) => !usesGameHcpAllowance(f)))(
    '%s: the cup stores 100 on the games row',
    (format) => {
      expect(cupMatchAllowance(format, PCTS).hcpAllowancePct).toBe(100);
    },
  );
});

/**
 * #2570: shamble has its own «Tellemåte» (Netto/Brutto) on step 2, so the
 * percentage field lives there, under it, and the general field (with its own
 * Netto/Brutto switch) is hidden for shamble alone.
 */
const SHOWS_GENERAL_FIELD: Record<GameMode, boolean> = {
  ...EXPECTED,
  shamble: false,
};

describe('showsGeneralAllowanceField (#2570)', () => {
  it.each(Object.entries(SHOWS_GENERAL_FIELD))('%s → %s', (mode, expected) => {
    expect(showsGeneralAllowanceField(mode)).toBe(expected);
  });

  it('an unknown format shows nothing', () => {
    expect(showsGeneralAllowanceField('not_a_mode')).toBe(false);
  });
});

describe('hcpAllowanceInPlay (#2570)', () => {
  it.each<[string, 'gross' | 'net' | undefined, boolean]>([
    ['shamble', 'net', true],
    ['shamble', undefined, true],
    // Gross shamble plays on raw strokes: the percentage is not in play.
    ['shamble', 'gross', false],
    // Only shamble reads the scoring toggle; the others follow usesGameHcpAllowance.
    ['stableford', 'gross', true],
    ['best_ball', undefined, true],
    ['skins', 'net', false],
    ['texas_scramble', undefined, false],
  ])('%s with %s → %s', (mode, scoring, expected) => {
    expect(hcpAllowanceInPlay(mode, scoring)).toBe(expected);
  });
});
