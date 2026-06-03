import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { firstName } from '@/lib/firstName';
import { sendDeliverReminderNotification } from '@/lib/mail/deliverReminderNotification';
import { TOTAL_HOLES } from '@/lib/games/deliveryStatus';
import { notify } from './notify';

/**
 * Delt primitiv for leverings-påminnelse (#376): in-app `deliver_reminder`-
 * varsel + betinget off-app-mail. Brukes av både auto-nudgen
 * (`maybeSendDeliveryReminder`) og admin-purringen (`remindUnsubmittedPlayers`).
 *
 * In-app-først: vi sender alltid in-app (via notify), og maler kun til
 * off-app-spillere (`shouldAlsoSendMail`). Best-effort — feiler stille i
 * console.error, kaster aldri, så parent-flyten (render/server-action) aldri
 * blokkeres. Defaulter til ingen mail hvis in-app-varselet ikke gikk gjennom
 * (samme rasjonale som inni notify() — vi vil ikke maile uten in-app).
 */
export async function sendDeliveryReminder(opts: {
  player: { userId: string; email: string | null; name: string | null };
  game: { id: string; name: string };
  logPrefix: string;
}): Promise<void> {
  const { player, game, logPrefix } = opts;

  let shouldMail = false;
  try {
    const r = await notify({
      userId: player.userId,
      kind: 'deliver_reminder',
      payload: { game_id: game.id, game_name: game.name },
    });
    shouldMail = r.shouldAlsoSendMail;
  } catch (e) {
    console.error(`[${logPrefix}] deliver_reminder notify failed`, e);
    return;
  }

  if (shouldMail && player.email) {
    try {
      await sendDeliverReminderNotification({
        to: player.email,
        playerFirstName: firstName(player.name),
        gameName: game.name,
        gameId: game.id,
      });
    } catch (e) {
      console.error(`[${logPrefix}] deliver_reminder mail failed`, e);
    }
  }
}

/**
 * Auto-nudge: fyr én leverings-påminnelse til spilleren hvis hen har registrert
 * alle 18 hull men ikke levert. Kalt fra game-home-render via `after()` (notify
 * kaller revalidateTag som kaster i render-fasen). Self-gater på hull-telling +
 * en atomisk idempotens-guard, så den er trygg å kalle på hvert besøk:
 *
 *   1. Tell hull med registrert slag for spilleren. < 18 → return.
 *   2. Atomisk «vinn raden»-update: sett deliver_reminder_sent_at = now() KUN
 *      hvis den er null + ikke levert + ikke trukket. Ingen rad tilbake →
 *      tapte race / allerede purret / levert / trukket → return.
 *   3. Vant raden → sendDeliveryReminder. Kjøres nøyaktig én gang per spiller.
 *
 * Bruker admin-client (RLS-bypass) siden cookies ikke er tilgjengelig inni
 * `after()`-callbacken, og fordi vi uansett skriver på vegne av systemet.
 * Best-effort — svelger alle feil.
 */
export async function maybeSendDeliveryReminder(opts: {
  gameId: string;
  userId: string;
  gameName: string;
}): Promise<void> {
  const { gameId, userId, gameName } = opts;
  const admin = getAdminClient();

  try {
    const { count, error: countErr } = await admin
      .from('scores')
      .select('hole_number', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .not('strokes', 'is', null);

    if (countErr || (count ?? 0) < TOTAL_HOLES) return;

    const { data: won, error: updErr } = await admin
      .from('game_players')
      .update({ deliver_reminder_sent_at: new Date().toISOString() })
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .is('deliver_reminder_sent_at', null)
      .is('submitted_at', null)
      .is('withdrawn_at', null)
      .select('user_id')
      .maybeSingle<{ user_id: string }>();

    if (updErr || !won) return;

    const { data: u } = await admin
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .maybeSingle<{ email: string | null; name: string | null }>();

    await sendDeliveryReminder({
      player: { userId, email: u?.email ?? null, name: u?.name ?? null },
      game: { id: gameId, name: gameName },
      logPrefix: 'autoDeliverReminder',
    });
  } catch (e) {
    console.error('[autoDeliverReminder] failed', e);
  }
}
