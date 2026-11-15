/**
 * The side contest on the hole (#2283): which holes are contest holes, what a
 * flight may report there, and what the organiser sees summed up afterwards.
 * The flight reports; the organiser still picks the winner
 * (`game_side_winners`) and types the cup's GIR counts
 * (`tournament_side_awards`). Nothing here fills either in.
 *
 * The SQL copy lives in `0237_side_contest_claims.sql`: `is_side_contest_hole`
 * mirrors `contestsForHole`, and the bounds below sit in its CHECKs and rpcs.
 * `sideContestDbCheck.test.ts` pins that the two agree (AGENTS.md trap 4).
 *
 * Relative imports only: the app imports this file from `native/app/src/`.
 */

import { buildCupRoster, type CupRosterGame, type CupRosterPlayer } from '../cup/cupRoster';
import { holesForSegment, type HoleSegment } from '../scoring/holeSegment';
import { isSingleFlightGame, type FlightPlayer } from './flightScope';
import { isAlternateShotMatchplay, type GameMode } from '../scoring/modes/types';

/** The holes a contest can be on. `games_side_holes_valid` and the claim tables hold the same. */
export const SIDE_CONTEST_HOLE_MIN = 1;
export const SIDE_CONTEST_HOLE_MAX = 18;

/** How many slots a category has, as `side_ld_count`/`side_ctp_count` (0–2). */
export const SIDE_CONTEST_SLOT_MAX = 2;

/**
 * «Omtrent hvor nær?» in metres, after rounding to one decimal: what
 * `game_side_claims.distance_m numeric(3,1)` and `record_side_claim` accept.
 */
export const CLAIM_DISTANCE_MIN_M = 0.1;
export const CLAIM_DISTANCE_MAX_M = 99.9;

/** The game's own categories, as in `game_side_winners.category`. */
export type SideContestCategory = 'closest_to_pin' | 'longest_drive';

/** What a hole can have. GIR exists only in a cup. */
export type HoleContestCategory = SideContestCategory | 'gir';

/** `tournament_side_awards.kind`. */
export type CupSideAwardKind = 'ctp' | 'ld' | 'gir';

/** One cup side award as the hole needs it: no winner and no counter. */
export type CupSideAward = {
  kind: CupSideAwardKind;
  holeNumber: number;
  points: number;
  /** Only for `gir`: «maks per lag» (1–10). */
  girMaxPerTeam: number | null;
};

/**
 * The columns a cup's holes are read with. Never the winner or the counters,
 * so a hole shows nothing from the other matches (#1495).
 */
export const CUP_SIDE_AWARD_SELECT = 'kind, hole_number, points, gir_max_per_team';

/** A raw `tournament_side_awards` row from `CUP_SIDE_AWARD_SELECT`. `points` is `numeric`. */
export type CupSideAwardRow = {
  kind: string;
  hole_number: number;
  points: number | string;
  gir_max_per_team: number | null;
};

const CUP_KINDS: readonly CupSideAwardKind[] = ['ctp', 'ld', 'gir'];

function isCupKind(kind: string): kind is CupSideAwardKind {
  return (CUP_KINDS as readonly string[]).includes(kind);
}

/** Maps the rows; a kind this file does not know is left out instead of guessed at. */
export function toCupSideAwards(rows: readonly CupSideAwardRow[]): CupSideAward[] {
  const awards: CupSideAward[] = [];
  for (const row of rows) {
    const points = Number(row.points);
    if (!isCupKind(row.kind) || !Number.isFinite(points)) continue;
    awards.push({
      kind: row.kind,
      holeNumber: row.hole_number,
      points,
      girMaxPerTeam: row.gir_max_per_team,
    });
  }
  return awards;
}

/** The category a cup kind is reported under. */
export function categoryForCupKind(kind: CupSideAwardKind): HoleContestCategory {
  switch (kind) {
    case 'ctp':
      return 'closest_to_pin';
    case 'ld':
      return 'longest_drive';
    case 'gir':
      return 'gir';
  }
}

/** The game's side tournament as the hole needs it. */
export type SideHolesConfig = {
  sideLdCount: number;
  sideCtpCount: number;
  /** `games.side_ld_holes`. Null or missing (an older cached bundle) = no holes chosen. */
  sideLdHoles?: readonly (number | null)[] | null;
  sideCtpHoles?: readonly (number | null)[] | null;
  /** A derived cup game (0151) keeps no scores of its own, so it has no contest holes. */
  sourceGameId: string | null;
};

