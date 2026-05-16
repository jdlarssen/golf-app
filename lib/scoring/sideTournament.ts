// lib/scoring/sideTournament.ts
// Pure TypeScript side tournament scoring.
// No external dependencies, deterministic, fully unit-tested.

import { SIDE_TOURNAMENT_POINTS, type SideCategoryId } from './sideTournamentConfig';

export type TeamId = number;
export type UserId = string;

export type SideCategory =
  | 'best_netto_18'
  | 'best_netto_front9'
  | 'best_netto_back9'
  | 'hole_win'
  | 'longest_drive'
  | 'closest_to_pin'
  | 'most_birdies_team'
  | 'most_birdies_individual'
  | 'most_eagles_team'
  | 'most_eagles_individual'
  | 'most_pars_team'
  | 'most_pars_individual'
  | 'best_brutto_18_team'
  | 'best_brutto_18_individual'
  | 'best_brutto_f9_team'
  | 'best_brutto_f9_individual'
  | 'best_brutto_b9_team'
  | 'best_brutto_b9_individual';

export interface SideTournamentConfig {
  enabled: boolean;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
  disabledCategories: readonly SideCategoryId[];
}

export interface SideWinner {
  category: 'longest_drive' | 'closest_to_pin';
  position: 1 | 2;
  winnerUserId: UserId | null;
}

export interface SideTournamentInput {
  config: SideTournamentConfig;
  teams: Array<{ teamId: TeamId; userIds: UserId[] }>;
  coursePars: number[];
  playerScoresPerHole: Array<{
    userId: UserId;
    perHoleGross: Array<number | null>;
    perHoleNetto: Array<number | null>;
  }>;
  nettoBestBallPerHole: Array<{
    teamId: TeamId;
    perHoleNetto: Array<number | null>;
  }>;
  sideWinners: SideWinner[];
}

export interface SideCategoryAward {
  category: SideCategory;
  teamId: TeamId;
  points: number;
  detail?: string;
  /**
   * Populated when `category === 'hole_win'`. The 1-indexed hole number
   * the team won outright. Consumers should prefer this over parsing the
   * free-text `detail` field.
   */
  holeNumber?: number;
}

export interface SideTournamentResult {
  teamStandings: Array<{
    teamId: TeamId;
    totalPoints: number;
    awards: SideCategoryAward[];
  }>;
}

// --- private helpers ---

