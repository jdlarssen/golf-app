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
 * denne modulen er ren og I/O-fri (Type A, jf. `lib/scoring/AGENTS.md`).
 */

/** Ett hull i en runde. `strokes === null` ⇒ uspilt hull. `par` er allerede
 *  kjønns-valgt ved kallstedet. */
export type HoleScore = {
  holeNumber: number;
  strokes: number | null;
  par: number;
};

/** Én ferdig runde (ett ferdig spill spilleren er deltaker i). */
export type RoundInput = {
  holes: HoleScore[];
};

/** Livstids-antall per bragd, alle brutto mot kjønns-par. */
export type Achievements = {
  holeInOne: number;
  eagle: number;
  birdie: number;
  turkey: number;
  snowman: number;
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

/**
 * Antall ikke-overlappende «turkey»-vinduer i én runde: 3 sammenhengende hull
 * (stigende hull-nr, hver birdie-eller-bedre). Uspilt/manglende hull bryter
 * rekka. Teller per runde, aldri over rundegrenser.
 */
function countTurkeys(round: RoundInput): number {
  const qualifying = round.holes
    .filter((h) => isPlayed(h) && h.par > 0 && h.par - h.strokes! >= 1)
    .map((h) => h.holeNumber)
    .sort((a, b) => a - b);

  let turkeys = 0;
  let runLength = 0;
  let prevHole: number | null = null;
  for (const holeNumber of qualifying) {
    if (prevHole != null && holeNumber === prevHole + 1) {
      runLength += 1;
    } else {
      runLength = 1;
    }
    prevHole = holeNumber;
    if (runLength === 3) {
      turkeys += 1;
      runLength = 0; // non-overlapping window
    }
  }
  return turkeys;
}

export function computePlayerStats(rounds: RoundInput[]): MyStats {
  const achievements: Achievements = {
    holeInOne: 0,
    eagle: 0,
    birdie: 0,
    turkey: 0,
    snowman: 0,
  };

  const completeTotals: number[] = [];

  for (const round of rounds) {
    const total = completeRoundTotal(round);
    if (total != null) completeTotals.push(total);

    for (const h of round.holes) {
      if (!isPlayed(h)) continue;
      const strokes = h.strokes;
      if (strokes === 1) achievements.holeInOne += 1;
      if (strokes === 8) achievements.snowman += 1;
      if (h.par > 0) {
        const underPar = h.par - strokes;
        if (underPar >= 2) achievements.eagle += 1;
        else if (underPar === 1) achievements.birdie += 1;
      }
    }

    achievements.turkey += countTurkeys(round);
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
