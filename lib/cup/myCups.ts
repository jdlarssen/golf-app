import 'server-only';
import type { getServerClient } from '@/lib/supabase/server';

type ServerSupabase = Awaited<ReturnType<typeof getServerClient>>;

/**
 * The cup-relation set behind the lasting door into cups you played (#1463).
 *
 * The only direct route into a finished cup used to be the inbox notice, which
 * the player can delete. `/admin/cup` is already reachable for every logged-in
 * user (#526), but it only listed cups you CREATED — so a plain player's list
 * was always empty. These helpers widen that list to every cup you are part of.
 */

/** A ledger row as `/admin/cup` renders it. */
export type CupLedgerRow = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'finished';
  team_1_name: string;
  team_2_name: string;
  /** NULL until the cup starts (#1142). */
  points_to_win: number | null;
  created_at: string;
  created_by: string;
  /** NULL = personal cup; set = club-scoped cup (#524). */
  group_id: string | null;
  /** Stored outcome: 1|2 = that side won, NULL on a finished cup = tied. */
  winner_team: 1 | 2 | null;
};

/** The persisted cup outcome — never recomputed (same stance as #1449). */
export type CupLedgerResult = { kind: 'winner'; team: string } | { kind: 'tied' };

/**
 * Union of id sources, deduped, first sighting wins.
 *
 * Overlap is the normal case, not the exception: a split cup day (#1441) gives
 * one player three `game_players` rows for the same cup, and every post-0155
 * participant sits in both the roster table and their games.
 */
export function mergeCupIds(
  sources: Array<Array<string | null | undefined>>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of sources) {
    for (const id of source) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Every cup the user is part of: created ∪ draft roster ∪ played.
 *
 * Three sources, because none of them covers everything:
 * - `tournaments.created_by` — cups you arranged;
 * - `tournament_participants` (0155) — the draft roster, so a player added in
 *   the Spillere room shows up BEFORE the matches are generated;
 * - `game_players → games.tournament_id` — cups you actually played, including
 *   the pre-0155 ones that have no roster rows at all.
 *
 * Request-scoped client on purpose: all three reads are the user's own rows (or
 * world-read), so RLS is the gate. The caller fetches the tournament rows
 * themselves — a club-cup participant who isn't a club member can't read the
 * row under RLS but CAN open `/cup/[id]`, so that fetch goes through the admin
 * client on exactly these ids (same authz shape as `getCupSnapshot`).
 */
export async function getMyCupIds(
  supabase: ServerSupabase,
  userId: string,
): Promise<string[]> {
  const [createdRes, rosterRes, playedRes] = await Promise.all([
    supabase.from('tournaments').select('id').eq('created_by', userId),
    supabase
      .from('tournament_participants')
      .select('tournament_id')
      .eq('user_id', userId),
    supabase
      .from('game_players')
      .select('games!inner(tournament_id)')
      .eq('user_id', userId)
      .not('games.tournament_id', 'is', null)
      .returns<Array<{ games: { tournament_id: string | null } | null }>>(),
  ]);

  return mergeCupIds([
    (createdRes.data ?? []).map((r) => r.id),
    (rosterRes.data ?? []).map((r) => r.tournament_id),
    (playedRes.data ?? []).map((r) => r.games?.tournament_id),
  ]);
}

/**
 * Where a ledger row leads. Admins keep the management page for every cup.
 * A player gets the management page only for their own PERSONAL cups — club
 * cups are managed from the club page, one door per room (#344) — and the
 * public cup page for everything else.
 */
export function cupLedgerHref(
  cup: Pick<CupLedgerRow, 'id' | 'created_by' | 'group_id'>,
  { userId, isAdmin }: { userId: string; isAdmin: boolean },
): string {
  const managesIt = isAdmin || (cup.created_by === userId && cup.group_id === null);
  return managesIt ? `/admin/cup/${cup.id}` : `/cup/${cup.id}`;
}

/**
 * The outcome line on a finished row, read straight off `winner_team` (stored
 * truth — `lib/games/getFinishedGamesForUser.ts` holds the same stance).
 * `null` while the cup is still a draft or running: the status chip says it.
 */
export function cupLedgerResult(
  cup: Pick<CupLedgerRow, 'status' | 'winner_team' | 'team_1_name' | 'team_2_name'>,
): CupLedgerResult | null {
  if (cup.status !== 'finished') return null;
  if (cup.winner_team === 1) return { kind: 'winner', team: cup.team_1_name };
  if (cup.winner_team === 2) return { kind: 'winner', team: cup.team_2_name };
  return { kind: 'tied' };
}
