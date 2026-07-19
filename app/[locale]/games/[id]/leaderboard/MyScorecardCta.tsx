'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LinkButton } from '@/components/ui/Button';

const MyScorecardCtaContext = createContext<string | null>(null);

/**
 * Supplies the «Mitt scorekort»-href to the leaderboard chrome (#1289).
 * Mounted ONLY by the authed `/leaderboard` page, and only when the viewer
 * is a non-withdrawn participant on a finished game. Unlike
 * `RevansjeCtaProvider` there is no standalone gate — cup/liga rounds have
 * scorecards too, and the post-round need (entering the round into Golfbox)
 * applies there as well. The public `/spectate/[token]` route, the demo and
 * the holes drilldown never mount it, so the CTA cannot leak to those
 * surfaces — same provider-absence trick as `RevansjeCta` (#1020).
 */
export function MyScorecardCtaProvider({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <MyScorecardCtaContext.Provider value={href}>
      {children}
    </MyScorecardCtaContext.Provider>
  );
}

/**
 * «Mitt scorekort» pill in the leaderboard footer area, before «Revansje?»
 * (personal utility ahead of the growth CTA). Restores the only visible path
 * to the player's own scorecard after a round is finished (#1289): every
 * finished-game entry point lands on the leaderboard, which used to be a
 * navigational dead end. Renders nothing without a provider above — format-
 * view unit tests (rendered without one) stay unchanged.
 */
export function MyScorecardCta() {
  const href = useContext(MyScorecardCtaContext);
  const t = useTranslations('leaderboard.common');
  if (!href) return null;
  return (
    <div className="flex justify-center px-6 pb-6 pt-2">
      <LinkButton href={href} variant="secondary" data-testid="my-scorecard-button">
        {t('myScorecardButton')}
      </LinkButton>
    </div>
  );
}
