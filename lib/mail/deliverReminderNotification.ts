// Sends a "Husk å levere scorekortet"-mail to a player who has registered all
// 18 holes but not submitted their scorecard (#376).
//
// Triggered from the auto-nudge (game-home render) and the admin purring, but
// ONLY for off-app players (notify() returns shouldAlsoSendMail) — active
// players get the in-app varsel alone. Best-effort: callers wrap a
// Promise.allSettled() around sends so one failure doesn't block the rest, and
// the parent flow never aborts on mail errors — the «ikke levert»-state lives
// in the DB and the player can still submit by opening the app.
//
// Locale-aware (i18n Fase M, #594): user-visible text comes from the `mail`
// catalog for the recipient's locale.

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

export type DeliverReminderNotificationParams = {
  to: string;
  /** First name of the player, for "Hei <name>!" salutation. Null if unknown. */
  playerFirstName: string | null;
  /** The game's display name, used in subject + body. */
  gameName: string;
  /** Game id — used to build the submit URL. */
  gameId: string;
  /** Mottakerens locale (#594). Normalt udefinert → norsk. */
  locale?: string | null;
};

export async function sendDeliverReminderNotification(
  params: DeliverReminderNotificationParams,
): Promise<void> {
  const { to, playerFirstName, gameName, gameId, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const subject = t('deliverReminder.subject', { gameName });
  const submitUrl = mailUrl(locale, `/games/${gameId}/submit`);
  const homeUrl = mailUrl(locale, '');

  const salutation = playerFirstName
    ? t('deliverReminder.salutationNamed', { name: playerFirstName })
    : t('deliverReminder.salutationGeneric');

  const bodyHtml = t.markup('deliverReminder.body', {
    gameName: escapeHtml(gameName),
    strong: (c) => `<strong>${c}</strong>`,
  });
  const bodyText = t('deliverReminder.bodyText', { gameName });

  const footerHtml = t.markup('deliverReminder.footer', {
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
              Tørny<span style="color:#C9A961;">.</span>
            </h1>
            <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              ${t('deliverReminder.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              ${bodyHtml}
            </p>
            <div style="margin:32px 0;">
              <a href="${submitUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${t('deliverReminder.submitButton')}
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
    `${t('deliverReminder.submitButtonText', { url: submitUrl })}\n\n` +
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
