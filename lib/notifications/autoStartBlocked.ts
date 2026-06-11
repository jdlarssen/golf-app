import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from './notify';

/**
 * Strukturelle blokkeringsårsaker fra `startScheduledGame`: tilstander som
 * ikke løser seg selv ved retry (i motsetning til transiente db-feil), og
 * som oppretteren faktisk kan gjøre noe med. Kun disse skal utløse
 * auto_start_blocked-varselet (#502) — transiente feil retries stille av
 * neste cron-sweep.
 */
const STRUCTURAL_BLOCK_REASONS: ReadonlySet<string> = new Set([
  'incomplete_sides',
  'pending_players',
  'no_players',
  'tee_missing',
  'tee_missing_rating',
]);

export function isStructuralBlockReason(reason: string): boolean {
  return STRUCTURAL_BLOCK_REASONS.has(reason);
}

/**
 * Én-gangs «auto-start blokkert»-varsel til spillets oppretter (#502).
 *
 * Cron-sweepen treffer et blokkert spill hvert minutt til blokkeringen
 * løses — varselet må derfor gates atomisk så oppretteren får nøyaktig
 * ett varsel, ikke ett per minutt. Samme «vinn raden»-mønster som
 * deliveryReminder (#376): sett `auto_start_blocked_notified_at = now()`
 * KUN hvis den er null og spillet fortsatt er scheduled; ingen rad
 * tilbake → allerede varslet (eller spillet rakk å starte) → return.
 *
 * Kjent begrensning: kolonnen nullstilles ikke hvis admin re-planlegger
 * tee-tiden etterpå — et nytt blokkert forsøk gir ikke nytt varsel.
 *
 * Best-effort: svelger alle feil (console.error), kaster aldri — sweepen
 * skal aldri velte på varsel-arbeid.
 */
export async function maybeNotifyAutoStartBlocked(opts: {
  gameId: string;
  gameName: string;
  createdBy: string | null;
  reason: string;
  logPrefix: string;
}): Promise<void> {
  const { gameId, gameName, createdBy, reason, logPrefix } = opts;

  if (!isStructuralBlockReason(reason)) return;
  if (!createdBy) {
    // Eldre rader kan mangle created_by — ingen mottaker, ingen varsel.
    console.log(
      `[${logPrefix}] game ${gameId} blocked (${reason}) but has no creator — skipping varsel`,
    );
    return;
  }

  try {
    const admin = getAdminClient();
    const { data: won, error: updErr } = await admin
      .from('games')
      .update({ auto_start_blocked_notified_at: new Date().toISOString() })
      .eq('id', gameId)
      .is('auto_start_blocked_notified_at', null)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle<{ id: string }>();

    if (updErr || !won) return;

    await notify({
      userId: createdBy,
      kind: 'auto_start_blocked',
      payload: { game_id: gameId, game_name: gameName, reason },
    });
  } catch (e) {
    console.error(`[${logPrefix}] auto_start_blocked varsel failed`, e);
  }
}
