// Sends a «du mangler slag på hull H»-mail to a player the organiser reminded
// from the desk (#2268, the owner's choice B): they have scored later holes but
// not these. Only for off-app players (notify() returns shouldAlsoSendMail),
// as the delivery reminder. Best-effort: the caller never aborts on mail errors.
//
// Locale-aware: user-visible text comes from the `mail` catalog for the
// recipient's locale, and the hole list is joined the locale's way.

import { formatListLocale } from '@/lib/i18n/format';
import { getMailTranslator, resolveMailLocale, mailUrl } from './i18n';
import { sendMail } from './send';
import { mailWordmarkHtml } from './wordmark';

export type MissingScoreReminderNotificationParams = {
  to: string;
  /** First name of the player, for "Hei <name>!" salutation. Null if unknown. */
  playerFirstName: string | null;
  /** The game's display name, used in subject + body. */
  gameName: string;
  /** Game id, for the link to the first missing hole. */
  gameId: string;
  /** The holes without a score, real hole numbers in order (at least one). */
  holes: readonly number[];
  /** Mottakerens locale. Normalt udefinert → norsk. */
  locale?: string | null;
};

export async function sendMissingScoreReminderNotification(
  params: MissingScoreReminderNotificationParams,
): Promise<void> {
  const { to, playerFirstName, gameName, gameId, holes, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const holeList = formatListLocale(holes.map(String), loc);
  const holeCount = holes.length;
  const firstHole = holes[0];

  const subject = t('missingScoreReminder.subject', { holes: holeList, holeCount, gameName });
  const holeUrl = mailUrl(locale, `/games/${gameId}/holes/${firstHole}`);
  const homeUrl = mailUrl(locale, '');

  const salutation = playerFirstName
    ? t('missingScoreReminder.salutationNamed', { name: playerFirstName })
    : t('missingScoreReminder.salutationGeneric');

  const bodyHtml = t.markup('missingScoreReminder.body', {
    gameName: escapeHtml(gameName),
    holes: holeList,
    holeCount,
    strong: (c) => `<strong>${c}</strong>`,
  });
  const bodyText = t('missingScoreReminder.bodyText', { gameName, holes: holeList, holeCount });
  const heading = t('missingScoreReminder.heading', { holes: holeList, holeCount });
  const button = t('missingScoreReminder.button', { hole: firstHole });
  const buttonText = t('missingScoreReminder.buttonText', { hole: firstHole, url: holeUrl });

  const footerHtml = t.markup('missingScoreReminder.footer', {
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
              ${heading}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              ${bodyHtml}
            </p>
            <div style="margin:32px 0;">
              <a href="${holeUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${button}
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
    `${buttonText}\n\n` +
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
