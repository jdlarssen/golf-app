// Scoreskinna på hullsiden (#2251): hvilke tall knappene tilbyr, hva de heter,
// hvilke formater som bruker skinna, og hvem skinna går til neste gang.
//
// Samme regel som `strokeEntry.ts`: ren og dependency-fri, så appen kan
// importere fila rett fra `lib/` uten Metro-fella (#1901). Den eneste importen
// utenfra er en type, og den forsvinner ved kompilering.

import type { GameMode } from '../scoring/modes/types';
import { MAX_STROKES, MIN_STROKES } from './strokeEntry';

function clamp(n: number): number {
  return Math.max(MIN_STROKES, Math.min(MAX_STROKES, n));
}

/**
 * Tallene på skinna: par −1 til par +3. Vinduet er fast per hull, så knappene
 * står stille når skinna bytter spiller. Klemt til slag-grensene uten duplikater.
 */
export function railStrokes(par: number): number[] {
  const values: number[] = [];
  for (let n = par - 1; n <= par + 3; n++) {
    const v = clamp(n);
    if (!values.includes(v)) values.push(v);
  }
  return values;
}

export type StrokeTerm =
  | 'albatross'
  | 'eagle'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'doubleBogey'
  | 'tripleBogey'
  | 'over';

/** Navnet på et slag-tall mot par. Fra +4 heter det bare diffen («+4»). */
export function strokeTerm(strokes: number, par: number): StrokeTerm {
  const diff = strokes - par;
  if (diff <= -3) return 'albatross';
  if (diff === -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  if (diff === 2) return 'doubleBogey';
  if (diff === 3) return 'tripleBogey';
  return 'over';
}

/**
 * «Stryk» i stableford-familien: netto dobbel bogey, altså par + slagene
 * spilleren får på hullet + 2. Samme tak som WHS bruker
 * (`lib/scoring/scoreDifferential.ts`). Tåler plusshandicap (negative slag).
 */
export function strikeStrokes(par: number, extraStrokes: number): number {
  return clamp(par + extraStrokes + 2);
}

/**
 * Bruker formatet skinna på hullsiden? Alle formater fører slag per kort,
 * unntatt Bingo Bango Bongo, der poengene kommer fra egen seksjon og kortene
 * blir som før.
 */
export function formatUsesScoreRail(mode: GameMode): boolean {
  switch (mode) {
    case 'best_ball':
    case 'stableford':
    case 'modified_stableford':
    case 'singles_matchplay':
    case 'solo_strokeplay':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
    case 'wolf':
    case 'nassau':
    case 'skins':
    case 'nines':
    case 'round_robin':
    case 'acey_deucey':
    case 'shamble':
    case 'patsome':
      return true;
    case 'bingo_bango_bongo':
      return false;
    default: {
      // `never` keeps a new GameMode a compile error. At runtime an unknown
      // mode (older app binary, seed before deploy) lands here: fail closed to
      // the cards, as `formatCapturesPutts` does (#1887).
      const _exhaustive: never = mode;
      return false;
    }
  }
}

/** Et sete på skinna. `locked` regnes ut av kalleren med `isCardLocked` (#2211). */
export type RailSeat = { score: number | null; locked: boolean };

/**
 * Første sete fra `startIndex` (med omløp) som mangler score og ikke er låst.
 * `null` når alle har score eller er låst.
 */
export function nextRailSeat({
  seats,
  startIndex,
}: {
  seats: readonly RailSeat[];
  startIndex: number;
}): number | null {
  const n = seats.length;
  if (n === 0) return null;
  const start = ((startIndex % n) + n) % n;
  for (let step = 0; step < n; step++) {
    const i = (start + step) % n;
    const seat = seats[i];
    if (seat.score == null && !seat.locked) return i;
  }
  return null;
}
