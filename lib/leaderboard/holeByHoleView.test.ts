import { describe, it, expect } from 'vitest';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { hasHoleByHoleView } from './holeByHoleView';

// Type A (#2217 D1): «Hull for hull» is linked only for the formats that have
// their own per-hole view. Everything else fell through to the generic
// best-ball drilldown and showed numbers and places the board did not.

type NonStablefordMode = Exclude<GameMode, 'stableford' | 'modified_stableford'>;

// A Record, so tsc makes a new GameMode a gap here too.
const EXPECTED: Record<NonStablefordMode, boolean> = {
  best_ball: true,
  skins: true,
  wolf: true,
  nines: true,
  round_robin: true,
  acey_deucey: true,
  bingo_bango_bongo: true,
  nassau: true,
  solo_strokeplay: true,
  singles_matchplay: false,
  fourball_matchplay: false,
  foursomes_matchplay: false,
  greensome_matchplay: false,
  chapman_matchplay: false,
  gruesome_matchplay: false,
  texas_scramble: false,
  ambrose: false,
  florida_scramble: false,
  shamble: false,
  patsome: false,
};

const configOf = (kind: string, extra: Record<string, unknown> = {}) =>
  ({ kind, ...extra }) as unknown as GameModeConfig;

describe('hasHoleByHoleView', () => {
  it.each(Object.entries(EXPECTED) as [NonStablefordMode, boolean][])(
    '%s → %s',
    (mode, expected) => {
      expect(hasHoleByHoleView(mode, configOf(mode))).toBe(expected);
    },
  );

  it.each([
    ['stableford', 'standard', 1, true],
    ['stableford', 'standard', 2, false],
    ['modified_stableford', 'modified', 1, true],
    ['modified_stableford', 'modified', 2, false],
  ] as const)('%s with points_table %s and team_size %i → %s', (mode, table, teamSize, expected) => {
    expect(
      hasHoleByHoleView(mode, configOf(mode, { team_size: teamSize, points_table: table })),
    ).toBe(expected);
  });

  it('needs a stableford config of the same kind', () => {
    expect(
      hasHoleByHoleView('stableford', configOf('best_ball', { team_size: 1 })),
    ).toBe(false);
  });

  it('fails closed for an unknown mode at runtime', () => {
    expect(hasHoleByHoleView('mystery' as GameMode, configOf('mystery'))).toBe(false);
  });
});
