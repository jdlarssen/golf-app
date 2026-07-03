import 'server-only';
import { firstName } from '@/lib/firstName';
import { sendPaymentReminderNotification } from '@/lib/mail/paymentReminderNotification';
import { notify } from './notify';

/**
 * Primitiv for startkontingent-purring (#1049): in-app `payment_reminder`-varsel
 * + betinget off-app-mail. Brukes av admin-purringen (`remindUnpaidPlayers`).
 *
 * In-app-først: vi sender alltid in-app (via notify), og maler kun til off-app-
 * spillere (`shouldAlsoSendMail`). Best-effort — feiler stille i console.error,
 * kaster aldri, så parent-server-actionen aldri blokkeres. Speiler mønsteret i
 * `sendDeliveryReminder` (#376).
 */
export async function sendPaymentReminder(opts: {
  player: {
    userId: string;
    email: string | null;
    name: string | null;
    locale?: string | null;
  };
  game: {
    id: string;
    name: string;
    entryFeeKr: number;
    paymentLink: string | null;
  };
  logPrefix: string;
}): Promise<void> {
  const { player, game, logPrefix } = opts;

  let shouldMail = false;
  try {
    const r = await notify({
      userId: player.userId,
      kind: 'payment_reminder',
      payload: {
        game_id: game.id,
        game_name: game.name,
        entry_fee_kr: game.entryFeeKr,
        payment_link: game.paymentLink,
      },
    });
    shouldMail = r.shouldAlsoSendMail;
  } catch (e) {
    console.error(`[${logPrefix}] payment_reminder notify failed`, e);
    return;
  }

  if (shouldMail && player.email) {
    try {
      await sendPaymentReminderNotification({
        to: player.email,
        playerFirstName: firstName(player.name),
        gameName: game.name,
        gameId: game.id,
        entryFeeKr: game.entryFeeKr,
        paymentLink: game.paymentLink,
        locale: player.locale ?? null,
      });
    } catch (e) {
      console.error(`[${logPrefix}] payment_reminder mail failed`, e);
    }
  }
}
