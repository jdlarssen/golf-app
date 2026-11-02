import type { WizardPlayer } from './getCupCandidatePlayers';
import type { CupBatchMatch } from './insertCupMatches';
import {
  CUP_PRESETS,
  buildSessionCountRows,
  buildSessions,
  type CupSessionFormat,
  type SessionCountRow,
  type SessionPlan,
} from './cupTemplates';
import {
  generateCupPlan,
  generateSplitDayPlan,
  type CupPlayer,
  type PairingStrategy,
  type PlannedBundleMatch,
  type PlannedMatch,
  type Rng,
} from './cupPairing';
import { splitDayTotalMatches } from './splitDayLineup';
import { getRatingForGender, type TeeBoxRatings } from '../games/teeRating';
import { teeGenderOf } from '../games/teeGender';
import { calculateCourseHandicap } from '../scoring/courseHandicap';
import { greensomeTeamHandicap } from '../scoring/modes/greensomeMatchplay';

/**
 * Det rene i «Fordel & generer» (#2752): hvor mange matcher et oppsett gir, planen
 * av matcher, og hva som faktisk sendes inn. Nettets veiviser og appen kaller begge
 * disse funksjonene, så de to ikke kan regne ulikt. Ingenting her leser eller skriver.
 */

/** Matchen veiviseren holder i steg 2: aldri en blanding innen samme plan. */
export type PlanMatch = PlannedMatch | PlannedBundleMatch;

export type TeamAssignment = 'team1' | 'team2' | 'unassigned';

export type WizardTeeBox = {
  id: string;
  name: string;
  slope_mens?: number | null;
  course_rating_mens?: number | null;
  par_total_mens?: number | null;
  slope_ladies?: number | null;
  course_rating_ladies?: number | null;
  par_total_ladies?: number | null;
  slope_juniors?: number | null;
  course_rating_juniors?: number | null;
  par_total_juniors?: number | null;
};

/** Greensomens manuelle lag-slag per match-id, som rå tekst. Urørt felt mangler. */
export type TeamStrokesInputs = Record<string, { team1?: string; team2?: string }>;

/** Oppsettet fra den lagrede planen, det samme på begge flater. */
export type MatchPlanSetup = {
  presetId: string;
  customSessions: CupSessionFormat[];
  strategy: PairingStrategy;
};

export const SPLIT_DAY_PRESET_ID = 'splittet-cup-dag';

export function isSplitDayPreset(presetId: string): boolean {
  return presetId === SPLIT_DAY_PRESET_ID;
}

/** Bygger `TeeBoxRatings` fra en `WizardTeeBox`: `getRatingForGender` vil ha `null`, ikke `undefined`. */
function teeRatingsOf(tee: WizardTeeBox): TeeBoxRatings {
  return {
    slope_mens: tee.slope_mens ?? null,
    course_rating_mens: tee.course_rating_mens ?? null,
    par_total_mens: tee.par_total_mens ?? null,
    slope_ladies: tee.slope_ladies ?? null,
    course_rating_ladies: tee.course_rating_ladies ?? null,
    par_total_ladies: tee.par_total_ladies ?? null,
    slope_juniors: tee.slope_juniors ?? null,
    course_rating_juniors: tee.course_rating_juniors ?? null,
    par_total_juniors: tee.par_total_juniors ?? null,
  };
}

/**
 * Spillehandicap-regnehjelp for greensomens manuelle lag-slag (#1441, D10):
 * arrangørens egen formel (40 % av høyeste spillers spillehandicap) trenger
 * hver spillers FULLE spillehandicap på valgt tee som utgangspunkt — ikke en
 * allowance-redusert versjon (allowance-feltet er irrelevant når
 * team_strokes_override erstatter formelen helt). Returnerer `null` når
 * valgt tee mangler ratingsett for spillerens kjønn — kalleren faller da
 * tilbake til å vise rå HCP-indeks i stedet.
 */
export function computeSpillehandicap(player: WizardPlayer, tee: WizardTeeBox | undefined): number | null {
  if (!tee) return null;
  const gender = teeGenderOf(player.gender ?? null);
  const rating = getRatingForGender(teeRatingsOf(tee), gender);
  if (!rating) return null;
  return calculateCourseHandicap({
    hcpIndex: player.hcpIndex,
    slope: rating.slope,
    courseRating: rating.courseRating,
    par: rating.par,
  });
}

