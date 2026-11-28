// #3019: tells each admin at once when a player reports a person or a round
// (Apple guideline 1.2: «timely responses»). The owner promised to look at
// every report within 24 hours.
//
// Triggered from submitReportCore after the insert. Best-effort: the caller
// wraps a Promise.allSettled() around the per-admin sends, and a mail failure
// never stops the report — the row lives in content_reports regardless.
//
// Locale-aware: user-visible text comes from the `mail` catalog for the
// recipient's locale.

import { getMailTranslator, resolveMailLocale, mailUrl } from './i18n';
import { sendMail } from './send';
import { mailWordmarkHtml } from './wordmark';
import { escapeHtml } from './escapeHtml';

export type ContentReportNotificationParams = {
  /** Admin recipient e-mail address. */
  to: string;
  /** First name of the admin, for salutation. Null if unknown. */
  adminFirstName: string | null;
  /** Display name of the player who sent the report. */
  reporterName: string;
  /** What was reported: a player or a round. */
  kind: 'user' | 'game';
  /** The player's name or the round's name. */
  target: string;
  reason: 'offensive' | 'harassment' | 'other';
  /** The reporter's own words, or null. Shown verbatim. */
  note: string | null;
  /** Recipient's locale. Defaults to Norwegian. */
  locale?: string | null;
};

export async function sendContentReportNotification(
  params: ContentReportNotificationParams,
): Promise<void> {
  const { to, adminFirstName, reporterName, kind, target, reason, note, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const subject = t('contentReport.subject', { target });
  const adminUrl = mailUrl(locale, '/admin/rapporter');
  const homeUrl = mailUrl(locale, '');

  const salutation = adminFirstName
    ? t('contentReport.salutationNamed', { name: adminFirstName })
    : t('contentReport.salutationGeneric');

  const bodyHtml = t.markup('contentReport.body', {
    reporterName: escapeHtml(reporterName),
    kind,
    target: escapeHtml(target),
    strong: (c) => `<strong>${c}</strong>`,
  });
  const reasonLine = t('contentReport.reason', { reason });
  const quote = note ? t('contentReport.quote', { text: note }) : null;

  const footerHtml = t.markup('contentReport.footer', {
    link: (c) =>
      `<a href="${homeUrl}" style="color:#1B4332;text-decoration:underline;">${c}</a>`,
  });

  const html = `<!DOCTYPE html><html lang="${loc}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A2E1F;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
              ${mailWordmarkHtml()}
            </h1>
            <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A2E1F;font-weight:500;">
              ${t('contentReport.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${bodyHtml}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(reasonLine)}
            </p>${
              quote
                ? `
            <p style="font-size:15px;line-height:1.6;margin:0 0 16px;background:#F0EDE5;border-radius:8px;padding:16px;color:#1A2E1F;">
              ${escapeHtml(quote)}
            </p>`
                : ''
            }
            <p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#4A3F30;">
              ${t('contentReport.promise')}
            </p>
            <div style="margin:32px 0;">
              <a href="${adminUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:9999px;font-weight:600;font-size:15px;">
                ${t('contentReport.openAdmin')}
              </a>
            </div>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E5E0D3;padding-top:24px;">
              ${footerHtml}
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody =
    `${subject}\n\n` +
    `${salutation}\n\n` +
    `${t('contentReport.bodyText', { reporterName, kind, target })}\n\n` +
    `${reasonLine}\n\n` +
    (quote ? `${quote}\n\n` : '') +
    `${t('contentReport.promise')}\n\n` +
    `${t('contentReport.openAdminText', { url: adminUrl })}\n\n` +
    `${t('common.footerTagline')}\n`;

  await sendMail({
    to,
    subject,
    html,
    text: textBody,
  });
}
