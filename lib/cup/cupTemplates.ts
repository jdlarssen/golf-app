/**
 * Cup-format-presets for templating-wizarden (#219, Ryder Cup fase 4).
 *
 * En preset er en ordnet liste av sesjoner. Hver sesjon har ett format. Innen
 * én sesjon spiller hver spiller maks én match; på tvers av sesjoner gjenbrukes
 * spillere (foursomes-økt → four-ball-økt → single-økt) — slik en ekte cup
 * (Ryder Cup / Presidents Cup) er bygd opp. Antall matcher per sesjon derives
 * fra lagstørrelse, så presetene skalerer fra 2-per-lag til klubb-skala.
 *
 * Roster forblir derivert fra matchene (se lib/cup/getCupSnapshot.ts) — sesjoner
 * er kun et genererings-tids-konsept og lagres ikke i databasen.
 */

export type CupSessionFormat =
  | 'foursomes_matchplay'
  | 'fourball_matchplay'
  | 'singles_matchplay'
  | 'greensome_matchplay'
  | 'chapman_matchplay'
  | 'gruesome_matchplay';

export type CupPreset = {
  id: string;
  /** Ordnede sesjoner — ett format per sesjon, i spille-rekkefølge. */
  sessions: CupSessionFormat[];
  /** Minste lagstørrelse (per lag) for at preset-en gir mening. */
  minPerTeam: number;
};

export type SessionPlan = {
  format: CupSessionFormat;
  matchCount: number;
};

/**
 * De tre innebygde presetene. «Tilpasset» finnes ikke her — den bygges som en
 * fri sesjonsliste i UI-et og mates rett inn i `generateCupPlan`.
 */
export const CUP_PRESETS: CupPreset[] = [
  {
    id: 'klassisk',
    sessions: ['foursomes_matchplay', 'fourball_matchplay', 'singles_matchplay'],
    minPerTeam: 2,
  },
  {
    id: 'fourball-singler',
    sessions: ['fourball_matchplay', 'singles_matchplay'],
    minPerTeam: 2,
  },
  {
    id: 'singler',
    sessions: ['singles_matchplay'],
    minPerTeam: 1,
  },
  {
    id: 'splittet-cup-dag',
    /**
     * #1441 (D4): denne presetens matcher genereres IKKE via `buildSessions` +
     * `generateCupPlan` som de tre over. Bunt-strukturen (greensome front9 +
     * best_ball back9-host + 2 avledede singles back9 per flight, samme fire
     * fysiske spillere hele runden) har ingen sesjons-på-tvers-av-hele-laget-
     * form — `generateSplitDayPlan` (cupPairing.ts) bygger den direkte per
     * flight i stedet. `sessions` her er ren dokumentasjon av hvilke
     * CupSessionFormat-medlemmer bunten inneholder (best_ball er bevisst
     * UTELATT — det er ikke medlem av CupSessionFormat, se
     * `PlannedBundleMatch`-kommentaren i cupPairing.ts for hvorfor). IKKE mat
     * denne inn i `buildSessions` — den ville produsert en meningsløs plan.
     */
    sessions: ['greensome_matchplay', 'singles_matchplay'],
    minPerTeam: 2,
  },
];

/**
 * Hvor mange matcher et format kan fylle gitt lagstørrelse. Singles bruker én
 * spiller per side (én match per spiller); 2v2-format bruker to per side, så
 * antallet er `floor(teamSize / 2)`.
 */
export function sessionMatchCount(format: CupSessionFormat, teamSize: number): number {
  if (format === 'singles_matchplay') return Math.max(0, teamSize);
  return Math.floor(teamSize / 2);
}

/** Én rad per økt for veiviserens matchantall-steppere (#1883). */
export type SessionCountRow = {
  /** Posisjon i input-lista — nøkkelen overstyringer adresseres med. */
  index: number;
  format: CupSessionFormat;
  /** Derivert antall for lagstørrelsen — stepperens tak. */
  derived: number;
  /** Klampet effektivt antall: override ∧ [1, derived]. */
  effective: number;
};

/**
 * Bygger radene for en (effektiv) lagstørrelse, med organisatorens
 * per-økt-overstyringer (#1883). Overstyringer er nøklet på posisjon i
 * `sessions` (samme format kan stå flere ganger i en tilpasset liste) og
 * klampes til [1, derivert] — aldri OPP forbi det lagene kan stille med.
 * Økter som ikke kan bemannes (derivert 0) droppes, override eller ei.
 * Ikke-endelige overstyringer ignoreres.
 */
export function buildSessionCountRows(
  sessions: CupSessionFormat[],
  teamSize: number,
  overrides: Readonly<Record<number, number>> = {},
): SessionCountRow[] {
  return sessions
    .map((format, index) => {
      const derived = sessionMatchCount(format, teamSize);
      const override = overrides[index];
      const effective =
        derived > 0 && typeof override === 'number' && Number.isFinite(override)
          ? Math.min(Math.max(1, Math.floor(override)), derived)
          : derived;
      return { index, format, derived, effective };
    })
    .filter((row) => row.derived > 0);
}

/**
 * Bygger den konkrete sesjonsplanen for en gitt (effektiv) lagstørrelse. Bruk
 * `min(lag1, lag2)` som `teamSize` på kall-siden. Sesjoner som ikke får plass
 * (matchCount 0) droppes. Valgfrie `overrides` (#1883) senker antallet per
 * økt — se `buildSessionCountRows` for klampe-regelen.
 */
export function buildSessions(
  sessions: CupSessionFormat[],
  teamSize: number,
  overrides?: Readonly<Record<number, number>>,
): SessionPlan[] {
  return buildSessionCountRows(sessions, teamSize, overrides).map((row) => ({
    format: row.format,
    matchCount: row.effective,
  }));
}
