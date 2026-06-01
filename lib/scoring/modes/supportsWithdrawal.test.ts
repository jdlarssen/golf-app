import { describe, it, expect } from 'vitest';
import { supportsWithdrawal } from './types';
import type { GameMode } from './types';

/**
 * Type-A: WD-format-scope (#386). `supportsWithdrawal` styrer hvor «trekk
 * spiller»-UI vises. In-scope = individuell-ball-totalformat der eksklusjon
 * endrer rangeringen; alt annet faller tilbake på «ikke levert».
 */

// Hele GameMode-unionen, eksplisitt listet så testen fanger en ny mode som
// glemmes (den må legges til her OG i predikatet — ellers feiler en av testene).
const ALL_MODES: GameMode[] = [
  'best_ball',
  'stableford',
  'modified_stableford',
  'singles_matchplay',
  'solo_strokeplay',
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'wolf',
  'nassau',
  'skins',
  'bingo_bango_bongo',
  'nines',
  'round_robin',
  'acey_deucey',
  'shamble',
  'patsome',
  'gruesome_matchplay',
];

const IN_SCOPE: GameMode[] = [
  'best_ball',
  'stableford',
  'modified_stableford',
  'solo_strokeplay',
];

describe('supportsWithdrawal', () => {
  it.each(IN_SCOPE)('returns true for individual-ball total format: %s', (mode) => {
    expect(supportsWithdrawal(mode)).toBe(true);
  });

  it.each(ALL_MODES.filter((m) => !IN_SCOPE.includes(m)))(
    'returns false for out-of-scope format: %s',
    (mode) => {
      expect(supportsWithdrawal(mode)).toBe(false);
    },
  );

  it('classifies every GameMode (exhaustive — no mode left unhandled)', () => {
    // Hadde unionen fått en ny mode uten case ville `never`-grenen kastet eller
    // tsc feilet; her sikrer vi at hver kjente mode returnerer en boolean.
    for (const mode of ALL_MODES) {
      expect(typeof supportsWithdrawal(mode)).toBe('boolean');
    }
  });

  it('exactly four formats are in scope for v1', () => {
    const supported = ALL_MODES.filter((m) => supportsWithdrawal(m));
    expect(supported.sort()).toEqual([...IN_SCOPE].sort());
  });
});
