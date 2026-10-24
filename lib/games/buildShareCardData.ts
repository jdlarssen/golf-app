/**
 * buildShareCardData — pure data-shaping function for shareable result-card
 * images (#942). Takes a computed ModeResult and resolves it into a
 * ShareCardModel that the image-generation route (built separately) can render
 * without further database access.
 *
 * No I/O. No side effects. Single source of truth for how each mode's score is
 * SHAPED on the card — but NOT how it's worded: the model carries structured
 * values (points/skins counts, vs-par labels, match outcomes), and the route
 * formats them via next-intl so the card follows the viewer's locale (#971).
 * Mirrors the band-routing of computeResultSummaries in lib/scoring/resultSummary.ts.
 */

import type { ModeResult, ShambleHoleRow, SoloStrokeplayHoleRow } from '@/lib/scoring/modes/types';
import { vsParOverPlayed } from '@/lib/leaderboard/vsPar';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ShareCardBand = 'placement' | 'skins' | 'matchplay';

/**
 * A competitor's score, structured so the route can localize it. `vsPar` is
 * locale-neutral golf notation (U+2212 minus / "E" / "+n") and carries its own
 * display label; `points`/`skins` carry the raw count for `t('points'|'skins')`.
 */
export type ShareCardScore =
  | { kind: 'points'; value: number }
  | { kind: 'skins'; value: number }
  | { kind: 'vsPar'; label: string };

export type ShareCardRow = {
  rank: number;
  /** Display name, already resolved by the caller (the result card passes public names, «Marte L.»). */
  name: string;
  /**
   * The names `name` is joined from, one per member in the order the caller's
   * ids had (one for a single player). The result card shortens a long team
   * name to first names from these (#2319).
   */
  memberNames: string[];
  /** Mode-framed score, structured for locale-aware rendering in the route. */
  score: ShareCardScore;
  /** True when this row is the sharer (for podium-row highlight). */
  isSharer: boolean;
  /**
   * The competitor's members, only when the caller asked for them
   * (`withUserIds`). The round report needs them to leave out players without
   * AI consent (#2561); the share card never sees ids.
   */
  userIds?: string[];
  /** The team's number for team rows, only with `withUserIds`. */
  teamNumber?: number;
};

export type ShareCardSide = { label: string; winnerName: string; isSharer: boolean };

/** The sharer's own matchplay outcome. `margin` is locale-neutral ("3&2", "2up", "AS"). */
export type ShareCardMatchOutcome =
  | { kind: 'won'; margin: string }
  | { kind: 'lost'; margin: string }
  | { kind: 'tied' };

/** The neutral matchplay headline. `undecided` when the match has no result yet. */
export type ShareCardMatchHeadline =
  | { kind: 'winner'; winnerName: string; margin: string }
  | { kind: 'tied' }
  | { kind: 'undecided' };

/** One side of a matchplay card (#2319). */
export type ShareCardMatchSide = {
  /** Members joined with « / ». */
  name: string;
  memberNames: string[];
  /** False on both sides when the match is halved or has no result yet. */
  won: boolean;
};

export type ShareCardMatch = {
  /** The sharer's outcome, or null when they aren't a participant. */
  sharerOutcome: ShareCardMatchOutcome | null;
  headline: ShareCardMatchHeadline;
  /** Both sides, side 1 first, for the card's two rows (#2319). */
  sides: [ShareCardMatchSide, ShareCardMatchSide];
};

