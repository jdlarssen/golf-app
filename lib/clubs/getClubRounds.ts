import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getUpcomingClubGames } from '@/lib/games/getUpcomingClubGames';
import { getGamesSocialProof, type GameSocialProof } from '@/lib/games/getGameSocialProof';
import { getRegistrationSeats } from '@/lib/games/getRegistrationSeats';
import { buildClubRoundEntries, type ClubRoundEntry } from '@/lib/games/terminliste';

/**
 * «Neste runder i klubben» on /klubber/[id] (#2326): the club's scheduled
 * rounds with what each has to do with you, the friends on it and its seats.
 *
 * The caller is the gate. The club rounds are read with the service role
 * (`getUpcomingClubGames`), so pass a club id only after `getClubDetail` has
 * confirmed the viewer's membership with the request client.
 *
 * Your own `game_players` rows are read with the request client (RLS: your
 * own rows). A failed read of the rounds or of your rows is `{ ok: false }`
 * (#2490): the section shows an error, never «no rounds». Seats and social
 * proof are best-effort in their helpers; a failure there only hides a line.
 */
export async function getClubRounds(
  supabase: SupabaseClient<Database>,
  clubId: string,
  userId: string,
  now: Date,
): Promise<
  | { ok: true; entries: ClubRoundEntry[]; socialProof: Record<string, GameSocialProof> }
  | { ok: false }
> {
  const gamesRes = await getUpcomingClubGames([clubId]);
  if (gamesRes.error) {
    console.error('[getClubRounds] rounds', gamesRes.error);
    return { ok: false };
  }
  const rows = gamesRes.data ?? [];
  if (rows.length === 0) return { ok: true, entries: [], socialProof: {} };

  const ids = rows.map((row) => row.id as string);
  const [joinedRes, socialProof, seats] = await Promise.all([
    supabase
      .from('game_players')
      .select('game_id')
      .eq('user_id', userId)
      .is('withdrawn_at', null)
      .in('game_id', ids),
    getGamesSocialProof(ids, userId),
    getRegistrationSeats(rows),
  ]);
  if (joinedRes.error) {
    console.error('[getClubRounds] my rows', joinedRes.error);
    return { ok: false };
  }

  const games = rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    short_id: row.short_id as string,
    scheduled_tee_off_at: row.scheduled_tee_off_at as string | null,
    course_name: row.courses?.name ?? null,
    game_mode: row.game_mode,
    mode_config: row.mode_config,
    hole_segment: row.hole_segment,
    start_type: row.start_type,
    created_by: row.created_by as string | null,
    signups_closed_at: row.signups_closed_at as string | null,
  }));
  const entries = buildClubRoundEntries(games, {
    joinedIds: new Set((joinedRes.data ?? []).map((r) => r.game_id)),
    userId,
    seats,
    now,
  });
  return { ok: true, entries, socialProof };
}
