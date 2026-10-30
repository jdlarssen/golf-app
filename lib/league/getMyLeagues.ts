import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { roundPlayerLocks, type RoundFlight } from './roundLocks';
import type { AppLeagueSummary, AppMarkerCard } from './appLeagueView';

type LeagueRow = { id: string; name: string; status: string };
type RoundRow = { id: string; league_id: string; label: string; sequence: number; closes_at: string };

/**
 * Pure assembly of «Ligaene dine»: one entry per draft or active league, its
 * earliest open round, and whether the caller has delivered it or is playing
 * it (roundPlayerLocks, the same rule as the start gate). `markerCards` are
 * the cards that wait for the caller as marker (#2688), keyed by league.
 */
export function assembleMyLeagues(
  leagues: LeagueRow[],
  openRounds: RoundRow[],
  flightsByRound: Map<string, RoundFlight[]>,
  userId: string,
  markerCards: ReadonlyMap<string, AppMarkerCard[]> = new Map(),
): AppLeagueSummary[] {
  const openByLeague = new Map<string, RoundRow>();
  for (const r of [...openRounds].sort((a, b) => a.sequence - b.sequence)) {
    if (!openByLeague.has(r.league_id)) openByLeague.set(r.league_id, r);
  }
  return leagues
    .filter((l): l is LeagueRow & { status: 'draft' | 'active' } => l.status === 'draft' || l.status === 'active')
    .map((l) => {
      const open = openByLeague.get(l.id) ?? null;
      const locks = roundPlayerLocks(open ? (flightsByRound.get(open.id) ?? []) : []);
      return {
        id: l.id,
        name: l.name,
        status: l.status,
        openRound: open ? { id: open.id, label: open.label, closesAt: open.closes_at } : null,
        delivered: locks.delivered.has(userId),
        inProgress: locks.inProgress.has(userId),
        markerCards: markerCards.get(l.id) ?? [],
      };
    });
}

type MarkerCardRow = {
  game_id: string;
  user_id: string;
  users: { name: string | null; nickname: string | null } | null;
  games: {
    status: string;
    league_rounds: { label: string; league_id: string } | null;
  } | null;
};

/**
 * #2688: the delivered cards in active league flights that name the caller as
 * marker and are not yet answered, grouped by league. The same rule as the
 * league page's queue (`getLigaSnapshot`: submitted, not approved, not
 * withdrawn, active flight); the marker is usually not in the flight, so it
 * reads with the admin client, bounded to the caller's own marker rows.
 */
async function readMarkerCards(userId: string, leagueIds: string[]): Promise<Map<string, AppMarkerCard[]>> {
  const { data, error } = await getAdminClient()
    .from('game_players')
    .select(
      'game_id, user_id, users!game_players_user_id_fkey(name, nickname), games!inner(status, league_rounds!games_league_round_id_fkey(label, league_id))',
    )
    .eq('marker_user_id', userId)
    .not('submitted_at', 'is', null)
    .is('approved_at', null)
    .is('withdrawn_at', null)
    .eq('games.status', 'active');
  if (error) throw error;
  const byLeague = new Map<string, AppMarkerCard[]>();
  for (const row of (data ?? []) as unknown as MarkerCardRow[]) {
    const round = row.games?.league_rounds;
    if (!round || !leagueIds.includes(round.league_id)) continue;
    const list = byLeague.get(round.league_id) ?? [];
    list.push({
      gameId: row.game_id,
      userId: row.user_id,
      playerName: row.users?.nickname?.trim() || row.users?.name?.trim() || null,
      roundLabel: round.label,
    });
    byLeague.set(round.league_id, list);
  }
  return byLeague;
}

/**
 * The caller's draft and active leagues for the app's Home (#2638). Read with
 * the admin client, bounded to the caller's own `league_players` rows; the
 * user id comes only from the validated token. A participant always sees their
 * own league (canViewLeague), so no further gate is needed. Throws on a failed
 * read: the route answers 500 and the app hides the section.
 */
export async function getMyLeagues(userId: string, now = new Date()): Promise<AppLeagueSummary[]> {
  const admin = getAdminClient();
  const { data: memberships, error: mErr } = await admin
    .from('league_players')
    .select('league_id')
    .eq('user_id', userId);
  if (mErr) throw mErr;
  const leagueIds = (memberships ?? []).map((m) => m.league_id);
  if (leagueIds.length === 0) return [];

  const nowIso = now.toISOString();
  const [leaguesRes, roundsRes, markerCards] = await Promise.all([
    admin
      .from('leagues')
      .select('id, name, status')
      .in('id', leagueIds)
      .in('status', ['draft', 'active'])
      .order('name'),
    admin
      .from('league_rounds')
      .select('id, league_id, label, sequence, closes_at')
      .in('league_id', leagueIds)
      .lte('opens_at', nowIso)
      .gte('closes_at', nowIso),
    readMarkerCards(userId, leagueIds),
  ]);
  if (leaguesRes.error) throw leaguesRes.error;
  if (roundsRes.error) throw roundsRes.error;
  const openRounds = (roundsRes.data ?? []) as RoundRow[];

  const flightsByRound = new Map<string, RoundFlight[]>();
  if (openRounds.length > 0) {
    const { data: flights, error: fErr } = await admin
      .from('games')
      .select('league_round_id, status, game_players!inner(user_id, withdrawn_at)')
      .in(
        'league_round_id',
        openRounds.map((r) => r.id),
      )
      .eq('game_players.user_id', userId);
    if (fErr) throw fErr;
    for (const f of flights ?? []) {
      if (!f.league_round_id) continue;
      const arr = flightsByRound.get(f.league_round_id) ?? [];
      arr.push({
        status: f.status,
        players: (f.game_players as Array<{ user_id: string; withdrawn_at: string | null }>).map((p) => ({
          userId: p.user_id,
          withdrawnAt: p.withdrawn_at,
        })),
      });
      flightsByRound.set(f.league_round_id, arr);
    }
  }

  return assembleMyLeagues(
    (leaguesRes.data ?? []) as LeagueRow[],
    openRounds,
    flightsByRound,
    userId,
    markerCards,
  );
}
