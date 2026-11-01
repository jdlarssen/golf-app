import 'server-only';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getAdminClient } from '@/lib/supabase/admin';
import { getLeagueJoinContext, type LeagueJoinContext } from './getLeagueJoinContext';
import { evaluateLeagueJoin, type LeagueJoinDecision } from './joinValidation';

/**
 * Joining a league through its shareable link (#2662), shared by the web action
 * and the app's route (#2748).
 *
 * The write goes through the service role (`getAdminClient`) because
 * `league_players` lets only the organiser insert (RLS 0092): the gate is
 * `evaluateLeagueJoin` here, on the same facts the page renders from, and
 * nothing behind it. `userId` must come from the caller's verified session or
 * token, never from a form or a body.
 */

export type JoinLeagueByCodeResult =
  | { ok: true; leagueId: string; alreadyJoined: boolean }
  | {
      ok: false;
      error: Exclude<LeagueJoinDecision, 'can_join' | 'already_joined'> | 'read_failed' | 'save_failed';
    };

export async function joinLeagueByCodeCore(code: string, userId: string): Promise<JoinLeagueByCodeResult> {
  // If the read fails we know nothing, so we say no instead of writing on a
  // guess (#1863).
  let context: LeagueJoinContext;
  try {
    context = await getLeagueJoinContext(code, userId);
  } catch {
    return { ok: false, error: 'read_failed' };
  }

  const decision = evaluateLeagueJoin(context.facts);
  const league = context.league;
  if (decision !== 'can_join' && decision !== 'already_joined') return { ok: false, error: decision };
  if (!league) return { ok: false, error: 'not_found' };
  if (decision === 'already_joined') return { ok: true, leagueId: league.id, alreadyJoined: true };

  // accepted_at now: joining by yourself is the confirmation (#463), so the
  // organiser's list never shows «Ikke bekreftet» for someone who came in by
  // the link. Upsert with ignoreDuplicates: two quick taps = a quiet no-op,
  // deliberately WITHOUT `expectAffected`, the duplicate IS the legitimate
  // 0-row outcome here (trap 2 is about writes where 0 rows reveal a fault).
  const { error: insertErr } = await getAdminClient()
    .from('league_players')
    .upsert(
      { league_id: league.id, user_id: userId, accepted_at: new Date().toISOString() },
      { onConflict: 'league_id,user_id', ignoreDuplicates: true },
    );
  if (insertErr) {
    console.error('[liga] joinLeagueByCode failed', {
      leagueId: league.id,
      userId,
      error: insertErr,
    });
    return { ok: false, error: 'save_failed' };
  }

  revalidatePath(`/liga/${league.id}`);
  revalidatePath(`/admin/liga/${league.id}`);
  return { ok: true, leagueId: league.id, alreadyJoined: false };
}
