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

/** Format the season value column. For 'average' model, show 1 decimal. */
function formatValue(value: number, model: string): string {
  if (model === 'average') {
    return formatNetToPar(value, 1);
  }
  return formatNetToPar(Math.round(value));
}

function RoundCell({ cell }: { cell: LeagueStandingCell | undefined }) {
  if (!cell || cell.netToPar === null) {
    return (
      <td className="px-2 py-2 text-center font-serif tabular-nums text-xs text-muted/40">
        —
      </td>
    );
  }

  const label = formatNetToPar(cell.netToPar);
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
          ? 'Levert etter opprinnelig vindu'
          : isPenalty
            ? 'Straffescore (ikke spilt)'
            : undefined
      }
    >
      <span>{label}</span>
      {isFlagged && (
        <span
          className="ml-0.5 inline-block h-1 w-1 rounded-full align-middle"
          style={{ background: 'var(--accent)' }}
          aria-label="Levert utenfor vindu"
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
}: {
  rows: LeagueStandingRow[];
  rounds: LeagueRoundView[];
  participants: LeagueParticipant[];
  standingsModel: string;
}) {
  if (rows.length === 0) {
    return (
      <p data-testid="liga-standings-empty" className="text-sm text-muted text-center py-4">
        Ingen resultater ennå — første runde teller når flights er levert.
      </p>
    );
  }

  const participantMap = new Map(participants.map((p) => [p.userId, p]));

  /** Ranked rows (ranked===true), then unranked at the bottom. */
  const ranked = rows.filter((r) => r.ranked);
  const unranked = rows.filter((r) => !r.ranked);
  const ordered = [...ranked, ...unranked];

  const valueHeader = standingsModel === 'average' ? 'Snitt' : 'Totalt';

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
              #
            </th>
            <th className="px-2 py-2 text-left font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Spiller
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
            const name = participant ? playerName(participant) : 'Ukjent spiller';
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
                  return <RoundCell key={r.id} cell={cell} />;
                })}

                {/* Season value */}
                <td
                  className="px-2 py-2.5 text-right font-serif tabular-nums text-sm font-semibold"
                  style={isFirst ? { color: 'var(--accent)' } : undefined}
                >
                  {formatValue(row.value, standingsModel)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
