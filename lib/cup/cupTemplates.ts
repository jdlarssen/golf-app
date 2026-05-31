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
  | 'singles_matchplay';

export type CupPreset = {
  id: string;
  /** Bruker-rettet norsk navn. */
  name: string;
  /** Kort norsk forklaring vist i wizarden. */
  description: string;
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
    name: 'Klassisk cup',
    description:
      'Foursomes, four-ball og singler — som en ekte Ryder Cup. Alle spiller flere matcher.',
    sessions: ['foursomes_matchplay', 'fourball_matchplay', 'singles_matchplay'],
    minPerTeam: 2,
  },
  {
    id: 'fourball-singler',
    name: 'Four-ball + singler',
    description: 'En four-ball-økt og en single-økt. Trenger ikke foursomes.',
    sessions: ['fourball_matchplay', 'singles_matchplay'],
    minPerTeam: 2,
  },
  {
    id: 'singler',
    name: 'Bare singler',
    description: 'Alle møter én motspiller. Funker uansett hvor mange dere er.',
    sessions: ['singles_matchplay'],
    minPerTeam: 1,
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

/**
 * Bygger den konkrete sesjonsplanen for en gitt (effektiv) lagstørrelse. Bruk
 * `min(lag1, lag2)` som `teamSize` på kall-siden. Sesjoner som ikke får plass
 * (matchCount 0) droppes.
 */
export function buildSessions(
  sessions: CupSessionFormat[],
  teamSize: number,
): SessionPlan[] {
  return sessions
    .map((format) => ({ format, matchCount: sessionMatchCount(format, teamSize) }))
    .filter((s) => s.matchCount > 0);
}
