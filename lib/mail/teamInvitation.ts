// Sends a «Du er invitert til {teamName}»-mail til en ukjent e-post når
// kapteinen legger til en medspiller som ikke har Tørny-konto enda.
// Triggered fra `submitTeamRegistration`-action etter at invitations-raden
// er opprettet med game_id satt. Alltid-send (recipient har ikke konto,
// så last_seen_at-terskelen gir ingen mening).
//
// Brukeren går: mail → /login (legger inn samme e-post) → kode → fullfør
// profil → /signup/[shortId]/team → klikker «Bli med på lag» (per
// teamActions.attachToCaptainTeam).

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

export type TeamInvitationMailParams = {
  to: string;
  captainName: string;
  gameName: string;
  teamName: string;
  /** 8-char short_id — brukes til å bygge /signup/[shortId]-deeplink via login. */
  gameShortId: string;
};

export async function sendTeamInvitationMail(
  params: TeamInvitationMailParams,
): Promise<void> {
  const { to, captainName, gameName, teamName, gameShortId } = params;
  const subject = `Du er invitert til ${teamName} (${gameName})`;
  // Vi sender brukeren til /login med next-param som tar dem til
  // påmeldings-siden etter OTP-verify + profil-fullføring.
  const next = encodeURIComponent(`/signup/${gameShortId}/team`);
  const loginUrl = `https://tornygolf.no/login?next=${next}`;

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
              Du er invitert på lag
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              <strong>${escapeHtml(captainName)}</strong> vil ha deg med på laget <em>${escapeHtml(teamName)}</em> i <strong>${escapeHtml(gameName)}</strong>.
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              For å bli med: gå til Tørny, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Etter pålogging lander du rett på lag-siden hvor du kan bekrefte plassen din.
            </p>
            <div style="margin:32px 0;">
              <a href="${loginUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                Bli med på laget
              </a>
            </div>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              Kjenner du ikke ${escapeHtml(captainName)}? Ignorer denne meldingen — ingenting skjer hvis du ikke logger inn.
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
    `${captainName} vil ha deg med på laget ${teamName} i ${gameName}.\n\n` +
    `Gå til Tørny, skriv inn denne e-posten, og logg inn med koden du får tilsendt. Etter pålogging lander du rett på lag-siden hvor du kan bekrefte plassen.\n\n` +
    `Bli med: ${loginUrl}\n\n` +
    `Kjenner du ikke ${captainName}? Ignorer denne meldingen.\n\n` +
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
