import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { profileTeeGender, type TeeProfile } from '@/lib/games/teeChoice';
import type { TeeBoxRatings, TeeGender } from '@/lib/games/teeRating';

// Same embed as startScheduledGameCore — the ratings the start freezes from.
const TEE_EMBED =
  'tee_boxes(slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)';

/**
 * #2209: the `game_players.tee_gender` each player gets when they join a game
 * after it was created — sign-up, approval, team invite, «Inviter», login via a
 * game invitation. The profile default clamped to the game's tee
 * (`profileTeeGender`), the same rule the wizard and the edit form use.
 *
 * Never throws: it runs on every path that adds a player, and a failed lookup
 * must never stop a sign-up or an invitation. A failed game read clamps
 * nothing (tee = null); a failed users read answers 'mens' for everyone —
 * what the rows got before #2209. Both are logged. Every id in `userIds` gets
 * a key.
 *
 * Reads with the service role (read only): the joining player cannot always
 * see the game or the other profiles under RLS.
 */
export async function joinTeeGenders(
  gameId: string,
  userIds: readonly string[],
): Promise<Record<string, TeeGender>> {
  const out: Record<string, TeeGender> = {};
  if (userIds.length === 0) return out;

  const tee = await readTee(gameId);
  const profiles = await readProfiles(userIds);
  for (const id of userIds) {
    out[id] = profiles ? profileTeeGender(profiles.get(id) ?? null, tee) : 'mens';
  }
  return out;
}

async function readTee(gameId: string): Promise<TeeBoxRatings | null> {
  try {
    const { data, error } = await getAdminClient()
      .from('games')
      .select(TEE_EMBED)
      .eq('id', gameId)
      .maybeSingle();
    if (error) {
      console.error('[joinTeeGenders] game read failed', error);
      return null;
    }
    const tee: unknown = (data as { tee_boxes?: unknown } | null)?.tee_boxes ?? null;
    if (tee === null) return null;
    if (typeof tee !== 'object' || Array.isArray(tee)) {
      console.error('[joinTeeGenders] game read returned an unexpected tee shape', tee);
      return null;
    }
    return tee as TeeBoxRatings;
  } catch (err) {
    console.error('[joinTeeGenders] game read threw', err);
    return null;
  }
}

async function readProfiles(
  userIds: readonly string[],
): Promise<Map<string, TeeProfile> | null> {
  try {
    const { data, error } = await getAdminClient()
      .from('users')
      .select('id, gender, level')
      .in('id', [...userIds]);
    if (error || !Array.isArray(data)) {
      console.error('[joinTeeGenders] users read failed', error ?? data);
      return null;
    }
    return new Map(data.map((u) => [u.id, { gender: u.gender, level: u.level }]));
  } catch (err) {
    console.error('[joinTeeGenders] users read threw', err);
    return null;
  }
}