function sumHoles(perHole: Array<number | null>, start: number, end: number): number | null {
  let sum = 0;
  for (let i = start; i < end; i++) {
    const v = perHole[i];
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

function findMinTeams(
  totals: Array<{ teamId: TeamId; total: number | null }>
): TeamId[] {
  const valid = totals.filter((t): t is { teamId: TeamId; total: number } => t.total !== null);
  if (valid.length === 0) return [];
  const min = Math.min(...valid.map((t) => t.total));
  return valid.filter((t) => t.total === min).map((t) => t.teamId);
}

/**
 * Mirror of `findMinTeams` — returns the teamIds with the highest `total`.
 * Used by count-based categories (most birdies/eagles/pars).
 * Teams with `null` total are excluded. Ties return all tied teamIds.
 */
function findMaxTeams(
  totals: Array<{ teamId: TeamId; total: number | null }>
): TeamId[] {
  const valid = totals.filter((t): t is { teamId: TeamId; total: number } => t.total !== null);
  if (valid.length === 0) return [];
  const max = Math.max(...valid.map((t) => t.total));
  return valid.filter((t) => t.total === max).map((t) => t.teamId);
}

/**
 * Counts holes where `predicate(netto, par)` is true for a single player.
 * Used by count-based categories (birdies/eagles/pars) and only considers
 * netto values, matching how the app already evaluates scores per hole.
 */
function countMatchesForPlayer(
  userId: UserId,
  playerScoresPerHole: SideTournamentInput['playerScoresPerHole'],
  coursePars: number[],
  predicate: (netto: number, par: number) => boolean,
): number {
  const player = playerScoresPerHole.find((p) => p.userId === userId);
  if (!player) return 0;
  let count = 0;
  for (let h = 0; h < 18; h++) {
    const netto = player.perHoleNetto[h];
    const par = coursePars[h];
    if (netto != null && par != null && predicate(netto, par)) count++;
  }
  return count;
}

/**
 * Sum of `countMatchesForPlayer` across every member of a team. Used to
 * compute the team-aggregate count for birdies/eagles/pars.
 */
function countMatchesForTeam(
  team: { teamId: TeamId; userIds: UserId[] },
  playerScoresPerHole: SideTournamentInput['playerScoresPerHole'],
  coursePars: number[],
  predicate: (netto: number, par: number) => boolean,
): number {
  return team.userIds.reduce(
    (sum, userId) => sum + countMatchesForPlayer(userId, playerScoresPerHole, coursePars, predicate),
    0,
  );
}

/**
 * Best ball brutto per hole, summed across a hole range.
 * On each hole, takes the LOWEST brutto among team members. If every team
 * member has `null` on a hole (no valid scores), the team's range total is
 * `null` — that team is then excluded from the brutto category, but other
 * teams can still compete.
 */
function bestBallGrossPerHole(
  team: { teamId: TeamId; userIds: UserId[] },
  playerScores: SideTournamentInput['playerScoresPerHole'],
  start: number,
  end: number,
): number | null {
  let sum = 0;
  for (let h = start; h < end; h++) {
    const grossOnHole = team.userIds
      .map((uid) => playerScores.find((p) => p.userId === uid)?.perHoleGross[h])
      .filter((g): g is number => typeof g === 'number');
    if (grossOnHole.length === 0) return null;
    sum += Math.min(...grossOnHole);
  }
  return sum;
}

/**
 * Lowest brutto sum for one player across a hole range.
 * Returns `null` if any hole in the range is missing — incomplete rounds
 * don't qualify for the individual-best brutto categories.
 */
function playerGrossSum(
  userId: UserId,
  playerScores: SideTournamentInput['playerScoresPerHole'],
  start: number,
  end: number,
): number | null {
  const player = playerScores.find((p) => p.userId === userId);
  if (!player) return null;
  let sum = 0;
  for (let h = start; h < end; h++) {
    const g = player.perHoleGross[h];
    if (g == null) return null;
    sum += g;
  }
  return sum;
}

function teamIdForUser(
  teams: SideTournamentInput['teams'],
  userId: UserId
): TeamId | null {
  for (const t of teams) {
    if (t.userIds.includes(userId)) return t.teamId;
  }
  return null;
}

/**
 * Returns true when the caller has disabled the given category via
 * `config.disabledCategories`. Internal — only used by `calculateSideTournament`
 * to gate per-category award blocks.
 */
function isDisabled(
  category: SideCategoryId,
  config: SideTournamentConfig,
): boolean {
  return config.disabledCategories.includes(category);
}

// --- public API ---

export function calculateSideTournament(
  input: SideTournamentInput
): SideTournamentResult {
  const standingsMap = new Map<TeamId, { totalPoints: number; awards: SideCategoryAward[] }>();
  for (const team of input.teams) {
    standingsMap.set(team.teamId, { totalPoints: 0, awards: [] });
  }

  // Early return: side tournament not active
  if (!input.config.enabled) {
    return {
      teamStandings: input.teams.map((t) => ({
        teamId: t.teamId,
        totalPoints: 0,
        awards: [],
      })),
    };
  }

  const award = (teamId: TeamId, a: SideCategoryAward) => {
    const s = standingsMap.get(teamId);
    if (!s) return;
    s.awards.push(a);
    s.totalPoints += a.points;
  };

  // 1. Best netto 18 — 10p, tie = all winners get 10
  if (!isDisabled('best_netto_18', input.config)) {
    const totals18 = input.nettoBestBallPerHole.map((t) => ({
      teamId: t.teamId,
      total: sumHoles(t.perHoleNetto, 0, 18),
    }));
    for (const teamId of findMinTeams(totals18)) {
      award(teamId, { category: 'best_netto_18', teamId, points: 10 });
    }
  }

  // 2. Best netto F9 — 5p
  if (!isDisabled('best_netto_f9', input.config)) {
    const totalsF9 = input.nettoBestBallPerHole.map((t) => ({
      teamId: t.teamId,
      total: sumHoles(t.perHoleNetto, 0, 9),
    }));
    for (const teamId of findMinTeams(totalsF9)) {
      award(teamId, { category: 'best_netto_front9', teamId, points: 5 });
    }
  }

  // 3. Best netto B9 — 5p
  if (!isDisabled('best_netto_b9', input.config)) {
    const totalsB9 = input.nettoBestBallPerHole.map((t) => ({
      teamId: t.teamId,
      total: sumHoles(t.perHoleNetto, 9, 18),
    }));
    for (const teamId of findMinTeams(totalsB9)) {
      award(teamId, { category: 'best_netto_back9', teamId, points: 5 });
    }
  }

  // 4. Hole-win — 2p per hole, only alone-winner
  if (!isDisabled('hole_win', input.config)) {
    for (let hole = 0; hole < 18; hole++) {
      const holeTotals = input.nettoBestBallPerHole.map((t) => ({
        teamId: t.teamId,
        total: t.perHoleNetto[hole] != null ? (t.perHoleNetto[hole] as number) : null,
      }));
      const winners = findMinTeams(holeTotals);
      if (winners.length === 1) {
        award(winners[0]!, {
          category: 'hole_win',
          teamId: winners[0]!,
          points: 2,
          detail: `Hull ${hole + 1}`,
          holeNumber: hole + 1,
        });
      }
    }
  }

  // 5. LD — 2p per slot (gated by ldCount)
  if (!isDisabled('longest_drive', input.config)) {
    for (const w of input.sideWinners) {
      if (w.category === 'longest_drive' && w.position <= input.config.ldCount && w.winnerUserId) {
        const teamId = teamIdForUser(input.teams, w.winnerUserId);
        if (teamId != null) {
          award(teamId, {
            category: 'longest_drive',
            teamId,
            points: 2,
            detail: `Slot ${w.position}`,
          });
        }
      }
    }
  }

  // 6. CTP — 2p per slot (gated by ctpCount)
  if (!isDisabled('closest_to_pin', input.config)) {
    for (const w of input.sideWinners) {
      if (w.category === 'closest_to_pin' && w.position <= input.config.ctpCount && w.winnerUserId) {
        const teamId = teamIdForUser(input.teams, w.winnerUserId);
        if (teamId != null) {
          award(teamId, {
            category: 'closest_to_pin',
            teamId,
            points: 2,
            detail: `Slot ${w.position}`,
          });
        }
      }
    }
  }

  // 7. Most birdies — team-aggregate (2p) + individual-best (1p)
  // Birdie = netto < par (per player per hole). Netto-based per design.
  const isBirdie = (netto: number, par: number): boolean => netto < par;

  // Team-aggregate: skip teams with N=1 (collapses to individual). Still
  // requires at least two eligible teams to actually compete, and at least
  // one match — awarding everyone for zero birdies would be silly.
  if (!isDisabled('most_birdies_team', input.config)) {
    const eligibleTeams = input.teams.filter((t) => t.userIds.length >= 2);
    if (eligibleTeams.length >= 2) {
      const teamTotals: Array<{ teamId: TeamId; total: number | null }> = eligibleTeams.map((t) => ({
        teamId: t.teamId,
        total: countMatchesForTeam(t, input.playerScoresPerHole, input.coursePars, isBirdie),
      }));
      const max = Math.max(...teamTotals.map((t) => (t.total ?? 0)));
      if (max > 0) {
        for (const teamId of findMaxTeams(teamTotals)) {
          award(teamId, {
            category: 'most_birdies_team',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.mostBirdiesTeam,
          });
        }
      }
    }
  }

  // Individual-best: highest per-player count → award their team. Same
  // zero-guard as team-aggregate.
  if (!isDisabled('most_birdies_individual', input.config)) {
    const playerCounts = input.playerScoresPerHole.map((p) => ({
      userId: p.userId,
      count: countMatchesForPlayer(p.userId, input.playerScoresPerHole, input.coursePars, isBirdie),
    }));
    if (playerCounts.length > 0) {
      const max = Math.max(...playerCounts.map((p) => p.count));
      if (max > 0) {
        const winners = playerCounts.filter((p) => p.count === max).map((p) => p.userId);
        const seenTeams = new Set<TeamId>();
        for (const userId of winners) {
          const teamId = teamIdForUser(input.teams, userId);
          if (teamId != null && !seenTeams.has(teamId)) {
            seenTeams.add(teamId);
            award(teamId, {
              category: 'most_birdies_individual',
              teamId,
              points: SIDE_TOURNAMENT_POINTS.mostBirdiesIndividual,
            });
          }
        }
      }
    }
  }

  // 8. Most eagles+ — team-aggregate (4p) + individual-best (2p)
  // Eagle+ = netto <= par - 2 (per player per hole). Netto-based per design.
  const isEaglePlus = (netto: number, par: number): boolean => netto <= par - 2;

  if (!isDisabled('most_eagles_team', input.config)) {
    const eligibleTeams = input.teams.filter((t) => t.userIds.length >= 2);
    if (eligibleTeams.length >= 2) {
      const teamTotals: Array<{ teamId: TeamId; total: number | null }> = eligibleTeams.map((t) => ({
        teamId: t.teamId,
        total: countMatchesForTeam(t, input.playerScoresPerHole, input.coursePars, isEaglePlus),
      }));
      const max = Math.max(...teamTotals.map((t) => (t.total ?? 0)));
      if (max > 0) {
        for (const teamId of findMaxTeams(teamTotals)) {
          award(teamId, {
            category: 'most_eagles_team',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.mostEaglesTeam,
          });
        }
      }
    }
  }

  if (!isDisabled('most_eagles_individual', input.config)) {
    const playerCounts = input.playerScoresPerHole.map((p) => ({
      userId: p.userId,
      count: countMatchesForPlayer(p.userId, input.playerScoresPerHole, input.coursePars, isEaglePlus),
    }));
    if (playerCounts.length > 0) {
      const max = Math.max(...playerCounts.map((p) => p.count));
      if (max > 0) {
        const winners = playerCounts.filter((p) => p.count === max).map((p) => p.userId);
        const seenTeams = new Set<TeamId>();
        for (const userId of winners) {
          const teamId = teamIdForUser(input.teams, userId);
          if (teamId != null && !seenTeams.has(teamId)) {
            seenTeams.add(teamId);
            award(teamId, {
              category: 'most_eagles_individual',
              teamId,
              points: SIDE_TOURNAMENT_POINTS.mostEaglesIndividual,
            });
          }
        }
      }
    }
  }

  // 9. Most pars+ — team-aggregate (2p) + individual-best (1p)
  // Par or better = netto <= par (per player per hole). Netto-based per design.
  const isParPlus = (netto: number, par: number): boolean => netto <= par;

  if (!isDisabled('most_pars_team', input.config)) {
    const eligibleTeams = input.teams.filter((t) => t.userIds.length >= 2);
    if (eligibleTeams.length >= 2) {
      const teamTotals: Array<{ teamId: TeamId; total: number | null }> = eligibleTeams.map((t) => ({
        teamId: t.teamId,
        total: countMatchesForTeam(t, input.playerScoresPerHole, input.coursePars, isParPlus),
      }));
      const max = Math.max(...teamTotals.map((t) => (t.total ?? 0)));
      if (max > 0) {
        for (const teamId of findMaxTeams(teamTotals)) {
          award(teamId, {
            category: 'most_pars_team',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.mostParsTeam,
          });
        }
      }
    }
  }

  if (!isDisabled('most_pars_individual', input.config)) {
    const playerCounts = input.playerScoresPerHole.map((p) => ({
      userId: p.userId,
      count: countMatchesForPlayer(p.userId, input.playerScoresPerHole, input.coursePars, isParPlus),
    }));
    if (playerCounts.length > 0) {
      const max = Math.max(...playerCounts.map((p) => p.count));
      if (max > 0) {
        const winners = playerCounts.filter((p) => p.count === max).map((p) => p.userId);
        const seenTeams = new Set<TeamId>();
        for (const userId of winners) {
          const teamId = teamIdForUser(input.teams, userId);
          if (teamId != null && !seenTeams.has(teamId)) {
            seenTeams.add(teamId);
            award(teamId, {
              category: 'most_pars_individual',
              teamId,
              points: SIDE_TOURNAMENT_POINTS.mostParsIndividual,
            });
          }
        }
      }
    }
  }

  // 10. Best brutto 18 — team-aggregate (best-ball brutto, 4p) + individual (2p)
  // LOW-wins category: lowest sum wins. Team-aggregate uses best-ball brutto
  // (lowest brutto per hole among teammates, summed). Individual uses one
  // player's brutto sum across all 18 holes.
  if (!isDisabled('best_brutto_18_team', input.config)) {
    const eligibleTeams = input.teams.filter((t) => t.userIds.length >= 2);
    if (eligibleTeams.length >= 2) {
      const teamTotals = eligibleTeams.map((t) => ({
        teamId: t.teamId,
        total: bestBallGrossPerHole(t, input.playerScoresPerHole, 0, 18),
      }));
      for (const teamId of findMinTeams(teamTotals)) {
        award(teamId, {
          category: 'best_brutto_18_team',
          teamId,
          points: SIDE_TOURNAMENT_POINTS.bestBrutto18Team,
        });
      }
    }
  }

  if (!isDisabled('best_brutto_18_individual', input.config)) {
    const playerSums = input.playerScoresPerHole.map((p) => ({
      userId: p.userId,
      total: playerGrossSum(p.userId, input.playerScoresPerHole, 0, 18),
    }));
    const valid = playerSums.filter(
      (p): p is { userId: UserId; total: number } => p.total !== null,
    );
    if (valid.length > 0) {
      const min = Math.min(...valid.map((p) => p.total));
      const winners = valid.filter((p) => p.total === min).map((p) => p.userId);
      const seenTeams = new Set<TeamId>();
      for (const userId of winners) {
        const teamId = teamIdForUser(input.teams, userId);
        if (teamId != null && !seenTeams.has(teamId)) {
          seenTeams.add(teamId);
          award(teamId, {
            category: 'best_brutto_18_individual',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.bestBrutto18Individual,
          });
        }
      }
    }
  }

  return {
    teamStandings: input.teams.map((t) => ({
      teamId: t.teamId,
      totalPoints: standingsMap.get(t.teamId)!.totalPoints,
      awards: standingsMap.get(t.teamId)!.awards,
    })),
  };
}
