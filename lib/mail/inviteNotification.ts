// Sends a "you've been invited" notification mail via Resend.
//
// The actual login code is sent by Supabase Auth when the invitee
// reaches /login and asks for one. This mail is just the prompt
// to get them there.
//
// Best-effort: callers should wrap this in try/catch so a mail
// failure never aborts the invitation insert. The invitations table
// is the source of truth — admin can resend manually if needed.
//
// Locale-aware (i18n Fase M, #594): user-visible text comes from the `mail`
// catalog for the recipient's locale. Invitees are account-less, so callers
// have no `users.locale` to pass — the default is Norwegian, and the language
// switcher is available once they log in.

import { Resend } from 'resend';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import {
  getMailTranslator,
  getMailMessages,
  resolveMailLocale,
  mailUrl,
} from './i18n';

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
  /**
   * Mottakerens locale (#594). Invitéer er konto-løse, så dette er normalt
   * udefinert → norsk. Beholdt som param for symmetri med øvrige mail-sendere.
   */
  locale?: string | null;
};

/**
 * Resolverer modus-hint-innholdet defensivt. Returnerer null når mailen ikke er
 * spill-scoped, modus mangler, eller modus ikke er en kjent katalog-modus. Label
 * og sammendrag leses locale-aware fra den merged'e katalogen.
 */
function resolveModeHint(
  hasGame: boolean,
  gameMode: string | undefined,
  messages: Awaited<ReturnType<typeof getMailMessages>>,
): { label: string; summary: string } | null {
  if (!hasGame || !gameMode) return null;
  if (!Object.prototype.hasOwnProperty.call(MODE_LABELS, gameMode)) return null;
  // Runtime-keyed by game_mode → read the merged catalog through a structural
  // cast (the typed catalog can't index an arbitrary string key).
  const cat = messages as unknown as {
    modes: Record<string, string>;
    formatGuide: { content: Record<string, { summary?: string }> };
  };
  const label = cat.modes[gameMode];
  const summary = cat.formatGuide.content[gameMode]?.summary;
  if (!label || !summary) return null;
  return { label, summary };
}

export async function sendInviteNotification(
  params: InviteNotificationParams,
): Promise<void> {
  // CI / test-env stub: when RESEND_STUB_SEND=true the function returns early
  // without touching Resend. Prod never sets this variable, so the full send
  // path is unchanged there. The invitation row has already been written before
  // this function is called, so the flow reaches status=sent as expected.
  if (process.env.RESEND_STUB_SEND === 'true') {
    console.log('[sendInviteNotification] stub mode — skipping Resend send');
    return;
  }

  const { to, invitedByName, gameName, gameMode, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);
  const messages = await getMailMessages(locale);

  const hasGame = typeof gameName === 'string' && gameName.length > 0;
  const modeHint = resolveModeHint(hasGame, gameMode, messages);

  const loginUrl = mailUrl(locale, '/login');
  const formatsUrl = mailUrl(locale, '/spillformater');

  // Modus-hint (#309): kort callout med navn + sammendrag + lenke. Distinkt
  // styling (14px, lys boks) så det ikke kolliderer med intro-linjens regex i
  // approval-testen. Tom streng når ingen hint → mal uendret fra før.
  const modeHintHtml = modeHint
    ? `<p style="font-size:14px;line-height:1.5;margin:0 0 24px;background:#F1EFE8;border-radius:8px;padding:12px 16px;color:#1A1813;">
              <strong>${t('invite.formatHint', { label: escapeHtml(modeHint.label) })}</strong><br>
              ${escapeHtml(modeHint.summary)}<br>
              <a href="${formatsUrl}" style="color:#1B4332;font-weight:600;text-decoration:underline;">${t('invite.formatReadMore')}</a>
            </p>
            `
    : '';
  const modeHintText = modeHint
    ? `${t('invite.formatHint', { label: modeHint.label })} — ${modeHint.summary}\n${t('invite.formatReadMore')}: ${formatsUrl}\n\n`
    : '';

  const subject = hasGame
    ? t('invite.subjectGame', { gameName: gameName! })
    : t('invite.subject');

  const introLineHtml = hasGame
    ? t.markup('invite.introGame', {
        name: escapeHtml(invitedByName),
        game: escapeHtml(gameName!),
        strong: (c) => `<strong>${c}</strong>`,
        em: (c) => `<em>${c}</em>`,
      })
    : t.markup('invite.introOpen', {
        name: escapeHtml(invitedByName),
        strong: (c) => `<strong>${c}</strong>`,
      });

  const introLineText = hasGame
    ? t.markup('invite.introGame', {
        name: invitedByName,
        game: gameName!,
        strong: (c) => c,
        em: (c) => c,
      })
    : t.markup('invite.introOpen', {
        name: invitedByName,
        strong: (c) => c,
      });

  const getStartedHtml = t.markup('invite.getStartedHtml', {
    link: (c) =>
      `<a href="${loginUrl}" style="color:#1B4332;font-weight:600;text-decoration:underline;">${c}</a>`,
  });
  const getStartedText = t.markup('invite.getStartedText', {
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
              ${t('invite.heading')}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${introLineHtml}
            </p>
            ${modeHintHtml}<p style="font-size:16px;line-height:1.5;margin:0 0 32px;">
              ${getStartedHtml}
            </p>
            <div style="margin:32px 0;">
              <a href="${loginUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;">
                ${t('common.openButton')}
              </a>
            </div>
            <p style="font-size:13px;color:#5C5347;line-height:1.5;margin:32px 0 0;border-top:1px solid #E6E2D6;padding-top:24px;">
              ${t('invite.footerDisclaimer', { name: escapeHtml(invitedByName) })}
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
