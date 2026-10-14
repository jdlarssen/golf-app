// #2299: oppsummeringen øverst på scorekortet når alle hullene er ført.
//
// Ingen regel her er ny. Hver del spør stedet regelen bor:
//
//  - **Beste og verste hull, flighten og tallet som står først** er de delte
//    reglene i `lib/scorecard/roundSummary.ts`, klare for nettsidens
//    lever-side.
//  - **Plassen** er Hjem sin (`liveStanding`), som er tavlas. Da står samme
//    plass på kortet, på Hjem og på tavla.
//  - **Birdiene** telles av `countRoundAchievements`, samme regel som «Mine tall».
//  - **Ordene** for et slag bor i `strokeTermText.ts`, navnelistene i
//    `formatNameList`.
//
// Ren funksjon og ren tekst: ingen nett, ingen SQLite, ingen React. Skjermen
// har regnet ut radene og summene før den spør.
import { isSingleFlightGame } from '../../../../lib/games/flightScope';
import {
  flightRoundStatus,
  roundDoneHeadline,
  roundHighlights,
  type RoundHighlight,
} from '../../../../lib/scorecard/roundSummary';
import type { ScorecardGridTotals } from '../../../../lib/scorecard/scorecardGrid';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { countRoundAchievements } from '../../../../lib/stats/achievements';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import { formatNameList, shortDisplayName } from './display';
import { liveStanding } from './homeHero';
import { findInRoster, resolveFlight, toRoster } from './roster';
import type { ScorecardRow } from './scorecardRows';
import { SHORT_LABELS, TERM_LABELS } from './strokeTermText';

/** Appen fører bare hele runder (`formatGate`), så hull 18 er alltid det siste. */
const LAST_HOLE = 18;
const HOLE_NUMBERS = Array.from({ length: LAST_HOLE }, (_, i) => i + 1);

/**
 * Den faste teksten på kortet. Kickerne står i vanlig skrift her og i versaler
 * på skjermen (`textTransform`), som resten av appen: da leser VoiceOver ord,
 * ikke bokstaver.
 */
export const ROUND_DONE_TEXT = {
  kicker: `Hull ${LAST_HOLE} · runden er ferdig`,
  bestKicker: 'Dagens beste hull',
  worstKicker: 'Det som svidde',
  flightKicker: 'Flighten din',
  complete: 'Alle hull ført ✓',
  submitted: 'Har levert ✓',
  /** Det skjermleseren sier i stedet for ✓. */
  completeSpoken: 'har ført alle hull',
  submittedSpoken: 'har levert',
  review: 'Se over og lever scorekortet',
  back: `Tilbake til hull ${LAST_HOLE}`,
} as const;

export type RoundDoneHeadline = 'points' | 'net' | 'gross';

/** En rad under «Flighten din». */
export type RoundDoneFlightRow =
  | { kind: 'complete'; names: string }
  | { kind: 'submitted'; names: string }
  | { kind: 'missing'; userId: string; name: string; holes: number[]; firstHole: number };

export interface RoundDoneModel {
  greetingName: string;
  headline: { kind: RoundDoneHeadline; value: number };
  birdies: number;
  /** Plassen på tavla, eller `null` når tavla ikke viser den. */
  standing: { rank: number; tied: boolean } | null;
  best: RoundHighlight | null;
  worst: RoundHighlight | null;
  /** `null` når det ikke finnes en flight å vise. */
  flight: RoundDoneFlightRow[] | null;
}

/**
 * Oppsummeringen, eller `null` når kortet ikke skal stå: kortet kan ikke
 * leveres herfra (levert, trukket, runden er over), eller et hull mangler
 * slag. Da står scorekortet som før.
 *
 * `scores` er de lag-foldede slagene (til plassen, som Hjem), `localScores` de
 * rå (til flighten: eier-regelen folder selv, som i `flightDeliveryFor`).
 */
export function buildRoundDoneModel(opts: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
  localScores: readonly LocalScore[];
  userId: string;
  rows: readonly ScorecardRow[];
  totals: ScorecardGridTotals;
  revealActive: boolean;
  canSubmit: boolean;
  missing: number;
  teamMode: boolean;
}): RoundDoneModel | null {
  const { bundle, userId, totals } = opts;
  if (!opts.canSubmit || opts.missing > 0) return null;
  const roster = toRoster(bundle.players);
  const me = findInRoster(roster, userId);
  if (!me) return null;
  const mode = bundle.game.gameMode as GameMode;

  const shown = roundDoneHeadline(mode, opts.revealActive);
  const value = shown === 'points' ? totals.points : shown === 'net' ? totals.netto : totals.brutto;
  const headline =
    value === null ? { kind: 'gross' as const, value: totals.brutto } : { kind: shown, value };

  const holes = opts.rows.map((row) => ({
    holeNumber: row.holeNumber,
    strokes: row.strokes,
    par: row.par,
  }));
  const { best, worst } = roundHighlights(holes);

  // Tavla viser ingen plass i en blind runde eller i lagformatene; vakta sier
  // det her også, så ingen trenger å lese `computeLiveBoard` for å se det.
  const live =
    opts.revealActive || opts.teamMode ? null : liveStanding(bundle, opts.scores, userId);

  return {
    greetingName: shortDisplayName(me.player),
    headline,
    birdies: countRoundAchievements(holes).birdie,
    standing: live ? { rank: live.standing.rank, tied: live.standing.tied } : null,
    best,
    worst,
    flight: flightRows(opts),
  };
}

