import type { NinesHoleRow, NinesResult } from '@/lib/scoring/modes/types';
import { byStanding, inStandingOrder } from './standingOrder';

/**
 * #2255 PR 3c: «Hull for hull» for Nines / Split Sixes — ett kort per hull med
 * potten (eller «Venter på score») og hver spillers plass på hullet, score og
 * poeng.
 *
 * Regnestykket bodde i webbens `NinesHolesView`. Nå bor det her, og både webben
 * og appen tegner de samme kortene. Teksten (varianten og scoringen) kommer som
 * katalognøkler, så hver flate oversetter selv.
 *
 * Ren fil, uten Next og uten React: appen importerer den gjennom Metro.
 */

export interface NinesHoleCardRow {
  userId: string;
  /**
   * Plassen på hullet (lavest score = 1). Lik score deler plassen, og neste
   * plass hopper over (1, 1, 3). `null` når hullet venter eller spilleren
   * mangler score: plass-sirkelen viser «–».
   */
  placement: number | null;
  /** Plass 1 (også delt): gull kant, halvfett navn og gull score. */
  isLeader: boolean;
  /** Poengene fra potten når de er over 0 («+5»), ellers `null` (ingenting vises). */
  pointsShown: number | null;
  /** Brutto ved siden av, bare i netto og bare når den er annerledes. */
  grossShown: number | null;
  effectiveScore: number | null;
}

export interface NinesHoleCard {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Potten på hullet (Nines 9, Split Sixes 6), `null` når hullet venter på score. */
  pot: number | null;
  /**
   * Plass på hullet først (lavest score øverst), så de uten plass. Ellers
   * etter stillingen i fast rekkefølge.
   */
  rows: NinesHoleCardRow[];
}

/** Katalognøkkelen for varianten (`leaderboard.nines.*`). */
export type NinesVariantKey = 'variantNines' | 'variantSplitSixes';
/** Katalognøkkelen for scoringen (`leaderboard.common.*`). */
export type NinesScoringKey = 'netto' | 'brutto';

export interface NinesHoleCards {
  variantKey: NinesVariantKey;
  scoringKey: NinesScoringKey;
  holes: NinesHoleCard[];
}

/** Hele potten per hull: Nines 9 (5/3/1), Split Sixes 6 (4/2/0). */
function potTotal(variant: NinesResult['variant']): number {
  return variant === 'split_sixes' ? 6 : 9;
}

/**
 * Plassen per spiller på hullet (competition ranking): sortert på score, og en
 * gruppe med EKSAKT lik score på posisjonene [i..j-1] deler plass i+1. Stemmer
 * per konstruksjon med poengfordelingen (begge utledes av samme rangering).
 */
function placementByPlayer(hole: NinesHoleRow): Map<string, number> {
  // Et hull som venter deler ikke ut poeng, så ingen plasseres, heller ikke en
  // som har tastet før de andre. Ellers ville et delvis scoret hull kåre en
  // for tidlig leder.
  if (hole.pending) return new Map();

  const ranked = hole.perPlayer
    .filter((c): c is typeof c & { effectiveScore: number } => c.effectiveScore != null)
    .sort((a, b) => a.effectiveScore - b.effectiveScore);

  const placements = new Map<string, number>();
  let i = 0;
  while (i < ranked.length) {
    const groupScore = ranked[i]!.effectiveScore;
    let j = i;
    while (j < ranked.length && ranked[j]!.effectiveScore === groupScore) j++;
    for (let k = i; k < j; k++) placements.set(ranked[k]!.userId, i + 1);
    i = j;
  }
  return placements;
}

/** Lavest plass først, de uten plass bakerst. */
function byPlacement(
  placements: ReadonlyMap<string, number>,
): (a: { userId: string }, b: { userId: string }) => number {
  const at = (userId: string) => placements.get(userId) ?? Number.POSITIVE_INFINITY;
  // Ikke `at(a) - at(b)`: to uten plass gir Infinity − Infinity = NaN.
  return (a, b) => {
    const pa = at(a.userId);
    const pb = at(b.userId);
    return pa === pb ? 0 : pa < pb ? -1 : 1;
  };
}

export function ninesHoleCards(result: NinesResult): NinesHoleCards {
  const tie = byStanding(inStandingOrder(result.players).map((p) => p.userId));
  const pot = potTotal(result.variant);
  return {
    variantKey: result.variant === 'split_sixes' ? 'variantSplitSixes' : 'variantNines',
    scoringKey: result.scoring === 'net' ? 'netto' : 'brutto',
    holes: result.holes.map((hole) => {
      const placements = placementByPlayer(hole);
      return {
        holeNumber: hole.holeNumber,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        pot: hole.pending ? null : pot,
        rows: [...hole.perPlayer]
          .sort((a, b) => byPlacement(placements)(a, b) || tie(a, b))
          .map((cell) => {
            const placement = placements.get(cell.userId) ?? null;
            const points = hole.pointsByPlayer[cell.userId] ?? 0;
            return {
              userId: cell.userId,
              placement,
              isLeader: placement === 1,
              pointsShown: points > 0 ? points : null,
              grossShown:
                result.scoring === 'net' && cell.gross != null && cell.gross !== cell.effectiveScore
                  ? cell.gross
                  : null,
              effectiveScore: cell.effectiveScore,
            };
          }),
      };
    }),
  };
}

/**
 * Poengene som tekst: hele tall rent («4»), del-poeng med én desimal. Del-poeng
 * kommer bare når flere deler en plass og potten ikke går opp, som med andre
 * spillertall enn tre. Desimalen formaterer hver flate selv (`oneDecimal`):
 * webben med sitt språk, appen på norsk uten Intl.
 */
export function ninesPointsText(points: number, oneDecimal: (points: number) => string): string {
  return Number.isInteger(points) ? String(points) : oneDecimal(points);
}
