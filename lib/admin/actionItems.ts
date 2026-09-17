import { cache } from 'react';
import { classifyDeliveryStatus } from '@/lib/games/deliveryStatus';
import {
  filledHolesByPlayer,
  type FilledRosterRow,
  type FilledScoreRow,
} from '@/lib/games/filledHoles';
import { holeCountForSegment } from '@/lib/games/holeScope';
import type { HoleSegment } from '@/lib/scoring';
import type { GameMode } from '@/lib/scoring/modes/types';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';

// ─── Types ────────────────────────────────────────────────────────────────

/** One active game that may require admin action. */
export interface ActiveGameInput {
  id: string;
  name: string;
  requirePeerApproval: boolean;
  /**
   * Antall hull som skal til for «ferdig» for DENNE spilleren (#1441). Uten
   * feltet defaulter `classifyDeliveryStatus` til 18 — samme etablerte
   * mønster som `app/[locale]/admin/games/[id]/status/page.tsx` bruker
   * (`holeCountForSegment(game.hole_segment)`). Uten dette leser et komplett
   * 9-hulls segment-spill aldri som «klart» i Sekretariatets action-items.
   */
  expectedHoles?: number;
}

/** One non-withdrawn player row from game_players. */
export interface ActivePlayerInput {
  gameId: string;
  submittedAt: string | null;
  approvedAt: string | null;
  withdrawnAt: string | null;
  /** Number of holes with a recorded stroke for this player in this game. */
  holesFilled: number;
}

export interface ActionItemCounts {
  /**
   * Active games where ≥1 non-withdrawn player has filled all 18 holes but
   * not submitted — mirrors the `not_all_submitted` finish-blocker in endGame.
   */
  unsubmitted: { gameId: string; name: string }[];
  /**
   * Active games where `require_peer_approval=true` and ≥1 non-withdrawn
   * player has submitted but not been approved — mirrors the
   * `not_all_approved` finish-blocker in endGame.
   */
  pendingApproval: { gameId: string; name: string }[];
}

// ─── Pure logic ───────────────────────────────────────────────────────────

/**
 * Pure, I/O-free function — fully unit-testable.
 *
 * A game can appear in both lists when some players are ready-not-delivered
 * and others are waiting for peer approval.
 *
 * Rule home: the finish-blockers in `endGame` (actions.ts ~454) are the
 * canonical definition. This function surfaces exactly those two blockers
 * across all active games, deduplicated by gameId.
 */
export function computeActionItemCounts(
  games: ActiveGameInput[],
  players: ActivePlayerInput[],
): ActionItemCounts {
  // Index players by gameId for O(n) traversal.
  const byGame = new Map<string, ActivePlayerInput[]>();
  for (const p of players) {
    if (!byGame.has(p.gameId)) byGame.set(p.gameId, []);
    byGame.get(p.gameId)!.push(p);
  }

  const unsubmitted: { gameId: string; name: string }[] = [];
  const pendingApproval: { gameId: string; name: string }[] = [];

  for (const game of games) {
    const gamePlayers = byGame.get(game.id) ?? [];
    let hasUnsubmitted = false;
    let hasPendingApproval = false;

    for (const p of gamePlayers) {
      const status = classifyDeliveryStatus({
        holesFilled: p.holesFilled,
        submittedAt: p.submittedAt,
        approvedAt: p.approvedAt,
        withdrawnAt: p.withdrawnAt,
        requirePeerApproval: game.requirePeerApproval,
        expectedHoles: game.expectedHoles,
      });

      if (status === 'ready_not_delivered') hasUnsubmitted = true;
      if (status === 'pending_approval') hasPendingApproval = true;
    }

    if (hasUnsubmitted) unsubmitted.push({ gameId: game.id, name: game.name });
    if (hasPendingApproval) pendingApproval.push({ gameId: game.id, name: game.name });
  }

  return { unsubmitted, pendingApproval };
}

/** A roster row (withdrawn members included) tagged with its game. */
export type HolesRosterRow = FilledRosterRow & { game_id: string };

/** An entered-stroke `scores` row tagged with its game. */
export type HolesScoreRow = FilledScoreRow & { game_id: string };

/**
 * Filled holes per `${game_id}:${user_id}` across many games.
 *
 * Thin glue only: the rule lives in `filledHolesByPlayer` (#2017), which takes
 * one mode, so roster and rows are grouped per game and counted with that
 * game's `game_mode`. Counting a player's OWN rows instead left a patsome
 * partner stuck at 6/18 and never flagged (#2045).
 *
 * Pass withdrawn members in the roster — `teamScoreOwnerId` needs the whole
 * team to skip them. Scores must already be filtered to entered strokes.
 */
