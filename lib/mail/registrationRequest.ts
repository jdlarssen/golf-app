// Sends a "Ny påmelding"-mail to admin/creator when a player requests to
// join a manual_approval-game. Triggered fra `requestApproval`-action-en
// kun når `shouldAlsoSendMail` slår ut (admin har vært off-app > 5 min).
//
// Best-effort: caller wrapper i try/catch så en mail-feil aldri ruller
// tilbake selve forespørselen. game_registration_requests-raden er source
// of truth — admin ser den i innboks + på godkjennings-siden uansett.

import { Resend } from 'resend';

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

export type RegistrationRequestMailParams = {
  to: string;
  gameName: string;
  /** 8-char short_id — brukes til å bygge deeplink til admin-godkjenningssiden. */
  gameShortId: string;
  requesterName: string;
  /**
   * Valgfri hilsen fra søker (max 200 tegn — håndhevet i action). Rendres som
   * blockquote i mail-en hvis satt, droppes ellers.
   */
  message?: string;
};

export async function sendRegistrationRequestMail(
  params: RegistrationRequestMailParams,
): Promise<void> {
  const { to, gameName, gameShortId, requesterName, message } = params;
  const subject = `Ny påmelding til ${gameName}`;
  const approvalUrl = `https://tornygolf.no/signup/${gameShortId}`;

  // Bygg hilsen-blokk kun hvis message er satt — vi vil ikke ha en tom
  // blockquote-ramme som tar opp plass uten innhold.
  const messageHtml = message
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #C9A961;background:#F8F6F0;font-size:15px;line-height:1.5;color:#1A1813;">${escapeHtml(
        message,
      )}</blockquote>`
    : '';
  const messageText = message ? `\n«${message}»\n` : '';

  const html = `<!DOCTYPE html><html lang="nb">
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
              Fyr opp golfturneringen på et par minutter.
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              Ny påmelding venter
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              <strong>${escapeHtml(requesterName)}</strong> vil bli med i <em>${escapeHtml(gameName)}</em>.
            </p>
            ${messageHtml}
            <div style="margin:32px 0;">
              <a href="${approvalUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                Gå til påmeldinger
              </a>
            </div>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              Du får denne meldingen fordi du er arrangør for spillet. Du kan godkjenne eller avslå forespørselen fra Sekretariatet.
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
    `${requesterName} vil bli med i ${gameName}.\n` +
    `${messageText}` +
    `\nGå til påmeldinger: ${approvalUrl}\n\n` +
    `Tørny — fyr opp golfturneringen på et par minutter.\n`;

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
