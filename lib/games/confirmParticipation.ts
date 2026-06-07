import { getAdminClient } from '@/lib/supabase/admin';

/**
 * #463 — auto-bekreft deltakelse når spilleren viser aktivitet (åpner spillet).
 *
 * Speiler `maybeSendDeliveryReminder`-mønsteret: atomisk «vinn raden»-update
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
    await admin
      .from('game_players')
      .update({ accepted_at: new Date().toISOString() })
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .is('accepted_at', null);
  } catch (e) {
    console.error('[autoConfirmParticipation] failed', e);
  }
}
