import {
  isAlternateShotMatchplay,
  isScrambleFamily,
  type GameMode,
} from '@/lib/scoring/modes/types';

/**
 * Leverer én levering hele laget i dette formatet? (#1453)
 *
 * Sant i formatene der laget fører én ball hele runden: scramble-familien og
 * alternate-shot-matchplay. Der markerer leverings-kjernen alle lagets aktive,
 * uleverte rader i ett, så hvem som helst på laget kan levere lagets kort.
 * Patsome er bevisst utenfor: det bytter mellom egen ball og felles ball
 * midtveis, og hver spiller leverer sitt eget kort.
 *
 * Det ene hjemmet for regelen (#2200): leverings-kjernen og påminnelses-sveipen
 * spør begge her, så en påminnelse aldri går til noen som ikke kan levere.
 */
export function deliveryCoversWholeTeam(mode: GameMode): boolean {
  return isScrambleFamily(mode) || isAlternateShotMatchplay(mode);
}
