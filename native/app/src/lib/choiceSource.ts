// Hvilke formater henter halve regnestykket fra en egen valg-tabell, og er
// valgene kommet? Ren fil uten nett og uten React, så modellene
// (`holeByHole.ts`) kan spørre uten å dra med seg Supabase-klienten; hooken
// som henter valgene, bor i `useChoices.ts` (#2255 PR 3b).
import type { ScoringExtras } from './scoringContext';

/** Hvilken valg-tabell formatet henter halve regnestykket sitt fra. */
export type ChoiceSource = 'wolf' | 'bingo_bango_bongo';

/**
 * Valg-kilden formatet trenger, eller `null` når det ikke trenger noen.
 *
 * Skrevet som et oppslag på `game_mode` og ikke utledet fra noe delt predikat:
 * «henter poeng fra en egen per-hull-tabell» er ikke et begrep motoren har, og
 * en gate som lot som den fulgte et delt begrep ville drevet fra det.
 */
export function choiceSourceFor(gameMode: string): ChoiceSource | null {
  if (gameMode === 'wolf') return 'wolf';
  if (gameMode === 'bingo_bango_bongo') return 'bingo_bango_bongo';
  return null;
}

/**
 * Trenger formatet valg fra serveren, og er de ikke kommet ennå? (#2255 PR 3b)
 * `undefined` = ikke hentet; en tom liste er et svar.
 */
export function choicesNotYetHere(gameMode: string, extras: ScoringExtras): boolean {
  const source = choiceSourceFor(gameMode);
  if (source === 'wolf') return extras.wolfChoices === undefined;
  if (source === 'bingo_bango_bongo') return extras.bingoBangoBongoHoles === undefined;
  return false;
}
