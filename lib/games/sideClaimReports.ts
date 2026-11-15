/**
 * What the flights reported for one side-contest slot, as the organiser reads
 * it before picking the winner (#2283): the finish page on the web and the
 * finish screen in the app both show «Meldt inn fra flightene» from this, so
 * the order, the names and the flights that have not reported cannot differ.
 * The flights report; the organiser still picks the winner
 * (`game_side_winners`). Nothing here fills the choice in.
 *
 * Relative imports only: the app imports this file from `native/app/src/`.
 */

import { sortClaimsForHole, type SideContestCategory } from './sideContest';
import { playerShortName, type PlayerNameParts } from '../names/playerName';

/** One flight's report on one hole, as the finish reads it. `winnerUserId: null` = «Ingen på green/fairway». */
export interface SideClaimReport {
  category: SideContestCategory;
  holeNumber: number;
  /** The key the flight reported under: 0 in a single-flight game (`claimFlightKeys`). */
  flightNumber: number;
  winnerUserId: string | null;
  /** The winner's name raw, null when nobody won; which one shows is decided in `reportsForSlot`. */
  winner: PlayerNameParts | null;
  distanceM: number | null;
}

/** A raw claim row: `game_side_claims` itself, or what `side_claims_for_finish` returns. */
export interface SideClaimReportRow {
  category: string;
  hole_number: number;
  flight_number: number;
  winner_user_id: string | null;
  /** `numeric(3,1)`: PostgREST sends a number, but a string would not surprise anyone. */
  distance_m: number | string | null;
}

/**
 * Maps the rows; a category this file does not know is left out instead of
 * guessed at (the CHECK holds it to the two). The one part the two readers
 * cannot share is where the winner's name comes from: the web looks it up in
 * the roster, the app's rpc sends it with the row. `winnerName` is asked only
 * for a row that has a winner.
 */
export function toSideClaimReports<R extends SideClaimReportRow>(
  rows: readonly R[],
  winnerName: (winnerUserId: string, row: R) => PlayerNameParts,
): SideClaimReport[] {
  return rows.flatMap((row) => {
    if (row.category !== 'closest_to_pin' && row.category !== 'longest_drive') return [];
    const distance = row.distance_m == null ? null : Number(row.distance_m);
    return [
      {
        category: row.category,
        holeNumber: row.hole_number,
        flightNumber: row.flight_number,
        winnerUserId: row.winner_user_id,
        winner: row.winner_user_id == null ? null : winnerName(row.winner_user_id, row),
        distanceM: distance != null && Number.isFinite(distance) ? distance : null,
      },
    ];
  });
}

/** The slot a report is read for: its category and the hole it is played on (null = organiser chose none). */
export interface ReportSlot {
  category: SideContestCategory;
  hole: number | null;
}

/** One flight's answer on the slot's hole. `name: null` = «Ingen på green/fairway». */
export interface ReportedLine {
  flightNumber: number;
  name: string | null;
  distanceM: number | null;
}

export interface SlotReports {
  hole: number;
  /** The shortest distance first, answers without one last (`sortClaimsForHole`). */
  lines: ReportedLine[];
  /** The flights that have not reported on the hole. */
  missingFlights: number[];
}

/**
 * What the flights reported for a slot, or `null` when the slot has no hole
 * (then the choice is as before). The reports are keyed on category and hole,
 * not on the slot's position. The winner shows with the first name, or the
 * full name when someone else in the game shares that first name
 * (`playerShortName`, #2286), since the list under the box shows full names.
 *
 * @param flights every key a flight reports under (`claimFlightKeys`), so a
 *   flight that has not reported is named even though it has no row.
 * @param roster everyone in the game, withdrawn players included: a shared
 *   first name counts there too.
 */
export function reportsForSlot(
  slot: ReportSlot,
  claims: readonly SideClaimReport[],
  flights: readonly number[],
  roster: readonly { userId: string; name: string | null }[],
): SlotReports | null {
  if (slot.hole === null) return null;
  const forHole = claims.filter((c) => c.category === slot.category && c.holeNumber === slot.hole);
  const reported = new Set(forHole.map((c) => c.flightNumber));
  return {
    hole: slot.hole,
    lines: sortClaimsForHole(forHole).map((c) => ({
      flightNumber: c.flightNumber,
      name:
        c.winnerUserId === null
          ? null
          : (playerShortName(
              c.winner,
              roster.filter((p) => p.userId !== c.winnerUserId).map((p) => p.name),
            ) ?? ''),
      distanceM: c.distanceM,
    })),
    missingFlights: flights.filter((f) => !reported.has(f)),
  };
}

/** What the box «Meldt inn fra flightene» under a side-contest select shows. */
export type ReportedBoxView =
  /** The read did not work: one sentence, and the organiser picks as before. */
  | { kind: 'failed' }
  /** No flight has answered: one sentence naming the hole, and the flights are not named. */
  | { kind: 'none'; hole: number }
  /** One line per answer, then the flights that have not answered. */
  | { kind: 'lines'; lines: ReportedLine[]; missingFlights: number[] };

/**
 * The two rules of the box (AGENTS.md trap 4: a rule has one home): a flight
 * that has not reported is only worth naming once some flight has (so
 * `missingFlights` is only carried with lines), and when none has, the box is
 * the one sentence instead of a list of every flight. «Ingen på green» is an
 * answer: it opens the list of missing flights. The web's finish pages and the
 * app's winner sheet only render what this returns.
 */
/**
 * The one rule both report boxes follow, the finish's flights and the cup's
 * matches (`slotBoxView` in lib/cup/cupSideReports.ts): with no answer the box
 * is one sentence, and the senders that have not reported only show beside at
 * least one answer.
 */
export function answersOrNone<L, M>(
  lines: readonly L[],
  missing: readonly M[],
): { kind: 'none' } | { kind: 'lines'; lines: readonly L[]; missing: readonly M[] } {
  return lines.length === 0 ? { kind: 'none' } : { kind: 'lines', lines, missing };
}

export function reportedBoxView(reports: SlotReports | 'failed'): ReportedBoxView {
  if (reports === 'failed') return { kind: 'failed' };
  const view = answersOrNone(reports.lines, reports.missingFlights);
  if (view.kind === 'none') return { kind: 'none', hole: reports.hole };
  return { kind: 'lines', lines: reports.lines, missingFlights: reports.missingFlights };
}
