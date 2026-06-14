import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { PullQuote } from '@/components/ui/PullQuote';

export interface LeaderboardFooterProps {
  /** `games.status` — styrer hvilken avslutnings-linje som vises. */
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /** PullQuote-className fra call-site (paddingen varierer per view). */
  className?: string;
}

/**
 * Dekorativ avslutnings-footer nederst på poeng-format-leaderboardene.
 * Status-bevisst: «Lykke til.» mens spillet er live/kommende, «Vel spilt!»
 * når det er ferdig — speiler matchplay-familiens
 * `hasDecidedWinner ? congratulations : goodLuck`-mønster.
 *
 * Bevisst distinkt fra podiets `congratulations` («Gratulerer.»): på ferdige
 * spill renderes Viewet chromeless under podiet, så samme tekst to ganger
 * unngås. «Vel spilt!» er en kollektiv avslutnings-signatur for hele feltet.
 */
export function LeaderboardFooter({
  gameStatus,
  className,
}: LeaderboardFooterProps): JSX.Element {
  const tc = useTranslations('leaderboard.common');
  return (
    <PullQuote className={className}>
      {gameStatus === 'finished' ? tc('wellPlayed') : tc('goodLuck')}
    </PullQuote>
  );
}
