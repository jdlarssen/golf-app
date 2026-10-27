import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * The league a flight game belongs to (#2661), or null for a game that is not
 * a league flight. Read with the admin client: the marker is usually not in
 * the flight, and RLS on games shows a game only to its players, so a request
 * client would see nothing.
 *
 * A failed read throws (the caller answers 500 or shows the error boundary),
 * never «not a league flight»: a database that does not answer is not a no.
 */
export type LeagueFlight = {
  gameId: string;
  roundId: string;
  roundLabel: string;
  leagueId: string;
  leagueName: string;
  isSimulator: boolean;
  /** `leagues.created_by`, the organiser who may approve in the marker's stead. */
  leagueCreatorId: string;
};

type Row = {
  id: string;
  league_round_id: string | null;
  league_rounds: {
    id: string;
    label: string;
    league_id: string;
    leagues: { id: string; name: string; is_simulator: boolean; created_by: string } | null;
  } | null;
};

export async function readLeagueFlight(gameId: string): Promise<LeagueFlight | null> {
  const { data, error } = await getAdminClient()
    .from('games')
    .select(
      'id, league_round_id, league_rounds!games_league_round_id_fkey(id, label, league_id, leagues!league_rounds_league_id_fkey(id, name, is_simulator, created_by))',
    )
    .eq('id', gameId)
    .maybeSingle<Row>();
  if (error) throw new Error(`readLeagueFlight: ${error.message}`);
  const round = data?.league_rounds ?? null;
  const league = round?.leagues ?? null;
  if (!data || !round || !league) return null;
  return {
    gameId: data.id,
    roundId: round.id,
    roundLabel: round.label,
    leagueId: league.id,
    leagueName: league.name,
    isSimulator: league.is_simulator,
    leagueCreatorId: league.created_by,
  };
}

/** The flight's league when it is a simulator league, else null. */
export async function readSimulatorLeagueFlight(gameId: string): Promise<LeagueFlight | null> {
  const flight = await readLeagueFlight(gameId);
  return flight?.isSimulator ? flight : null;
}
