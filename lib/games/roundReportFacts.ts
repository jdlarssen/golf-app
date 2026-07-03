/**
 * buildRoundReportFacts — pure fact-serializer for the AI round-report
 * generator (#1008). Takes a computed `ModeResult` and shapes a compact,
 * JSON-serializable facts object that becomes the ONLY source of numbers
 * the LLM is allowed to use.
 *
 * No I/O. No side effects. Reuses `buildShareCardData` for standings/winner/
 * matchplay-headline — this module never re-derives a total, a rank, or a
 * margin from raw `ModeResult` fields. That's the acceptance criterion in
 * the contract (#1008): "the report never states numbers contradicting the
 * leaderboard", enforced by construction (single computation path) plus the
 * Type A tests here (facts numbers === ModeResult numbers).
 *
 * Bands mirror `ShareCardBand` plus the skins/matchplay split already used
 * by `buildShareCardData`/`computeResultSummaries`:
 *  - 'matchplay' — singles/fourball/foursomes (incl. greensome/chapman/
 *    gruesome, which alias to the foursomes `ModeResult.kind` at the scoring
 *    layer).
 *  - 'skins'     — skins.
 *  - 'placement' — everything else (individual + team strokeplay/stableford/
 *    scramble + point games).
 */

import type { GameMode, ModeResult } from '@/lib/scoring/modes/types';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import { runningMatchStatus } from '@/lib/scoring/modes/matchplayRunningStatus';
import { buildShareCardData, type ShareCardBand } from './buildShareCardData';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RoundReportBand = ShareCardBand;

export type RoundReportStandingRow = {
  rank: number;
  name: string;
  /** Mode-framed score label, already formatted (vs-par / points / skins). */
  scoreLabel: string;
};

export type RoundReportCheckpoint = {
  afterHole: number;
  /**
   * Running raw-score leader at this marker. At the FINAL scored hole the
   * leader is the standings winner (tiebreak included), never the raw-sum
   * leader — otherwise a raw tie makes the facts contradict `winnerName`
   * (#1029). Ties at mid-round markers keep first-encountered raw leader.
   */
  leaderName: string;
};

export type RoundReportMatchplayFacts =
  | { undecided: true }
  | {
      undecided: false;
      winnerName: string;
      /** Golf-notation margin, e.g. '3&2', '2up', 'AS' — verbatim from ModeResult. */
      margin: string;
      /** Only present when the match was decided before hole 18 (mat-em). */
      decidedAtHole: number | null;
      /** Number of times the lead changed sides across the played holes. */
      leadChanges: number;
      /** Biggest lead side 1 held at any point (holes up), 0 if never ahead. */
      biggestLeadSide1: number;
      /** Biggest lead side 2 held at any point (holes up), 0 if never ahead. */
      biggestLeadSide2: number;
    };

export type RoundReportSkinsFacts = {
  bigSkinHoles: Array<{
    holeNumber: number;
    skinsAwarded: number;
    winnerName: string;
    carriedIn: number;
  }>;
  /** Unwon pot hanging at the last resolved hole. 0 = nothing carried. */
  carriedPot: number;
};

export type RoundReportFacts = {
  gameName: string;
  courseName: string | null;
  endedAt: string | null;
  formatLabel: string;
  band: RoundReportBand;
  winnerName: string | null;
  standings: RoundReportStandingRow[];
  /** Number of holes with at least one recorded score, computed deterministically. */
  scoredHoles: number;
  /** Only present for solo strokeplay/stableford — leader after holes 6/12/18. */
  checkpoints?: RoundReportCheckpoint[];
  /**
   * Present (true) when the top two placement rows carry the same score label
   * — the raw scores tied and the winner was separated only by the tiebreak
   * cascade. Lets the report say «avgjort på tiebreak» with cover (#1029).
   */
  decidedByTiebreak?: true;
  /** Only present when band === 'placement' AND a margin was cheaply derivable. */
  margin?: string;
  /** Only present when band === 'matchplay'. */
  matchplay?: RoundReportMatchplayFacts;
  /** Only present when band === 'skins'. */
  skins?: RoundReportSkinsFacts;
};

export type BuildRoundReportFactsOpts = {
  result: ModeResult;
  /** userId -> already-resolved display name (formatRevealName applied by caller). */
  nameByUserId: Map<string, string>;
  gameName: string;
  courseName: string | null;
  endedAt: string | null;
  gameMode: GameMode;
  coursePar: number | null;
};

