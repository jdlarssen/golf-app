// Stableford-poengene hullsiden viser mens du taster: på knappene i skinna
// («Par · 2 p»), i radene og på «Stryk» (#2251). Flyttet hit fra nettsidens
// rutemappe (#2252) så appen kan regne de samme tallene.
//
// Relative importer, ikke `@/`: appen henter fila rett fra `lib/`, og alt den
// drar inn må løses fra `native/app` (#1901). Poengtabellene er scoringens
// egne, så denne fila bestemmer bare hvilken tabell og hvilket netto-tall.

import { computeStablefordPoints } from '../scoring/modes/stableford';
import { computeModifiedStablefordPoints } from '../scoring/modes/modifiedStableford';
import type { GameMode } from '../scoring/modes/types';

/** Modified stableford har egen poengtabell; resten bruker standardtabellen. */
export function stablefordPointsFnFor(
  gameMode: GameMode,
): typeof computeStablefordPoints {
  return gameMode === 'modified_stableford'
    ? computeModifiedStablefordPoints
    : computeStablefordPoints;
}

/**
 * Stableford-poeng for ett kort på hullet, eller `null` når formatet ikke er
 * stableford eller kortet mangler score. Netto er slag minus slagene spilleren
 * får på hullet (negative ved plusshandicap).
 */
export function stablefordPointsForCard(args: {
  card: { score: number | null; extraStrokes: number };
  par: number;
  gameMode: GameMode;
  isStableford: boolean;
}): number | null {
  const { card, par, gameMode, isStableford } = args;
  return isStableford && card.score != null
    ? stablefordPointsFnFor(gameMode)({
        par,
        netStrokes: card.score - card.extraStrokes,
      })
    : null;
}
