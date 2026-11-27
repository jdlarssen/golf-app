import type { ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { ChevronRightIcon } from '@/components/icons';
import { formatRoundCell, isPointsCell } from '@/lib/league/standingsFormat';
import { localeDecimal } from '@/components/league/LeagueStandingsTable';

/**
 * #2980 (variant A): the top of a round's card in the league page's round
 * list. For a round you played, your number from the season table stands on
 * the right where «Levert» stood, and the whole row opens your card from the
 * round. Every other round keeps today's row with its `action` («Spill»,
 * «Åpner …»).
 *
 * A card that waits for the marker has no number in the table yet (#2661), so
 * `awaiting` keeps the waiting line. Without `leagueId` (a caller the card's
 * gate would refuse) or without a flight, the number is plain text.
 *
 * The link's name for a screen reader keeps what the row said before it
 * became a link (`roundSummary`: label, window, dates), then the result and
 * «Se kortet ditt».
 */
export function RoundMyResult({
  mine,
  awaiting,
  model,
  pointsBased,
  leagueId,
  userId,
  roundSummary,
  action,
  children,
}: {
  /** Your cell in the round (`myRoundCell`); null = the round shows nothing extra. */
  mine: { raw: number; gameId: string | null } | null;
  awaiting: boolean;
  model: string;
  pointsBased: boolean;
  /** `cardLinkLeagueId`: the league id when the caller may open cards. */
  leagueId: string | null;
  userId: string | null;
  /** The round as the screen reader reads it: «Runde 1, Lukket, 10. nov 2026 – 20. nov 2026». */
  roundSummary: string;
  /** Today's right-hand side, for a round without your number. */
  action: ReactNode;
  /** The round's own column: number, window, label and dates. */
  children: ReactNode;
}) {
  const t = useTranslations('liga.player');
  const locale = useLocale() as AppLocale;

  if (!mine || awaiting) {
    return (
      <div className="flex items-start justify-between gap-3">
        {children}
        <div className="shrink-0 self-center">{action}</div>
      </div>
    );
  }

  const value = formatRoundCell(mine.raw, model, pointsBased, localeDecimal(locale));
  const unit = isPointsCell(model, pointsBased) ? t('myResultUnit', { count: mine.raw }) : null;
  const result = (
    <span className="flex items-baseline gap-1" data-testid="liga-round-my-result">
      <span className="font-serif text-base font-semibold tabular-nums text-text">{value}</span>
      {unit && <span className="font-sans text-xs text-muted">{unit}</span>}
    </span>
  );

  if (!leagueId || !mine.gameId || !userId) {
    return (
      <div className="flex items-start justify-between gap-3">
        {children}
        <div className="shrink-0 self-center">{result}</div>
      </div>
    );
  }

  // No prefetch: the list holds a link per round, and the card is rarely opened.
  return (
    <Link
      href={`/liga/${leagueId}/kort/${mine.gameId}/${userId}`}
      prefetch={false}
      aria-label={t('myResultCardAria', { round: roundSummary, result: unit ? `${value} ${unit}` : value })}
      data-testid="liga-round-card-link"
      className="-m-2 flex min-h-[44px] items-start justify-between gap-3 rounded-xl p-2 transition-colors hover:bg-primary-soft/50"
    >
      {children}
      <span className="flex shrink-0 items-center gap-1 self-center">
        {result}
        <ChevronRightIcon className="text-muted" />
      </span>
    </Link>
  );
}