/**
 * The hole for slot `position` (1-based), or null. A slot past the count has
 * no hole even when the array still holds one, so a lowered count never needs
 * the array rewritten (`holes[1:count]` in `is_side_contest_hole`).
 */
export function holeForSlot(
  holes: readonly (number | null)[] | null | undefined,
  count: number,
  position: number,
): number | null {
  if (!holes || position < 1 || position > count) return null;
  return holes[position - 1] ?? null;
}

function slotHoles(holes: readonly (number | null)[] | null | undefined, count: number): number[] {
  const chosen: number[] = [];
  for (let position = 1; position <= count; position++) {
    const hole = holeForSlot(holes, count, position);
    if (hole !== null) chosen.push(hole);
  }
  return chosen;
}

/** A contest on one hole. The cup variant carries its points for the card. */
export type HoleContest =
  | { category: SideContestCategory; source: 'game' }
  | { category: SideContestCategory; source: 'cup'; points: number }
  | { category: 'gir'; source: 'cup'; points: number; maxPerTeam: number };

const CATEGORY_ORDER: readonly HoleContestCategory[] = ['closest_to_pin', 'longest_drive', 'gir'];

/**
 * The contests on `holeNumber`, at most one per category, in card order:
 * closest to pin, longest drive, GIR. A category the cup has on the hole wins
 * over the game's own slot on the same hole, since the claims are keyed per
 * category and hole and the cup's card carries the points. Two cup slots on
 * one hole (N winners «per flight», 0156) are still one contest.
 */
export function contestsForHole(
  game: SideHolesConfig,
  cupAwards: readonly CupSideAward[] | null | undefined,
  holeNumber: number,
): HoleContest[] {
  if (game.sourceGameId != null) return [];
  const contests = new Map<HoleContestCategory, HoleContest>();

  for (const award of cupAwards ?? []) {
    if (award.holeNumber !== holeNumber) continue;
    const category = categoryForCupKind(award.kind);
    if (contests.has(category)) continue;
    if (category === 'gir') {
      if (award.girMaxPerTeam == null) continue;
      contests.set(category, { category, source: 'cup', points: award.points, maxPerTeam: award.girMaxPerTeam });
    } else {
      contests.set(category, { category, source: 'cup', points: award.points });
    }
  }

  if (!contests.has('closest_to_pin') && slotHoles(game.sideCtpHoles, game.sideCtpCount).includes(holeNumber)) {
    contests.set('closest_to_pin', { category: 'closest_to_pin', source: 'game' });
  }
  if (!contests.has('longest_drive') && slotHoles(game.sideLdHoles, game.sideLdCount).includes(holeNumber)) {
    contests.set('longest_drive', { category: 'longest_drive', source: 'game' });
  }

  return CATEGORY_ORDER.flatMap((category) => {
    const contest = contests.get(category);
    return contest ? [contest] : [];
  });
}

/** A hole number from a form field ("7"), or null when it is not a whole number in 1–18. */
export function parseSideContestHole(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const hole = Number(text);
  return hole >= SIDE_CONTEST_HOLE_MIN && hole <= SIDE_CONTEST_HOLE_MAX ? hole : null;
}

export type ClaimDistanceResult = { ok: true; distanceM: number | null } | { ok: false };

/**
 * «Omtrent hvor nær? [2,4] meter». Takes «2,4» and «2.4», rounds to one
 * decimal the way `round(x, 1)` does in `record_side_claim`, and then checks
 * 0,1–99,9. An empty field is a valid «no distance». At most two decimals: with
 * more, floating point can round where Postgres would not (2,449999999).
 */
export function parseClaimDistance(raw: string): ClaimDistanceResult {
  const text = raw.trim();
  if (text === '') return { ok: true, distanceM: null };
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(text)) return { ok: false };
  const value = Number(text.replace(',', '.'));
  // toFixed first: 0.15 * 10 is 1.4999… in floating point, and round(0.15, 1)
  // in Postgres is 0.2.
  const distanceM = Math.round(Number((value * 10).toFixed(6))) / 10;
  if (distanceM < CLAIM_DISTANCE_MIN_M || distanceM > CLAIM_DISTANCE_MAX_M) return { ok: false };
  return { ok: true, distanceM };
}

