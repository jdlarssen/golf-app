// lib/scoring/sideTournament.ts
// Pure TypeScript side tournament scoring.
// No external dependencies, deterministic, fully unit-tested.

export type TeamId = number;
export type UserId = string;

export type SideCategory =
  | 'best_netto_18'
  | 'best_netto_front9'
  | 'best_netto_back9'
  | 'hole_win'
  | 'longest_drive'
  | 'closest_to_pin';

export interface SideTournamentConfig {
  enabled: boolean;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
}

export interface SideWinner {
  category: 'longest_drive' | 'closest_to_pin';
  position: 1 | 2;
  winnerUserId: UserId | null;
}

export interface SideTournamentInput {
  config: SideTournamentConfig;
  teams: Array<{ teamId: TeamId; userIds: UserId[] }>;
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

function teamIdForUser(
  teams: SideTournamentInput['teams'],
  userId: UserId
): TeamId | null {
  for (const t of teams) {
    if (t.userIds.includes(userId)) return t.teamId;
  }
  return null;
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
  const totals18 = input.nettoBestBallPerHole.map((t) => ({
    teamId: t.teamId,
    total: sumHoles(t.perHoleNetto, 0, 18),
  }));
  for (const teamId of findMinTeams(totals18)) {
    award(teamId, { category: 'best_netto_18', teamId, points: 10 });
  }

  // 2. Best netto F9 — 5p
  const totalsF9 = input.nettoBestBallPerHole.map((t) => ({
    teamId: t.teamId,
    total: sumHoles(t.perHoleNetto, 0, 9),
  }));
  for (const teamId of findMinTeams(totalsF9)) {
    award(teamId, { category: 'best_netto_front9', teamId, points: 5 });
  }

  // 3. Best netto B9 — 5p
  const totalsB9 = input.nettoBestBallPerHole.map((t) => ({
    teamId: t.teamId,
    total: sumHoles(t.perHoleNetto, 9, 18),
  }));
  for (const teamId of findMinTeams(totalsB9)) {
    award(teamId, { category: 'best_netto_back9', teamId, points: 5 });
  }

  // 4. Hole-win — 2p per hole, only alone-winner
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

  // 5. LD — 2p per slot (gated by ldCount)
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

  // 6. CTP — 2p per slot (gated by ctpCount)
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

  return {
    teamStandings: input.teams.map((t) => ({
      teamId: t.teamId,
      totalPoints: standingsMap.get(t.teamId)!.totalPoints,
      awards: standingsMap.get(t.teamId)!.awards,
    })),
  };
}
