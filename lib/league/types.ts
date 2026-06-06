// Shared domain types for the Liga (league) feature (#453, epic #452).
// Mirrors the cup layer: pure aggregation types live here so computeLeagueStandings,
// generateRounds and their tests import from one place, decoupled from DB rows.

/** Liga-format. Fase 1 er låst til slagspill ('stroke'). */
export type LeagueFormat = 'stroke';

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

/**
 * Konfig som styrer hvordan sesong-tabellen regnes ut. Hentes fra `leagues`-raden.
 * Fase 1 leser kun netto-mot-par, så `standingsModel` er 'total' eller 'average'.
 */
export type LeagueStandingsConfig = {
  standingsModel: Extract<StandingsModel, 'total' | 'average'>;
  missedRoundPolicy: MissedRoundPolicy;
  penaltyKind: PenaltyKind;
  /** Kun lest når penaltyKind === 'fixed'. Slag over par for en uteblitt runde. */
  penaltyFixedOverPar: number | null;
};

/** Én spillers tellende resultat i én runde (netto mot par). */
export type LeagueRoundPlayerScore = {
  userId: string;
  /** totalNetStrokes − par for tee. Lavere er bedre. */
  netToPar: number;
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
  /** null = spilte ikke runden. */
  netToPar: number | null;
  /** true = verdien er en straffescore (uteblitt runde under penalty-modellen). */
  penalised: boolean;
  deliveredOutsideWindow: boolean;
};

/** Én rad i sesong-tabellen. */
export type LeagueStandingRow = {
  userId: string;
  /** Rangerings-verdi (sum eller snitt av netto-mot-par). Lavere er bedre. */
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
