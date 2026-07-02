// Sends the guest-claim mail (#1009): the organiser pushes a finished round's
// result to the guest's real e-mail address AFTER the shadow account's address
// has been flipped from the placeholder. The mail is just the prompt — logging
// in with a normal OTP code is what proves ownership and (via verifyCode)
// clears users.is_guest.
//
// Best-effort: callers wrap this in try/catch. If the send fails, the e-mail
// flip is KEPT (contract decision 7) — the guest can still log in; the
// organiser can re-send from the spillere page.
//
// Locale-aware (i18n Fase M-mønsteret): guests have no stored locale at
// claim-time (locale null → norsk), but the param is kept for symmetry with
// the other senders.

import { Resend } from 'resend';
import {
  getMailTranslator,
  resolveMailLocale,
  mailUrl,
} from './i18n';

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

export type GuestClaimNotificationParams = {
  to: string;
  /** Gjestens fornavn (fra users.name) — null → nøytral «Hei!»-salutation. */
  guestFirstName: string | null;
  /** Arrangøren som sender resultatet. */
  invitedByName: string;
  gameName: string;
  locale?: string | null;
};

export async function sendGuestClaimNotification(
  params: GuestClaimNotificationParams,
): Promise<void> {
  if (process.env.RESEND_STUB_SEND === 'true') {
    console.log('[sendGuestClaimNotification] stub mode — skipping Resend send');
    return;
  }

  const { to, guestFirstName, invitedByName, gameName, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const loginUrl = mailUrl(locale, '/login');

  const subject = t('guestClaim.subject', { gameName });
  const salutation = guestFirstName
    ? t('guestClaim.salutationNamed', { name: guestFirstName })
    : t('guestClaim.salutationGeneric');

  const bodyHtml = t.markup('guestClaim.body', {
    inviterName: escapeHtml(invitedByName),
    gameName: escapeHtml(gameName),
    strong: (c) => `<strong>${c}</strong>`,
  });
  const bodyText = t('guestClaim.bodyText', {
    inviterName: invitedByName,
    gameName,
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
              ${t('guestClaim.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              ${bodyHtml}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              ${t('guestClaim.claimLine')}
            </p>
            <div style="margin:32px 0;">
              <a href="${loginUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${t('common.openButton')}
              </a>
            </div>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              ${t('guestClaim.footer', { inviterName: escapeHtml(invitedByName) })}
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
    `${t('guestClaim.claimLine')}\n\n` +
    `${t('guestClaim.loginButtonText', { url: loginUrl })}\n\n` +
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
