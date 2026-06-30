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

import type { ModeResult } from '@/lib/scoring/modes/types';

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
  /** Display name, already resolved by the caller (formatRevealName applied). */
  name: string;
  /** Mode-framed score, structured for locale-aware rendering in the route. */
  score: ShareCardScore;
  /** True when this row is the sharer (for podium-row highlight). */
  isSharer: boolean;
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

export type ShareCardMatch = {
  /** The sharer's outcome, or null when they aren't a participant. */
  sharerOutcome: ShareCardMatchOutcome | null;
  headline: ShareCardMatchHeadline;
};

export type ShareCardModel = {
  band: ShareCardBand;
  /** Top 3 (or fewer) by rank. Empty for the matchplay band. */
  podium: ShareCardRow[];
  /** Convenience: podium[0] for the champagne hero, or null. */
  winner: ShareCardRow | null;
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
  /** Course par total, for vs-par score labels on strokeplay modes. */
  coursePar: number;
  /** Resolved side-tournament winners. winnerUserId null => unawarded (skip). */
  sideWinners: { label: string; winnerUserId: string | null }[];
  /**
   * Locale-resolved fallback for a competitor whose name is missing from
   * nameByUserId (caller's player list momentarily out of sync) — NEVER the raw
   * userId, which would dump a UUID onto a shared card. The route passes
   * `t('playerFallback')`; defaults to '' for unit tests that always supply names.
   */
  playerFallback?: string;
}): ShareCardModel {
  const {
    result,
    nameByUserId,
    sharerId,
    coursePar,
    sideWinners,
    playerFallback = '',
  } = opts;

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
      return { band: 'matchplay', podium: [], winner: null, sharerStrip: null, match, sideTournaments };
    }

    case 'fourball_matchplay': {
      const side1Ids = result.sides[0].players.map((p) => p.userId);
      const side2Ids = result.sides[1].players.map((p) => p.userId);
      const match = buildMatchplayMatch(result.result, side1Ids, side2Ids, sharerId, nameByUserId, playerFallback);
      return { band: 'matchplay', podium: [], winner: null, sharerStrip: null, match, sideTournaments };
    }

    case 'foursomes_matchplay': {
      const side1Ids = result.sides[0].players.map((p) => p.userId);
      const side2Ids = result.sides[1].players.map((p) => p.userId);
      const match = buildMatchplayMatch(result.result, side1Ids, side2Ids, sharerId, nameByUserId, playerFallback);
      return { band: 'matchplay', podium: [], winner: null, sharerStrip: null, match, sideTournaments };
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
      return buildPlacementModel('skins', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    // -----------------------------------------------------------------------
    // Stableford → 'placement' band, points
    // -----------------------------------------------------------------------
    case 'stableford': {
      if (result.variant === 'solo') {
        const rows: IndividualCompetitor[] = result.players.map((p) => ({
          userIds: [p.userId],
          rank: p.rank,
          score: { kind: 'points', value: p.totalPoints },
        }));
        return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
      } else {
        // team stableford
        const rows: IndividualCompetitor[] = result.teams.map((t) => ({
          userIds: t.playerIds,
          rank: t.rank,
          score: { kind: 'points', value: t.totalPoints },
        }));
        return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
      }
    }

    // -----------------------------------------------------------------------
    // Solo strokeplay → 'placement' band, vs-par label
    // -----------------------------------------------------------------------
    case 'solo_strokeplay': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'vsPar', label: vsParLabel(p.totalNetStrokes, coursePar) },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    // -----------------------------------------------------------------------
    // Team strokeplay modes → 'placement' band, vs-par label
    // -----------------------------------------------------------------------
    case 'best_ball': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.playerIds,
        rank: t.rank,
        // best_ball uses `total` (net total strokes)
        score: { kind: 'vsPar', label: vsParLabel(t.total, coursePar) },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    case 'texas_scramble': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.members.map((m) => m.userId),
        rank: t.rank,
        score: { kind: 'vsPar', label: vsParLabel(t.totalNet, coursePar) },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    case 'shamble': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.members,
        rank: t.rank,
        // shamble uses `totalScore` (net strokes sum)
        score: { kind: 'vsPar', label: vsParLabel(t.totalScore, coursePar) },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    case 'patsome': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.playerIds,
        rank: t.rank,
        // patsome uses stableford points
        score: { kind: 'points', value: t.totalPoints },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
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
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    case 'nassau': {
      // Nassau primary ranking is by units won (0-3)
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.units },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    case 'bingo_bango_bongo': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.totalPoints },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    case 'nines': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.totalPoints },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    case 'round_robin': {
      // Round Robin ranks by totalHoleWins
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.totalHoleWins },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
    }

    case 'acey_deucey': {
      // Acey Deucey total can be negative — rendered as "{total} poeng"
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        score: { kind: 'points', value: p.total },
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments, playerFallback);
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
    score: c.score,
    isSharer: sharerId !== null && c.userIds.includes(sharerId),
  }));

  const podium = allRows.slice(0, 3);
  const winner = podium[0] ?? null;

  // sharerStrip: null if sharerId null, null if sharer in top 3, otherwise their row
  let sharerStrip: ShareCardRow | null = null;
  if (sharerId !== null) {
    const sharerInTop3 = podium.some((r) => r.isSharer);
    if (!sharerInTop3) {
      const sharerRow = allRows.find((r) => r.isSharer) ?? null;
      sharerStrip = sharerRow;
    }
  }

  return { band, podium, winner, sharerStrip, match: null, sideTournaments };
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
  return userIds
    .map((id) => nameByUserId.get(id) ?? playerFallback)
    .join(' / ');
}

/**
 * Formats a net-strokes total versus course par as a vs-par string.
 * Uses U+2212 (minus sign) for negative values, as per the spec.
 * E.g.: 70 vs par 72 → "−2", 72 vs par 72 → "E", 75 vs par 72 → "+3".
 */
function vsParLabel(netStrokes: number, coursePar: number): string {
  const diff = netStrokes - coursePar;
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
  if (matchResult === null) {
    // Match not yet decided
    return { sharerOutcome: null, headline: { kind: 'undecided' } };
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

  return { sharerOutcome, headline };
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
