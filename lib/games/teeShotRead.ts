import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { teeShotStatus, type TeeShotStatus } from './teeShots';

export interface TeeShotRosterRow {
  user_id: string;
  team_number: number | null;
  withdrawn_at: string | null;
}

/**
 * #2580 «Hvem sitt utslag»: where every team on the roster stands, read for
 * the web's server pages (the delivery page and the organiser's four pages).
 * The count is `teeShotStatus` (lib/games/teeShots.ts); this only reads the
 * rows. The ordinary server client is enough: the SELECT policy lets the
 * game's players and its creator (or an admin) in.
 *
 * Error ≠ absence (#1441): a failed read throws to the route's error boundary
 * rather than showing everyone as short (or nobody).
 */
export async function readTeamTeeShotStatuses(
  supabase: SupabaseClient<Database>,
  gameId: string,
  minimum: number,
  roster: readonly TeeShotRosterRow[],
): Promise<Map<number, TeeShotStatus>> {
  const { data, error } = await supabase
    .from('team_tee_shots')
    .select('team_number, hole_number, tee_shot_by')
    .eq('game_id', gameId);
  if (error) throw error;

  const teams = new Set<number>();
  for (const row of roster) if (row.team_number != null) teams.add(row.team_number);

  const statuses = new Map<number, TeeShotStatus>();
  for (const team of [...teams].sort((a, b) => a - b)) {
    statuses.set(
      team,
      teeShotStatus({
        minimum,
        memberIds: roster
          .filter((r) => r.team_number === team && r.withdrawn_at == null)
          .map((r) => r.user_id),
        picks: (data ?? [])
          .filter((p) => p.team_number === team)
          .map((p) => ({ holeNumber: p.hole_number, teeShotBy: p.tee_shot_by })),
      }),
    );
  }
  return statuses;
}
