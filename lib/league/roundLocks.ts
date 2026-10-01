/**
 * Who is locked out of a new flight in one league round (#2214).
 *
 * A player has one counted flight per round. Once they are in a flight that is
 * finished (delivered) or still scheduled/active (in progress), nobody can put
 * them in another flight for that round: not themselves, and not a co-player
 * who starts a flight and ticks them.
 *
 * A withdrawn player (`withdrawnAt` set) is never locked. Withdrawing is the
 * way out of a flight that was abandoned.
 *
 * One home for the rule: the server gate in `startLeagueRoundFlight` and the
 * round view in `getLigaSnapshot` (the «Spill» button and the co-player picker)
 * both read it from here.
 */

export type RoundFlight = {
  status: string;
  players: Array<{ userId: string; withdrawnAt: string | null }>;
};

export type RoundPlayerLocks = {
  /** Non-withdrawn players in a finished flight. */
  delivered: Set<string>;
  /** Non-withdrawn players in a scheduled or active flight. */
  inProgress: Set<string>;
};

export function roundPlayerLocks(flights: RoundFlight[]): RoundPlayerLocks {
  const delivered = new Set<string>();
  const inProgress = new Set<string>();
  for (const flight of flights) {
    const target =
      flight.status === 'finished'
        ? delivered
        : flight.status === 'scheduled' || flight.status === 'active'
          ? inProgress
          : null;
    if (!target) continue;
    for (const p of flight.players) {
      if (p.withdrawnAt === null) target.add(p.userId);
    }
  }
  return { delivered, inProgress };
}