/**
 * Standardforslag for greensomens manuelle lag-slag (#1441 owner-QA: «bør
 * være ferdigplottet inn hvor mange slag de ulike har. Ikke at de står
 * tomme.»). Samme 60/40-formel motoren selv bruker for greensome
 * (`greensomeTeamHandicap`, lib/scoring/modes/greensomeMatchplay.ts) —
 * KALT VIDERE her, aldri reimplementert (avrunding inkludert). Hver spillers
 * verdi er spillehandicapet på valgt tee, eller rå HCP-indeks som fallback
 * når tee mangler ratingsett for spillerens kjønn.
 *
 * KUN et forslag: feltet forblir fritt redigerbart, og en arrangørs egen formel
 * (f.eks. 40 % av høyeste) skriver rett over denne verdien uten noen ekstra
 * bekreftelse (D10 — «manual strokes override»).
 */
function greensomeTeamStrokesDefault(
  playerA: WizardPlayer,
  playerB: WizardPlayer,
  tee: WizardTeeBox | undefined,
): number {
  const a = computeSpillehandicap(playerA, tee) ?? playerA.hcpIndex;
  const b = computeSpillehandicap(playerB, tee) ?? playerB.hcpIndex;
  return greensomeTeamHandicap(a, b);
}

/** Defensivt fallback (0) når paret ikke har nøyaktig to spillere — kan ikke
 * skje med gyldig bunt-output (`generateSplitDayPlan` gir alltid par av 2),
 * men holder skjermen fra å krasje på malformed data. */
export function greensomeDefaultOrFallback(pair: WizardPlayer[], tee: WizardTeeBox | undefined): number {
  if (pair.length !== 2) return 0;
  return greensomeTeamStrokesDefault(pair[0], pair[1], tee);
}

/**
 * Effektiv verdi for ETT lags manuelle lag-slag-felt (#1441 owner-QA, D10):
 * `raw === undefined` betyr feltet aldri er rørt av organisatoren → viser
 * (og sender) det live-utledede forslaget fra `greensomeDefaultOrFallback`,
 * som oppdaterer seg selv når spillerne i flighten endres (oppstillings-
 * editoren, `swapFlightPlayer`). Tomt eller ugyldig innhold ETTER at feltet
 * ER rørt faller ALLEREDE tilbake til samme forslag — «what you see is what
 * the engine uses» skal aldri kunne divergere fra hva som faktisk sendes inn.
 */
