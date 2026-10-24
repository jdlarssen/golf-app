import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { roundPlayerLocks, type RoundFlight } from './roundLocks';
import type { AppLeagueSummary } from './appLeagueView';

type LeagueRow = { id: string; name: string; status: string };
type RoundRow = { id: string; league_id: string; label: string; sequence: number; closes_at: string };

/**
 * Pure assembly of «Ligaene dine»: one entry per draft or active league, its
 * earliest open round, and whether the caller has delivered it or is playing
 * it (roundPlayerLocks, the same rule as the start gate).
 */
export function assembleMyLeagues(
  leagues: LeagueRow[],
  openRounds: RoundRow[],
  flightsByRound: Map<string, RoundFlight[]>,
  userId: string,
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
      };
    });
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
  const [leaguesRes, roundsRes] = await Promise.all([
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

  return assembleMyLeagues((leaguesRes.data ?? []) as LeagueRow[], openRounds, flightsByRound, userId);
}
