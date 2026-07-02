import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Kicker } from '@/components/ui/Kicker';

type Props = {
  /** The stored `games.round_report` text — one short Norwegian match report. */
  text: string;
};

/**
 * «Fra pressetribunen» — the AI-generated round report (#1008), shown below
 * the podium/result content in every format's finished branch (and, via the
 * shared `renderLeaderboardContent`, on the public spectator link with zero
 * extra wiring). Isomorphic like `LeaderboardHeader` — no `'use client'` —
 * since it's threaded as a plain `ReactNode` into client podium components
 * through the same `footerSlot` prop `WithdrawnPlayersSection` established
 * (#386).
 *
 * Visual: on-brand callout — champagne-gold left border + linen/surface
 * background, mirroring the blockquote treatment in the game-finished mail
 * (`registrationRejected.ts` precedent) so the story reads the same in the
 * app as it does in the inbox.
 */
export function RoundReportCard({ text }: Props): JSX.Element {
  const t = useTranslations('leaderboard.roundReport');

  return (
    <div data-testid="round-report" className="mt-4 px-4">
      <Kicker tone="accent" className="px-1 mb-2">
        {t('heading')}
      </Kicker>
      <div className="rounded-2xl border-l-[3px] border-accent bg-surface px-5 py-4">
        <p className="text-[15px] leading-relaxed text-text whitespace-pre-line">
          {text}
        </p>
      </div>
    </div>
  );
}
