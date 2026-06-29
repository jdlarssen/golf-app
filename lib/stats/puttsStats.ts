/**
 * Putte-snitt for den personlige stats-huben (#939). Et minste meningsfullt
 * mål: gjennomsnittlig antall putter per komplett runde. Holder samme
 * komplett-18-disiplin som formkurven og per-bane-rollupen (`/profile/historikk`)
 * — bare runder med putts registrert på ALLE 18 hull teller, så snittet ikke
 * skjevtrekkes av halv-førte runder.
 */

const COMPLETE_ROUND_HOLES = 18;

export interface PuttsRoundInput {
  /**
   * De registrerte putt-tallene for runden — ett element per hull som faktisk
   * har en putt-verdi. Lengde 18 = putts ført på alle hull (kvalifiserer);
   * kortere = runden hoppes over.
   */
  recordedPutts: number[];
}

export interface PuttsStats {
  /** Antall kvalifiserende runder (alle 18 hull har en putt-verdi). */
  roundsCounted: number;
  /** Snitt totalt antall putter per kvalifiserende runde. Null når ingen kvalifiserer. */
  avgPuttsPerRound: number | null;
  /** Laveste totale putt-antall i en kvalifiserende runde. Null når ingen kvalifiserer. */
  bestRoundPutts: number | null;
}

export function computePuttsStats(rounds: PuttsRoundInput[]): PuttsStats {
  const totals = rounds
    .filter((r) => r.recordedPutts.length === COMPLETE_ROUND_HOLES)
    .map((r) => r.recordedPutts.reduce((acc, p) => acc + p, 0));

  if (totals.length === 0) {
    return { roundsCounted: 0, avgPuttsPerRound: null, bestRoundPutts: null };
  }

  const sum = totals.reduce((acc, t) => acc + t, 0);
  return {
    roundsCounted: totals.length,
    avgPuttsPerRound: sum / totals.length,
    bestRoundPutts: Math.min(...totals),
  };
}
