import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import {
  groupRosterByGame,
  onlyStandaloneGames,
  upcomingBlockIds,
  type ArrangedGame,
  type ArrangedRosterRow,
} from './arrangedGames';
import { readCreatorStartBlock } from './readCreatorStartBlock';
import type { StartBlock } from './startBlockReason';

/** The `games` columns «Rundene dine» reads (`ArrangedGame`). */
export const ARRANGED_GAME_SELECT =
  'id, name, status, created_at, started_at, ended_at, scheduled_tee_off_at, require_peer_approval, registration_mode, signups_closed_at, courses(name)';

/** The `game_players` columns the counts read (`ArrangedRosterRow`). */
export const ARRANGED_ROSTER_SELECT = 'game_id, submitted_at, approved_at, withdrawn_at';

export type ArrangedRoundsRead =
  | {
      ok: true;
      games: ArrangedGame[];
      rosterByGame: Map<string, ArrangedRosterRow[]>;
      startBlocks: Map<string, StartBlock | null>;
    }
  | { ok: false; error: unknown };

/**
 * The one read behind «Rundene dine» (#2269), for `/klubbhuset` and the
 * Klubbhus room: the viewer's own standalone games, the roster rows for the
 * active and scheduled ones, and the start block for each scheduled round the
 * view shows (`upcomingLimit`). `groupArrangedRounds` groups the result.
 *
 * The games and roster go through the request client: RLS «games select own
 * created» and «game_players creator select». The roster read is paged
 * (`selectAllRowsResult`, as `/admin/games` counts players, #2227): 40 games
 * with 150 players each pass PostgREST's 1 000-row cap, and an unpaged read
 * would make the counts quietly wrong.
 *
 * A failed read comes back as `{ ok: false }`, never as «nothing arranged»
 * (#2490).
 */
export async function getArrangedRounds(
  supabase: SupabaseClient<Database>,
  userId: string,
  opts: { upcomingLimit?: number } = {},
): Promise<ArrangedRoundsRead> {
  const { data: games, error } = await onlyStandaloneGames(
    supabase.from('games').select(ARRANGED_GAME_SELECT).eq('created_by', userId),
  )
    .order('created_at', { ascending: false })
    .returns<ArrangedGame[]>();
  if (error) return { ok: false, error };

  const rows = games ?? [];
  const rosterIds = rows
    .filter((g) => g.status === 'active' || g.status === 'scheduled')
    .map((g) => g.id);

  const [roster, blocks] = await Promise.all([
    rosterIds.length === 0
      ? Promise.resolve({ data: [] as ArrangedRosterRow[], error: null })
      : selectAllRowsResult(
          (from, to) =>
            supabase
              .from('game_players')
              .select(ARRANGED_ROSTER_SELECT)
              .in('game_id', rosterIds)
              .order('game_id')
              .order('user_id')
              .range(from, to)
              .returns<ArrangedRosterRow[]>(),
          'arranged rounds roster',
        ),
    // Service role (see `readCreatorStartBlock`). The authorisation is here:
    // every id comes from the `created_by = userId` read above.
    Promise.all(
      upcomingBlockIds(rows, opts.upcomingLimit).map(
        async (id) => [id, await readCreatorStartBlock(id)] as const,
      ),
    ),
  ]);
  if (roster.error) return { ok: false, error: roster.error };

  return {
    ok: true,
    games: rows,
    rosterByGame: groupRosterByGame(roster.data ?? []),
    startBlocks: new Map(blocks),
  };
}
