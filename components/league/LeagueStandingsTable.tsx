import { Fragment } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatNumber } from '@/lib/i18n/format';
import {
  formatRoundCell,
  formatSeasonValue,
  roundCellValue,
  splitStandings,
  type FormatDecimal,
} from '@/lib/league/standingsFormat';
import type { LeagueStandingRow, LeagueStandingCell } from '@/lib/league/types';
import type { LeagueRoundView, LeagueParticipant } from '@/lib/league/getLigaSnapshot';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';

function playerName(p: LeagueParticipant, unknownLabel: string): string {
  return p.nickname?.trim() || p.name?.trim() || unknownLabel;
}

/** The locale's decimal for the shared formatters (`lib/league/standingsFormat`). */
function localeDecimal(locale: AppLocale): FormatDecimal {
  return (value, decimals) =>
    formatNumber(value, locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function RoundCell({
  cell,
  model,
  pointsBased,
  t,
  locale,
  open,
}: {
  cell: LeagueStandingCell | undefined;
  model: string;
  pointsBased: boolean;
  t: ReturnType<typeof useTranslations<'liga.standings'>>;
  locale: AppLocale;
  open: boolean;
}) {
  const raw = roundCellValue(cell, model);
  const tone = open ? ' bg-primary-soft' : '';
  if (!cell || raw === null) {
    return (
      <td
        data-open-cell={open || undefined}
        className={`px-0 py-2 text-center font-serif tabular-nums text-xs text-score-unset-fg${tone}`}
      >
        —
      </td>
    );
  }

  // Stableford-runde-verdier (og plasserings-poeng) er rene poeng, ikke mot-par.
  const label = formatRoundCell(raw, model, pointsBased, localeDecimal(locale));
  const isPenalty = cell.penalised;
  const isFlagged = cell.deliveredOutsideWindow;

  return (
    <td
      data-open-cell={open || undefined}
      className={[
        'px-0 py-2 text-center font-serif tabular-nums text-xs',
        isPenalty ? 'italic text-muted/60' : 'text-text',
        open ? 'bg-primary-soft' : '',
      ].join(' ')}
      title={
        isFlagged
          ? t('flaggedTitle')
          : isPenalty
            ? t('penalisedTitle')
            : undefined
      }
    >
      <span>{label}</span>
      {isFlagged && (
        <span
          role="img"
          className="ml-0.5 inline-block h-1 w-1 rounded-full align-middle"
          style={{ background: 'var(--accent)' }}
          aria-label={t('flaggedAriaLabel')}
        />
      )}
    </td>
  );
}

export function LeagueStandingsTable({
  rows,
  rounds,
  participants,
  standingsModel,
  bestNCount,
  pointsBased = false,
  openRoundId = null,
}: {
  rows: LeagueStandingRow[];
  /** Rounds that have opened, in sequence (`tableRounds`); upcoming rounds get no column. */
  rounds: LeagueRoundView[];
  participants: LeagueParticipant[];
  standingsModel: string;
  bestNCount?: number | null;
  /** #452 Fase 4: stableford-formater viser rå poeng (høyest best) i cellene. */
  pointsBased?: boolean;
  /** #1378: the round whose window is open now; its column is toned. */
  openRoundId?: string | null;
}) {
  const t = useTranslations('liga.standings');
  const locale = useLocale();

  if (rows.length === 0) {
    return (
      <p data-testid="liga-standings-empty" className="text-sm text-muted text-center py-4">
        {t('emptyState')}
      </p>
    );
  }

  const participantMap = new Map(participants.map((p) => [p.userId, p]));

  const { ranked, notRanked, notRankedYet } = splitStandings(rows);
  const groups = [
    { key: 'notRanked', label: t('groupNotRanked'), rows: notRanked },
    { key: 'notRankedYet', label: t('groupNotRankedYet'), rows: notRankedYet },
  ].filter((g) => g.rows.length > 0);
  const columnCount = 3 + rounds.length;

  const valueHeader =
    standingsModel === 'points'
      ? t('colPoints')
      : standingsModel === 'average'
        ? t('colAverage')
        : standingsModel === 'best_n'
          ? bestNCount
            ? t('colBestN', { n: bestNCount })
            : t('colBestNFallback')
          : t('colTotal');

  const headClass =
    'font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted';

  const renderRow = (row: LeagueStandingRow, { isLast }: { isLast: boolean }) => {
    const participant = participantMap.get(row.userId);
    // Én kilde for hele tabellen (#1527): samme nøkkel enten raden
    // mangler deltaker eller deltakeren mangler navn.
    const name = participant
      ? playerName(participant, t('unknownPlayer'))
      : t('unknownPlayer');
    const isFirst = row.rank === 1;
    const isUnranked = !row.ranked;
    // The last ranked row sits right above a group heading, which draws the line.
    const noLine = isLast && !isUnranked && groups.length > 0;

    return (
      <tr
        key={row.userId}
        data-testid="liga-standings-row"
        className={[
          'transition-colors',
          noLine ? '' : 'border-b border-row-divider-warm',
          isFirst ? 'rounded-lg' : '',
        ].join(' ')}
        style={
          isFirst
            ? {
                background:
                  'linear-gradient(90deg, rgba(201,169,97,0.08), rgba(201,169,97,0.03))',
              }
            : undefined
        }
      >
        {/* Rank: empty for rows that are not ranked */}
        <td
          className="w-7 py-2.5 pr-1 font-serif tabular-nums text-sm"
          style={isFirst ? { color: 'var(--accent-text)' } : undefined}
        >
          {isUnranked ? '' : (row.rank ?? '')}
        </td>

        {/* Name */}
        <td
          className="py-2.5 pr-2 font-sans text-sm font-medium"
          style={isFirst ? { color: 'var(--accent-text)' } : undefined}
        >
          <div className="flex items-center gap-1.5">
            <span>{name}</span>
            {participant?.acceptedAt == null && (
              <UnconfirmedBadge />
            )}
          </div>
        </td>

        {/* Season value */}
        <td
          className={[
            'w-[52px] py-2.5 pr-1.5 text-right font-serif tabular-nums text-sm font-semibold',
            isUnranked ? 'text-muted' : '',
          ].join(' ')}
          style={isFirst ? { color: 'var(--accent-text)' } : undefined}
        >
          {formatSeasonValue(row.value, standingsModel, pointsBased, localeDecimal(locale))}
        </td>

        {/* Per-round cells */}
        {rounds.map((r) => {
          const cell = row.perRound.find((c) => c.roundId === r.id);
          return (
            <RoundCell
              key={r.id}
              cell={cell}
              model={standingsModel}
              pointsBased={pointsBased}
              t={t}
              locale={locale}
              open={r.id === openRoundId}
            />
          );
        })}
      </tr>
    );
  };

  return (
    <div className="w-full overflow-x-auto -mx-1">
      <table
        data-testid="liga-standings"
        className="w-full border-collapse text-sm"
        style={{ minWidth: '320px' }}
      >
        <thead>
          <tr className="border-b border-border">
            <th className={`w-7 py-2 pr-1 text-left ${headClass}`}>{t('colRank')}</th>
            <th className={`py-2 pr-2 text-left ${headClass}`}>{t('colPlayer')}</th>
            <th className={`w-[52px] py-2 pr-1.5 text-right ${headClass}`}>{valueHeader}</th>
            {rounds.map((r) => {
              const open = r.id === openRoundId;
              return (
                <th key={r.id} className={`w-[34px] p-0 text-center ${headClass}`}>
                  <div
                    data-testid={open ? 'liga-standings-open-col' : undefined}
                    className={[
                      'flex items-center justify-center gap-1 py-2',
                      open ? 'rounded-t-lg bg-primary-soft' : '',
                    ].join(' ')}
                  >
                    {open && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-live-dot"
                      />
                    )}
                    <span>R{r.sequence}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ranked.map((row, i) => renderRow(row, { isLast: i === ranked.length - 1 }))}
          {groups.map((g) => (
            <Fragment key={g.key}>
              <tr data-testid={`liga-standings-group-${g.key}`} className="border-b border-row-divider-warm">
                <th colSpan={columnCount} scope="colgroup" className={`pb-2 pt-4 text-left ${headClass}`}>
                  {g.label}
                </th>
              </tr>
              {g.rows.map((row) => renderRow(row, { isLast: false }))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
