import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import type { SideCategoryId } from '@/lib/scoring/sideTournamentConfig';
import type { GameStatus } from './status';
import type { ScoreVisibility } from './visibility';

/**
 * Tag-cached fetch for the `games` + `game_players` rows the hull-page needs
 * on every hull-bytte (hole-navigation).
 *
 * ## Why cache this?
 *
 * The hull-page (`app/games/[id]/holes/[holeNumber]/page.tsx`) is the
 * hottest read-path in the app — every tap on the carousel nav re-renders
 * it server-side. Profiling showed ~440ms median tail-latency was spent in
 * the first Promise.all wave: fetching `games`, `game_players` and a
 * scoreCount. The first two never change during a hole-bytte, so they
 * belong in a cross-request cache; only the per-hole scores need a fresh
 * round-trip. Caching cuts hull-bytte latency by ~300ms.
 *
 * Only `games` + `game_players` (with the joined user name/nickname) are
 * cached here. `scores` are NOT cached — they change too frequently and
 * the hull-page needs the latest values for the current hole anyway.
 *
 * ## Why the admin client?
 *
 * Next.js's request-scoped APIs (`cookies()`, `headers()`) cannot be called
 * inside `unstable_cache` callbacks, so the cached function cannot use the
 * cookie-based `getServerClient()`. We use the service-role `getAdminClient()`
 * which bypasses RLS. Authorization is enforced at the call-site instead:
 * the hull-page reads `{ game, players }` and `notFound()`s if the current
 * user isn't in `players`. This matches the existing hull-page logic
 * (`me = allPlayers.find(...)`) — no behavior change, just a different
 * place where authz is enforced.
 *
 * ## Cache invalidation
 *
 * Tag convention: `game-${id}`. The 15-minute `revalidate` is a safety net
 * for edge cases (e.g., admin edits a row directly in the Supabase
 * dashboard). The primary invalidation mechanism is `revalidateTag` calls
 * in the mutation server-actions that touch `games` or `game_players`:
 *
 *  - `app/games/[id]/submit/actions.ts` — submitScorecard
 *  - `app/games/[id]/approve/actions.ts` — approveScorecard, rejectScorecard
 *  - `app/admin/games/[id]/actions.ts` — startScheduledGameAction, startGame,
 *    adminApproveScorecard, endGame, reopenScorecard, reopenGame
 *  - `app/admin/games/[id]/avslutt/actions.ts` — endGameWithSideWinners
 *  - `app/admin/games/[id]/edit/actions.ts` — saveDraft, publishFromDraft,
 *    updateScheduled (these all touch `games` + replace the `game_players`
 *    roster wholesale)
 *
 * ## Stale-tolerance trade-off: user profile edits
 *
 * The cached payload joins `users.name` and `users.nickname`. Invalidating
 * the cache on every user-profile edit would require fanning out across
 * every game the player is in (potentially many rows). Instead, we accept
 * brief staleness for nickname/name changes — they self-heal on the next
 * cache miss within the 15-min revalidate window. The trade-off is worth
 * it: profile edits are rare, nickname-staleness during an active round is
 * a low-impact visual glitch, and the alternative (cascading invalidation)
 * adds material complexity.
 */

export type GameForHole = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  tee_box_id: string;
  score_visibility: ScoreVisibility;
  require_peer_approval: boolean;
  scheduled_tee_off_at: string | null;
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  // v1.2.0 — per-spill kategori-overstyringer. Tomt array = Full pakke
  // (alle aktive). DB-CHECK i 0026 garanterer at hver entry er en gyldig
  // SideCategoryId, så vi caster trygt på input-side.
  side_disabled_categories: SideCategoryId[] | null;
};

export type PlayerForHole = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  // Hole entry only renders when status is 'active' or 'finished'; pending
  // invitees can't reach those states per Task 7's publish-gate. Typed
  // nullable to match the DB column.
  users: { name: string | null; nickname: string | null } | null;
};

export type GameWithPlayers = {
  game: GameForHole;
  players: PlayerForHole[];
};

async function fetchGameWithPlayers(
  id: string,
): Promise<GameWithPlayers | null> {
  const supabase = getAdminClient();
  const [gameRes, playersRes] = await Promise.all([
    supabase
      .from('games')
      .select(
        'id, name, status, course_id, tee_box_id, score_visibility, require_peer_approval, scheduled_tee_off_at, side_tournament_enabled, side_ld_count, side_ctp_count, side_disabled_categories',
      )
      .eq('id', id)
      .single<GameForHole>(),
    supabase
      .from('game_players')
      .select(
        'user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, rejection_reason, users!game_players_user_id_fkey(name, nickname)',
      )
      .eq('game_id', id)
      .returns<PlayerForHole[]>(),
  ]);
  if (gameRes.error || !gameRes.data) return null;
  if (playersRes.error) throw playersRes.error;
  return { game: gameRes.data, players: playersRes.data ?? [] };
}

/**
 * Fetch `{ game, players }` for a given game id from the tag-cached layer.
 *
 * Returns `null` if the game does not exist (call-sites should `notFound()`).
 * Throws on unexpected DB errors fetching `game_players` so the page error
 * boundary can render — falling back silently would hide real outages.
 */
export async function getGameWithPlayers(
  id: string,
): Promise<GameWithPlayers | null> {
  return unstable_cache(() => fetchGameWithPlayers(id), ['gwp', id], {
    tags: [`game-${id}`],
    revalidate: 900,
  })();
}
