// Sends the organiser one of two mails about their round (#2203):
//  - `all_delivered`: every card is in, «Alle har levert. Avslutt spillet.»
//  - `stale`: the round has stood still for a day. It goes whether or not
//    anyone is still missing, so the text says neither.
//
// Sent from lib/notifications/organizerNotices.ts, and ONLY when the organiser
// is off-app (notify() returns shouldAlsoSendMail); an organiser in the app
// gets the in-app varsel and push alone. Never for a single delivery (the
// owner's answer 2026-10-05). Best-effort: the caller catches and logs, and a
// mail error never reaches the delivery, approval or sweep that set it off.
//
// Locale-aware (i18n Fase M, #594): user-visible text comes from the `mail`
// catalog for the recipient's locale.

import { getMailTranslator, resolveMailLocale, mailUrl } from './i18n';
import { sendMail } from './send';
import { mailWordmarkHtml } from './wordmark';

export type OrganizerGameNoticeParams = {
  to: string;
  /** First name of the organiser, for "Hei <name>!" salutation. Null if unknown. */
  recipientFirstName: string | null;
  /** The game's display name, used in subject + body. */
  gameName: string;
  /** Game id, for the link to /games/[id]/avslutt. */
  gameId: string;
  /** The recipient's locale (#594). Usually undefined → Norwegian. */
  locale?: string | null;
  variant: 'all_delivered' | 'stale';
};

export async function sendOrganizerGameNotice(params: OrganizerGameNoticeParams): Promise<void> {
  const { to, recipientFirstName, gameName, gameId, locale, variant } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);
  const allDelivered = variant === 'all_delivered';

  const subject = allDelivered
    ? t('organizerGameNotice.subjectAllDelivered', { gameName })
    : t('organizerGameNotice.subjectStale', { gameName });
  const finishUrl = mailUrl(locale, `/games/${gameId}/avslutt`);
  const homeUrl = mailUrl(locale, '');

  const salutation = recipientFirstName
    ? t('organizerGameNotice.salutationNamed', { name: recipientFirstName })
    : t('organizerGameNotice.salutationGeneric');

  const bodyHtml = t.markup(
    allDelivered ? 'organizerGameNotice.bodyAllDelivered' : 'organizerGameNotice.bodyStale',
    {
      gameName: escapeHtml(gameName),
      strong: (c) => `<strong>${c}</strong>`,
    },
  );
  const bodyText = allDelivered
    ? t('organizerGameNotice.bodyTextAllDelivered', { gameName })
    : t('organizerGameNotice.bodyTextStale', { gameName });
  const heading = allDelivered
    ? t('organizerGameNotice.headingAllDelivered')
    : t('organizerGameNotice.headingStale');

  const footerHtml = t.markup('organizerGameNotice.footer', {
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
              <a href="${finishUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${t('organizerGameNotice.button')}
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
    `${t('organizerGameNotice.buttonText', { url: finishUrl })}\n\n` +
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
