/**
 * Startlista (#2289): the flights as cards side by side, and where a selected
 * player can be moved. The organiser taps a player, then the flight.
 *
 * Import-pure on purpose (no Supabase, no `server-only`, no `Intl`), like
 * `flightScope.ts`: the app imports it by path in the parity work (#1954).
 * The numbers are raw here; the surfaces format them (`formatHcpDisplay`).
 */

import { MAX_FLIGHT_SIZE, flightBuckets, type FlightPlayer } from './flightScope';

/** A roster row with the player's stored, signed index (plus is negative). */
export type StartlistPlayer = FlightPlayer & { hcpIndex: number };

export type StartlistFlight<T extends StartlistPlayer = StartlistPlayer> = {
  number: number;
  /** In the order the caller passed them in (signup order on the page). */
  members: T[];
  /** Unrounded mean of the signed indexes; `null` for an empty flight. */
  avgHcpIndex: number | null;
  full: boolean;
};

export type Startlist<T extends StartlistPlayer = StartlistPlayer> = {
  /** Flights with at least one active player, by number. */
  flights: StartlistFlight<T>[];
  /** Active players without a flight. Never a move target. */
  unassigned: T[];
  activeCount: number;
};

/** The mean of the members' signed indexes, unrounded; `null` when empty. */
export function averageHcpIndex(members: readonly Pick<StartlistPlayer, 'hcpIndex'>[]): number | null {
  if (members.length === 0) return null;
  return members.reduce((sum, m) => sum + m.hcpIndex, 0) / members.length;
}

/**
 * Groups the active players into flights (withdrawn ones are out, as in
 * `flightBuckets`) and the «Uten flight» list.
 */
export function buildStartlist<T extends StartlistPlayer>(players: readonly T[]): Startlist<T> {
  const { assigned, unassigned } = flightBuckets(players);
  const flights = [...assigned.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, members]) => ({
      number,
      members,
      avgHcpIndex: averageHcpIndex(members),
      full: members.length >= MAX_FLIGHT_SIZE,
    }));
  const activeCount = unassigned.length + flights.reduce((n, f) => n + f.members.length, 0);
  return { flights, unassigned, activeCount };
}

/**
 * The flight numbers a player can be put in: `1..ceil(active / MAX_FLIGHT_SIZE) + 1`
 * (one empty flight more, so 3+3 is possible instead of 4+2), plus any used
 * flight above that. Sorted, no duplicates. The one home for this rule: the
 * Startlista and the waiting-room picker read it.
 */
export function offeredFlightNumbers(activeCount: number, usedFlights: Iterable<number>): number[] {
  const upTo = Math.ceil(activeCount / MAX_FLIGHT_SIZE) + 1;
  const numbers = new Set<number>(Array.from({ length: upTo }, (_, i) => i + 1));
  for (const n of usedFlights) numbers.add(n);
  return [...numbers].sort((a, b) => a - b);
}

/**
 * The flights `userId` can be moved to: the offered numbers minus the
 * player's own flight and the full ones. An unknown or withdrawn player has
 * none.
 */
export function moveTargets(startlist: Startlist, userId: string): number[] {
  const own = startlist.flights.find((f) => f.members.some((m) => m.user_id === userId));
  const isUnassigned = startlist.unassigned.some((m) => m.user_id === userId);
  if (!own && !isUnassigned) return [];
  const full = new Set(startlist.flights.filter((f) => f.full).map((f) => f.number));
  return offeredFlightNumbers(
    startlist.activeCount,
    startlist.flights.map((f) => f.number),
  ).filter((n) => n !== own?.number && !full.has(n));
}

/**
 * The cards in strict number order: every flight with players, and every
 * target that has none (a gap in the numbers, or the empty extra flight) as
 * an empty slot. «Uten flight» is not a slot; it stands below them.
 */
export function flightSlots<T extends StartlistPlayer>(
  startlist: Startlist<T>,
  targets: readonly number[],
): { number: number; flight: StartlistFlight<T> | null }[] {
  const byNumber = new Map(startlist.flights.map((f) => [f.number, f]));
  const numbers = new Set([...byNumber.keys(), ...targets]);
  return [...numbers]
    .sort((a, b) => a - b)
    .map((number) => ({ number, flight: byNumber.get(number) ?? null }));
}
