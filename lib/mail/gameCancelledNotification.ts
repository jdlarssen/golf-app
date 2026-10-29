// Sends a «{gameName} er avlyst»-mail to a player on the list of a scheduled
// round the organiser cancelled with «Avlys og si fra» (#2481).
//
// Triggered from `deleteGame` after the game is deleted, ONLY for off-app
// players (notify() returns shouldAlsoSendMail) — a player in the app sees the
// in-app notice at once. Best-effort: the caller wraps the sends in
// Promise.allSettled(), so one failure never blocks the rest or the redirect.
//
// No button: the game no longer exists, so the mail carries everything the
// player needs — the round, when it was set for, and the organiser's greeting.
//
// Locale-aware (i18n Fase M, #594): user-visible text comes from the `mail`
// catalog for the recipient's locale; the date is formatted in Oslo time.

import { getMailTranslator, resolveMailLocale } from './i18n';
import { sendMail } from './send';
import { mailWordmarkHtml } from './wordmark';

export type GameCancelledNotificationParams = {
  to: string;
  /** First name of the player, for "Hei <name>!" salutation. Null if unknown. */
  playerFirstName: string | null;
  /** The game's display name, used in subject + body. */
  gameName: string;
  /** `games.scheduled_tee_off_at`; null when the round had no start time. */
  teeOffAt: string | null;
  courseName: string | null;
  /** The display name of the one who cancelled. Null → the catalog fallback. */
  organizerName: string | null;
  /** The organiser's greeting, verbatim (max 300, enforced in the action). */
  message?: string;
  /** Mottakerens locale (#594). Normalt udefinert → norsk. */
  locale?: string | null;
};

export async function sendGameCancelledNotification(
  params: GameCancelledNotificationParams,
): Promise<void> {
  const { to, playerFirstName, gameName, teeOffAt, courseName, organizerName, message, locale } =
    params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const organizer = organizerName ?? t('gameCancelled.organizerFallback');
  const subject = t('gameCancelled.subject', { gameName });

  const salutation = playerFirstName
    ? t('gameCancelled.salutationNamed', { name: playerFirstName })
    : t('gameCancelled.salutationGeneric');

  const bodyHtml = t.markup('gameCancelled.body', {
    organizer: escapeHtml(organizer),
    gameName: escapeHtml(gameName),
    strong: (c) => `<strong>${c}</strong>`,
  });
  const bodyText = t('gameCancelled.bodyText', { organizer, gameName });

  const teeOff = teeOffAt ? Date.parse(teeOffAt) : Number.NaN;
  const scheduledLine = Number.isNaN(teeOff)
    ? null
    : courseName
      ? t('gameCancelled.scheduled', { teeOff, courseName })
      : t('gameCancelled.scheduledNoCourse', { teeOff });

  const messageHtml = message
    ? `<p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
              ${escapeHtml(t('gameCancelled.messageLead', { organizer }))}
            </p>
            <blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #C9A961;background:#F8F6F0;font-size:15px;line-height:1.5;color:#1A1813;">${escapeHtml(
              message,
            ).replace(/\n/g, '<br>')}</blockquote>`
    : '';

  const html = `<!DOCTYPE html><html lang="${loc}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1813;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
              ${mailWordmarkHtml()}
            </h1>
            <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              ${t('gameCancelled.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${bodyHtml}${scheduledLine ? ` ${escapeHtml(scheduledLine)}` : ''}
            </p>
            ${messageHtml}
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              ${t('gameCancelled.footer')}
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text =
    `${subject}\n\n` +
    `${salutation}\n\n` +
    `${bodyText}${scheduledLine ? ` ${scheduledLine}` : ''}\n\n` +
    (message ? `${t('gameCancelled.messageText', { organizer, message })}\n\n` : '') +
    `${t('gameCancelled.footer')}\n\n` +
    `${t('common.footerTagline')}\n`;

  await sendMail({
    to,
    subject,
    html,
    text,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
