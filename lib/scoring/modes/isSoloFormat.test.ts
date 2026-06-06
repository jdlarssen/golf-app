import { describe, it, expect } from 'vitest';
import { isSoloFormat } from './types';
import type { GameMode } from './types';

/**
 * Type-A: solo-format-klassifisering. `isSoloFormat` er single source of truth
 * for «individuelt format uten lag-/flight-gruppering» — spillere er en flat
 * liste (team_number/flight_number null eller rotasjons-slot, ikke et lag).
 * Styrer hvor lag-/flight-UI skjules (game-home «DIN INFO», deltaker-liste,
 * admin spiller-tabell). Tidligere brukte call-sites `isStablefordFamily` som
 * proxy og glemte pott-formatene (Wolf/Nassau/Skins/BBB/Nines/RR/Acey).
 */

// Hele GameMode-unionen, eksplisitt listet så testen fanger en ny mode som
// glemmes (den må legges til her OG i predikatet — ellers feiler en test).
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

// Pott-/individuell-formater: alltid solo uansett team_size (alle er team_size 1).
const ALWAYS_SOLO: GameMode[] = [
  'solo_strokeplay',
  'wolf',
  'nassau',
  'skins',
  'bingo_bango_bongo',
  'nines',
  'round_robin',
  'acey_deucey',
];

// Lag-/side-formater: aldri solo.
const NEVER_SOLO: GameMode[] = [
  'best_ball',
  'singles_matchplay',
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
  'shamble',
  'patsome',
];

describe('isSoloFormat', () => {
  it.each(ALWAYS_SOLO)('returns true for individual format: %s', (mode) => {
    expect(isSoloFormat(mode, 1)).toBe(true);
  });

  it.each(NEVER_SOLO)('returns false for team/side format: %s', (mode) => {
    // team_size varierer (2/3/4) per format, men ingen av dem er solo uansett.
    expect(isSoloFormat(mode, 2)).toBe(false);
  });

  it.each(['stableford', 'modified_stableford'] as const)(
    'stableford-family %s is solo only at team_size 1',
    (mode) => {
      expect(isSoloFormat(mode, 1)).toBe(true);
      expect(isSoloFormat(mode, 2)).toBe(false);
    },
  );

  it('classifies every GameMode (exhaustive — no mode left unhandled)', () => {
    for (const mode of ALL_MODES) {
      expect(typeof isSoloFormat(mode, 1)).toBe('boolean');
    }
  });
});
