// Shared domain types for the Liga (league) feature (#453, epic #452).
// Mirrors the cup layer: pure aggregation types live here so computeLeagueStandings,
// generateRounds and their tests import from one place, decoupled from DB rows.

/**
 * Liga-format (liga-globalt, ikke per runde).
 * - 'stroke' = slagspill: per-runde-verdi er mot-par, lavest best.
 * - 'stableford' / 'modified_stableford' = poeng-basert: per-runde-verdi er
 *   stableford-poeng, høyest best. Sesong-tabellen aggregeres retnings-bevisst
 *   (se `LeagueStandingsConfig.pointsBased` + `computeLeagueStandings`). Fase 4 (#452).
 */
export type LeagueFormat = 'stroke' | 'stableford' | 'modified_stableford';

/** Visning av sesong-tabellen. Fase 1 bruker 'net'. */
export type LeagueScoring = 'net' | 'gross' | 'both';

/** Hvordan sesongen rangeres. Fase 1 bruker 'total' + 'average'. */
export type StandingsModel = 'total' | 'average' | 'best_n' | 'points';

/** Hvordan en manglende runde håndteres under 'total'-modellen. */
export type MissedRoundPolicy = 'penalty' | 'must_play_all';

/** Straffescore-variant for manglende runde. */
export type PenaltyKind = 'worst_plus_one' | 'fixed';

/** Bane-omfang-trappen — styrer hva som velges per runde. */
export type CourseScope =
  | 'single_course_single_tee'
  | 'single_course'
  | 'multi_course';

export type LeagueStatus = 'draft' | 'active' | 'finished';

/** Frekvens for auto-generering av runde-vinduer. */
export type RoundFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom';

// ── computeLeagueStandings: pure aggregator ────────────────────────────────────

/** Hvilket tall sesong-tabellen rangeres på. 'both' regner begge parallelt. */
export type StandingsMetric = 'net' | 'gross';

/**
 * Konfig som styrer hvordan sesong-tabellen regnes ut. Hentes fra `leagues`-raden.
 * Fase 2b støtter alle fire modellene: 'total', 'average', 'best_n' og 'points'.
 */
export type LeagueStandingsConfig = {
  standingsModel: StandingsModel;
  missedRoundPolicy: MissedRoundPolicy;
  penaltyKind: PenaltyKind;
  /** Kun lest når penaltyKind === 'fixed'. Slag over par for en uteblitt runde. */
  penaltyFixedOverPar: number | null;
  /** Antall beste runder som teller. Kun lest under 'best_n'. */
  bestNCount: number | null;
};

/**
 * Én spillers tellende per-runde-verdi, på netto- og brutto-aksen. Tallets
 * betydning og retning følger liga-formatet (se `LeagueFormat`):
 *  - slagspill: mot-par (totalStrokes − par), lavest best;
 *  - stableford: stableford-poeng, høyest best (kun netto; brutto speiler netto
 *    siden poeng-ligaer rangeres netto-only).
 * Retningen styres av `LeagueStandingsConfig.pointsBased`, ikke av feltnavnet.
 */
export type LeagueRoundPlayerScore = {
  userId: string;
  /** Per-runde-verdi på netto-aksen (mot-par for slagspill, poeng for stableford). */
  net: number;
  /** Per-runde-verdi på brutto-aksen. Speiler `net` for stableford (netto-only). */
  gross: number;
  /** Flagget når flighten ble levert utenfor opprinnelig vindu (admin-override). */
  deliveredOutsideWindow: boolean;
};

/** En runde med alle tellende spiller-resultater. */
export type LeagueRoundInput = {
  roundId: string;
  sequence: number;
  scores: LeagueRoundPlayerScore[];
};

/** Én celle i sesong-tabellen — en spillers resultat i én runde. */
export type LeagueStandingCell = {
  roundId: string;
  /**
   * Rå per-runde-verdi på aktiv akse (mot-par for slagspill, poeng for
   * stableford). null = spilte ikke runden. Formateres format-bevisst i display.
   */
  value: number | null;
  /** Poeng spilleren fikk denne runden under 'points'-modellen. null ellers / ikke spilt. */
  points: number | null;
  /** true = verdien er en straffescore (uteblitt runde under penalty-modellen). */
  penalised: boolean;
  deliveredOutsideWindow: boolean;
};

/** Én rad i sesong-tabellen. */
export type LeagueStandingRow = {
  userId: string;
  /** Rangerings-verdi. Mot-par-modellene: lavere er bedre. Points-modellen: høyere er bedre. */
  value: number;
  roundsPlayed: number;
  /** false når 'must_play_all' og spilleren mangler en runde → sorteres nederst. */
  ranked: boolean;
  /** 1-basert plassering blant rangerte. null for ikke-rangerte. */
  rank: number | null;
  perRound: LeagueStandingCell[];
};

export type LeagueStandings = {
  rows: LeagueStandingRow[];
};

/** Sesong-tabeller per scoring. Én er null når ligaen ikke regner det tallet. */
export type LeagueStandingsByScoring = {
  net: LeagueStandings | null;
  gross: LeagueStandings | null;
};
