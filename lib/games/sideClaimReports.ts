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

/** A raw `game_side_claims` row with the winner's name already looked up. */
export interface SideClaimReportRow {
  category: string;
  hole_number: number;
  flight_number: number;
  winner_user_id: string | null;
  /** `numeric(3,1)`: PostgREST sends a number, but a string would not surprise anyone. */
  distance_m: number | string | null;
  winner: PlayerNameParts | null;
}

/**
 * Maps the rows; a category this file does not know is left out instead of
 * guessed at (the CHECK holds it to the two).
 */
export function toSideClaimReports(rows: readonly SideClaimReportRow[]): SideClaimReport[] {
  return rows.flatMap((row) => {
    if (row.category !== 'closest_to_pin' && row.category !== 'longest_drive') return [];
    const distance = row.distance_m == null ? null : Number(row.distance_m);
    return [
      {
        category: row.category,
        holeNumber: row.hole_number,
        flightNumber: row.flight_number,
        winnerUserId: row.winner_user_id,
        winner: row.winner_user_id == null ? null : row.winner,
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
