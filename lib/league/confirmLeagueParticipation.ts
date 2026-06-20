import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';

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
    // #727: route through expectAffected so a genuine PostgREST error — silently
    // swallowed before, since the result was never inspected — surfaces in the
    // log. A 0-row outcome is the STEADY STATE here: this runs on every liga-page
    // load and the `.is('accepted_at', null)` guard matches nothing once the
    // player is confirmed, so NoRowsAffectedError is the expected idempotent
    // no-op and is swallowed silently (not logged as a failure).
    expectAffected(
      await admin
        .from('league_players')
        .update({ accepted_at: new Date().toISOString() })
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .is('accepted_at', null)
        .select('user_id'),
      'autoConfirmLeagueParticipation',
    );
  } catch (e) {
    if (!(e instanceof NoRowsAffectedError)) {
      console.error('[autoConfirmLeagueParticipation] failed', e);
    }
  }
}
