// Sender en «Cup-en er avgjort»-mail til hver deltaker når admin avslutter
// cup-en. Best-effort: callers should wrap a Promise.allSettled() rundt
// fan-out så én feilet mottaker ikke blokkerer resten. Action-en aborterer
// aldri på mail-feil — resultatet lever i DB-en og leaderboard-en er nåbar
// i appen uten mailen.

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

export type CupFinishedNotificationParams = {
  to: string;
  playerFirstName: string | null;
  tournamentName: string;
  tournamentId: string;
  team1Name: string;
  team2Name: string;
  team1Points: number;
  team2Points: number;
  winnerTeamName: string | null;
};

function formatPoints(n: number): string {
  return String(n).replace('.', ',');
}

export async function sendCupFinishedNotification(
  params: CupFinishedNotificationParams,
): Promise<void> {
  const {
    to,
    playerFirstName,
    tournamentName,
    tournamentId,
    team1Name,
    team2Name,
    team1Points,
    team2Points,
    winnerTeamName,
  } = params;

  const subject = `Resultatet er klart — ${tournamentName}`;
  const leaderboardUrl = `https://tornygolf.no/cup/${tournamentId}`;
  const salutation = playerFirstName ? `Hei ${playerFirstName}!` : 'Hei!';

  const resultLine = winnerTeamName
    ? `<strong>${escapeHtml(winnerTeamName)}</strong> vant cupen.`
    : `Cupen endte uavgjort.`;
  const scoreLine = `${escapeHtml(team1Name)} ${formatPoints(team1Points)} — ${formatPoints(team2Points)} ${escapeHtml(team2Name)}`;

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
            <p style="font-size:13px;color:#5C5347;margin:0 0 32px;">
              Fyr opp golfturneringen på et par minutter.
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A1813;">
              ${salutation}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              Cup-en <strong>${escapeHtml(tournamentName)}</strong> er avgjort.
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 8px;">
              ${resultLine}
            </p>
            <p style="font-size:20px;line-height:1.3;margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;color:#1B4332;">
              ${scoreLine}
            </p>
            <div style="margin:32px 0;">
              <a href="${leaderboardUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                Se hele leaderboardet
              </a>
            </div>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text =
    `${salutation}\n\n` +
    `Cup-en "${tournamentName}" er avgjort.\n\n` +
    (winnerTeamName ? `${winnerTeamName} vant cupen.\n` : `Cupen endte uavgjort.\n`) +
    `${team1Name} ${formatPoints(team1Points)} — ${formatPoints(team2Points)} ${team2Name}\n\n` +
    `Se hele leaderboardet: ${leaderboardUrl}\n`;

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
