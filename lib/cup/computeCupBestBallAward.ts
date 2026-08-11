import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { bestBallForHole, teamTotal } from '@/lib/scoring/modes/bestBall';

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
 * Allowance (#1539/#1551): denne funksjonen anvender INGEN allowance selv. Den
 * leser `courseHandicap` rått — nøyaktig som motorens egen `compute()` i
 * `lib/scoring/modes/bestBall.ts`, som driver kampens leaderboard. Allowancen
 * er alt anvendt én gang, da `startScheduledGame` frøs
 * `game_players.course_handicap` med `games.hcp_allowance_pct`
 * (`cupMatchAllowance` sørger for at cup-best-ball-matcher får arrangørens
 * prosent der).
 *
 * Funksjonen anvendte tidligere `mode_config.allowance_pct` selv. Det ga to
 * hjem for samme regel: kampens tavle brukte den frosne verdien mens
 * cup-poenget la en ny allowance oppå — samme kamp, to ulike antall slag
 * (Ryder Cup 2026: 85 % ble effektivt ~72 % i cup-poenget).
 */

export type CupBestBallSidePlayer = { userId: string; courseHandicap: number };

export type CupBestBallAwardInput = {
  side1: CupBestBallSidePlayer[];
  side2: CupBestBallSidePlayer[];
  holes: Array<{ number: number; strokeIndex: number }>;
  scores: Array<{ userId: string; holeNumber: number; gross: number | null }>;
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

  const grossByKey = new Map<string, number | null>();
  for (const s of input.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const teamNetTotal = (side: CupBestBallSidePlayer[]) => {
    const holeRows = input.holes.map((hole) => {
      const players = side.map((p) => {
        const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
        const extraStrokes = strokesForHole(p.courseHandicap, hole.strokeIndex);
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