export type ShareCardModel = {
  band: ShareCardBand;
  /** Top 3 (or fewer) by rank. Empty for the matchplay band. */
  podium: ShareCardRow[];
  /**
   * Every row sharing first place, also past the three on the podium, so a
   * tied first place names all its winners (#2318, #2319). Empty for the
   * matchplay band, an empty field and a skins round where nobody won a skin.
   */
  winners: ShareCardRow[];
  /** Present ONLY when the sharer is a participant AND finished outside the top 3. */
  sharerStrip: ShareCardRow | null;
  /** Matchplay band only; null otherwise. */
  match: ShareCardMatch | null;
  /** Resolved side-tournament winners; pass-through with isSharer computed. */
  sideTournaments: ShareCardSide[];
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildShareCardData(opts: {
  result: ModeResult;
  /** userId -> already-resolved display name. */
  nameByUserId: Map<string, string>;
  /** The sharer's userId, or null for a non-participant (=> neutral card, no strip/highlight). */
  sharerId: string | null;
  /**
   * Par for one ball per hole (`par_mens`), for the holes in the game's scope.
   * Drives the vs-par labels on the strokeplay modes, counted only over the
   * holes a competitor has a score on (#2217).
   */
  parByHole: ReadonlyMap<number, number>;
  /** Resolved side-tournament winners. winnerUserId null => unawarded (skip). */
  sideWinners: { label: string; winnerUserId: string | null }[];
  /**
   * Locale-resolved fallback for a competitor whose name is missing from
   * nameByUserId (caller's player list momentarily out of sync) — NEVER the raw
   * userId, which would dump a UUID onto a shared card. The route passes
   * `t('playerFallback')`; defaults to '' for unit tests that always supply names.
   */
  playerFallback?: string;
  /**
   * #2561: put `userIds` (and `teamNumber` on team rows) on the placement
   * rows. Off by default, so the share card's rows are unchanged.
   */
  withUserIds?: boolean;
}): ShareCardModel {
  const {
    result,
    nameByUserId,
    sharerId,
    parByHole,
    sideWinners,
    playerFallback = '',
    withUserIds = false,
  } = opts;
  const vsParScore = makeVsParScore(parByHole);

  const sideTournaments = buildSideTournaments(
    sideWinners,
    nameByUserId,
    sharerId,
    playerFallback,
  );

  switch (result.kind) {
    // -----------------------------------------------------------------------
    // Matchplay family → 'matchplay' band
    // -----------------------------------------------------------------------
    case 'singles_matchplay': {
      const side1Ids = [result.sides[0].userId];
      const side2Ids = [result.sides[1].userId];
      const match = buildMatchplayMatch(result.result, side1Ids, side2Ids, sharerId, nameByUserId, playerFallback);
      return { band: 'matchplay', podium: [], winners: [], sharerStrip: null, match, sideTournaments };
    }

    case 'fourball_matchplay': {
      const side1Ids = result.sides[0].players.map((p) => p.userId);
      const side2Ids = result.sides[1].players.map((p) => p.userId);
      const match = buildMatchplayMatch(result.result, side1Ids, side2Ids, sharerId, nameByUserId, playerFallback);
      return { band: 'matchplay', podium: [], winners: [], sharerStrip: null, match, sideTournaments };
    }

    case 'foursomes_matchplay': {
      const side1Ids = result.sides[0].players.map((p) => p.userId);
      const side2Ids = result.sides[1].players.map((p) => p.userId);
      const match = buildMatchplayMatch(result.result, side1Ids, side2Ids, sharerId, nameByUserId, playerFallback);
      return { band: 'matchplay', podium: [], winners: [], sharerStrip: null, match, sideTournaments };
    }

    // -----------------------------------------------------------------------
    // Skins → 'skins' band
    // -----------------------------------------------------------------------
    case 'skins': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'skins', value: p.totalSkins },
      }));
      return buildPlacementModel('skins', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    // -----------------------------------------------------------------------
    // Stableford → 'placement' band, points
    // -----------------------------------------------------------------------
    case 'stableford': {
      // #2625: a game ranked on net to par shows the engine's points against
      // par pace («+3», «E», «−2»), what it is ranked on.
      const toPar = result.ranking === 'net_to_par';
      if (result.variant === 'solo') {
        const rows: IndividualCompetitor[] = result.players.map((p) => ({
          userIds: [p.userId],
          rank: p.rank,
          score: toPar ? { kind: 'vsPar', label: vsParLabel(p.toPar) } : { kind: 'points', value: p.totalPoints },
        }));
        return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
      } else {
        // team stableford
        const rows: IndividualCompetitor[] = result.teams.map((t) => ({
          userIds: t.playerIds,
          teamNumber: t.teamNumber,
          rank: t.rank,
          score: toPar ? { kind: 'vsPar', label: vsParLabel(t.toPar) } : { kind: 'points', value: t.totalPoints },
        }));
        return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
      }
    }

    // -----------------------------------------------------------------------
    // Solo strokeplay → 'placement' band, vs-par label
    // -----------------------------------------------------------------------
    case 'solo_strokeplay': {
      // #2253: a game ranked on net to par shows the engine's own number,
      // against each player's own par. The par_mens map would put a lady on
      // par 72 one stroke off per stroke of par difference.
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score:
          result.ranking === 'net_to_par'
            ? { kind: 'vsPar', label: vsParLabel(p.netToPar) }
            : vsParScore(p.totalNetStrokes, soloUnplayedHoles(result.holes, p.userId), result.holes.length),
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    // -----------------------------------------------------------------------
    // Team strokeplay modes → 'placement' band, vs-par label
    // -----------------------------------------------------------------------
    case 'best_ball': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.playerIds,
        teamNumber: t.teamNumber,
        rank: t.rank,
        // best_ball uses `total` (net total strokes). #2625: a game ranked on
        // net to par shows the team's own to par, what it is ranked on.
        score:
          result.ranking === 'net_to_par'
            ? { kind: 'vsPar', label: vsParLabel(t.toPar) }
            : vsParScore(t.total, teamUnplayedHoles(t.holes), t.holes.length),
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    case 'texas_scramble': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.members.map((m) => m.userId),
        teamNumber: t.teamNumber,
        rank: t.rank,
        score:
          result.ranking === 'net_to_par'
            ? { kind: 'vsPar', label: vsParLabel(t.toPar) }
            : vsParScore(t.totalNet, teamUnplayedHoles(t.holes), t.holes.length),
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    case 'shamble': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.members,
        teamNumber: t.teamNumber,
        rank: t.rank,
        // shamble uses `totalScore` (net strokes sum) — the `count` lowest
        // balls per hole, so par counts `count` times (#2217).
        score:
          result.ranking === 'net_to_par'
            ? { kind: 'vsPar', label: vsParLabel(t.toPar) }
            : vsParScore(
                t.totalScore,
                shambleUnplayedHoles(result.holes, t.teamNumber),
                result.holes.length,
                result.count,
              ),
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    case 'patsome': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.playerIds,
        teamNumber: t.teamNumber,
        rank: t.rank,
        // patsome uses stableford points; #2625: points against par pace in a
        // game ranked on net to par.
        score:
          result.ranking === 'net_to_par'
            ? { kind: 'vsPar', label: vsParLabel(t.toPar) }
            : { kind: 'points', value: t.totalPoints },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    // -----------------------------------------------------------------------
    // Point modes → 'placement' band, points
    // -----------------------------------------------------------------------
    case 'wolf': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.totalPoints },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    case 'nassau': {
      // Nassau primary ranking is by units won (0-3)
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.units },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    case 'bingo_bango_bongo': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.totalPoints },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    case 'nines': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.totalPoints },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    case 'round_robin': {
      // Round Robin ranks by totalHoleWins
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.totalHoleWins },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    case 'acey_deucey': {
      // Acey Deucey total can be negative — rendered as "{total} poeng"
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.total },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback, withUserIds);
    }

    default: {
      // Exhaustive check — TypeScript will error here if a ModeResult kind is unhandled
      const _exhaustive: never = result;
      throw new Error(`Unhandled ModeResult kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * A unified competitor representation used internally before resolving names.
 * For individual modes, userIds has one entry. For team modes, all members.
 */
type IndividualCompetitor = {
  /** All userId members for this competitor slot (1 for individual, N for team). */
  userIds: string[];
  /** Set on team competitors only (#2561, for the round report's «Lag N»). */
  teamNumber?: number;
  rank: number;
  score: ShareCardScore;
};

/**
 * Builds the placement/skins band model from a flat list of competitors.
 * Sorts by rank ascending, secondary by resolved display name for stability on ties.
 * Takes the top 3 for the podium. Computes sharerStrip when applicable.
 */
function buildPlacementModel(
  band: ShareCardBand,
  competitors: IndividualCompetitor[],
  nameByUserId: Map<string, string>,
  sharerId: string | null,
  sideTournaments: ShareCardSide[],
  playerFallback: string,
  withUserIds: boolean,
): ShareCardModel {
  // Sort: rank ascending, then name ascending for stable tie ordering
  const sorted = [...competitors].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return resolveTeamName(a.userIds, nameByUserId, playerFallback).localeCompare(
      resolveTeamName(b.userIds, nameByUserId, playerFallback),
    );
  });

  // Resolve all rows
  const allRows: ShareCardRow[] = sorted.map((c) => ({
    rank: c.rank,
    name: resolveTeamName(c.userIds, nameByUserId, playerFallback),
    memberNames: resolveMemberNames(c.userIds, nameByUserId, playerFallback),
    score: c.score,
    isSharer: sharerId !== null && c.userIds.includes(sharerId),
    ...(withUserIds
      ? { userIds: c.userIds, ...(c.teamNumber !== undefined ? { teamNumber: c.teamNumber } : {}) }
      : {}),
  }));

  const podium = allRows.slice(0, 3);
  // A skins round where nobody took a skin has no winner, even though the
  // whole field shares rank 1: plain rows, no gold on «0 skins».
  const nobodyWon =
    band === 'skins' && podium[0]?.score.kind === 'skins' && podium[0].score.value === 0;
  // Every row sharing first place, also past the third: four tied on 38 are four
  // winners, even though the podium shows three rows.
  const winners = nobodyWon ? [] : allRows.filter((r) => r.rank === allRows[0].rank);

  // sharerStrip: null if sharerId null, null if sharer in top 3, otherwise their row
  let sharerStrip: ShareCardRow | null = null;
  if (sharerId !== null) {
    const sharerInTop3 = podium.some((r) => r.isSharer);
    if (!sharerInTop3) {
      const sharerRow = allRows.find((r) => r.isSharer) ?? null;
      sharerStrip = sharerRow;
    }
  }

  return { band, podium, winners, sharerStrip, match: null, sideTournaments };
}

/**
 * Resolves a team's display name by joining member names with " / ".
 * Falls back to the caller-supplied `playerFallback` when a name is missing —
 * NEVER the raw userId, which would dump a UUID onto a shared card. (A
 * competitor can be in the computed result but absent from nameByUserId if the
 * caller's player list is momentarily out of sync.)
 */
function resolveTeamName(
  userIds: string[],
  nameByUserId: Map<string, string>,
  playerFallback: string,
): string {
  return resolveMemberNames(userIds, nameByUserId, playerFallback).join(' / ');
}

/** One resolved name per member, with the same fallback as `resolveTeamName`. */
function resolveMemberNames(
  userIds: readonly string[],
  nameByUserId: Map<string, string>,
  playerFallback: string,
): string[] {
  return userIds.map((id) => nameByUserId.get(id) ?? playerFallback);
}

/**
 * A vs-par score builder over the given par map (#2217 D6): total − balls ×
 * (par for the holes the competitor has a score on), via `vsParOverPlayed`.
 * `holesInScope` is the number of hole rows the competitor has; 0 (no rows,
 * as in hand-built fixtures) compares with the full scope par.
 */
function makeVsParScore(parByHole: ReadonlyMap<number, number>) {
  let scopePar = 0;
  for (const par of parByHole.values()) scopePar += par;
  return (
    total: number,
    unplayedHoleNumbers: readonly number[],
    holesInScope: number,
    balls = 1,
  ): ShareCardScore => ({
    kind: 'vsPar',
    label: vsParLabel(
      vsParOverPlayed({
        total,
        scopePar,
        unplayedPars: unplayedHoleNumbers.map((n) => parByHole.get(n) ?? 0),
        holesInScope,
        balls,
      }),
    ),
  });
}

/** Holes a solo player has no net on: the cell is missing or `net` is null. */
function soloUnplayedHoles(holes: readonly SoloStrokeplayHoleRow[], userId: string): number[] {
  return holes
    .filter((h) => h.perPlayer.find((c) => c.userId === userId)?.net == null)
    .map((h) => h.holeNumber);
}

/** Holes a best-ball or scramble team has no net on. */
function teamUnplayedHoles(
  holes: ReadonlyArray<{ holeNumber: number; teamNet: number | null }>,
): number[] {
  return holes.filter((h) => h.teamNet == null).map((h) => h.holeNumber);
}

/** Holes a shamble team has no score on: the cell is missing or `teamScore` is null. */
function shambleUnplayedHoles(holes: readonly ShambleHoleRow[], teamNumber: number): number[] {
  return holes
    .filter((h) => h.teams.find((c) => c.teamNumber === teamNumber)?.teamScore == null)
    .map((h) => h.holeNumber);
}

/**
 * Formats a vs-par difference as a label. Uses U+2212 (minus sign) for
 * negative values, as per the spec: −2 → "−2", 0 → "E", 3 → "+3". `null` (no
 * played hole) → "—".
 */
function vsParLabel(diff: number | null): string {
  if (diff === null) return '—';
  if (diff === 0) return 'E';
  if (diff < 0) return `−${Math.abs(diff)}`; // U+2212 minus sign
  return `+${diff}`;
}

/**
 * Builds the matchplay match block as structured outcome/headline values, which
 * the route words via next-intl. Returns a non-null match even when the result
 * is null (unresolved match) so the card can show a neutral 'undecided' headline.
 */
function buildMatchplayMatch(
  matchResult: { winner: 'side1' | 'side2' | 'tied'; formatted: string } | null,
  side1UserIds: ReadonlyArray<string>,
  side2UserIds: ReadonlyArray<string>,
  sharerId: string | null,
  nameByUserId: Map<string, string>,
  playerFallback: string,
): ShareCardMatch {
  const sideOf = (ids: ReadonlyArray<string>, won: boolean): ShareCardMatchSide => ({
    name: resolveTeamName([...ids], nameByUserId, playerFallback),
    memberNames: resolveMemberNames(ids, nameByUserId, playerFallback),
    won,
  });

  if (matchResult === null) {
    // Match not yet decided
    return {
      sharerOutcome: null,
      headline: { kind: 'undecided' },
      sides: [sideOf(side1UserIds, false), sideOf(side2UserIds, false)],
    };
  }

  const { winner, formatted } = matchResult;

  // Determine which side the sharer is on (if any)
  const sharerOnSide1 = sharerId !== null && side1UserIds.includes(sharerId);
  const sharerOnSide2 = sharerId !== null && side2UserIds.includes(sharerId);
  const sharerParticipates = sharerOnSide1 || sharerOnSide2;

  // Compute the sharer's outcome (null when they aren't a participant)
  let sharerOutcome: ShareCardMatchOutcome | null = null;
  if (sharerParticipates) {
    if (winner === 'tied') {
      sharerOutcome = { kind: 'tied' };
    } else if (
      (winner === 'side1' && sharerOnSide1) ||
      (winner === 'side2' && sharerOnSide2)
    ) {
      sharerOutcome = { kind: 'won', margin: formatted };
    } else {
      sharerOutcome = { kind: 'lost', margin: formatted };
    }
  }

  // Compute the neutral headline
  let headline: ShareCardMatchHeadline;
  if (winner === 'tied') {
    headline = { kind: 'tied' };
  } else {
    const winnerIds = winner === 'side1' ? side1UserIds : side2UserIds;
    const winnerName = resolveTeamName([...winnerIds], nameByUserId, playerFallback);
    headline = { kind: 'winner', winnerName, margin: formatted };
  }

  return {
    sharerOutcome,
    headline,
    sides: [
      sideOf(side1UserIds, winner === 'side1'),
      sideOf(side2UserIds, winner === 'side2'),
    ],
  };
}

/**
 * Maps sideWinners to ShareCardSide[], skipping entries with null winnerUserId.
 */
function buildSideTournaments(
  sideWinners: { label: string; winnerUserId: string | null }[],
  nameByUserId: Map<string, string>,
  sharerId: string | null,
  playerFallback: string,
): ShareCardSide[] {
  return sideWinners
    .filter((s): s is { label: string; winnerUserId: string } => s.winnerUserId !== null)
    .map((s) => ({
      label: s.label,
      // Never blank on a shared card — same neutral fallback as resolveTeamName.
      winnerName: nameByUserId.get(s.winnerUserId) ?? playerFallback,
      isSharer: s.winnerUserId === sharerId,
    }));
}
