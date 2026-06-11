import type { MatchplayHoleResult } from './types';

/**
 * Løpende match-status etter hvert hull i en matchplay-match (#546).
 *
 * Tar per-hull-utfall i hull-rekkefølge og returnerer kumulativ `holesUp`
 * etter hvert hull: positiv = side 1 leder, negativ = side 2 leder, 0 = AS.
 * Uspilte hull gir `null` og endrer ikke stillingen — de kan ligge midt i
 * sekvensen når hull spilles i ulik rekkefølge, og skal ikke telle (matcher
 * scoring-lagets `holesUp` som kun teller spilte hull).
 */
export function runningMatchStatus(
  results: MatchplayHoleResult[],
): (number | null)[] {
  let holesUp = 0;
  return results.map((result) => {
    switch (result) {
      case 'side1_wins':
        holesUp += 1;
        return holesUp;
      case 'side2_wins':
        holesUp -= 1;
        return holesUp;
      case 'tied':
        return holesUp;
      default:
        return null;
    }
  });
}

/**
 * Kompakt stilling-label for tabell-kolonner: «AS» ved likt, ellers
 * golf-konvensjonen «{n}up» uten mellomrom (samme form som
 * `MatchplayMatchResult.formatted` bruker for avgjorte matcher).
 */
export function runningStatusLabel(holesUp: number): string {
  if (holesUp === 0) return 'AS';
  return `${Math.abs(holesUp)}up`;
}
