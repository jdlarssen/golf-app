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
  | 'best_brutto_b9_individual'
  | 'king_par3_team'
  | 'king_par3_individual'
  | 'king_par5_team'
  | 'king_par5_individual'
  | 'longest_bogey_free_streak'
  | 'lowest_single_hole_brutto'
  | 'turkey'
  | 'solid'
  | 'snowman'
  // v1.19.0 new categories (issue #169)
  | 'most_albatrosses_team'
  | 'most_albatrosses_individual'
  | 'most_hole_in_ones_team'
  | 'most_hole_in_ones_individual'
  | 'king_par4_team'
  | 'king_par4_individual'
  | 'clean_front_9'
  | 'clean_back_9'
  | 'no_double_plus_round'
  | 'hardest_hole_winner'
  | 'comeback_kid'
  | 'all_par_groups_birdie'
  | 'even_par_round'
  | 'back_to_back_birdies'
  | 'team_all_birdied_bonus'
  | 'team_no_bogey_hole_coord'
  | 'worst_single_hole_brutto'
  | 'most_double_bogeys_individual';

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
  /**
   * Stroke indices per hole (1..18, one per hole). Used by
   * `hardest_hole_winner` to find the hole with SI=1 (banens hardeste).
   * Must be an 18-element array. Built parallel to `coursePars` at the
   * leaderboard call-site.
   */
  courseStrokeIndices: number[];
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
  /**
   * Populated when `category === 'longest_bogey_free_streak'`. The 1-indexed
   * starting hole of the streak. Leaderboard UI prepends the winner's name
   * to render e.g. `"Per, 7 hull (3–9)"`.
   */
  streakStartHole?: number;
  /** 1-indexed end hole of the bogey-free streak. */
  streakEndHole?: number;
  /** Length in holes of the bogey-free streak. */
  streakLength?: number;
  /**
   * Populated when `category === 'lowest_single_hole_brutto'`. The raw
   * brutto score on the winning hole (e.g. 2 for an eagle on a par-4).
   * Combined with `holeNumber` to render e.g. `"Per, 2 på hull 14"`.
   *
   * Also populated for `category === 'snowman'` with the worst over-par
   * gross score on the hole — leaderboard renders e.g. `"+6 på hull 12"`.
   */
  score?: number;
  /**
   * Populated for achievement-style awards where a specific player owns
   * the streak (`category === 'turkey'` or `category === 'solid'`). The
   * leaderboard UI uses this to attribute the streak to a player by name.
   * Absent for team-coordinated bonus awards (see `coordBonus`).
   */
  winnerUserId?: UserId;
  /**
   * `true` for the lag-koord-bonus variant of stackable achievements
   * (`category === 'turkey'` or `category === 'solid'`) — awarded when
   * EVERY team member has a qualifying streak across the same hole window.
   * The leaderboard renders these on a separate row from per-player streaks.
   *
   * Also set for `team_all_birdied_bonus` and `team_no_bogey_hole_coord`,
   * which are pure coord-bonuses (no per-player variant).
   */
  coordBonus?: boolean;
  /**
   * Populated when `category === 'comeback_kid'`. The B9-minus-F9 net delta
   * (negative = improvement). Leaderboard renders e.g. `"forbedret seg med 4 slag"`.
   */
  delta?: number;
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
 *
 * Optional `holeFilter` skips holes where the predicate returns false (used
 * by king_par3 / king_par5 to restrict to specific par values). When every
 * hole in [start, end) is filtered out, returns `null`.
 */
function bestBallGrossPerHole(
  team: { teamId: TeamId; userIds: UserId[] },
  playerScores: SideTournamentInput['playerScoresPerHole'],
  start: number,
  end: number,
  holeFilter?: (holeIdx: number) => boolean,
): number | null {
  let sum = 0;
  let countedHoles = 0;
  for (let h = start; h < end; h++) {
    if (holeFilter && !holeFilter(h)) continue;
    const grossOnHole = team.userIds
      .map((uid) => playerScores.find((p) => p.userId === uid)?.perHoleGross[h])
      .filter((g): g is number => typeof g === 'number');
    if (grossOnHole.length === 0) return null;
    sum += Math.min(...grossOnHole);
    countedHoles++;
  }
  if (countedHoles === 0) return null;
  return sum;
}

