import type { WolfHoleOutcome, WolfResult } from '@/lib/scoring/modes/types';
import {
  wolfChoiceKey,
  wolfOutcomeKey,
  type WolfChoiceKey,
  type WolfOutcomeKey,
} from '../wolf/holeLabels';
import { byStanding, inStandingOrder } from './standingOrder';

/**
 * #2255 PR 3b: «Hull for hull» for Wolf — ett kort per hull med hvem som var
 * ulv, valget, utfallet, innsatsen og hver spillers side, score og poeng.
 *
 * Regnestykket bodde i webbens `WolfHolesView`. Nå bor det her, og både webben
 * og appen tegner de samme kortene. Teksten (valg og utfall) kommer som
 * katalognøkler fra `lib/wolf/holeLabels.ts`, så hver flate oversetter selv.
 *
 * Ren fil, uten Next og uten React: appen importerer den gjennom Metro.
 */

export interface WolfHoleCardRow {
  userId: string;
  /** `wolf` = ulvens side, `opp` = de andre, `null` = ikke plassert ennå. */
  side: 'wolf' | 'opp' | null;
  /** Hadde best score på sin side. */
  isContributor: boolean;
  /** Poengene på hullet. Visningen viser dem bare når de er over 0. */
  points: number;
  effectiveScore: number | null;
  /** Brutto ved siden av, bare i netto og bare når den er annerledes. */
  grossShown: number | null;
}

export interface WolfHoleCard {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Innsatsen når den er mer enn 1 (delt forrige hull), ellers `null`. */
  stake: number | null;
  wolfUserId: string;
  partnerUserId: string | null;
  choiceKey: WolfChoiceKey;
  outcome: WolfHoleOutcome;
  outcomeKey: WolfOutcomeKey;
  /**
   * Ulvens side først (ulven selv før partneren), så de andre, så uplasserte.
   * Ellers etter stillingen i fast rekkefølge.
   */
  rows: WolfHoleCardRow[];
}

export interface WolfHoleCards {
  scoring: WolfResult['scoring'];
  holes: WolfHoleCard[];
}

function sideRank(side: 'wolf' | 'opp' | null): number {
  return side === 'wolf' ? 0 : side === 'opp' ? 1 : 2;
}

/** Ulven selv foran alle andre på sin side. */
function wolfFirst(wolfUserId: string): (a: { userId: string }, b: { userId: string }) => number {
  return (a, b) => Number(b.userId === wolfUserId) - Number(a.userId === wolfUserId);
}

export function wolfHoleCards(result: WolfResult): WolfHoleCards {
  const tie = byStanding(inStandingOrder(result.players).map((p) => p.userId));
  return {
    scoring: result.scoring,
    holes: result.holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      stake: hole.stake > 1 ? hole.stake : null,
      wolfUserId: hole.wolfUserId,
      partnerUserId: hole.partnerUserId,
      choiceKey: wolfChoiceKey(hole.choice),
      outcome: hole.outcome,
      outcomeKey: wolfOutcomeKey(hole.outcome),
      rows: [...hole.players]
        .sort(
          (a, b) => sideRank(a.side) - sideRank(b.side) || wolfFirst(hole.wolfUserId)(a, b) || tie(a, b),
        )
        .map((cell) => ({
          userId: cell.userId,
          side: cell.side,
          isContributor: cell.isContributor,
          points: hole.pointsByPlayer[cell.userId] ?? 0,
          effectiveScore: cell.effectiveScore,
          grossShown:
            result.scoring === 'net' && cell.gross != null && cell.gross !== cell.effectiveScore
              ? cell.gross
              : null,
        })),
    })),
  };
}
