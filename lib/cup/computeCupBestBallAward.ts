import { applyAllowance } from '@/lib/scoring/courseHandicap';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { bestBallForHole, teamTotal } from '@/lib/scoring/modes/bestBall';
import { ALLOWANCE_DEFAULTS } from './allowance';

/**
 * Splittet-cup-dagens best-ball-cup-poeng (#1441, D4/D11): en av de fire
 * cup-konkurransene per flight er back9-best-ball-en, poengsatt på netto
 * LAGTOTAL (lavest vinner) — ikke hull-for-hull som matchplay-familien
 * (`computeCupMatchResult`). Egen fil (ikke en gren i
 * `computeCupMatchResult.ts`): den filens `MATCHPLAY_CONFIG`-dispatch er
 * bygget rundt matchplay-ens `winner: 'side1'|'side2'|'tied'`-per-hull-shape
 * via `ScoringContext`/`GameModeConfig`; best-ball-cup-poenget er en helt
 * annen sammenligning (sum vs. sum, ingen hull-for-hull-vinner) og trenger
 * ikke `ScoringContext`s fulle shape — en slankere egen input holder.
 *
 * Allowance: standard `best_ball`-modusen (lib/scoring/modes/bestBall.ts) har
 * INGEN `allowance_pct` i sin `mode_config` — den bruker rå `courseHandicap`.
 * Splittet-cup-dagens best-ball-host trenger derimot WHS-allowance (85 %
 * default, `ALLOWANCE_DEFAULTS.bestBall`), så denne funksjonen anvender
 * `applyAllowance` selv før den bygger per-hull-nettoene (samme mønster som
 * `fourballMatchplay.ts` bruker for sin egen allowance).
 */

export type CupBestBallSidePlayer = { userId: string; courseHandicap: number };

export type CupBestBallAwardInput = {
  side1: CupBestBallSidePlayer[];
  side2: CupBestBallSidePlayer[];
  holes: Array<{ number: number; strokeIndex: number }>;
  scores: Array<{ userId: string; holeNumber: number; gross: number | null }>;
  /** HCP-allowance 0..100. Default `ALLOWANCE_DEFAULTS.bestBall` (85) når undefined. */
  allowancePct?: number;
};

export type CupBestBallAwardResult = {
  winnerSide: 1 | 2 | 'tied';
  /** «{side1Total}–{side2Total}» netto lagtotaler, ALLTID i den rekkefølgen
   * (ikke vinner-først) — en ren resultattavle, speiler ikke matchplay-ens
   * marginformat. */
  formatted: string;
};

/**
 * Ren funksjon — tar INGEN stilling til `games.status`. Kalleren (F3b:
 * getCupSnapshot) avgjør om host-matchen er `'finished'` før den stoler på
 * resultatet, akkurat som `computeCupMatchResult` gjør for matchplay-familien.
 *
 * Returnerer `null` når en rettferdig sammenligning ikke er mulig:
 *  - `side1`/`side2` har ikke nøyaktig 2 spillere hver,
 *  - `holes` er tom, eller
 *  - ETT ELLER BEGGE lag mangler netto på minst ett hull (`teamTotal`s
 *    `missingHoles`-kontrakt — en partial sum kan ikke sammenlignes rettferdig
 *    mot en komplett sum).
 */
export function computeCupBestBallAward(
  input: CupBestBallAwardInput,
): CupBestBallAwardResult | null {
  if (input.side1.length !== 2 || input.side2.length !== 2) return null;
  if (input.holes.length === 0) return null;

  const allowancePct = input.allowancePct ?? ALLOWANCE_DEFAULTS.bestBall;

  const grossByKey = new Map<string, number | null>();
  for (const s of input.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const teamNetTotal = (side: CupBestBallSidePlayer[]) => {
    const holeRows = input.holes.map((hole) => {
      const players = side.map((p) => {
        const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
        const effective = applyAllowance(p.courseHandicap, allowancePct);
        const extraStrokes = strokesForHole(effective, hole.strokeIndex);
        return { userId: p.userId, gross, extraStrokes };
      });
      const bb = bestBallForHole(players);
      return { holeNumber: hole.number, teamNet: bb.teamNet };
    });
    return teamTotal(holeRows);
  };

  const t1 = teamNetTotal(input.side1);
  const t2 = teamNetTotal(input.side2);

  if (t1.missingHoles.length > 0 || t2.missingHoles.length > 0) return null;

  const formatted = `${t1.total}–${t2.total}`;
  if (t1.total < t2.total) return { winnerSide: 1, formatted };
  if (t2.total < t1.total) return { winnerSide: 2, formatted };
  return { winnerSide: 'tied', formatted };
}
