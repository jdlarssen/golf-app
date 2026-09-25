import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

type RosterUserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  profile_completed_at: string | null;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
  is_guest: boolean;
};

/**
 * #2210 — the users on a game's roster as `PlayerOption` rows, for the
 * creator's edit page (`/games/[id]/rediger`).
 *
 * The page's own options list reads `users` under the creator's RLS, which
 * only shows users the creator shares a game with as a player (0092). An
 * organiser who does not play in their own game saw none of the players:
 * best ball with finished teams crashed, and the other formats had invisible
 * players who got the men's tee on save.
 *
 * Service-role, for exactly the ids passed in. The caller is responsible for
 * the gate: the route runs `requireAdminOrCreator`, and the ids come from the
 * game's own `game_players`, which the creator can already read (0160). The
 * columns are the ones users-RLS already shows an organiser who plays in the
 * game, and no e-mail (#435). `deleted_at` is not filtered: 0174 removes
 * anonymised users from rosters that have not started.
 *
 * Throws on a failed read — the page's error boundary is the right answer,
 * not a form with silently missing players.
 */
export async function getRosterPlayerOptions(
  userIds: string[],
): Promise<PlayerOption[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await getAdminClient()
    .from('users')
    .select(
      'id, name, nickname, hcp_index, profile_completed_at, gender, level, is_guest',
    )
    .in('id', userIds)
    .returns<RosterUserRow[]>();
  if (error) {
    console.error('[getRosterPlayerOptions] lookup failed', error);
    throw error;
  }

  return (data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
    pending: u.profile_completed_at === null,
    gender: u.gender,
    level: u.level,
    isGuest: u.is_guest,
  }));
}
