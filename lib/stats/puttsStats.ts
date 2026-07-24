/**
 * Putte-statistikk for den personlige stats-huben (#939, #1290).
 *
 * To mål med ulik disiplin:
 *  - **PPH (putter per hull):** GATE-FRI. Sum av alle registrerte putt-verdier
 *    delt på antall hull som faktisk har en putt-verdi, på tvers av samtlige
 *    runder. Gir synlig utbytte fra aller første førte hull (#1290) — trenger
 *    ikke en komplett runde.
 *  - **Snitt/runde + beste + runder talt:** beholder komplett-18-disiplinen
 *    (kun runder med putt ført på ALLE 18 hull teller), så snittet ikke
 *    skjevtrekkes av halv-førte runder — samme regel som formkurven (#939).
 *
 * I tillegg regnes `nearMiss`: runder der spilleren har ført putt på noen, men
 * ikke alle spilte hull — grunnlaget for «du mangler N hull»-tomtilstanden.
 * En runde uten en eneste ført putt teller ingen steder (ingen mas om frivillig
 * statistikk).
 */

const COMPLETE_ROUND_HOLES = 18;

export interface PuttsRoundInput {
  /**
   * De registrerte putt-tallene for runden — ett element per hull som har en
   * putt-verdi (0 er en gyldig verdi, ikke en mangel). Lengde 18 = putts ført
   * på alle hull (kvalifiserer for snittet).
   */
  recordedPutts: number[];
  /**
   * Antall spilte hull i runden (hull med slag ført). Brukes til å avgjøre om
   * putt-føringen er delvis: 0 < førte hull < spilte hull ⇒ runden er «nesten».
   */
  playedHoles: number;
}

export interface PuttsNearMiss {
  /** Antall runder med delvis putt-føring (noen, men ikke alle spilte hull). */
  partialRounds: number;
  /** Sum av manglende hull over de delvise rundene. */
  missingHoles: number;
}

export interface PuttsStats {
  /**
   * Putter per hull, gate-fri: sum av alle putt-verdier / antall hull med
   * putt-verdi. Null når ingen putter er ført ennå.
   */
  pph: number | null;
  /** Antall hull med en putt-verdi, på tvers av alle runder. 0 ⇒ skjul panelet. */
  holesCounted: number;
  /** Antall kvalifiserende runder (alle 18 hull har en putt-verdi). */
  roundsCounted: number;
  /** Snitt totalt antall putter per kvalifiserende runde. Null når ingen kvalifiserer. */
  avgPuttsPerRound: number | null;
  /** Laveste totale putt-antall i en kvalifiserende runde. Null når ingen kvalifiserer. */
  bestRoundPutts: number | null;
  /** Grunnlaget for «nesten»-tomtilstanden (delvis førte runder). */
  nearMiss: PuttsNearMiss;
}

export function computePuttsStats(rounds: PuttsRoundInput[]): PuttsStats {
  let totalPutts = 0;
  let holesCounted = 0;
  let partialRounds = 0;
  let missingHoles = 0;
  const completeTotals: number[] = [];

  for (const round of rounds) {
    const puttedHoles = round.recordedPutts.length;
    // Ingen ført putt ⇒ ingen mas, intet bidrag noe sted (atferdsgate, #1290).
    if (puttedHoles === 0) continue;

    const roundSum = round.recordedPutts.reduce((acc, p) => acc + p, 0);
    totalPutts += roundSum;
    holesCounted += puttedHoles;

    // Snittet/beste teller kun komplette 18-hulls-runder (#939-disiplinen).
    if (puttedHoles === COMPLETE_ROUND_HOLES) {
      completeTotals.push(roundSum);
    }

    // Delvis: noen — men ikke alle — spilte hull har putt-verdi. En komplett
    // 9-hulls-runde (førte = spilte) er dermed IKKE delvis (ingen mas), men
    // kvalifiserer heller aldri for 18/18-snittet.
    if (puttedHoles < round.playedHoles) {
      partialRounds += 1;
      missingHoles += round.playedHoles - puttedHoles;
    }
  }

  const roundsCounted = completeTotals.length;
  const completeSum = completeTotals.reduce((acc, t) => acc + t, 0);

  return {
    pph: holesCounted === 0 ? null : totalPutts / holesCounted,
    holesCounted,
    roundsCounted,
    avgPuttsPerRound: roundsCounted === 0 ? null : completeSum / roundsCounted,
    bestRoundPutts: roundsCounted === 0 ? null : Math.min(...completeTotals),
    nearMiss: { partialRounds, missingHoles },
  };
}
