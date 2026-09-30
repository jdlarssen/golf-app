import type { AceyDeuceyHoleRow, AceyDeuceyResult } from '@/lib/scoring/modes/types';
import { formatSignedPoints } from './soloScorecard';
import { byStanding, inStandingOrder } from './standingOrder';

/**
 * #2255 PR 3c: «Hull for hull» for Acey Deucey — ett kort per hull med alle
 * fire spillerne rangert på score, ace (unik lavest, +3) i gull og deuce (unik
 * høyest, −3) i en kald markering.
 *
 * Regnestykket bodde i webbens `AceyDeuceyHolesView`. Nå bor det her, og både
 * webben og appen tegner de samme kortene. Scoringen kommer som katalognøkkel,
 * så hver flate oversetter selv.
 *
 * Ren fil, uten Next og uten React: appen importerer den gjennom Metro.
 */

/**
 * Tonen på raden. `ace`: gull kant og tone, stjerne, halvfett navn, gull poeng
 * og score. `deuce`: kald ramme på dempet flate, dempet poeng og score.
 * `neutral`: de i midten, og alle på et hull som venter.
 */
export type AceyDeuceyRowTone = 'ace' | 'deuce' | 'neutral';

export interface AceyDeuceyHoleCardRow {
  userId: string;
  tone: AceyDeuceyRowTone;
  /**
   * Poengene på hullet: «+3», «0» eller «−3» (ekte minustegn, U+2212). Bare
   * når alle fire har spilt hullet, ellers `null` (ingenting vises).
   */
  pointsText: string | null;
  /** Brutto ved siden av, bare i netto og bare når den er annerledes. */
  grossShown: number | null;
  /** Scoren som teller (brutto eller netto), `null` uten score («–»). */
  effectiveScore: number | null;
}

export interface AceyDeuceyHoleCard {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Alle fire har score. Ellers står «Venter» i hodet. */
  scored: boolean;
  /**
   * Et spilt hull: lavest score øverst (ace), høyest nederst (deuce). Et hull
   * som venter har ingen rangering. Lik score (og hele hullet som venter)
   * står etter stillingen i fast rekkefølge.
   */
  rows: AceyDeuceyHoleCardRow[];
}

/** Katalognøkkelen for scoringen (`leaderboard.common.*`). */
export type AceyDeuceyScoringKey = 'netto' | 'brutto';

export interface AceyDeuceyHoleCards {
  scoringKey: AceyDeuceyScoringKey;
  holes: AceyDeuceyHoleCard[];
}

/** «+3», «0», «−3»: plusstegn foran ace, ekte minustegn foran deuce. */
function pointsText(points: number): string {
  return points > 0 ? `+${points}` : formatSignedPoints(points);
}

/** Lavest score først, de uten score bakerst. */
function byScore(a: { effectiveScore: number | null }, b: { effectiveScore: number | null }): number {
  const sa = a.effectiveScore ?? Number.POSITIVE_INFINITY;
  const sb = b.effectiveScore ?? Number.POSITIVE_INFINITY;
  // Ikke `sa - sb`: to uten score gir Infinity − Infinity = NaN.
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

function toneOf(hole: AceyDeuceyHoleRow, userId: string): AceyDeuceyRowTone {
  if (!hole.scored) return 'neutral';
  if (userId === hole.aceUserId) return 'ace';
  if (userId === hole.deuceUserId) return 'deuce';
  return 'neutral';
}

export function aceyDeuceyHoleCards(result: AceyDeuceyResult): AceyDeuceyHoleCards {
  const tie = byStanding(inStandingOrder(result.players).map((p) => p.userId));
  return {
    scoringKey: result.scoring === 'net' ? 'netto' : 'brutto',
    holes: result.holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      scored: hole.scored,
      rows: [...hole.perPlayer]
        .sort((a, b) => (hole.scored ? byScore(a, b) : 0) || tie(a, b))
        .map((cell) => ({
          userId: cell.userId,
          tone: toneOf(hole, cell.userId),
          pointsText: hole.scored ? pointsText(cell.points) : null,
          grossShown:
            result.scoring === 'net' && cell.gross != null && cell.gross !== cell.effectiveScore
              ? cell.gross
              : null,
          effectiveScore: cell.effectiveScore,
        })),
    })),
  };
}
