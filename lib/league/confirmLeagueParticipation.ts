import { getAdminClient } from '@/lib/supabase/admin';

/**
 * #463 — auto-bekreft liga-deltakelse når deltakeren åpner liga-siden.
 * Liga-analog til `maybeAutoConfirmParticipation`. Atomisk, idempotent,
 * admin-client, best-effort. Se den for begrunnelse.
 */
export async function maybeAutoConfirmLeagueParticipation(opts: {
  leagueId: string;
  userId: string;
}): Promise<void> {
  const { leagueId, userId } = opts;
  const admin = getAdminClient();
  try {
    await admin
      .from('league_players')
      .update({ accepted_at: new Date().toISOString() })
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .is('accepted_at', null);
  } catch (e) {
    console.error('[autoConfirmLeagueParticipation] failed', e);
  }
}
