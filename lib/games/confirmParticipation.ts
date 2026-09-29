import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';

/**
 * #463 — auto-bekreft deltakelse når spilleren viser aktivitet (åpner spillet).
 *
 * Samme mønster som påminnelses-kravet (#376/#2200): atomisk «vinn raden»-update
 * som setter `accepted_at = now()` KUN hvis den fortsatt er null. Idempotent —
 * kjører reelt nøyaktig én gang per spiller per spill. Bruker admin-client
 * siden cookies ikke er tilgjengelig inni `after()`-callbacken og vi skriver
 * på vegne av brukerens egen handling. Best-effort: svelger alle feil.
 *
 * Modellen er «merkelapp + dytt» — å åpne spillet ER en bekreftelse, så badgen
 * rydder seg selv for aktive spillere uten et eksplisitt trykk.
 */
export async function maybeAutoConfirmParticipation(opts: {
  gameId: string;
  userId: string;
}): Promise<void> {
  const { gameId, userId } = opts;
  const admin = getAdminClient();
  try {
    // #2223: same shape as the league twin (#727). A bare await threw nothing,
    // so a PostgREST error vanished; expectAffected surfaces it. 0 rows is the
    // steady state (the player is already confirmed) and stays silent.
    expectAffected(
      await admin
        .from('game_players')
        .update({ accepted_at: new Date().toISOString() })
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .is('accepted_at', null)
        .select('user_id'),
      'autoConfirmParticipation',
    );
  } catch (e) {
    if (!(e instanceof NoRowsAffectedError)) {
      console.error('[autoConfirmParticipation] failed', e);
    }
  }
}