export function holesFilledByGame(opts: {
  games: readonly { id: string; game_mode: GameMode }[];
  players: readonly HolesRosterRow[];
  scores: readonly HolesScoreRow[];
}): Map<string, number> {
  const playersByGame = new Map<string, HolesRosterRow[]>();
  for (const p of opts.players) {
    if (!playersByGame.has(p.game_id)) playersByGame.set(p.game_id, []);
    playersByGame.get(p.game_id)!.push(p);
  }
  const scoresByGame = new Map<string, HolesScoreRow[]>();
  for (const s of opts.scores) {
    if (!scoresByGame.has(s.game_id)) scoresByGame.set(s.game_id, []);
    scoresByGame.get(s.game_id)!.push(s);
  }

  const holes = new Map<string, number>();
  for (const game of opts.games) {
    const filled = filledHolesByPlayer({
      players: playersByGame.get(game.id) ?? [],
      scores: scoresByGame.get(game.id) ?? [],
      mode: game.game_mode,
    });
    for (const [userId, count] of filled) {
      holes.set(`${game.id}:${userId}`, count);
    }
  }
  return holes;
}

// ─── Cached server helper ─────────────────────────────────────────────────

/**
 * Fetches action-item counts for all active games.
 *
 * `cache()` dedupes across Suspense siblings — both the ActionItemsStripe and
 * the Spill-tile badge share this single round-trip.
 *
 * Requires server context (RLS-enforced server client); do not call from
 * client components.
 */
export const getActionItemCounts = cache(async (): Promise<ActionItemCounts> => {
  // Import here to keep this file importable in tests without server-only.
  const { getAdminContext } = await import(
    '@/app/[locale]/admin/_dashboardContext'
  );
  const { supabase } = await getAdminContext();

  // 1. Fetch all active games.
  const { data: gamesData } = await supabase
    .from('games')
    .select('id, name, require_peer_approval, hole_segment, game_mode')
    .eq('status', 'active');

  if (!gamesData || gamesData.length === 0) {
    return { unsubmitted: [], pendingApproval: [] };
  }

  const activeIds = gamesData.map((g) => g.id);

  // 2. Fetch all game_players for those games. Withdrawn players stay in:
  //    `holesFilledByGame` needs the whole team to pick its row owner, and
  //    `classifyDeliveryStatus` reads them as `withdrawn` so they never count.
  const { data: playersData } = await supabase
    .from('game_players')
    .select('game_id, user_id, team_number, submitted_at, approved_at, withdrawn_at')
    .in('game_id', activeIds);

  // 3. Fetch entered strokes for those games.
  const { data: scoresData } = await selectAllRowsResult(
    (from, to) =>
      supabase
        .from('scores')
        .select('game_id, user_id, hole_number')
        .not('strokes', 'is', null)
        .in('game_id', activeIds)
        .order('id')
        .range(from, to),
    'getAdminActionItems scores',
  );

  // #2017/#2045: count via the team card's row owner, per hole — the same rule
  // as the reminder. Own rows left a patsome partner at 6/18, never flagged.
  const holesMap = holesFilledByGame({
    games: gamesData.map((g) => ({
      id: g.id,
      // DB type is `string`; games_game_mode_check (0111) constrains it to GameMode.
      game_mode: g.game_mode as GameMode,
    })),
    players: playersData ?? [],
    scores: scoresData ?? [],
  });

  const games: ActiveGameInput[] = gamesData.map((g) => ({
    id: g.id,
    name: g.name,
    requirePeerApproval: g.require_peer_approval ?? false,
    // #1441 — front9/back9-spill er «ferdig» ved 9 hull, ikke 18.
    expectedHoles: holeCountForSegment(g.hole_segment as HoleSegment),
  }));

  const players: ActivePlayerInput[] = (playersData ?? []).map((p) => ({
    gameId: p.game_id,
    submittedAt: p.submitted_at,
    approvedAt: p.approved_at,
    withdrawnAt: p.withdrawn_at,
    holesFilled: holesMap.get(`${p.game_id}:${p.user_id}`) ?? 0,
  }));

  return computeActionItemCounts(games, players);
});

/** Total distinct games requiring any admin action (union of both lists). */
export function totalActionableGames(counts: ActionItemCounts): number {
  const ids = new Set([
    ...counts.unsubmitted.map((g) => g.gameId),
    ...counts.pendingApproval.map((g) => g.gameId),
  ]);
  return ids.size;
}
