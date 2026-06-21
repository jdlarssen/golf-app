// Sends a «Søknad til {gameName}»-mail til søker etter at admin avslår en
// pending registreringsforespørsel. Triggered fra `rejectRequest`-action
// kun når notify() returnerer shouldAlsoSendMail.
//
// Best-effort: caller wrapper i try/catch. In-app-varselet er allerede
// inserted — søker vil se det neste gang de åpner appen uansett.
//
// Locale-aware (i18n Fase M, #594): user-visible text comes from the `mail`
// catalog for the recipient's locale.

import { Resend } from 'resend';
import { getMailTranslator, resolveMailLocale } from './i18n';

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

export type RegistrationRejectedMailParams = {
  to: string;
  gameName: string;
  /**
   * Valgfri begrunnelse fra admin (max 200 tegn — håndhevet i action).
   * Rendres som blockquote hvis satt, droppes ellers.
   */
  reason?: string;
  /** Mottakerens locale (#594). Normalt udefinert → norsk. */
  locale?: string | null;
};

export async function sendRegistrationRejectedMail(
  params: RegistrationRejectedMailParams,
): Promise<void> {
  const { to, gameName, reason, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const subject = t('registrationRejected.subject', { gameName });

  const bodyHtml = t.markup('registrationRejected.body', {
    gameName: escapeHtml(gameName),
    strong: (c) => `<strong>${c}</strong>`,
  });
  const bodyText = t('registrationRejected.bodyText', { gameName });

  const reasonHtml = reason
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #C9A961;background:#F8F6F0;font-size:15px;line-height:1.5;color:#1A1813;">${escapeHtml(
        reason,
      )}</blockquote>`
    : '';
  const reasonText = reason
    ? `\n${t('registrationRejected.reasonPrefix', { reason })}\n`
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
              Tørny<span style="color:#C9A961;">.</span>
            </h1>
            <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              ${t('registrationRejected.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${bodyHtml}
            </p>
            ${reasonHtml}
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${t('registrationRejected.closing')}
            </p>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              ${t('registrationRejected.footer')}
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
    `${bodyText}\n` +
    `${reasonText}` +
    `\n${t('registrationRejected.closing')}\n\n` +
    `${t('common.footerTagline')}\n`;

  const resend = getClient();
  const result = await resend.emails.send({
    from: resolveFromEmail(),
    to,
    subject,
    html,
    text,
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