export function effectiveStrokes(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function playerLookup(team1Players: WizardPlayer[], team2Players: WizardPlayer[]) {
  const byId = new Map<string, WizardPlayer>();
  for (const p of [...team1Players, ...team2Players]) byId.set(p.id, p);
  return (userId: string) => byId.get(userId);
}

function minPerTeamOf(presetId: string): number {
  return CUP_PRESETS.find((p) => p.id === presetId)?.minPerTeam ?? 1;
}

function effectiveSessions(setup: MatchPlanSetup): CupSessionFormat[] {
  if (setup.presetId === 'tilpasset') return setup.customSessions;
  return CUP_PRESETS.find((p) => p.id === setup.presetId)?.sessions ?? [];
}

export function sessionCountRowsFor(
  setup: MatchPlanSetup,
  team1Count: number,
  team2Count: number,
  overrides: Record<number, number>,
): SessionCountRow[] {
  return buildSessionCountRows(effectiveSessions(setup), Math.min(team1Count, team2Count), overrides);
}

function sessionPlanFor(
  setup: MatchPlanSetup,
  team1Count: number,
  team2Count: number,
  overrides: Record<number, number>,
): SessionPlan[] {
  return buildSessions(effectiveSessions(setup), Math.min(team1Count, team2Count), overrides);
}

/** Antall matcher oppsettet gir med gjeldende lag-fordeling. */
export function plannedMatchTotal(
  setup: MatchPlanSetup,
  team1Count: number,
  team2Count: number,
  overrides: Record<number, number>,
): number {
  if (isSplitDayPreset(setup.presetId)) return splitDayTotalMatches(team1Count, team2Count);
  return sessionPlanFor(setup, team1Count, team2Count, overrides).reduce((sum, s) => sum + s.matchCount, 0);
}

/** Hvorfor «Neste» ikke går ennå. `null`: ingenting stopper det. */
export type RosterBlock =
  | { kind: 'team_min'; side: 'team1' | 'team2'; minPerTeam: number }
  | { kind: 'zero_matches' }
  | null;

export function rosterBlock(
  setup: MatchPlanSetup,
  team1Count: number,
  team2Count: number,
  plannedTotal: number,
): RosterBlock {
  const minPerTeam = minPerTeamOf(setup.presetId);
  if (team1Count < minPerTeam) return { kind: 'team_min', side: 'team1', minPerTeam };
  if (team2Count < minPerTeam) return { kind: 'team_min', side: 'team2', minPerTeam };
  if (plannedTotal === 0) return { kind: 'zero_matches' };
  return null;
}

/** Minst `minPerTeam` per lag, minst én match, og for personlig cup under match-taket. */
export function canAdvanceRoster(
  setup: MatchPlanSetup,
  team1Count: number,
  team2Count: number,
  plannedTotal: number,
  matchCap: number | undefined,
): boolean {
  if (rosterBlock(setup, team1Count, team2Count, plannedTotal) !== null) return false;
  return matchCap === undefined || plannedTotal <= matchCap;
}

/**
 * Nedjusteringene etter et trykk på en stepper. Tilbake på derivert tak = INGEN
 * overstyring. Lagret vi den likevel, ble økta pinnet til lagstørrelsen den ble satt
 * ved: organisatoren som prøver stepperen på halvfordelte lag og fordeler resten
 * etterpå, ville fått singel-økta stående på det gamle tallet i stedet for å følge
 * det voksende laget.
 */
export function adjustedSessionOverrides(
  prev: Record<number, number>,
  row: SessionCountRow,
  delta: 1 | -1,
): Record<number, number> {
  const next = Math.min(Math.max(1, row.effective + delta), row.derived);
  if (next >= row.derived) {
    const { [row.index]: _atCeiling, ...rest } = prev;
    return rest;
  }
  return { ...prev, [row.index]: next };
}

function toCupPlayer(p: WizardPlayer): CupPlayer {
  return { userId: p.id, name: p.displayName, hcpIndex: p.hcpIndex };
}

/** Planen av matcher fra lag-fordelingen. `rng` er for deterministiske tester. */
export function generateMatchPlan(input: {
  setup: MatchPlanSetup;
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
  overrides: Record<number, number>;
  rng?: Rng;
}): PlanMatch[] {
  const { setup, team1Players, team2Players, overrides, rng } = input;
  const team1 = team1Players.map(toCupPlayer);
  const team2 = team2Players.map(toCupPlayer);
  if (isSplitDayPreset(setup.presetId)) {
    return generateSplitDayPlan({ team1, team2, strategy: setup.strategy, rng });
  }
  return generateCupPlan({
    team1,
    team2,
    sessions: sessionPlanFor(setup, team1Players.length, team2Players.length, overrides),
    strategy: setup.strategy,
    rng,
  });
}

/** Bytter én plass i forhåndsvisningen av de vanlige oppsettene. */
export function changeMatchPlayer(
  matches: PlanMatch[],
  matchId: string,
  side: 'side1' | 'side2',
  idx: number,
  userId: string,
): PlanMatch[] {
  return matches.map((m) => {
    if (m.id !== matchId) return m;
    const arr = side === 'side1' ? [...m.side1] : [...m.side2];
    arr[idx] = userId;
    return side === 'side1' ? { ...m, side1: arr } : { ...m, side2: arr };
  });
}

/**
 * Bygger den faktiske innsendingen (#1441, D10 + owner-QA F3d): matchene som de er,
 * pluss `teamStrokesOverride` på hver greensome-match — ALLTID satt (D10-oppdatering):
 * «what you see is what the engine uses» betyr feltet sender akkurat den effektive
 * verdien skjermen viste (typet forslag ELLER organisatorens eget tall —
 * `effectiveStrokes` er samme logikk begge steder), aldri lenger «ingen override, la
 * motoren regne selv ved runde-start».
 */
export function buildSubmissionMatches(input: {
  presetId: string;
  matches: PlanMatch[];
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
  selectedTee: WizardTeeBox | undefined;
  teamStrokesInputs: TeamStrokesInputs;
}): CupBatchMatch[] {
  const { presetId, matches, team1Players, team2Players, selectedTee, teamStrokesInputs } = input;
  if (!isSplitDayPreset(presetId)) return matches as CupBatchMatch[];
  const lookup = playerLookup(team1Players, team2Players);
  return (matches as PlannedBundleMatch[]).map((m) => {
    if (m.format !== 'greensome_matchplay') return m;
    const side1Players = m.side1.map(lookup).filter((p): p is WizardPlayer => Boolean(p));
    const side2Players = m.side2.map(lookup).filter((p): p is WizardPlayer => Boolean(p));
    const default1 = greensomeDefaultOrFallback(side1Players, selectedTee);
    const default2 = greensomeDefaultOrFallback(side2Players, selectedTee);
    const raw = teamStrokesInputs[m.id];
    const team1 = effectiveStrokes(raw?.team1, default1);
    const team2 = effectiveStrokes(raw?.team2, default2);
    return { ...m, teamStrokesOverride: { team1, team2 } };
  });
}
