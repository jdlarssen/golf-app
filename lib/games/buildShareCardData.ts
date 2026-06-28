/**
 * buildShareCardData — pure data-shaping function for shareable result-card
 * images (#942). Takes a computed ModeResult and resolves it into a
 * ShareCardModel that the image-generation route (built separately) can render
 * without further database access.
 *
 * No I/O. No side effects. Single source of truth for how each mode's score is
 * labelled on the card. Mirrors the band-routing of computeResultSummaries in
 * lib/scoring/resultSummary.ts.
 */

import type { ModeResult } from '@/lib/scoring/modes/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ShareCardBand = 'placement' | 'skins' | 'matchplay';

export type ShareCardRow = {
  rank: number;
  /** Display name, already resolved by the caller (formatRevealName applied). */
  name: string;
  /** Mode-framed score, e.g. "−1", "72 slag", "38 poeng", "4 skins", or "" if none. */
  scoreLabel: string;
  /** True when this row is the sharer (for podium-row highlight). */
  isSharer: boolean;
};

export type ShareCardSide = { label: string; winnerName: string; isSharer: boolean };

export type ShareCardModel = {
  band: ShareCardBand;
  /** Top 3 (or fewer) by rank. Empty for the matchplay band. */
  podium: ShareCardRow[];
  /** Convenience: podium[0] for the champagne hero, or null. */
  winner: ShareCardRow | null;
  /** Present ONLY when the sharer is a participant AND finished outside the top 3. */
  sharerStrip: ShareCardRow | null;
  /** Matchplay band only; null otherwise. */
  match: { sharerOutcomeLabel: string; headline: string } | null;
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
}): ShareCardModel {
  const { result, nameByUserId, sharerId, coursePar, sideWinners } = opts;

  const sideTournaments = buildSideTournaments(sideWinners, nameByUserId, sharerId);

  switch (result.kind) {
    // -----------------------------------------------------------------------
    // Matchplay family → 'matchplay' band
    // -----------------------------------------------------------------------
    case 'singles_matchplay': {
      const side1Ids = [result.sides[0].userId];
      const side2Ids = [result.sides[1].userId];
      const match = buildMatchplayMatch(result.result, side1Ids, side2Ids, sharerId, nameByUserId);
      return { band: 'matchplay', podium: [], winner: null, sharerStrip: null, match, sideTournaments };
    }

    case 'fourball_matchplay': {
      const side1Ids = result.sides[0].players.map((p) => p.userId);
      const side2Ids = result.sides[1].players.map((p) => p.userId);
      const match = buildMatchplayMatch(result.result, side1Ids, side2Ids, sharerId, nameByUserId);
      return { band: 'matchplay', podium: [], winner: null, sharerStrip: null, match, sideTournaments };
    }

    case 'foursomes_matchplay': {
      const side1Ids = result.sides[0].players.map((p) => p.userId);
      const side2Ids = result.sides[1].players.map((p) => p.userId);
      const match = buildMatchplayMatch(result.result, side1Ids, side2Ids, sharerId, nameByUserId);
      return { band: 'matchplay', podium: [], winner: null, sharerStrip: null, match, sideTournaments };
    }

    // -----------------------------------------------------------------------
    // Skins → 'skins' band
    // -----------------------------------------------------------------------
    case 'skins': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        scoreLabel: `${p.totalSkins} skins`,
      }));
      return buildPlacementModel('skins', rows, nameByUserId, sharerId, sideTournaments);
    }

    // -----------------------------------------------------------------------
    // Stableford → 'placement' band, "{points} poeng"
    // -----------------------------------------------------------------------
    case 'stableford': {
      if (result.variant === 'solo') {
        const rows: IndividualCompetitor[] = result.players.map((p) => ({
          userIds: [p.userId],
          rank: p.rank,
          scoreLabel: `${p.totalPoints} poeng`,
        }));
        return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
      } else {
        // team stableford
        const rows: IndividualCompetitor[] = result.teams.map((t) => ({
          userIds: t.playerIds,
          rank: t.rank,
          scoreLabel: `${t.totalPoints} poeng`,
        }));
        return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
      }
    }

    // -----------------------------------------------------------------------
    // Solo strokeplay → 'placement' band, vs-par label
    // -----------------------------------------------------------------------
    case 'solo_strokeplay': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        scoreLabel: vsParLabel(p.totalNetStrokes, coursePar),
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    // -----------------------------------------------------------------------
    // Team strokeplay modes → 'placement' band, vs-par label
    // -----------------------------------------------------------------------
    case 'best_ball': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.playerIds,
        rank: t.rank,
        // best_ball uses `total` (net total strokes)
        scoreLabel: vsParLabel(t.total, coursePar),
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    case 'texas_scramble': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.members.map((m) => m.userId),
        rank: t.rank,
        scoreLabel: vsParLabel(t.totalNet, coursePar),
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    case 'shamble': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.members,
        rank: t.rank,
        // shamble uses `totalScore` (net strokes sum)
        scoreLabel: vsParLabel(t.totalScore, coursePar),
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    case 'patsome': {
      const rows: IndividualCompetitor[] = result.teams.map((t) => ({
        userIds: t.playerIds,
        rank: t.rank,
        // patsome uses stableford points
        scoreLabel: `${t.totalPoints} poeng`,
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    // -----------------------------------------------------------------------
    // Point modes → 'placement' band, "{points} poeng"
    // -----------------------------------------------------------------------
    case 'wolf': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        scoreLabel: `${p.totalPoints} poeng`,
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    case 'nassau': {
      // Nassau primary ranking is by units won (0-3)
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        scoreLabel: `${p.units} poeng`,
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    case 'bingo_bango_bongo': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        scoreLabel: `${p.totalPoints} poeng`,
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    case 'nines': {
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        scoreLabel: `${p.totalPoints} poeng`,
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    case 'round_robin': {
      // Round Robin ranks by totalHoleWins
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        scoreLabel: `${p.totalHoleWins} poeng`,
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
    }

    case 'acey_deucey': {
      // Acey Deucey total can be negative — show as "{total} poeng"
      const rows: IndividualCompetitor[] = result.players.map((p) => ({
        userIds: [p.userId],
        rank: p.rank,
        scoreLabel: `${p.total} poeng`,
      }));
      return buildPlacementModel('placement', rows, nameByUserId, sharerId, sideTournaments);
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
  scoreLabel: string;
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
): ShareCardModel {
  // Sort: rank ascending, then name ascending for stable tie ordering
  const sorted = [...competitors].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return resolveTeamName(a.userIds, nameByUserId).localeCompare(
      resolveTeamName(b.userIds, nameByUserId),
    );
  });

  // Resolve all rows
  const allRows: ShareCardRow[] = sorted.map((c) => ({
    rank: c.rank,
    name: resolveTeamName(c.userIds, nameByUserId),
    scoreLabel: c.scoreLabel,
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
 * Falls back to the userId if no name is found (defensive).
 */
function resolveTeamName(userIds: string[], nameByUserId: Map<string, string>): string {
  return userIds
    .map((id) => nameByUserId.get(id) ?? id)
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
 * Builds the matchplay match block.
 * Determines the sharer's outcome (win / loss / tie) from the match result.
 * Returns a non-null match object even when result is null (unresolved match)
 * so the card can show a neutral headline.
 */
function buildMatchplayMatch(
  matchResult: { winner: 'side1' | 'side2' | 'tied'; formatted: string } | null,
  side1UserIds: ReadonlyArray<string>,
  side2UserIds: ReadonlyArray<string>,
  sharerId: string | null,
  nameByUserId: Map<string, string>,
): { sharerOutcomeLabel: string; headline: string } {
  if (matchResult === null) {
    // Match not yet decided
    return { sharerOutcomeLabel: '', headline: 'Matchplay' };
  }

  const { winner, formatted } = matchResult;

  // Determine which side the sharer is on (if any)
  const sharerOnSide1 = sharerId !== null && side1UserIds.includes(sharerId);
  const sharerOnSide2 = sharerId !== null && side2UserIds.includes(sharerId);
  const sharerParticipates = sharerOnSide1 || sharerOnSide2;

  // Compute sharer outcome label
  let sharerOutcomeLabel = '';
  if (sharerParticipates) {
    if (winner === 'tied') {
      sharerOutcomeLabel = 'Uavgjort';
    } else if (
      (winner === 'side1' && sharerOnSide1) ||
      (winner === 'side2' && sharerOnSide2)
    ) {
      sharerOutcomeLabel = `Vant ${formatted}`;
    } else {
      sharerOutcomeLabel = `Tapte ${formatted}`;
    }
  }

  // Compute neutral headline
  let headline: string;
  if (winner === 'tied') {
    headline = 'Uavgjort';
  } else {
    // Find winner side name
    const winnerIds = winner === 'side1' ? side1UserIds : side2UserIds;
    const winnerName = resolveTeamName([...winnerIds], nameByUserId);
    headline = `${winnerName} vant ${formatted}`;
  }

  return { sharerOutcomeLabel, headline };
}

/**
 * Maps sideWinners to ShareCardSide[], skipping entries with null winnerUserId.
 */
function buildSideTournaments(
  sideWinners: { label: string; winnerUserId: string | null }[],
  nameByUserId: Map<string, string>,
  sharerId: string | null,
): ShareCardSide[] {
  return sideWinners
    .filter((s): s is { label: string; winnerUserId: string } => s.winnerUserId !== null)
    .map((s) => ({
      label: s.label,
      winnerName: nameByUserId.get(s.winnerUserId) ?? '',
      isSharer: s.winnerUserId === sharerId,
    }));
}
