import { cache } from 'react';
import {
  classifyDeliveryStatus,
  TOTAL_HOLES,
} from '@/lib/games/deliveryStatus';

// ─── Types ────────────────────────────────────────────────────────────────

/** One active game that may require admin action. */
export interface ActiveGameInput {
  id: string;
  name: string;
  requirePeerApproval: boolean;
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
      });

      if (status === 'ready_not_delivered') hasUnsubmitted = true;
      if (status === 'pending_approval') hasPendingApproval = true;
    }

    if (hasUnsubmitted) unsubmitted.push({ gameId: game.id, name: game.name });
    if (hasPendingApproval) pendingApproval.push({ gameId: game.id, name: game.name });
  }

  return { unsubmitted, pendingApproval };
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
    .select('id, name, require_peer_approval')
    .eq('status', 'active');

  if (!gamesData || gamesData.length === 0) {
    return { unsubmitted: [], pendingApproval: [] };
  }

  const activeIds = gamesData.map((g) => g.id);

  // 2. Fetch all non-withdrawn game_players for those games.
  const { data: playersData } = await supabase
    .from('game_players')
    .select('game_id, user_id, submitted_at, approved_at, withdrawn_at')
    .in('game_id', activeIds)
    .is('withdrawn_at', null);

  // 3. Count filled holes per (game_id, user_id).
  const { data: scoresData } = await supabase
    .from('scores')
    .select('game_id, user_id')
    .not('strokes', 'is', null)
    .in('game_id', activeIds);

  // Aggregate hole counts in TS (PostgREST has no GROUP BY).
  const holesMap = new Map<string, number>();
  for (const s of scoresData ?? []) {
    const key = `${s.game_id}:${s.user_id}`;
    holesMap.set(key, (holesMap.get(key) ?? 0) + 1);
  }

  const games: ActiveGameInput[] = gamesData.map((g) => ({
    id: g.id,
    name: g.name,
    requirePeerApproval: g.require_peer_approval ?? false,
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
