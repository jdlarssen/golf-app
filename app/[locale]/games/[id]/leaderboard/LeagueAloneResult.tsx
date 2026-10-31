import type { JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { LeaderboardShell, LeaderboardHeader } from './LeaderboardChrome';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

export interface LeagueAloneResultProps {
  gameName: string;
  /** The one player, for the row's reactions. */
  userId: string;
  /** Display name, as the podium shows it (`formatRevealName`). */
  name: string;
  /** The figure the round is ranked on: points, net strokes or net to par. */
  scoreText: string;
  /** Its unit under the figure («poeng», «slag», «mot par»). */
  scoreLabel: string;
  /** «Etter N hull», as under the podium's heading. */
  subtitle: string;
  backHref?: string;
  /** As on the podiums: skip Shell + Header inside `LeaderboardTabs`. */
  chromeless?: boolean;
  footerSlot?: ReactNode;
}

/**
 * The finished board for a league round played alone (#2712, orchestrator
 * 31.10 after the owner's rule «en runde alene har ingen plass og ingen
 * seier»). It takes the podium's place in the solo stableford and solo
 * strokeplay formats: the points and «Godkjent», with no podium step,
 * medallion, gold, confetti or congratulations. Home says the same.
 */
export function LeagueAloneResult({
  gameName,
  userId,
  name,
  scoreText,
  scoreLabel,
  subtitle,
  backHref = '/',
  chromeless = false,
  footerSlot,
}: LeagueAloneResultProps): JSX.Element {
  const t = useTranslations('leaderboard');
  return (
    <LeaderboardShell chromeless={chromeless} footerSlot={footerSlot}>
      {!chromeless && <LeaderboardHeader gameName={gameName} backHref={backHref} />}

      <div className="px-6 pt-1.5 pb-3.5 text-center">
        <Kicker>{t('leagueAlone.kicker')}</Kicker>
        <h1 className="mt-2 font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-text">
          {t('leagueAlone.heading')}
        </h1>
        <p className="mt-1 text-[11.5px] tabular-nums text-muted">{subtitle}</p>
      </div>

      <div data-testid="league-alone-result" className="px-4 pt-3 pb-2">
        <Card className="flex items-center gap-3.5 px-4 py-3.5">
          <p className="min-w-0 flex-1 font-serif text-[17px] font-medium tracking-[-0.005em] text-text truncate">
            {name}
          </p>
          <div className="shrink-0 text-right">
            <span className="score-num block text-[28px] leading-none tracking-[-0.02em] text-text">
              {scoreText}
            </span>
            <span className="mt-1 block text-xs font-semibold text-muted">{scoreLabel}</span>
          </div>
        </Card>
        <RowReactionsForPlayer targetUserId={userId} />
      </div>
    </LeaderboardShell>
  );
}
