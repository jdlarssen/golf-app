import 'server-only';
import { firstName } from '@/lib/firstName';
import { sendMissingScoreReminderNotification } from '@/lib/mail/missingScoreReminderNotification';
import { notify } from './notify';

/**
 * The organiser's «Påminn» on a skipped-hole row (#2268, the owner's choice
 * B): an in-app `missing_score_reminder` (push included, via notify) and, for
 * an off-app player, a mail. Same shape as `sendDeliveryReminder`: in-app
 * first, mail only when notify says so, and no mail when the in-app insert
 * failed.
 *
 * It never stamps `game_players.deliver_reminder_sent_at`: that stamp is the
 * delivery-reminder sweep's one-shot guard (#2200), and setting it here would
 * cancel the player's later reminder to deliver.
 *
 * Best-effort: logs and never throws, so one dead address does not stop the
 * rest. The caller counts the stored rows back (`remindMissingScore.ts`).
 */
export async function sendMissingScoreReminder(opts: {
  player: { userId: string; email: string | null; name: string | null; locale?: string | null };
  game: { id: string; name: string };
  holes: readonly number[];
  logPrefix: string;
}): Promise<void> {
  const { player, game, holes, logPrefix } = opts;

  let shouldMail = false;
  try {
    const r = await notify({
      userId: player.userId,
      kind: 'missing_score_reminder',
      payload: { game_id: game.id, game_name: game.name, holes: [...holes] },
    });
    shouldMail = r.shouldAlsoSendMail;
  } catch (e) {
    console.error(`[${logPrefix}] missing_score_reminder notify failed`, e);
    return;
  }

  if (shouldMail && player.email) {
    try {
      await sendMissingScoreReminderNotification({
        to: player.email,
        playerFirstName: firstName(player.name),
        gameName: game.name,
        gameId: game.id,
        holes,
        locale: player.locale ?? null,
      });
    } catch (e) {
      console.error(`[${logPrefix}] missing_score_reminder mail failed`, e);
    }
  }
}
