// Sends a "Resultatet er klart" mail to a player after admin avslutter spillet.
//
// Best-effort: callers should wrap a Promise.allSettled() around per-player
// sends so a single failure doesn't block the rest, and the action itself
// never aborts on mail errors — the game-finished state lives in the DB and
// the leaderboard is reachable in-app even without the mail.

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

export type GameFinishedNotificationParams = {
  to: string;
  /** First name of the recipient, for "Hei <name>!" salutation. Pass null if unknown. */
  playerFirstName: string | null;
  /** The game's display name, used in subject + body. */
  gameName: string;
  /** Game id — used to build the leaderboard URL. */
  gameId: string;
};

export async function sendGameFinishedNotification(
  params: GameFinishedNotificationParams,
): Promise<void> {
  const { to, playerFirstName, gameName, gameId } = params;
  const subject = `Resultatet er klart — ${gameName}`;
  const leaderboardUrl = `https://tornygolf.no/games/${gameId}/leaderboard`;
  const salutation = playerFirstName ? `Hei ${playerFirstName}!` : 'Hei!';

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
              Resultatet er klart
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              Runden i <strong>${escapeHtml(gameName)}</strong> er ferdig — alle scorekort er levert og godkjent, og leaderboard er åpen.
            </p>
            <div style="margin:32px 0;">
              <a href="${leaderboardUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                Se leaderboard
              </a>
            </div>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              Du får denne meldingen fordi du var med i runden. Logg inn på <a href="https://tornygolf.no" style="color:#1B4332;text-decoration:underline;">tornygolf.no</a> for full oversikt.
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text =
    `Resultatet er klart — ${gameName}\n\n` +
    `${salutation}\n\n` +
    `Runden i ${gameName} er ferdig — alle scorekort er levert og godkjent, og leaderboard er åpen.\n\n` +
    `Se leaderboard: ${leaderboardUrl}\n\n` +
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
