// Sends a "you've been invited to a club" notification mail via Resend.
//
// Mirror of inviteNotification.ts but scoped to a club (group) instead of a
// game. The actual login code is sent by Supabase Auth when the invitee reaches
// /login and asks for one — this mail is just the prompt to get them there.
// When they log in, accept_club_invitations() makes them a member at once.
//
// Best-effort: callers should wrap this in try/catch so a mail failure never
// aborts the invitation insert. The club_invitations row is the source of
// truth — admin can re-add the same email to resend.
//
// Locale-aware (i18n Fase M, #594): user-visible text comes from the `mail`
// catalog for the recipient's locale. Invitees are account-less, so callers
// have no `users.locale` to pass — the default is Norwegian, and the language
// switcher is available once they log in.

import { Resend } from 'resend';
import { getMailTranslator, resolveMailLocale, mailUrl } from './i18n';

// RESEND_FROM_EMAIL in our env is the bare address (`noreply@tornygolf.no`).
// We always want the display name "Tørny" in the From header, so wrap the
// env value unless it already looks like a `Display Name <addr>` lockup.
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

export type ClubInviteNotificationParams = {
  to: string;
  /** Display name of the club owner/admin who added the email. */
  invitedByName: string;
  /** The club the recipient is invited to. */
  clubName: string;
  /**
   * Mottakerens locale (#594). Invitéer er konto-løse, så dette er normalt
   * udefinert → norsk. Beholdt som param for symmetri med øvrige mail-sendere.
   */
  locale?: string | null;
};

export async function sendClubInviteNotification(
  params: ClubInviteNotificationParams,
): Promise<void> {
  const { to, invitedByName, clubName, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const loginUrl = mailUrl(locale, '/login');

  const subject = t('clubInvite.subject', { clubName });

  const introLineHtml = t.markup('clubInvite.intro', {
    name: escapeHtml(invitedByName),
    club: escapeHtml(clubName),
    strong: (c) => `<strong>${c}</strong>`,
    em: (c) => `<em>${c}</em>`,
  });
  const introLineText = t.markup('clubInvite.intro', {
    name: invitedByName,
    club: clubName,
    strong: (c) => c,
    em: (c) => c,
  });

  const getStartedHtml = t.markup('clubInvite.getStartedHtml', {
    link: (c) =>
      `<a href="${loginUrl}" style="color:#1B4332;font-weight:600;text-decoration:underline;">${c}</a>`,
  });
  const getStartedText = t.markup('clubInvite.getStartedText', {
    link: () => loginUrl,
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
            <p style="font-size:13px;color:#5C5347;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              ${t('clubInvite.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${introLineHtml}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 32px;">
              ${getStartedHtml}
            </p>
            <div style="margin:32px 0;">
              <a href="${loginUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${t('common.openButton')}
              </a>
            </div>
            <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              ${t('clubInvite.footerDisclaimer', { name: escapeHtml(invitedByName) })}
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
    `${introLineText}\n\n` +
    `${getStartedText}\n\n` +
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
