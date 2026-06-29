// Sends a "Vi bygde det du foreslo" mail to the idea submitter when an admin
// marks their idea as built.
//
// Only sent when notify() returns shouldAlsoSendMail = true (user is off-app).
// Best-effort: callers should wrap in try/catch or Promise.allSettled so a
// mail failure never blocks the markIdeaBuilt action — the in-app notification
// already lives in the DB.
//
// Locale-aware: user-visible text comes from the `mail` catalog for the
// recipient's locale.

import { Resend } from 'resend';
import { getMailTranslator, resolveMailLocale, mailUrl } from './i18n';

function resolveFromEmail(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim();
  if (!raw) return 'Tørny <noreply@tornygolf.no>';
  if (raw.includes('<') && raw.includes('>')) return raw;
  return `Tørny <${raw}>`;
}

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not set');
  }
  return new Resend(key);
}

export type IdeaBuiltNotificationParams = {
  /** Recipient e-mail address (the idea submitter). */
  to: string;
  /** First name of the recipient, for salutation. Null if unknown. */
  name: string | null;
  /** Recipient's locale. Defaults to Norwegian. */
  locale?: string | null;
};

export async function sendIdeaBuiltNotification(
  params: IdeaBuiltNotificationParams,
): Promise<void> {
  const { to, name, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const subject = t('ideaBuilt.subject');
  const homeUrl = mailUrl(locale, '/foreslaa-ide');

  const salutation = name
    ? t('ideaBuilt.salutationNamed', { name })
    : t('ideaBuilt.salutationGeneric');

  const bodyHtml = t('ideaBuilt.body');

  const footerHtml = t.markup('ideaBuilt.footer', {
    link: (c) =>
      `<a href="${mailUrl(locale, '')}" style="color:#1B4332;text-decoration:underline;">${c}</a>`,
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
              Tørny<span style="color:#C9A961;">.</span>
            </h1>
            <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              ${t('ideaBuilt.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              ${escapeHtml(bodyHtml)}
            </p>
            <div style="margin:32px 0;">
              <a href="${homeUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${t('ideaBuilt.openButton')}
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

  const textBody =
    `${subject}\n\n` +
    `${salutation}\n\n` +
    `${bodyHtml}\n\n` +
    `${t('ideaBuilt.openButtonText', { url: homeUrl })}\n\n` +
    `${t('common.footerTagline')}\n`;

  const resend = getClient();
  const result = await resend.emails.send({
    from: resolveFromEmail(),
    to,
    subject,
    html,
    text: textBody,
  });

  if (result.error) {
    throw new Error(
      `Resend send failed: ${result.error.message ?? JSON.stringify(result.error)}`,
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
