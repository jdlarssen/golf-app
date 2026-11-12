import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

export interface LeagueFlightResultRow {
  userId: string;
  /** Display name, as the podium shows it (`formatRevealName`). */
  name: string;
  /** The figure the round is ranked on: points, net strokes or net to par. */
  scoreText: string;
  /** Its unit under the figure («poeng», «slag», «mot par»). */
  scoreLabel: string;
}

export interface LeagueFlightResultProps {
  gameName: string;
  /** In the board's order (the engine's), one row per player. */
  rows: readonly LeagueFlightResultRow[];
  /** «Etter N hull», as under the podium's heading. */
  subtitle: string;
  backHref?: string;
  /** As on the podiums: skip Shell + Header inside `LeaderboardTabs`. */
  chromeless?: boolean;
  footerSlot?: ReactNode;
}

/**
 * The finished board for a league flight (#2712, #2850, owner 12.11: «en
 * ligaflight har ingen plass og ingen vinner»). It takes the duel's and the
 * podium's place in the solo stableford and solo strokeplay formats: one row
 * per player with the points or strokes and «Godkjent», with no place number,
 * podium step, medallion, gold, confetti or congratulations. The league round
 * is decided when the round closes, across every flight, and the place stands
 * on the league page. Home says the same.
 */
export function LeagueFlightResult({
  gameName,
  rows,
  subtitle,
  backHref = '/',
  chromeless = false,
  footerSlot,
}: LeagueFlightResultProps): JSX.Element {
  const t = useTranslations('leaderboard');
  return (
    <LeaderboardShell chromeless={chromeless} footerSlot={footerSlot}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker>{t('leagueFlight.kicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('leagueFlight.heading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">{subtitle}</p>
      </div>

      <ul data-testid="league-flight-result" className="space-y-2.5 px-4 pt-3 pb-2">
        {rows.map((row) => (
          <li key={row.userId} data-testid="league-flight-row">
            <Card className="flex items-center gap-3.5 px-4 py-3.5">
              <p className="min-w-0 flex-1 font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
                {row.name}
              </p>
              <div className="shrink-0 text-right">
                <span className="score-num block text-[28px] leading-none tracking-[-0.02em] text-text">
                  {row.scoreText}
                </span>
                <span className="mt-1 block text-xs font-semibold text-muted">{row.scoreLabel}</span>
              </div>
            </Card>
            <RowReactionsForPlayer targetUserId={row.userId} />
          </li>
        ))}
      </ul>
    </LeaderboardShell>
  );
}
