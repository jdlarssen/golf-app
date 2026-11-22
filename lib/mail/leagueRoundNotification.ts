// The league round's two messages as mail (#2974): «Runde 3 i Vinterligaen er
// åpen» and the reminder before the round closes.
//
// The messages are a varsel and a push first (#2638 Del 3). The mail is for
// the player who has no device to push to: without it nothing reaches them
// outside Tørny. Who that is, and that the mail goes once per message, is the
// sweep's job (`lib/notifications/leagueRoundNotices.ts`); this file renders
// and sends. Best-effort there: a failed mail is logged and never undoes the
// varsel.
//
// One wording, two places: the text says what the inbox card says
// (`notifications.kinds.leagueRoundOpen` and its siblings), and the button
// opens the page the varsel opens (`notificationDestination`).
//
// Locale-aware (i18n Fase M, #594): user-visible text comes from the `mail`
// catalog for the recipient's locale, the deadline in Oslo time.

import { notificationDestination } from '@/lib/notifications/deeplink';
import type { NotificationPayload } from '@/lib/notifications/types';
import { getMailTranslator, mailUrl, resolveMailLocale } from './i18n';
import { sendMail } from './send';
import { mailWordmarkHtml } from './wordmark';
import { escapeHtml } from './escapeHtml';

export type LeagueRoundNotificationParams = {
  to: string;
  /** First name of the player, for the «Hei <name>!» salutation. Null if unknown. */
  playerFirstName: string | null;
  kind: 'league_round_open' | 'league_round_closing';
  /** The varsel's own payload, so the mail and the inbox card never drift apart. */
  payload: NotificationPayload<'league_round_open'>;
  /** The recipient's locale (#594). Normally undefined → Norwegian. */
  locale?: string | null;
};

export async function sendLeagueRoundNotification(
  params: LeagueRoundNotificationParams,
): Promise<void> {
  const { to, playerFirstName, kind, payload, locale } = params;
  const loc = resolveMailLocale(locale);
  const t = await getMailTranslator(locale);

  const closesAt = Date.parse(payload.closes_at);
  const names = { roundLabel: payload.round_label, leagueName: payload.league_name };
  const subject =
    kind === 'league_round_open'
      ? t('leagueRound.subjectOpen', names)
      : t('leagueRound.subjectClosing', { ...names, closesAt });

  // #2666: a simulator league names the course and tee, as the inbox card does.
  const body =
    kind === 'league_round_closing'
      ? t('leagueRound.bodyClosing')
      : payload.is_simulator && payload.course_name && payload.tee_name
        ? t('leagueRound.bodyOpenSim', {
            courseName: payload.course_name,
            teeName: payload.tee_name,
            closesAt,
          })
        : t('leagueRound.bodyOpen', { closesAt });

  const salutation = playerFirstName
    ? t('leagueRound.salutationNamed', { name: playerFirstName })
    : t('leagueRound.salutationGeneric');

  // The same page the varsel opens: the round's start page in a simulator
  // league, the league page otherwise.
  const path = notificationDestination({ kind, payload }) ?? `/liga/${payload.league_id}`;
  const buttonUrl = mailUrl(locale, path);
  const button = payload.is_simulator ? t('leagueRound.buttonRound') : t('leagueRound.buttonLeague');
  const buttonText = payload.is_simulator
    ? t('leagueRound.buttonRoundText', { url: buttonUrl })
    : t('leagueRound.buttonLeagueText', { url: buttonUrl });

  // The way out of the mail is the push switch, and it lives on the profile.
  const profileUrl = mailUrl(locale, '/profile');
  const footerHtml = t.markup('leagueRound.footer', {
    link: (c) =>
      `<a href="${profileUrl}" style="color:#1B4332;text-decoration:underline;">${c}</a>`,
  });
  const footerText = t('leagueRound.footerText', { url: profileUrl });

  const html = `<!DOCTYPE html><html lang="${loc}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A2E1F;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F8F6F0;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;">
          <tr><td>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;margin:0 0 8px;color:#1B4332;letter-spacing:-0.01em;">
              ${mailWordmarkHtml()}
            </h1>
            <p style="font-size:13px;color:#4A3F30;margin:0 0 32px;">
              ${t('common.tagline')}
            </p>
            <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;margin:0 0 16px;color:#1A2E1F;font-weight:500;">
              ${escapeHtml(subject)}
            </h2>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(salutation)}
            </p>
            <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">
              ${escapeHtml(body)}
            </p>
            <div style="margin:32px 0;">
              <a href="${buttonUrl}" style="display:inline-block;background:#1B4332;color:#F8F6F0;text-decoration:none;padding:14px 24px;border-radius:9999px;font-weight:600;font-size:15px;">
                ${button}
              </a>
            </div>
            <p style="font-size:13px;color:#4A3F30;line-height:1.5;margin:32px 0 0;border-top:1px solid #E5E0D3;padding-top:24px;">
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
    `${body}\n\n` +
    `${buttonText}\n\n` +
    `${footerText}\n\n` +
    `${t('common.footerTagline')}\n`;

  await sendMail({
    to,
    subject,
    html,
    text,
  });
}
