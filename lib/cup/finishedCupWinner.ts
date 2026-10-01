import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { getCupSnapshot } from './getCupSnapshot';
import { cupWinnerFromPoints } from './cupWinner';

/**
 * Keeps a finished cup's stored winner in step with its points (#2214).
 *
 * `finishTournament` writes `tournaments.winner_team` once, and the results
 * page shows that stored value for a finished cup. Side awards can still be
 * corrected after the finish (the owner's answer, 25.09.2026), and a
 * correction moves the team points. Without this the page would show 4,5–6
 * under «Lag 1 vant». No other path changes a finished cup's points: starting
 * and reopening a match are refused (`finishedCupBlocksPlay`).
 *
 * Does nothing for a cup that is not finished. Writes only when the winner
 * changed, and only while the cup is still finished. A failed read or write
 * throws, so the caller can answer `save_failed`; a new tap repeats the
 * correction and the sync, both idempotent.
 *
 * Its own file, not `sideAwardActions.ts`: a 'use server' file may only
 * export actions.
 */
export async function syncFinishedCupWinner(tournamentId: string): Promise<void> {
  const admin = getAdminClient();
  const { data: cup, error } = await admin
    .from('tournaments')
    .select('status, winner_team')
    .eq('id', tournamentId)
    .maybeSingle();
  if (error) {
    throw new Error(`syncFinishedCupWinner: cup read failed: ${error.message}`, { cause: error });
  }
  if (!cup || cup.status !== 'finished') return;

  // The snapshot only needs the team points here, so the name fallback for an
  // unknown player is never shown and can be a fixed string.
  const snapshot = await getCupSnapshot(tournamentId, '?');
  if (!snapshot) return;
  const winner = cupWinnerFromPoints(
    snapshot.leaderboard.team1Points,
    snapshot.leaderboard.team2Points,
  );
  if (winner === cup.winner_team) return;

  expectAffected(
    await admin
      .from('tournaments')
      .update({ winner_team: winner })
      .eq('id', tournamentId)
      .eq('status', 'finished')
      .select('id'),
    'syncFinishedCupWinner',
  );
}
