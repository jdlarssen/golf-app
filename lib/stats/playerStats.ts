/**
 * Personlige «Mine tall» — ren aggregering av en spillers egne brutto-scorer (#865).
 *
 * I motsetning til den globale tavla (`clubStats.ts`, som leser modus-riktige
 * `result_summary`) er dette rent **brutto**: handicap-uavhengig, universelt, og
 * trygt for alle 22 spillemodi (en birdie er en birdie uansett format). Netto er
 * historikkens domene (#866), ikke her.
 *
 * Kallstedet velger riktig par per hull per spillerens `tee_gender`
 * (`par_mens`/`par_ladies`/`par_juniors`) FØR det sender inn `RoundInput`, så
 * denne modulen er ren og I/O-fri (Type A, jf. `lib/scoring/AGENTS.md`). Selve
 * bragd-tellingen bor i `./achievements` (delt med sesong-recap, #946).
 */
import {
  countRoundAchievements,
  EMPTY_ACHIEVEMENTS,
  type Achievements,
  type HoleScore,
} from './achievements';

// Re-eksportert for bakoverkompat — eksisterende kallflater (og tester)
// importerer disse fra `./playerStats`.
export type { Achievements, HoleScore };

/** Én ferdig runde (ett ferdig spill spilleren er deltaker i). */
export type RoundInput = {
  holes: HoleScore[];
};

export type MyStats = {
  /** Antall ferdige runder (paritet med /profile/historikk — teller alle,
   *  også uten registrerte scorer og trukne, for å unngå avvik mot historikken). */
  roundsPlayed: number;
  /** Snitt total brutto over KOMPLETTE 18-hulls-runder, avrundet. `null` hvis ingen. */
  grossAverage: number | null;
  /** Laveste total brutto over KOMPLETTE 18-hulls-runder. `null` hvis ingen. */
  bestRound: number | null;
  achievements: Achievements;
};

const COMPLETE_ROUND_HOLES = 18;

/** En spilt score: ikke-null slag. */
function isPlayed(h: HoleScore): h is HoleScore & { strokes: number } {
  return h.strokes != null;
}

/**
 * Total brutto for en runde KUN hvis den er en komplett 18-hulls-runde
 * (nøyaktig 18 ikke-null slag). 9-hulls- og ufullstendige runder gir `null`,
 * så de blandes ikke inn i snitt/beste runde. (Bevisst — apples-to-apples.)
 */
function completeRoundTotal(round: RoundInput): number | null {
  const played = round.holes.filter(isPlayed);
  if (played.length !== COMPLETE_ROUND_HOLES) return null;
  return played.reduce((sum, h) => sum + h.strokes, 0);
}

export function computePlayerStats(rounds: RoundInput[]): MyStats {
  const achievements: Achievements = { ...EMPTY_ACHIEVEMENTS };
  const completeTotals: number[] = [];

  for (const round of rounds) {
    const total = completeRoundTotal(round);
    if (total != null) completeTotals.push(total);

    const a = countRoundAchievements(round.holes);
    achievements.holeInOne += a.holeInOne;
    achievements.eagle += a.eagle;
    achievements.birdie += a.birdie;
    achievements.turkey += a.turkey;
    achievements.snowman += a.snowman;
  }

  const grossAverage =
    completeTotals.length > 0
      ? Math.round(
          completeTotals.reduce((a, b) => a + b, 0) / completeTotals.length,
        )
      : null;
  const bestRound =
    completeTotals.length > 0 ? Math.min(...completeTotals) : null;

  return {
    roundsPlayed: rounds.length,
    grossAverage,
    bestRound,
    achievements,
  };
}
