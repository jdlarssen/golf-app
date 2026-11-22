// Native N3 (#1825): hullet «Fortsett runden» peker på.
//
// Selve CTA-tilstanden (`computePrimaryCtaState`) bor i
// `lib/games/primaryCtaState.ts`, delt med webbens PrimaryCta (#2228).

import { nextUnfilledHoleOf } from '../../../../lib/games/nextHole';
import type { StartType } from '../../../../lib/games/startType';

const ALL_HOLES: readonly number[] = Array.from({ length: 18 }, (_, i) => i + 1);

/**
 * Hullet «Fortsett runden» skal peke på: det første uten slag (#164), i den
 * rekkefølgen runden spilles. I en shotgun er det flightens egen start, ikke
 * hull 1: regelen er webbens (`nextUnfilledHoleOf`), så knappen, billetten og
 * nettsiden er enige.
 *
 * Faller tilbake til første hull når alt er fylt — samme som webben. Den
 * verdien brukes uansett ikke da, for spilleren er i `ready_to_submit` og
 * CTA-en peker på scorekortet.
 *
 * `holes` er hullene spillet eier (#2752): andre halvdel av en delt cup-dag
 * starter på hull 10.
 */
export function nextUnfilledHole(
  filledHoles: readonly number[],
  holes: readonly number[] = ALL_HOLES,
  startType: StartType = 'first_tee',
): number {
  return nextUnfilledHoleOf(holes, new Set(filledHoles), startType) ?? holes[0];
}