function flightRows(opts: {
  bundle: GameBundle;
  localScores: readonly LocalScore[];
  userId: string;
}): RoundDoneFlightRow[] | null {
  const { bundle, userId } = opts;
  const mode = bundle.game.gameMode as GameMode;
  const roster = toRoster(bundle.players);
  const me = findInRoster(roster, userId);
  if (!me) return null;
  // Uten flight i et stort felt er «flighten» hele feltet. Da sier lista
  // ingenting om dem du gikk med.
  if (me.flight_number == null && !isSingleFlightGame(mode, [...roster])) return null;
  const mates = resolveFlight(roster, mode, me).filter((entry) => entry.user_id !== userId);
  if (mates.length === 0) return null;

  const status = flightRoundStatus({
    players: bundle.players.map((player) => ({
      user_id: player.userId,
      team_number: player.teamNumber,
      withdrawn_at: player.withdrawnAt,
      submitted_at: player.submittedAt,
    })),
    mateIds: mates.map((entry) => entry.user_id),
    scores: opts.localScores.map((score) => ({
      user_id: score.userId,
      hole_number: score.holeNumber,
      strokes: score.strokes,
    })),
    mode,
    holeNumbers: HOLE_NUMBERS,
  });
  const nameOf = (id: string) => {
    const entry = mates.find((mate) => mate.user_id === id);
    return entry ? shortDisplayName(entry.player) : '';
  };

  const rows: RoundDoneFlightRow[] = [];
  if (status.complete.length > 0) {
    rows.push({ kind: 'complete', names: formatNameList(status.complete.map(nameOf)) });
  }
  if (status.submitted.length > 0) {
    rows.push({ kind: 'submitted', names: formatNameList(status.submitted.map(nameOf)) });
  }
  for (const { userId: id, holes } of status.missing) {
    rows.push({ kind: 'missing', userId: id, name: nameOf(id), holes, firstHole: holes[0] });
  }
  return rows;
}

/** «Godt spilt, Sigrid». */
export function greeting(name: string): string {
  return `Godt spilt, ${name}`;
}

/** Ordet under det første tallet. */
export function headlineUnit(kind: RoundDoneHeadline): string {
  return kind === 'points' ? 'poeng' : kind === 'net' ? 'netto' : 'slag';
}

export function birdieUnit(count: number): string {
  return count === 1 ? 'birdie' : 'birdier';
}

/** Tallet for plassen, «3.». Delt plass har samme tall og sier det i ordet under. */
export function placeNumber(standing: { rank: number }): string {
  return `${standing.rank}.`;
}

export function placeUnit(standing: { tied: boolean }): string {
  return standing.tied ? 'delt plass nå' : 'plass nå';
}

/** Det skjermleseren sier om plassen: «3. plass nå» eller «delt 3. plass nå». */
export function placeSpoken(standing: { rank: number; tied: boolean }): string {
  return `${standing.tied ? 'delt ' : ''}${placeNumber(standing)} plass nå`;
}

/**
 * Hullteksten under kickeren. Beste hull: «Hull 7 · birdie på par 3», «Hull 4 ·
 * par» eller «Hull 7 · hole-in-one». Verste: «Hull 13 · trippel», og fra +4
 * bare diffen, «Hull 13 · +4».
 */
export function highlightText(hole: RoundHighlight, which: 'best' | 'worst'): string {
  const prefix = `Hull ${hole.holeNumber} · `;
  if (hole.term === 'over') return `${prefix}+${hole.strokes - hole.par}`;
  if (which === 'worst') {
    return prefix + (SHORT_LABELS[hole.term] ?? TERM_LABELS[hole.term]).toLowerCase();
  }
  if (hole.holeInOne) return `${prefix}hole-in-one`;
  if (hole.term === 'par') return `${prefix}par`;
  return `${prefix}${TERM_LABELS[hole.term].toLowerCase()} på par ${hole.par}`;
}

/** «·» leses høyt av VoiceOver; komma gir en naturlig pause. */
export function spoken(text: string): string {
  return text.split(' · ').join(', ');
}

/** «Mangler hull 17», eller «Mangler hull 3 og 17». */
export function missingText(holes: readonly number[]): string {
  return `Mangler hull ${formatNameList(holes.map(String))}`;
}

/** Knappen på raden: «Jonas mangler hull 17. Åpne hull 17.» */
export function missingSpoken(row: { name: string; holes: readonly number[]; firstHole: number }): string {
  return `${row.name} mangler hull ${formatNameList(row.holes.map(String))}. Åpne hull ${row.firstHole}.`;
}
