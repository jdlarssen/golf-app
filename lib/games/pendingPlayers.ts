export type RosterPlayer = {
  id: string;
  email: string;
  profile_completed_at: string | null;
};

export type PendingPlayer = {
  id: string;
  email: string;
};

/**
 * Returns the subset of roster players whose profile is not yet completed.
 * Drives the publish / start gates: a non-empty result blocks the transition.
 */
export function findPendingPlayers(players: RosterPlayer[]): PendingPlayer[] {
  return players
    .filter((p) => p.profile_completed_at === null)
    .map((p) => ({ id: p.id, email: p.email }));
}