/** One tap on − or + in the distance field. */
export const DISTANCE_STEP_M = 0.5;

/**
 * The distance after a tap on − or +, or `null` when the tap would leave
 * CLAIM_DISTANCE_MIN_M–MAX_M. From an empty field, + gives the first step.
 * Rounded to one decimal so a run of taps never drifts (0.1 + 0.2). The app's
 * and the web's distance fields both step with this.
 */
export function stepDistance(current: number | null, direction: -1 | 1): number | null {
  if (current == null) return direction === 1 ? DISTANCE_STEP_M : null;
  const next = Math.round((current + direction * DISTANCE_STEP_M) * 10) / 10;
  if (next < CLAIM_DISTANCE_MIN_M || next > CLAIM_DISTANCE_MAX_M) return null;
  return next;
}

/**
 * The flights' reports for one hole, in the order the organiser reads them:
 * the shortest distance first, then reports without one (also «Ingen på
 * green»). Equal distances, and the reports without one, go by flight.
 */
export function sortClaimsForHole<T extends { distanceM: number | null; flightNumber: number }>(
  claims: readonly T[],
): T[] {
  return [...claims].sort((a, b) => {
    if (a.distanceM !== null && b.distanceM !== null && a.distanceM !== b.distanceM) {
      return a.distanceM - b.distanceM;
    }
    if (a.distanceM === null && b.distanceM !== null) return 1;
    if (a.distanceM !== null && b.distanceM === null) return -1;
    return a.flightNumber - b.flightNumber;
  });
}

/**
 * Which question the GIR card asks: on the green in par − 2 strokes. Par runs
 * 3–6 (`course_holes`, 0040); anything outside is clamped.
 */
export type GirQuestionKey = 'afterTeeShot' | 'onTwo' | 'onThree' | 'onFour';

export function girQuestionForPar(par: number): GirQuestionKey {
  if (par <= 3) return 'afterTeeShot';
  if (par === 4) return 'onTwo';
  if (par === 5) return 'onThree';
  return 'onFour';
}

/**
 * The caller's key in the claim tables, as `side_claim_flight_key` (0237)
 * computes it: 0 in a single-flight game (`isSingleFlightGame`: Wolf, or at
 * most four active players), else the caller's flight number. Null for a
 * withdrawn player, a non-player, and a player without a flight in a bigger
 * game: the rpcs answer `not_player` then and the SELECT policy shows
 * nothing, so the hole has no card to offer. Never a key of its own (#2891);
 * `sideContestDbCheck.test.ts` pins the SQL to the same rule.
 */
export function sideClaimFlightKey(
  gameMode: GameMode,
  players: readonly FlightPlayer[],
  userId: string,
): number | null {
  const me = players.find((p) => p.user_id === userId && p.withdrawn_at == null);
  if (!me) return null;
  return isSingleFlightGame(gameMode, [...players]) ? 0 : me.flight_number;
}

/**
 * Every key a flight reports under in this game: the distinct
 * `sideClaimFlightKey` of the active players, ascending. `[0]` in a
 * single-flight game; a withdrawn player or one without a flight in a bigger
 * game adds none. The finish uses it to name the flights that have not
 * reported, so it can never disagree with the key a flight saves under.
 */
export function claimFlightKeys(gameMode: GameMode, players: readonly FlightPlayer[]): number[] {
  const keys = new Set<number>();
  for (const p of players) {
    const key = sideClaimFlightKey(gameMode, players, p.user_id);
    if (key !== null) keys.add(key);
  }
  return [...keys].sort((a, b) => a - b);
}

/** A player as the GIR card needs it. */
export type GirBallPlayer = { userId: string; teamNumber: number | null };

/** One ball on the hole and the players who play it. */
export type GirBall = { key: string; userIds: string[] };

/**
 * The balls GIR is reported for: one per player, or one per side in the
 * foursomes family (`isAlternateShotMatchplay`), where the side plays one
 * ball. Pass the flight's active players (`resolveFlight`). A player without a
 * side in an alternate-shot game still gets a ball of their own.
 *
 * ASSUMPTION (contract): a foursomes side's GIR counts once. Counting per
 * player there too is a change to this function only.
 */