const PLAYER_FALLBACK = 'Ukjent spiller';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildRoundReportFacts(
  opts: BuildRoundReportFactsOpts,
): RoundReportFacts {
  const { result, nameByUserId, gameName, courseName, endedAt, gameMode, coursePar } = opts;

  const card = buildShareCardData({
    result,
    nameByUserId,
    sharerId: null,
    coursePar: coursePar ?? 0,
    sideWinners: [],
    playerFallback: PLAYER_FALLBACK,
  });

  const standings: RoundReportStandingRow[] = card.podium.map((row) => ({
    rank: row.rank,
    name: row.name,
    scoreLabel: formatScoreLabel(row.score),
  }));

  const facts: RoundReportFacts = {
    gameName,
    courseName,
    endedAt,
    formatLabel: MODE_LABELS[gameMode],
    band: card.band,
    winnerName: card.winner?.name ?? matchplayWinnerNameFallback(card),
    standings,
    scoredHoles: computeScoredHoles(result),
  };

  if (card.band === 'matchplay') {
    facts.matchplay = buildMatchplayFacts(result, nameByUserId);
  } else if (card.band === 'skins' && result.kind === 'skins') {
    facts.skins = buildSkinsFacts(result, nameByUserId);
  } else if (card.band === 'placement') {
    const checkpoints = buildCheckpoints(result, nameByUserId, facts.winnerName);
    if (checkpoints) facts.checkpoints = checkpoints;
    if (
      standings.length >= 2 &&
      standings[0].rank !== standings[1].rank &&
      standings[0].scoreLabel === standings[1].scoreLabel
    ) {
      facts.decidedByTiebreak = true;
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Score-label formatting (from the already-structured ShareCardScore)
// ---------------------------------------------------------------------------

function formatScoreLabel(score: { kind: 'points'; value: number } | { kind: 'skins'; value: number } | { kind: 'vsPar'; label: string }): string {
  switch (score.kind) {
    case 'points':
      return `${score.value} poeng`;
    case 'skins':
      return `${score.value} skins`;
    case 'vsPar':
      return score.label;
  }
}

/** buildShareCardData returns `winner: null` for the matchplay band (no podium). */
function matchplayWinnerNameFallback(card: ReturnType<typeof buildShareCardData>): string | null {
  if (card.band !== 'matchplay' || card.match === null) return null;
  return card.match.headline.kind === 'winner' ? card.match.headline.winnerName : null;
}

// ---------------------------------------------------------------------------
// scoredHoles — deterministic per-kind hole counting.
//
// "At least one recorded score" means: at least one participant's `gross`
// (or side gross, for matchplay) is non-null on that hole row. Every
// ModeResult variant carries per-hole rows somewhere — top-level `holes`,
// or nested under `teams[].holes` for the team-owned-scorecard formats.
// ---------------------------------------------------------------------------

function computeScoredHoles(result: ModeResult): number {
  switch (result.kind) {
    case 'solo_strokeplay':
    case 'skins':
    case 'nines':
    case 'acey_deucey':
    case 'nassau':
      return result.holes.filter((h) => h.perPlayer.some((p) => p.gross !== null)).length;

    case 'wolf':
      // WolfHoleRow has no per-hole gross field (choice/outcome-driven, not a
      // raw-score row) — fall back to `outcome !== 'pending'` as the closest
      // available "this hole was resolved" signal.
      return result.holes.filter((h) => h.outcome !== 'pending').length;

    case 'bingo_bango_bongo':
      // BingoBangoBongoHoleRow tracks achievement-winners, not gross — a hole
      // counts as scored once at least one of bingo/bango/bongo was awarded.
      return result.holes.filter(
        (h) => h.bingoUserId !== null || h.bangoUserId !== null || h.bongoUserId !== null,
      ).length;

    case 'stableford':
      if (result.variant === 'solo') {
        return result.holes.filter((h) => h.perPlayer.some((p) => p.gross !== null)).length;
      }
      // Team stableford: per-hull rows live under teams[].holes (captain-owned
      // rows are shared across 4BBB partners, so scan every team).
      return countScoredHolesAcrossTeams(result.teams, (h) => h.players.some((p) => p.gross !== null));

    case 'best_ball':
      return countScoredHolesAcrossTeams(result.teams, (h) => h.players.some((p) => p.gross !== null));

    case 'texas_scramble':
      return countScoredHolesAcrossTeams(result.teams, (h) => h.teamGross !== null);

    case 'patsome':
      return countScoredHolesAcrossTeams(
        result.teams,
        (h) => h.players.some((p) => p.gross !== null) || h.teamGross !== null,
      );

    case 'shamble':
      return result.holes.filter((h) =>
        h.teams.some((t) => t.perPlayer.some((p) => p.gross !== null)),
      ).length;

    case 'singles_matchplay':
      return result.holes.filter((h) => h.side1Gross !== null || h.side2Gross !== null).length;

    case 'fourball_matchplay':
      return result.holes.filter(
        (h) =>
          h.side1Players.some((p) => p.gross !== null) ||
          h.side2Players.some((p) => p.gross !== null),
      ).length;

    case 'foursomes_matchplay':
      return result.holes.filter((h) => h.side1Gross !== null || h.side2Gross !== null).length;

    case 'round_robin':
      return result.holes.filter(
        (h) =>
          h.side1Players.some((p) => p.gross !== null) ||
          h.side2Players.some((p) => p.gross !== null),
      ).length;

    default: {
      const _exhaustive: never = result;
      throw new Error(`Unhandled ModeResult kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Union of hole-numbers considered "scored" across a team-owned-scorecard
 * format's `teams[].holes` rows — a hole counts once any team has a
 * recorded score on it, even if other teams haven't reached that hole yet.
 */
function countScoredHolesAcrossTeams<T extends { holeNumber: number }>(
  teams: ReadonlyArray<{ holes: ReadonlyArray<T> }>,
  isScored: (hole: T) => boolean,
): number {
  const scoredHoleNumbers = new Set<number>();
  for (const team of teams) {
    for (const hole of team.holes) {
      if (isScored(hole)) scoredHoleNumbers.add(hole.holeNumber);
    }
  }
  return scoredHoleNumbers.size;
}

// ---------------------------------------------------------------------------
// Matchplay extra facts — margin, decidedAtHole, momentum
// ---------------------------------------------------------------------------

function buildMatchplayFacts(
  result: ModeResult,
  nameByUserId: Map<string, string>,
): RoundReportMatchplayFacts {
  if (
    result.kind !== 'singles_matchplay' &&
    result.kind !== 'fourball_matchplay' &&
    result.kind !== 'foursomes_matchplay'
  ) {
    // Should be unreachable — buildShareCardData only returns band='matchplay'
    // for these three kinds — but keep the guard explicit and honest.
    return { undecided: true };
  }

  if (result.result === null) return { undecided: true };

  const side1UserIds = matchplaySideUserIds(result, 1);
  const side2UserIds = matchplaySideUserIds(result, 2);
  const winnerUserIds = result.result.winner === 'side1' ? side1UserIds : side2UserIds;
  const winnerName = joinNames(winnerUserIds, nameByUserId);

  const holeResults = result.holes.map((h) => h.result);
  const running = runningMatchStatus(holeResults).filter((v): v is number => v !== null);
  const { leadChanges, biggestLeadSide1, biggestLeadSide2 } = computeMomentum(running);

  return {
    undecided: false,
    winnerName,
    margin: result.result.formatted,
    decidedAtHole: result.result.decidedAtHole < 18 ? result.result.decidedAtHole : null,
    leadChanges,
    biggestLeadSide1,
    biggestLeadSide2,
  };
}

function matchplaySideUserIds(
  result:
    | Extract<ModeResult, { kind: 'singles_matchplay' }>
    | Extract<ModeResult, { kind: 'fourball_matchplay' }>
    | Extract<ModeResult, { kind: 'foursomes_matchplay' }>,
  sideNumber: 1 | 2,
): string[] {
  // Narrow on `result.kind` before touching `sides` — TS can't distribute the
  // union across `result.sides[i]` on its own (indexed access isn't
  // discriminated the way `result.kind` is).
  if (result.kind === 'singles_matchplay') {
    return [result.sides[sideNumber - 1].userId];
  }
  return result.sides[sideNumber - 1].players.map((p) => p.userId);
}

/**
 * Momentum from the `runningMatchStatus` sequence: lead changes = number of
 * sign flips (positive <-> negative, ignoring zero/AS plateaus), plus the
 * biggest lead (max holesUp) each side ever held.
 */
function computeMomentum(running: number[]): {
  leadChanges: number;
  biggestLeadSide1: number;
  biggestLeadSide2: number;
} {
  let leadChanges = 0;
  let lastSign = 0;
  let biggestLeadSide1 = 0;
  let biggestLeadSide2 = 0;

  for (const holesUp of running) {
    if (holesUp > biggestLeadSide1) biggestLeadSide1 = holesUp;
    if (-holesUp > biggestLeadSide2) biggestLeadSide2 = -holesUp;

    const sign = Math.sign(holesUp);
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) leadChanges += 1;
    if (sign !== 0) lastSign = sign;
  }

  return { leadChanges, biggestLeadSide1, biggestLeadSide2 };
}

// ---------------------------------------------------------------------------
// Skins extra facts
// ---------------------------------------------------------------------------

function buildSkinsFacts(
  result: Extract<ModeResult, { kind: 'skins' }>,
  nameByUserId: Map<string, string>,
): RoundReportSkinsFacts {
  const bigSkinHoles = result.holes
    .filter((h) => h.skinsAwarded >= 2 && h.winnerUserId !== null)
    .map((h) => ({
      holeNumber: h.holeNumber,
      skinsAwarded: h.skinsAwarded,
      winnerName: nameByUserId.get(h.winnerUserId as string) ?? PLAYER_FALLBACK,
      carriedIn: h.carriedIn,
    }));

  return { bigSkinHoles, carriedPot: result.carriedPot };
}

// ---------------------------------------------------------------------------
// Placement checkpoints — solo_strokeplay / solo stableford only (cheap
// cumulative-leader lookup at fixed hole markers).
// ---------------------------------------------------------------------------

function buildCheckpoints(
  result: ModeResult,
  nameByUserId: Map<string, string>,
  finalLeaderName: string | null,
): RoundReportCheckpoint[] | null {
  if (result.kind === 'solo_strokeplay') {
    return checkpointsFromCumulative(
      result.holes.map((h) => ({
        holeNumber: h.holeNumber,
        perPlayer: h.perPlayer.map((p) => ({ userId: p.userId, value: p.net })),
      })),
      nameByUserId,
      // Lower cumulative net strokes = leading.
      (a, b) => a - b,
      finalLeaderName,
    );
  }

  if (result.kind === 'stableford' && result.variant === 'solo') {
    return checkpointsFromCumulative(
      result.holes.map((h) => ({
        holeNumber: h.holeNumber,
        perPlayer: h.perPlayer.map((p) => ({ userId: p.userId, value: p.gross !== null ? p.points : null })),
      })),
      nameByUserId,
      // Higher cumulative points = leading.
      (a, b) => b - a,
      finalLeaderName,
    );
  }

  return null;
}

/**
 * Shared checkpoint-derivation for solo strokeplay/stableford: walks holes in
 * order accumulating each player's per-hole value, and records the leader
 * (by `compare`) after hole 6, hole 12, and the final scored hole. A hole
 * with a null value for a player doesn't change that player's running total
 * (mirrors "hole not played yet" — pick-up holes stay excluded).
 *
 * The LAST checkpoint always sits at the final scored hole, i.e. it describes
 * the finished round — so its leader is `finalLeaderName` (the standings
 * winner, tiebreak included), never the raw-sum leader. A raw tie otherwise
 * produces facts where «ledet etter siste hull» contradicts `winnerName`
 * (#1029).
 */
function checkpointsFromCumulative(
  holes: Array<{ holeNumber: number; perPlayer: Array<{ userId: string; value: number | null }> }>,
  nameByUserId: Map<string, string>,
  compare: (a: number, b: number) => number,
  finalLeaderName: string | null,
): RoundReportCheckpoint[] | null {
  const sorted = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);
  const cumulative = new Map<string, number>();
  const checkpoints: RoundReportCheckpoint[] = [];

  const markers = new Set([6, 12]);
  let lastScoredHole: number | null = null;

  for (const hole of sorted) {
    let anyScored = false;
    for (const p of hole.perPlayer) {
      if (p.value === null) continue;
      anyScored = true;
      cumulative.set(p.userId, (cumulative.get(p.userId) ?? 0) + p.value);
    }
    if (anyScored) lastScoredHole = hole.holeNumber;
    if (markers.has(hole.holeNumber) && cumulative.size > 0) {
      const leaderName = leaderFromCumulative(cumulative, nameByUserId, compare);
      if (leaderName) checkpoints.push({ afterHole: hole.holeNumber, leaderName });
    }
  }

  if (lastScoredHole !== null && !markers.has(lastScoredHole) && cumulative.size > 0) {
    const leaderName = leaderFromCumulative(cumulative, nameByUserId, compare);
    if (leaderName) checkpoints.push({ afterHole: lastScoredHole, leaderName });
  }

  if (checkpoints.length > 0 && finalLeaderName !== null) {
    const last = checkpoints[checkpoints.length - 1];
    checkpoints[checkpoints.length - 1] = { ...last, leaderName: finalLeaderName };
  }

  return checkpoints.length > 0 ? checkpoints : null;
}

function leaderFromCumulative(
  cumulative: Map<string, number>,
  nameByUserId: Map<string, string>,
  compare: (a: number, b: number) => number,
): string | null {
  let bestUserId: string | null = null;
  let bestValue = 0;
  for (const [userId, value] of cumulative) {
    if (bestUserId === null || compare(value, bestValue) < 0) {
      bestUserId = userId;
      bestValue = value;
    }
  }
  if (bestUserId === null) return null;
  return nameByUserId.get(bestUserId) ?? PLAYER_FALLBACK;
}

// ---------------------------------------------------------------------------
// Name helpers
// ---------------------------------------------------------------------------

function joinNames(userIds: string[], nameByUserId: Map<string, string>): string {
  return userIds.map((id) => nameByUserId.get(id) ?? PLAYER_FALLBACK).join(' / ');
}
