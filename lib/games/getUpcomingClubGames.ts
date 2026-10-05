import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import type { StartType } from './startType';

/**
 * What a club round carries: «Finn turneringer»'s club list reads all of it
 * (base info only, safe to show, #1022), the Klubbhus room reads the tee-off
 * (#2493).
 */
export const UPCOMING_CLUB_GAME_SELECT =
  'id, name, short_id, scheduled_tee_off_at, registration_mode, status, signups_closed_at, created_by, group_id, game_mode, mode_config, hole_segment, start_type, courses(name), groups(name)';

/** The Json/text columns the select narrows with `overrideTypes`. */
export type UpcomingClubGameFormat = {
  game_mode: GameMode;
  mode_config: GameModeConfig;
  hole_segment: HoleSegment;
  start_type: StartType;
};

/**
 * The scheduled rounds in the given clubs, earliest tee-off first and rounds
 * without one last, 50 at most (#2493; moved out of `getDiscoverableGames`).
 * «Finn turneringer» and the Klubbhus room read it. Only `scheduled`: #2445
 * hides a draft from everyone but its organiser.
 *
 * - `openSignupsOnly` filters closed signups IN the query, so the window isn't
 *   spent on rows the caller drops (#2276).
 * - `excludeCreatedBy` / `excludeIds` leave out the viewer's own rounds and the
 *   ones they are already in or have asked to join.
 * - `teeOffFrom` keeps rounds whose tee-off is at or after that instant (and
 *   so drops rounds without one); `limit` replaces the 50-row window. The room
 *   asks once per club with both, so one busy club cannot push another club's
 *   next round out of a shared window.
 *
 * Service role: club rounds on `invite_only` are visible to members, and the
 * games-RLS only lets players and organisers read a row. The caller is the
 * gate — pass only club ids from the viewer's own memberships. Returns the
 * PostgREST result; each caller decides what a failed read means.
 */
export async function getUpcomingClubGames(
  clubIds: string[],
  opts: {
    excludeCreatedBy?: string;
    excludeIds?: readonly string[];
    openSignupsOnly?: boolean;
    teeOffFrom?: string;
    limit?: number;
  } = {},
) {
  let query = getAdminClient()
    .from('games')
    .select(UPCOMING_CLUB_GAME_SELECT)
    .in('group_id', clubIds)
    .eq('status', 'scheduled');
  if (opts.openSignupsOnly) query = query.is('signups_closed_at', null);
  if (opts.excludeCreatedBy) query = query.neq('created_by', opts.excludeCreatedBy);
  if (opts.teeOffFrom) query = query.gte('scheduled_tee_off_at', opts.teeOffFrom);
  let limited = query
    .order('scheduled_tee_off_at', { ascending: true, nullsFirst: false })
    .limit(opts.limit ?? 50);
  if (opts.excludeIds && opts.excludeIds.length > 0) {
    limited = limited.not('id', 'in', `(${opts.excludeIds.join(',')})`);
  }
  return limited.overrideTypes<Array<UpcomingClubGameFormat>>();
}
