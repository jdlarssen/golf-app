import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatNumber } from '@/lib/i18n/format';
import {
  formatRoundCell,
  formatSeasonValue,
  roundCellValue,
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
}: {
  cell: LeagueStandingCell | undefined;
  model: string;
  pointsBased: boolean;
  t: ReturnType<typeof useTranslations<'liga.standings'>>;
  locale: AppLocale;
}) {
  const raw = roundCellValue(cell, model);
  if (!cell || raw === null) {
    return (
      <td className="px-2 py-2 text-center font-serif tabular-nums text-xs text-muted/40">
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
      className={[
        'px-2 py-2 text-center font-serif tabular-nums text-xs',
        isPenalty ? 'italic text-muted/60' : 'text-text',
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
}: {
  rows: LeagueStandingRow[];
  rounds: LeagueRoundView[];
  participants: LeagueParticipant[];
  standingsModel: string;
  bestNCount?: number | null;
  /** #452 Fase 4: stableford-formater viser rå poeng (høyest best) i cellene. */
  pointsBased?: boolean;
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

  /** Ranked rows (ranked===true), then unranked at the bottom. */
  const ranked = rows.filter((r) => r.ranked);
  const unranked = rows.filter((r) => !r.ranked);
  const ordered = [...ranked, ...unranked];

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

  return (
    <div className="w-full overflow-x-auto -mx-1">
      <table
        data-testid="liga-standings"
        className="w-full border-collapse text-sm"
        style={{ minWidth: '320px' }}
      >
        <thead>
          <tr className="border-b border-border">
            <th className="w-8 px-2 py-2 text-left font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {t('colRank')}
            </th>
            <th className="px-2 py-2 text-left font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {t('colPlayer')}
            </th>
            {rounds.map((r) => (
              <th
                key={r.id}
                className="px-2 py-2 text-center font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
              >
                R{r.sequence}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {valueHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row, idx) => {
            const participant = participantMap.get(row.userId);
            // Én kilde for hele tabellen (#1527): samme nøkkel enten raden
            // mangler deltaker eller deltakeren mangler navn.
            const name = participant
              ? playerName(participant, t('unknownPlayer'))
              : t('unknownPlayer');
            const isFirst = row.rank === 1;
            const isUnranked = !row.ranked;

            return (
              <tr
                key={row.userId}
                data-testid="liga-standings-row"
                className={[
                  'border-b border-border/50 transition-colors',
                  isFirst
                    ? 'rounded-lg'
                    : isUnranked
                      ? 'opacity-60'
                      : '',
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
                {/* Rank */}
                <td
                  className="w-8 px-2 py-2.5 font-serif tabular-nums text-sm"
                  style={isFirst ? { color: 'var(--accent-text)' } : undefined}
                >
                  {isUnranked ? '–' : (row.rank ?? idx + 1)}
                </td>

                {/* Name */}
                <td
                  className="px-2 py-2.5 font-sans text-sm font-medium"
                  style={isFirst ? { color: 'var(--accent-text)' } : undefined}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{name}</span>
                    {participant?.acceptedAt == null && (
                      <UnconfirmedBadge />
                    )}
                  </div>
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
                    />
                  );
                })}

                {/* Season value */}
                <td
                  className="px-2 py-2.5 text-right font-serif tabular-nums text-sm font-semibold"
                  style={isFirst ? { color: 'var(--accent-text)' } : undefined}
                >
                  {formatSeasonValue(row.value, standingsModel, pointsBased, localeDecimal(locale))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
