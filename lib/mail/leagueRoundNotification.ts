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
// The opening mail can carry a summary of the round that closed before it
// (#2979): a short news story and the numbers, under the button. The summary
// is the same for everyone, so then the whole league gets the mail. The story
// is Norwegian for every recipient, like the round report (#1527). Each row
// of the table shows how far the player moved since the table before the
// round (#2983): an arrow and the places in HTML, words in the plain text,
// nothing when the place is the same or there is nothing to move from.
//
// Locale-aware (i18n Fase M, #594): user-visible text comes from the `mail`
// catalog for the recipient's locale, the deadline in Oslo time.

import { formatNetToPar, formatPoints, formatSeasonValue, type FormatDecimal } from '@/lib/league/standingsFormat';
import type { RoundSummary } from '@/lib/league/roundSummary';
import { notificationDestination } from '@/lib/notifications/deeplink';
import type { NotificationPayload } from '@/lib/notifications/types';
import { getMailTranslator, mailUrl, resolveMailLocale } from './i18n';
import { sendMail } from './send';
import { mailWordmarkHtml } from './wordmark';
import { escapeHtml } from './escapeHtml';

/** The round that closed before the one that opens: its numbers, and the news story when there is one. */
export type LeagueRoundMailSummary = {
  summary: RoundSummary;
  /** Written by the language model from the numbers; null sends the numbers alone. */
  story: string | null;
};

export type LeagueRoundNotificationParams = {
  to: string;
  /** First name of the player, for the «Hei <name>!» salutation. Null if unknown. */
  playerFirstName: string | null;
  kind: 'league_round_open' | 'league_round_closing';
  /** The varsel's own payload, so the mail and the inbox card never drift apart. */
  payload: NotificationPayload<'league_round_open'>;
  /** The recipient's locale (#594). Normally undefined → Norwegian. */
  locale?: string | null;
  /** #2979: the round before, shown under the button. Only with the opening message. */
  summary?: LeagueRoundMailSummary;
};

export async function sendLeagueRoundNotification(
  params: LeagueRoundNotificationParams,
): Promise<void> {
  const { to, playerFirstName, kind, payload, locale, summary } = params;
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
  // A mail with a summary goes to the whole league, with a device or not, so
  // it says only why it came.
  const profileUrl = mailUrl(locale, '/profile');
  const footerHtml = summary
    ? t('leagueRound.footerSummary')
    : t.markup('leagueRound.footer', {
        link: (c) =>
          `<a href="${profileUrl}" style="color:#1B4332;text-decoration:underline;">${c}</a>`,
      });
  const footerText = summary
    ? t('leagueRound.footerSummary')
    : t('leagueRound.footerText', { url: profileUrl });

  // #2979: the round before, the same for everyone. The numbers are formatted
  // the way the league table formats them.
  const formatDecimal: FormatDecimal = (value, decimals) =>
    new Intl.NumberFormat(loc === 'no' ? 'nb-NO' : 'en-GB', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  const s = summary?.summary;
  const nameOf = (name: string | null) => name ?? t('common.somePlayerFallback');
  const roundValue = (value: number) =>
    s?.pointsBased ? formatPoints(value, formatDecimal) : formatNetToPar(value, formatDecimal);
  const best = s ? s.round.filter((r) => r.place === 1) : [];
  const summaryHeading = s ? t('leagueRound.summaryHeading', { roundLabel: s.roundLabel }) : '';
  const summaryBest = s
    ? t('leagueRound.summaryBest', {
        names: new Intl.ListFormat(loc === 'no' ? 'nb-NO' : 'en-GB', { type: 'conjunction' }).format(
          best.map((r) => nameOf(r.name)),
        ),
        value: roundValue(best[0]!.value),
        played: s.playedThisRound,
        total: s.playersInLeague,
      })
    : '';
  const summaryTableHeading = s ? t('leagueRound.summaryTable', { rounds: s.roundsPlayed }) : '';
  const moveLabel = (move: number | null, form: 'html' | 'text'): string => {
    if (move === null || move === 0) return '';
    const key = move > 0 ? 'Up' : 'Down';
    return t(`leagueRound.move${key}${form === 'text' ? 'Text' : ''}`, { places: Math.abs(move) });
  };
  const tableRows = s
    ? s.table.map((r) => ({
        place: `${r.place}.`,
        name: nameOf(r.name),
        value: formatSeasonValue(r.value, s.model, s.pointsBased, formatDecimal),
        move: r.move,
        moveHtml: moveLabel(r.move, 'html'),
        moveText: moveLabel(r.move, 'text'),
      }))
    : [];
  // The column is there only when someone moved, so the first round's table
  // looks as it did.
  const showMoves = tableRows.some((r) => r.moveHtml !== '');
  const summaryHtml = s
    ? `
            <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.2;margin:32px 0 12px;color:#1A2E1F;font-weight:500;border-top:1px solid #E5E0D3;padding-top:24px;">
              ${escapeHtml(summaryHeading)}
            </h3>${
              summary?.story
                ? summary.story
                    .split(/\n{2,}/)
                    .map(
                      (paragraph) => `
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
              ${escapeHtml(paragraph)}
            </p>`,
                    )
                    .join('')
                : ''
            }
            <p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:#4A3F30;">
              ${escapeHtml(summaryBest)}
            </p>
            <p style="font-size:14px;line-height:1.5;margin:0 0 4px;font-weight:600;">
              ${escapeHtml(summaryTableHeading)}
            </p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size:15px;line-height:1.5;">${tableRows
              .map(
                (r) => `
              <tr>
                <td style="width:32px;padding:2px 0;color:#4A3F30;">${r.place}</td>
                <td style="padding:2px 0;">${escapeHtml(r.name)}</td>
                <td align="right" style="padding:2px 0;font-weight:600;">${escapeHtml(r.value)}</td>${
                  showMoves
                    ? `
                <td align="right" style="width:44px;padding:2px 0 2px 8px;font-size:13px;font-variant-numeric:tabular-nums;color:${(r.move ?? 0) > 0 ? '#1B4332' : '#4A3F30'};">${escapeHtml(r.moveHtml)}</td>`
                    : ''
                }
              </tr>`,
              )
              .join('')}
            </table>`
    : '';
  const summaryText = s
    ? `${summaryHeading}\n\n` +
      (summary?.story ? `${summary.story}\n\n` : '') +
      `${summaryBest}\n\n` +
      `${summaryTableHeading}\n` +
      tableRows.map((r) => `${r.place} ${r.name} ${r.value}${r.moveText ? ` (${r.moveText})` : ''}`).join('\n') +
      '\n\n'
    : '';

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
            </div>${summaryHtml}
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
    summaryText +
    `${footerText}\n\n` +
    `${t('common.footerTagline')}\n`;

  await sendMail({
    to,
    subject,
    html,
    text,
  });
}
