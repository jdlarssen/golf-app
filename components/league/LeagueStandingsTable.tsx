import { useTranslations } from 'next-intl';
import type { LeagueStandingRow, LeagueStandingCell } from '@/lib/league/types';
import type { LeagueRoundView, LeagueParticipant } from '@/lib/league/getLigaSnapshot';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';

function playerName(p: LeagueParticipant): string {
  return p.nickname?.trim() || p.name?.trim() || 'Ukjent spiller';
}

/** Format a net-to-par number: "E", "+3", "−5". Uses minus sign (−), not hyphen. */
function formatNetToPar(n: number | null, decimals = 0): string {
  if (n === null) return '';
  if (n === 0) return 'E';
  const abs = Math.abs(n);
  const str = decimals > 0 ? abs.toFixed(decimals).replace('.', ',') : String(abs);
  return n > 0 ? `+${str}` : `−${str}`;
}

/** Format points: plain number, 1 decimal only when fractional (tie-split). */
function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

/**
 * Format the season value column per model. Poeng-baserte formater (stableford)
 * og 'points'-modellen viser rene poeng; slagspill-modellene viser mot-par.
 */
function formatValue(value: number, model: string, pointsBased: boolean): string {
  if (model === 'points' || pointsBased) {
    return formatPoints(value);
  }
  if (model === 'average') {
    return formatNetToPar(value, 1);
  }
  return formatNetToPar(Math.round(value));
}

function RoundCell({
  cell,
  model,
  pointsBased,
  t,
}: {
  cell: LeagueStandingCell | undefined;
  model: string;
  pointsBased: boolean;
  t: ReturnType<typeof useTranslations<'liga.standings'>>;
}) {
  const isPoints = model === 'points';
  const raw = cell ? (isPoints ? cell.points : cell.value) : null;
  if (!cell || raw === null) {
    return (
      <td className="px-2 py-2 text-center font-serif tabular-nums text-xs text-muted/40">
        —
      </td>
    );
  }

  // Stableford-runde-verdier (og plasserings-poeng) er rene poeng, ikke mot-par.
  const label = isPoints || pointsBased ? formatPoints(raw) : formatNetToPar(raw);
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
            const name = participant ? playerName(participant) : t('unknownPlayer');
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
                  style={isFirst ? { color: 'var(--accent)' } : undefined}
                >
                  {isUnranked ? '–' : (row.rank ?? idx + 1)}
                </td>

                {/* Name */}
                <td
                  className="px-2 py-2.5 font-sans text-sm font-medium"
                  style={isFirst ? { color: 'var(--accent-deep)' } : undefined}
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
                    <RoundCell key={r.id} cell={cell} model={standingsModel} pointsBased={pointsBased} t={t} />
                  );
                })}

                {/* Season value */}
                <td
                  className="px-2 py-2.5 text-right font-serif tabular-nums text-sm font-semibold"
                  style={isFirst ? { color: 'var(--accent)' } : undefined}
                >
                  {formatValue(row.value, standingsModel, pointsBased)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