/**
 * Lowest brutto sum for one player across a hole range.
 * Returns `null` if any hole in the range is missing — incomplete rounds
 * don't qualify for the individual-best brutto categories.
 *
 * Optional `holeFilter` skips holes where the predicate returns false (used
 * by king_par3 / king_par5). When every hole in [start, end) is filtered
 * out, returns `null`.
 */
function playerGrossSum(
  userId: UserId,
  playerScores: SideTournamentInput['playerScoresPerHole'],
  start: number,
  end: number,
  holeFilter?: (holeIdx: number) => boolean,
): number | null {
  const player = playerScores.find((p) => p.userId === userId);
  if (!player) return null;
  let sum = 0;
  let countedHoles = 0;
  for (let h = start; h < end; h++) {
    if (holeFilter && !holeFilter(h)) continue;
    const g = player.perHoleGross[h];
    if (g == null) return null;
    sum += g;
    countedHoles++;
  }
  if (countedHoles === 0) return null;
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
 * Walks `perHole` linearly and returns the longest run of consecutive holes
 * (1-indexed start/end) where `predicate` returns true. Returns `null` when
 * no hole matches. Used by longest_bogey_free_streak to find the bogey-free
 * stretch per player.
 *
 * A `null` value in the array breaks the streak (treated as not matching),
 * matching the brutto/netto helpers' "incomplete = doesn't qualify" rule.
 */
function longestStreak(
  perHole: Array<number | null>,
  predicate: (val: number, holeIdx: number) => boolean,
): { length: number; startHole: number; endHole: number } | null {
  let bestLen = 0;
  let bestStart = 0;
  let curLen = 0;
  let curStart = 0;
  for (let h = 0; h < perHole.length; h++) {
    const v = perHole[h];
    const matches = v != null && predicate(v, h);
    if (matches) {
      if (curLen === 0) curStart = h;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }
  if (bestLen === 0) return null;
  return {
    length: bestLen,
    startHole: bestStart + 1, // 1-indexed
    endHole: bestStart + bestLen, // 1-indexed inclusive
  };
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

/**
 * Greedy left-to-right scan that returns every maximal-length, non-overlapping
 * window of exactly `windowSize` consecutive holes where `predicate` matches
 * on all holes in the window. After emitting a match at index `i`, the scan
 * jumps to `i + windowSize` — so 6 in a row at windowSize=3 yields TWO streaks
 * (holes 1-3 and 4-6), and 5 in a row yields ONE (holes 1-3, then 4-5 is too
 * short).
 *
 * A `null` value in the array breaks any in-progress run (same rule as
 * `longestStreak`). Returns 1-indexed `startHole` / `endHole` for parity with
 * how award fields are populated elsewhere.
 *
 * Used by Turkey (3-streak of netto-birdies) and Solid (5-streak of netto-
 * par-or-better) — both achievements are stackable across the round.
 */
function findNonOverlappingStreaks(
  perHole: Array<number | null>,
  windowSize: number,
  predicate: (val: number, holeIdx: number) => boolean,
): Array<{ startHole: number; endHole: number }> {
  const streaks: Array<{ startHole: number; endHole: number }> = [];
  let runStart = -1;
  let h = 0;
  while (h < perHole.length) {
    const v = perHole[h];
    const matches = v != null && predicate(v, h);
    if (matches) {
      if (runStart === -1) runStart = h;
      if (h - runStart + 1 >= windowSize) {
        streaks.push({ startHole: runStart + 1, endHole: runStart + windowSize });
        // Jump past the emitted window — next streak must start at `runStart + windowSize`.
        h = runStart + windowSize;
        runStart = -1;
        continue;
      }
      h++;
    } else {
      runStart = -1;
      h++;
    }
  }
  return streaks;
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

  // 11. Best brutto F9 — team-aggregate (2p) + individual (1p)
  // Same shape as best_brutto_18 but scoped to holes 1-9 (indices 0..8).
  if (!isDisabled('best_brutto_f9_team', input.config)) {
    const eligibleTeams = input.teams.filter((t) => t.userIds.length >= 2);
    if (eligibleTeams.length >= 2) {
      const teamTotals = eligibleTeams.map((t) => ({
        teamId: t.teamId,
        total: bestBallGrossPerHole(t, input.playerScoresPerHole, 0, 9),
      }));
      for (const teamId of findMinTeams(teamTotals)) {
        award(teamId, {
          category: 'best_brutto_f9_team',
          teamId,
          points: SIDE_TOURNAMENT_POINTS.bestBruttoF9Team,
        });
      }
    }
  }

  if (!isDisabled('best_brutto_f9_individual', input.config)) {
    const playerSums = input.playerScoresPerHole.map((p) => ({
      userId: p.userId,
      total: playerGrossSum(p.userId, input.playerScoresPerHole, 0, 9),
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
            category: 'best_brutto_f9_individual',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.bestBruttoF9Individual,
          });
        }
      }
    }
  }

  // 12. Best brutto B9 — team-aggregate (2p) + individual (1p)
  // Same shape as best_brutto_18 but scoped to holes 10-18 (indices 9..17).
  if (!isDisabled('best_brutto_b9_team', input.config)) {
    const eligibleTeams = input.teams.filter((t) => t.userIds.length >= 2);
    if (eligibleTeams.length >= 2) {
      const teamTotals = eligibleTeams.map((t) => ({
        teamId: t.teamId,
        total: bestBallGrossPerHole(t, input.playerScoresPerHole, 9, 18),
      }));
      for (const teamId of findMinTeams(teamTotals)) {
        award(teamId, {
          category: 'best_brutto_b9_team',
          teamId,
          points: SIDE_TOURNAMENT_POINTS.bestBruttoB9Team,
        });
      }
    }
  }

  if (!isDisabled('best_brutto_b9_individual', input.config)) {
    const playerSums = input.playerScoresPerHole.map((p) => ({
      userId: p.userId,
      total: playerGrossSum(p.userId, input.playerScoresPerHole, 9, 18),
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
            category: 'best_brutto_b9_individual',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.bestBruttoB9Individual,
          });
        }
      }
    }
  }

  // 13. Konge på par-3 — team-aggregate (best-ball brutto on par-3 holes, 4p)
  //     + individual (lowest single-player brutto sum on par-3 holes, 2p)
  // LOW-wins. If course has no par-3 holes, both helpers would return null —
  // gate up-front so we don't even try (cleaner than letting findMinTeams
  // award an empty winner set).
  const isPar3 = (h: number): boolean => input.coursePars[h] === 3;
  const hasPar3Holes = input.coursePars.some((p) => p === 3);

  if (!isDisabled('king_par3_team', input.config) && hasPar3Holes) {
    const eligibleTeams = input.teams.filter((t) => t.userIds.length >= 2);
    if (eligibleTeams.length >= 2) {
      const teamTotals = eligibleTeams.map((t) => ({
        teamId: t.teamId,
        total: bestBallGrossPerHole(t, input.playerScoresPerHole, 0, 18, isPar3),
      }));
      for (const teamId of findMinTeams(teamTotals)) {
        award(teamId, {
          category: 'king_par3_team',
          teamId,
          points: SIDE_TOURNAMENT_POINTS.kingPar3Team,
        });
      }
    }
  }

  if (!isDisabled('king_par3_individual', input.config) && hasPar3Holes) {
    const playerSums = input.playerScoresPerHole.map((p) => ({
      userId: p.userId,
      total: playerGrossSum(p.userId, input.playerScoresPerHole, 0, 18, isPar3),
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
            category: 'king_par3_individual',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.kingPar3Individual,
          });
        }
      }
    }
  }

  // 14. Konge på par-5 — team-aggregate (best-ball brutto on par-5 holes, 4p)
  //     + individual (lowest single-player brutto sum on par-5 holes, 2p)
  // Same shape as king_par3, just filtered to par-5 holes instead.
  const isPar5 = (h: number): boolean => input.coursePars[h] === 5;
  const hasPar5Holes = input.coursePars.some((p) => p === 5);

  if (!isDisabled('king_par5_team', input.config) && hasPar5Holes) {
    const eligibleTeams = input.teams.filter((t) => t.userIds.length >= 2);
    if (eligibleTeams.length >= 2) {
      const teamTotals = eligibleTeams.map((t) => ({
        teamId: t.teamId,
        total: bestBallGrossPerHole(t, input.playerScoresPerHole, 0, 18, isPar5),
      }));
      for (const teamId of findMinTeams(teamTotals)) {
        award(teamId, {
          category: 'king_par5_team',
          teamId,
          points: SIDE_TOURNAMENT_POINTS.kingPar5Team,
        });
      }
    }
  }

  if (!isDisabled('king_par5_individual', input.config) && hasPar5Holes) {
    const playerSums = input.playerScoresPerHole.map((p) => ({
      userId: p.userId,
      total: playerGrossSum(p.userId, input.playerScoresPerHole, 0, 18, isPar5),
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
            category: 'king_par5_individual',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.kingPar5Individual,
          });
        }
      }
    }
  }

  // 15. Longest bogey-free streak — individ-only, 4p
  // Longest run of consecutive holes where netto <= par (par or better).
  // No team-aggregate (streak can't be meaningfully summed across players).
  // Awards each tied team once (dedup), full pot per team. Empty streak
  // (no player has any par-or-better hole) → no award.
  if (!isDisabled('longest_bogey_free_streak', input.config)) {
    const playerStreaks = input.playerScoresPerHole
      .map((p) => {
        const streak = longestStreak(
          p.perHoleNetto,
          (netto, h) => {
            const par = input.coursePars[h];
            return par != null && netto <= par;
          },
        );
        return streak ? { userId: p.userId, streak } : null;
      })
      .filter((p): p is { userId: UserId; streak: NonNullable<ReturnType<typeof longestStreak>> } => p !== null);

    if (playerStreaks.length > 0) {
      const max = Math.max(...playerStreaks.map((p) => p.streak.length));
      if (max > 0) {
        const winners = playerStreaks.filter((p) => p.streak.length === max);
        const seenTeams = new Set<TeamId>();
        for (const w of winners) {
          const teamId = teamIdForUser(input.teams, w.userId);
          if (teamId != null && !seenTeams.has(teamId)) {
            seenTeams.add(teamId);
            award(teamId, {
              category: 'longest_bogey_free_streak',
              teamId,
              points: SIDE_TOURNAMENT_POINTS.longestBogeyFreeStreak,
              streakLength: w.streak.length,
              streakStartHole: w.streak.startHole,
              streakEndHole: w.streak.endHole,
            });
          }
        }
      }
    }
  }

  // 16. Lavest enkelthull brutto — individ-only, 2p
  // For each player, find their LOWEST single-hole brutto across all 18
  // holes. Player(s) with the absolute lowest value win. Ties → full pot
  // per team, deduped to one award per team. No team-aggregate (single-
  // hole = single-player by definition).
  if (!isDisabled('lowest_single_hole_brutto', input.config)) {
    const playerLows = input.playerScoresPerHole
      .map((p) => {
        let bestVal: number | null = null;
        let bestHole = 0; // 0-indexed
        for (let h = 0; h < p.perHoleGross.length; h++) {
          const g = p.perHoleGross[h];
          if (g == null) continue;
          if (bestVal == null || g < bestVal) {
            bestVal = g;
            bestHole = h;
          }
        }
        return bestVal == null ? null : { userId: p.userId, score: bestVal, holeIdx: bestHole };
      })
      .filter((p): p is { userId: UserId; score: number; holeIdx: number } => p !== null);

    if (playerLows.length > 0) {
      const min = Math.min(...playerLows.map((p) => p.score));
      const winners = playerLows.filter((p) => p.score === min);
      const seenTeams = new Set<TeamId>();
      for (const w of winners) {
        const teamId = teamIdForUser(input.teams, w.userId);
        if (teamId != null && !seenTeams.has(teamId)) {
          seenTeams.add(teamId);
          award(teamId, {
            category: 'lowest_single_hole_brutto',
            teamId,
            points: SIDE_TOURNAMENT_POINTS.lowestSingleHoleBrutto,
            score: w.score,
            holeNumber: w.holeIdx + 1, // 1-indexed
          });
        }
      }
    }
  }

  // 17. Turkey — per spiller, 4p per non-overlapping 3-hole netto-birdie streak.
  // Stackable: a single player can earn multiple turkeys per round (e.g. 6 in
  // a row → 2 turkeys). Each streak awards 4p to the streak-owner's team and
  // records `winnerUserId` so the leaderboard can attribute it.
  //
  // Lag-koord-bonus (separate award, same `turkey` category): teams with ≥2
  // members get an additional 4p × N when EVERY team member has a netto-birdie
  // on the same 3-hole window. Computed by collapsing per-player birdie flags
  // into a per-team "all members birdied" boolean array, then reusing
  // findNonOverlappingStreaks. Marked with `coordBonus: true` so the
  // leaderboard renders it on a separate row from per-player turkeys.
  if (!isDisabled('turkey', input.config)) {
    for (const p of input.playerScoresPerHole) {
      const teamId = teamIdForUser(input.teams, p.userId);
      if (teamId == null) continue;
      const streaks = findNonOverlappingStreaks(
        p.perHoleNetto,
        3,
        (netto, h) => {
          const par = input.coursePars[h];
          return par != null && netto < par;
        },
      );
      for (const s of streaks) {
        award(teamId, {
          category: 'turkey',
          teamId,
          points: SIDE_TOURNAMENT_POINTS.turkeyPerPlayer,
          winnerUserId: p.userId,
          streakLength: 3,
          streakStartHole: s.startHole,
          streakEndHole: s.endHole,
        });
      }
    }

    // Lag-koord-bonus
    for (const team of input.teams) {
      const n = team.userIds.length;
      if (n < 2) continue;
      const memberScores = team.userIds
        .map((uid) => input.playerScoresPerHole.find((p) => p.userId === uid))
        .filter((p): p is SideTournamentInput['playerScoresPerHole'][number] => p != null);
      if (memberScores.length !== n) continue; // missing scores → skip
      // 1 if every member has netto < par on this hole, else null (breaks streak)
      const allBirdiedFlag: Array<number | null> = new Array(18).fill(null);
      for (let h = 0; h < 18; h++) {
        const par = input.coursePars[h];
        if (par == null) continue;
        const allBirdie = memberScores.every((p) => {
          const netto = p.perHoleNetto[h];
          return netto != null && netto < par;
        });
        if (allBirdie) allBirdiedFlag[h] = 1;
      }
      const coordStreaks = findNonOverlappingStreaks(allBirdiedFlag, 3, () => true);
      for (const s of coordStreaks) {
        award(team.teamId, {
          category: 'turkey',
          teamId: team.teamId,
          points: SIDE_TOURNAMENT_POINTS.turkeyCoordPerMember * n,
          coordBonus: true,
          streakLength: 3,
          streakStartHole: s.startHole,
          streakEndHole: s.endHole,
        });
      }
    }
  }

  // 18. Solid — per spiller, 2p per non-overlapping 5-hole netto-par-or-better
  // streak (netto <= par). Same shape as Turkey, just 5-in-a-row at 2p each.
  // Stackable, and a `solid` award includes `winnerUserId` for attribution.
  //
  // Lag-koord-bonus: teams with ≥2 members get an additional 2p × N when every
  // member has netto ≤ par on the same 5-hole window. Marked with
  // `coordBonus: true`.
  if (!isDisabled('solid', input.config)) {
    for (const p of input.playerScoresPerHole) {
      const teamId = teamIdForUser(input.teams, p.userId);
      if (teamId == null) continue;
      const streaks = findNonOverlappingStreaks(
        p.perHoleNetto,
        5,
        (netto, h) => {
          const par = input.coursePars[h];
          return par != null && netto <= par;
        },
      );
      for (const s of streaks) {
        award(teamId, {
          category: 'solid',
          teamId,
          points: SIDE_TOURNAMENT_POINTS.solidPerPlayer,
          winnerUserId: p.userId,
          streakLength: 5,
          streakStartHole: s.startHole,
          streakEndHole: s.endHole,
        });
      }
    }

    // Lag-koord-bonus (5-streak where every team member has netto ≤ par)
    for (const team of input.teams) {
      const n = team.userIds.length;
      if (n < 2) continue;
      const memberScores = team.userIds
        .map((uid) => input.playerScoresPerHole.find((p) => p.userId === uid))
        .filter((p): p is SideTournamentInput['playerScoresPerHole'][number] => p != null);
      if (memberScores.length !== n) continue;
      const allParPlusFlag: Array<number | null> = new Array(18).fill(null);
      for (let h = 0; h < 18; h++) {
        const par = input.coursePars[h];
        if (par == null) continue;
        const allParPlus = memberScores.every((p) => {
          const netto = p.perHoleNetto[h];
          return netto != null && netto <= par;
        });
        if (allParPlus) allParPlusFlag[h] = 1;
      }
      const coordStreaks = findNonOverlappingStreaks(allParPlusFlag, 5, () => true);
      for (const s of coordStreaks) {
        award(team.teamId, {
          category: 'solid',
          teamId: team.teamId,
          points: SIDE_TOURNAMENT_POINTS.solidCoordPerMember * n,
          coordBonus: true,
          streakLength: 5,
          streakStartHole: s.startHole,
          streakEndHole: s.endHole,
        });
      }
    }
  }

  // 19. Snowman — per hull, -2p når HELE laget har brutto ≥ par+5. Stackable
  // across the round (multiple bad holes → multiple snowmen). Rule applies to
  // 1-player teams too — solo players get a snowman when their one brutto
  // score is ≥ par+5. `score` records the worst over-par delta on the hole
  // (e.g. +6) so the leaderboard can render "hele laget +6 på hull 12".
  if (!isDisabled('snowman', input.config)) {
    for (const team of input.teams) {
      const memberScores = team.userIds
        .map((uid) => input.playerScoresPerHole.find((p) => p.userId === uid))
        .filter((p): p is SideTournamentInput['playerScoresPerHole'][number] => p != null);
      if (memberScores.length !== team.userIds.length) continue; // missing data → skip
      if (memberScores.length === 0) continue;
      for (let h = 0; h < 18; h++) {
        const par = input.coursePars[h];
        if (par == null) continue;
        const grossOnHole = memberScores.map((p) => p.perHoleGross[h]);
        // Need all members to have a recorded brutto AND each must be ≥ par+5
        if (grossOnHole.some((g) => g == null)) continue;
        const validGross = grossOnHole as number[];
        const allSnowman = validGross.every((g) => g >= par + 5);
        if (!allSnowman) continue;
        const worstOver = Math.max(...validGross) - par;
        award(team.teamId, {
          category: 'snowman',
          teamId: team.teamId,
          points: SIDE_TOURNAMENT_POINTS.snowman,
          holeNumber: h + 1, // 1-indexed
          score: worstOver,
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
