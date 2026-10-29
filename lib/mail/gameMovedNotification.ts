// Tells a player that a scheduled round has a new time (#2480), from «Flytt
// runden» and from «Rediger».
//
// Sent from lib/notifications/notifyGameMoved.ts, and ONLY when the player is
// off-app (notify() returns shouldAlsoSendMail); a player in the app gets the
// in-app varsel and push alone (the owner's answer 2026-10-29: «Ja til
// alle»). Best-effort: the caller catches and logs, and a mail error never
// reaches the move that set it off.
//
// Locale-aware (#594): the text comes from the `mail` catalog for the
// recipient's locale, and the tee-off is formatted there in Oslo time.

import { getMailTranslator, resolveMailLocale, mailUrl } from './i18n';
import { sendMail } from './send';
import { mailWordmarkHtml } from './wordmark';

export type GameMovedNotificationParams = {
  to: string;
  /** First name of the player, for "Hei <name>!" salutation. Null if unknown. */
  recipientFirstName: string | null;
  /** The game's display name, used in subject + body. */
  gameName: string;
  /** Game id, for the link to /games/[id]. */
  gameId: string;
  /** The new tee-off, ISO. */
  teeOffAt: string;
  /** The course or tee changed in the same save («Rediger»). */
  courseChanged: boolean;
  /** The recipient's locale (#594). Usually undefined → Norwegian. */
  locale?: string | null;
};

export async function sendGameMovedNotification(params: GameMovedNotificationParams): Promise<void> {
  const { to, recipientFirstName, gameName, gameId, teeOffAt, courseChanged, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);
  const teeOffMs = Date.parse(teeOffAt);

  const subject = t('gameMoved.subject', { gameName });
  const gameUrl = mailUrl(locale, `/games/${gameId}`);
  const homeUrl = mailUrl(locale, '');

  const salutation = recipientFirstName
    ? t('gameMoved.salutationNamed', { name: recipientFirstName })
    : t('gameMoved.salutationGeneric');

  const bodyHtml = t.markup(courseChanged ? 'gameMoved.bodyCourseChanged' : 'gameMoved.body', {
    gameName: escapeHtml(gameName),
    teeOffAt: teeOffMs,
    strong: (c) => `<strong>${c}</strong>`,
  });
  const bodyText = courseChanged
    ? t('gameMoved.bodyTextCourseChanged', { gameName, teeOffAt: teeOffMs })
    : t('gameMoved.bodyText', { gameName, teeOffAt: teeOffMs });

  const footerHtml = t.markup('gameMoved.footer', {
    link: (c) =>
      `<a href="${homeUrl}" style="color:#1B4332;text-decoration:underline;">${c}</a>`,
  });

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
              ${t('gameMoved.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              ${bodyHtml}
            </p>
            <div style="margin:32px 0;">
              <a href="${gameUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${t('gameMoved.button')}
              </a>
            </div>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              ${footerHtml}
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
    `${bodyText}\n\n` +
    `${t('gameMoved.buttonText', { url: gameUrl })}\n\n` +
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
