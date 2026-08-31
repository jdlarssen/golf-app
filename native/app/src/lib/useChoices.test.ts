// Native (#1832): hvilke formater som koster et nettkall.
//
// Hooken rundt denne funksjonen poller serveren mens skjermen står åpen. Den
// listen skal være nøyaktig to formater lang: svarer `choiceSourceFor` noe
// annet enn `null` for et format som ikke bruker per-hull-valg, begynner elleve
// andre spilltyper å hente en tabell de ikke trenger — hvert tiende sekund,
// på mobildata, midt i en runde.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factoryen heises over importene og må bruke require */
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { CHOICES_POLL_MS, choiceSourceFor } from './useChoices';

// Modulen drar inn fetch-laget, som drar inn den ekte klienten — den kaster
// uten `EXPO_PUBLIC_SUPABASE_*` allerede ved import.
jest.mock('../supabase', () => require('../test/supabaseMock'));

const NO_CHOICES: readonly GameMode[] = [
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
  'gruesome_matchplay',
  'nassau',
  'skins',
  'nines',
  'round_robin',
  'acey_deucey',
  'shamble',
  'patsome',
];

describe('choiceSourceFor', () => {
  it('peker wolf og bingo bango bongo på hver sin tabell', () => {
    expect(choiceSourceFor('wolf')).toBe('wolf');
    expect(choiceSourceFor('bingo_bango_bongo')).toBe('bingo_bango_bongo');
  });

  it.each(NO_CHOICES)('henter ingenting for %s', (mode) => {
    expect(choiceSourceFor(mode)).toBeNull();
  });

  it('henter ingenting før bundelen har landet og formatet er kjent', () => {
    expect(choiceSourceFor('')).toBeNull();
  });
});

describe('CHOICES_POLL_MS', () => {
  it('går sjeldnere enn slag-pollingen — dette er nett, ikke SQLite', () => {
    // Leaderboardets POLL_MS er 1500 ms mot den lokale basen. Et nettkall i
    // den takten ville vært 40 spørringer i minuttet per åpen skjerm.
    expect(CHOICES_POLL_MS).toBeGreaterThanOrEqual(1500);
  });
});