export function girBallsForGame(mode: GameMode, players: readonly GirBallPlayer[]): GirBall[] {
  if (!isAlternateShotMatchplay(mode)) {
    return players.map((p) => ({ key: p.userId, userIds: [p.userId] }));
  }
  const balls: GirBall[] = [];
  const bySide = new Map<number, GirBall>();
  for (const p of players) {
    if (p.teamNumber == null) {
      balls.push({ key: p.userId, userIds: [p.userId] });
      continue;
    }
    const side = bySide.get(p.teamNumber);
    if (side) {
      side.userIds.push(p.userId);
    } else {
      const ball = { key: `side-${p.teamNumber}`, userIds: [p.userId] };
      bySide.set(p.teamNumber, ball);
      balls.push(ball);
    }
  }
  return balls;
}

/** A `game_gir_claims` row as the sum needs it. */
export type GirClaimInput = { gameId: string; holeNumber: number; userId: string; hit: boolean };

/** One of the cup's games, as `getCupSnapshot` reads them, plus what decides the balls. */
export type GirSumGame = CupRosterGame & {
  id: string;
  gameMode: GameMode;
  holeSegment: HoleSegment;
  /** A derived game (0151) reports nothing; its host does. */
  sourceGameId: string | null;
};

export type GirTeamSum = {
  /** Balls on the green in regulation, a shared foursomes ball once. */
  count: number;
  /** The players on each ball that counted, in match order. */
  balls: CupRosterPlayer[][];
};

export type GirHoleSum = {
  team1: GirTeamSum;
  team2: GirTeamSum;
  /** Matches on this hole with at least one report. */
  reportedGameIds: string[];
  /** Matches that play this hole and have reported nothing for it. */
  missingGameIds: string[];
};

/**
 * Whether a cup match is where the hole's claims are made: never a derived
 * game (0151, it keeps no strokes of its own), and not a match whose half of a
 * split cup day does not include the hole. The one rule for «has this match
 * not reported yet?»: the GIR sums and the organiser's closest-to-pin and
 * longest-drive boxes both ask it.
 */
export function cupMatchReportsHole(
  game: Pick<GirSumGame, 'sourceGameId' | 'holeSegment'>,
  holeNumber: number,
): boolean {
  if (game.sourceGameId != null) return false;
  return holesForSegment([{ number: holeNumber }], game.holeSegment).length > 0;
}

/**
 * What the matches reported for one GIR hole, per cup team. The team comes
 * from `buildCupRoster`, the same lookup `getCupSnapshot` uses. A match that
 * does not report on the hole (`cupMatchReportsHole`) neither reports nor
 * counts as missing.
 *
 * This is shown beside the organiser's own counter, never written into it.
 */
export function sumGirClaimsByTeam(
  holeNumber: number,
  claims: readonly GirClaimInput[],
  games: readonly GirSumGame[],
): GirHoleSum {
  const roster = buildCupRoster(games);
  const teamOf = new Map<string, { team: 1 | 2; player: CupRosterPlayer }>();
  for (const player of roster.team1) teamOf.set(player.userId, { team: 1, player });
  for (const player of roster.team2) teamOf.set(player.userId, { team: 2, player });

  const sum: GirHoleSum = {
    team1: { count: 0, balls: [] },
    team2: { count: 0, balls: [] },
    reportedGameIds: [],
    missingGameIds: [],
  };

  for (const game of games) {
    if (!cupMatchReportsHole(game, holeNumber)) continue;

    const hits = new Map<string, boolean>();
    for (const claim of claims) {
      if (claim.gameId === game.id && claim.holeNumber === holeNumber) hits.set(claim.userId, claim.hit);
    }
    if (hits.size === 0) {
      sum.missingGameIds.push(game.id);
      continue;
    }
    sum.reportedGameIds.push(game.id);

    const balls = girBallsForGame(
      game.gameMode,
      game.players.map((p) => ({ userId: p.user_id, teamNumber: p.team_number })),
    );
    for (const ball of balls) {
      if (!ball.userIds.some((userId) => hits.get(userId) === true)) continue;
      const first = teamOf.get(ball.userIds[0]);
      if (!first) continue;
      const players = ball.userIds.flatMap((userId) => {
        const entry = teamOf.get(userId);
        return entry ? [entry.player] : [];
      });
      const team = first.team === 1 ? sum.team1 : sum.team2;
      team.count += 1;
      team.balls.push(players);
    }
  }

  return sum;
}
