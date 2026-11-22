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
  /**
   * Brutto for den KOMPLETTE 18-hulls-runden med færrest slag over par; ved
   * likt mot par vinner laveste brutto. `null` hvis ingen. Målt mot par fordi
   * banene har ulik par: 58 på en par 54-bane er dårligere enn 74 på par 72
   * (audit 2026-11-20; par 3-baner kan lagres nå).
   */
  bestRound: number | null;
  achievements: Achievements;
};

/** Hull i en komplett runde. Eksportert så appen (#2256) ikke skriver av tallet. */
export const COMPLETE_ROUND_HOLES = 18;

/** En spilt score: ikke-null slag. */
function isPlayed(h: HoleScore): h is HoleScore & { strokes: number } {
  return h.strokes != null;
}

/**
 * Total brutto og par for en runde KUN hvis den er en komplett 18-hulls-runde
 * (nøyaktig 18 ikke-null slag). 9-hulls- og ufullstendige runder gir `null`,
 * så de blandes ikke inn i snitt/beste runde. (Bevisst — apples-to-apples.)
 */
function completeRoundTotal(round: RoundInput): { gross: number; par: number } | null {
  const played = round.holes.filter(isPlayed);
  if (played.length !== COMPLETE_ROUND_HOLES) return null;
  return {
    gross: played.reduce((sum, h) => sum + h.strokes, 0),
    par: played.reduce((sum, h) => sum + h.par, 0),
  };
}

/** Fewest strokes over par first; on a tie, the lower gross. */
function isBetterRound(
  a: { gross: number; par: number },
  b: { gross: number; par: number },
): boolean {
  const toParA = a.gross - a.par;
  const toParB = b.gross - b.par;
  return toParA !== toParB ? toParA < toParB : a.gross < b.gross;
}

export function computePlayerStats(rounds: RoundInput[]): MyStats {
  const achievements: Achievements = { ...EMPTY_ACHIEVEMENTS };
  const completeTotals: number[] = [];
  let best: { gross: number; par: number } | null = null;

  for (const round of rounds) {
    const total = completeRoundTotal(round);
    if (total != null) {
      completeTotals.push(total.gross);
      if (best == null || isBetterRound(total, best)) best = total;
    }

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
  const bestRound = best?.gross ?? null;

  return {
    roundsPlayed: rounds.length,
    grossAverage,
    bestRound,
    achievements,
  };
}
