/**
 * «Jevne lag» on step 4 of the new-game wizard (#2478): the players are dealt
 * by handicap index in a snake, so pairs put the best with the weakest.
 *
 * Sorted from the lowest index (a plus handicap is stored negative, so it
 * comes first), the teams take one player each in the order 1, 2, …, k, then
 * k, …, 1, and so on. A full team is skipped, so 11 à 4 (4/4/3, #2569) still
 * deals everyone. Equal indexes are settled on name, then id, so the same
 * players always give the same teams.
 *
 * A player with no index (`hcpIndex: null` — an invitee who has not finished
 * the profile and still carries the 54.0 default) is dealt last, to the team
 * with the lowest value that has room, and is left out of every sum, average
 * and spread.
 *
 * Pure: no React, no `PlayerOption`. The hook and the team cards read it.
 */

export type BalancePlayer = { id: string; name: string; hcpIndex: number | null };

/**
 * The numbers the team cards and the line under the buttons show. `values[i]`
 * is team i + 1's sum (`mode: 'sum'`, the teams are equal in size) or average
 * (`'average'`), over its players with an index; `null` when it has none.
 * `spread` is the largest value minus the smallest among the teams that have
 * one, unrounded; `null` when no team has one.
 */
export type TeamHcp = {
  values: (number | null)[];
  mode: 'sum' | 'average';
  spread: number | null;
  /** The players with no index, in input order, whether they have a team or not. */
  uncounted: string[];
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function bestFirst(a: BalancePlayer, b: BalancePlayer): number {
  return (
    (a.hcpIndex ?? 0) - (b.hcpIndex ?? 0) ||
    compareText(a.name, b.name) ||
    compareText(a.id, b.id)
  );
}

function hcpValues(
  rosters: BalancePlayer[][],
  mode: TeamHcp['mode'],
): Pick<TeamHcp, 'values' | 'spread'> {
  const values = rosters.map((roster) => {
    const counted = roster.filter((p) => p.hcpIndex !== null);
    if (counted.length === 0) return null;
    const sum = counted.reduce((total, p) => total + (p.hcpIndex ?? 0), 0);
    return mode === 'sum' ? sum : sum / counted.length;
  });
  const present = values.filter((v): v is number => v !== null);
  const spread = present.length === 0 ? null : Math.max(...present) - Math.min(...present);
  return { values, spread };
}

function uncountedIds(players: readonly BalancePlayer[]): string[] {
  return players.filter((p) => p.hcpIndex === null).map((p) => p.id);
}

/**
 * Deals `players` on teams of `sizes` (from `splitIntoTeams`; the sizes add up
 * to the player count). `teamOf` maps each id to its team, 1-based.
 */
export function balancedTeams(
  players: readonly BalancePlayer[],
  sizes: readonly number[],
): TeamHcp & { teamOf: Record<string, number> } {
  const counted = players.filter((p) => p.hcpIndex !== null).sort(bestFirst);
  const rosters: BalancePlayer[][] = sizes.map(() => []);
  const hasRoom = (team: number) => rosters[team].length < sizes[team];

  let next = 0;
  let forward = true;
  while (next < counted.length && rosters.some((_, team) => hasRoom(team))) {
    const round = forward ? sizes.map((_, i) => i) : sizes.map((_, i) => sizes.length - 1 - i);
    for (const team of round) {
      if (next >= counted.length) break;
      if (hasRoom(team)) rosters[team].push(counted[next++]);
    }
    forward = !forward;
  }

  const mode: TeamHcp['mode'] = sizes.every((size) => size === sizes[0]) ? 'sum' : 'average';
  for (const player of players) {
    if (player.hcpIndex !== null) continue;
    const { values } = hcpValues(rosters, mode);
    let lowest = -1;
    for (let team = 0; team < rosters.length; team++) {
      if (!hasRoom(team)) continue;
      if (lowest === -1 || (values[team] ?? 0) < (values[lowest] ?? 0)) lowest = team;
    }
    if (lowest !== -1) rosters[lowest].push(player);
  }

  const teamOf: Record<string, number> = {};
  rosters.forEach((roster, team) => {
    for (const p of roster) teamOf[p.id] = team + 1;
  });
  return { teamOf, ...hcpValues(rosters, mode), mode, uncounted: uncountedIds(players) };
}

/**
 * The same numbers for any layout — after «Jevne lag», a random draw or moves
 * by tap. Whether the teams are equal is read from the cards that have players:
 * 4/4/3 is an average, and so is a team with a free seat mid-assignment.
 * Players with no team are not counted; teams with no players are `null`.
 */
export function teamHcpValues(
  teamOf: Readonly<Record<string, number>>,
  players: readonly BalancePlayer[],
): TeamHcp {
  const teamCount = Math.max(0, ...players.map((p) => teamOf[p.id] ?? 0));
  const rosters: BalancePlayer[][] = Array.from({ length: teamCount }, () => []);
  for (const p of players) {
    const team = teamOf[p.id];
    if (team !== undefined && team >= 1) rosters[team - 1].push(p);
  }
  const filled = rosters.filter((roster) => roster.length > 0).map((roster) => roster.length);
  const mode: TeamHcp['mode'] = filled.every((size) => size === filled[0]) ? 'sum' : 'average';
  return { ...hcpValues(rosters, mode), mode, uncounted: uncountedIds(players) };
}
