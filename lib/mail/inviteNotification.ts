// Sends a "you've been invited" notification mail via Resend.
//
// The actual login code is sent by Supabase Auth when the invitee
// reaches /login and asks for one. This mail is just the prompt
// to get them there.
//
// Best-effort: callers should wrap this in try/catch so a mail
// failure never aborts the invitation insert. The invitations table
// is the source of truth — admin can resend manually if needed.

import { Resend } from 'resend';
import { MODE_GUIDE } from '@/lib/formats/modeGuide';
import { MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';

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

export type InviteNotificationParams = {
  to: string;
  invitedByName: string;
  /**
   * Spill-navnet når invitasjonen gjelder en konkret runde (game-scoped
   * invitasjon fra `/admin/games/[id]`). Når satt, bytter mail-en til en
   * spill-spesifikk subject + ekstra body-linje. Uten gameName beholdes
   * dagens åpne app-invitasjon-copy (friend-invite + admin-invite).
   */
  gameName?: string;
  /**
   * Spillets `game_mode` (#309). Når satt sammen med `gameName` OG verdien er en
   * kjent modus, viser mailen et kort modus-hint (navn + ett-linjes sammendrag +
   * lenke til /spillformater). Ukjent/manglende verdi → ingen hint (defensivt, så
   * inaktive/fremtidige formats aldri kaster). Ignorert for åpne (game-løse)
   * invitasjoner.
   */
  gameMode?: string;
};

/**
 * Resolverer modus-hint-innholdet defensivt. Returnerer null når mailen ikke er
 * spill-scoped, modus mangler, eller modus ikke er en kjent `MODE_GUIDE`-nøkkel.
 */
function resolveModeHint(
  hasGame: boolean,
  gameMode: string | undefined,
): { label: string; summary: string } | null {
  if (!hasGame || !gameMode) return null;
  if (!Object.prototype.hasOwnProperty.call(MODE_GUIDE, gameMode)) return null;
  const mode = gameMode as GameMode;
  return { label: MODE_LABELS[mode], summary: MODE_GUIDE[mode].summary };
}

export async function sendInviteNotification(
  params: InviteNotificationParams,
): Promise<void> {
  const { to, invitedByName, gameName, gameMode } = params;
  const hasGame = typeof gameName === 'string' && gameName.length > 0;
  const modeHint = resolveModeHint(hasGame, gameMode);

  // Modus-hint (#309): kort callout med navn + sammendrag + lenke. Distinkt
  // styling (14px, lys boks) så det ikke kolliderer med intro-linjens regex i
  // approval-testen. Tom streng når ingen hint → mal uendret fra før.
  const modeHintHtml = modeHint
    ? `<p style="font-size:14px;line-height:1.5;margin:0 0 24px;background:#F1EFE8;border-radius:8px;padding:12px 16px;color:#1A1813;">
              <strong>Spillformat: ${escapeHtml(modeHint.label)}</strong><br>
              ${escapeHtml(modeHint.summary)}<br>
              <a href="https://tornygolf.no/spillformater" style="color:#1B4332;font-weight:600;text-decoration:underline;">Les mer om spillformatene</a>
            </p>
            `
    : '';
  const modeHintText = modeHint
    ? `Spillformat: ${modeHint.label} — ${modeHint.summary}\nLes mer om spillformatene: https://tornygolf.no/spillformater\n\n`
    : '';
  const subject = hasGame
    ? `Du er invitert til ${gameName} på Tørny`
    : 'Du er invitert til Tørny';

  const introLineHtml = hasGame
    ? `<strong>${escapeHtml(invitedByName)}</strong> har invitert deg til spillet <em>${escapeHtml(gameName!)}</em> på Tørny.`
    : `<strong>${escapeHtml(invitedByName)}</strong> har invitert deg til en golf-turnering i Tørny.`;

  const introLineText = hasGame
    ? `${invitedByName} har invitert deg til spillet ${gameName} på Tørny.`
    : `${invitedByName} har invitert deg til en golf-turnering i Tørny.`;

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
              Du er invitert
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${introLineHtml}
            </p>
            ${modeHintHtml}<p style="font-size:16px;line-height:1.5;margin:0 0 32px;">
              For å komme i gang: gå til
              <a href="https://tornygolf.no/login" style="color:#1B4332;font-weight:600;text-decoration:underline;">tornygolf.no</a>,
              skriv inn denne e-posten, og logg inn med koden du får tilsendt.
            </p>
            <div style="margin:32px 0;">
              <a href="https://tornygolf.no/login" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                Åpne Tørny
              </a>
            </div>
            <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              Har du ikke en golfvenn ved navn ${escapeHtml(invitedByName)}? Ignorer denne meldingen.
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
    modeHintText +
    `Gå til https://tornygolf.no/login, skriv inn denne e-posten, og logg inn med koden du får tilsendt.\n\n` +
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
