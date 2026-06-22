import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { GameMode } from '@/lib/scoring/modes/types';
import { isSingleFlightGame } from './flightScope';
import { resolveActiveCardState, type ActiveCardState } from './activeCardState';

const HOLE_COUNT = 18;

/** The active-game fields the Home card needs to resolve state, route, and count approvals. */
export type ActiveGameForCard = {
  id: string;
  game_mode: GameMode;
  flightNumber: number;
  require_peer_approval: boolean;
  submitted_at: string | null;
  withdrawn_at: string | null;
  approved_at: string | null;
};

export type ActiveCardExtras = {
  state: ActiveCardState;
  /** Where the card links. «Continue» → next unfilled hole / submit; else → game overview. */
  href: string;
  /** Flight-peers who submitted but await THIS user's approval (0 unless peer approval applies). */
  pendingApprovalsForMe: number;
};

/**
 * Resolves per-active-game card data for Home (#878): the display state, the
 * tap target («rett inn i runden» for active rounds, overview otherwise), and
 * the peer-approval count. Two scoped queries at most (scores for the rounds
 * still in progress, game_players for the games requiring peer approval), run
 * in parallel — bounded by the user's handful of active games, never N+1.
 *
 * Degrades safely: on any query error the affected game falls back to the game
 * overview href with zero pending approvals, so the card always renders.
 */
export async function getActiveGameCardData(
  supabase: SupabaseClient<Database>,
  userId: string,
  games: ActiveGameForCard[],
): Promise<Map<string, ActiveCardExtras>> {
  const states = new Map<string, ActiveCardState>(
    games.map((g) => [g.id, resolveActiveCardState(g)]),
  );

  // Only rounds still in progress need a next-hole lookup; only peer-approval
  // games need the flight roster.
  const continueIds = games
    .filter((g) => states.get(g.id) === 'continue')
    .map((g) => g.id);
  const approvalGames = games.filter((g) => g.require_peer_approval);

  const [scoresRes, matesRes] = await Promise.all([
    continueIds.length
      ? supabase
          .from('scores')
          .select('game_id, hole_number')
          .in('game_id', continueIds)
          .eq('user_id', userId)
          .not('strokes', 'is', null)
      : Promise.resolve({ data: [], error: null }),
    approvalGames.length
      ? supabase
          .from('game_players')
          .select('game_id, user_id, flight_number, submitted_at, approved_at, withdrawn_at')
          .in(
            'game_id',
            approvalGames.map((g) => g.id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const filledByGame = new Map<string, Set<number>>();
  for (const r of scoresRes.data ?? []) {
    let set = filledByGame.get(r.game_id);
    if (!set) {
      set = new Set<number>();
      filledByGame.set(r.game_id, set);
    }
    set.add(r.hole_number);
  }

  type MateRow = {
    game_id: string;
    user_id: string;
    flight_number: number | null;
    submitted_at: string | null;
    approved_at: string | null;
    withdrawn_at: string | null;
  };
  const matesByGame = new Map<string, MateRow[]>();
  for (const r of (matesRes.data ?? []) as MateRow[]) {
    const list = matesByGame.get(r.game_id);
    if (list) list.push(r);
    else matesByGame.set(r.game_id, [r]);
  }

  const result = new Map<string, ActiveCardExtras>();
  for (const g of games) {
    const state = states.get(g.id) ?? 'continue';

    let href = `/games/${g.id}`;
    if (state === 'continue') {
      const filled = filledByGame.get(g.id) ?? new Set<number>();
      if (filled.size >= HOLE_COUNT) {
        href = `/games/${g.id}/submit`;
      } else {
        let nextHole = 1;
        for (let h = 1; h <= HOLE_COUNT; h++) {
          if (!filled.has(h)) {
            nextHole = h;
            break;
          }
        }
        href = `/games/${g.id}/holes/${nextHole}`;
      }
    }

    let pendingApprovalsForMe = 0;
    if (g.require_peer_approval) {
      const all = matesByGame.get(g.id) ?? [];
      // #543 single-flight rule: ≤4 active players (or wolf) → everyone attests.
      const singleFlight = isSingleFlightGame(
        g.game_mode,
        all.map((m) => ({
          user_id: m.user_id,
          flight_number: m.flight_number,
          withdrawn_at: m.withdrawn_at,
        })),
      );
      const mates = singleFlight
        ? all
        : all.filter((m) => m.flight_number === g.flightNumber);
      pendingApprovalsForMe = mates.filter(
        (m) =>
          m.user_id !== userId &&
          m.submitted_at != null &&
          m.approved_at == null,
      ).length;
    }

    result.set(g.id, { state, href, pendingApprovalsForMe });
  }

  return result;
}
