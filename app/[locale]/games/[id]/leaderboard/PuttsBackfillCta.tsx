'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LinkButton } from '@/components/ui/Button';

type PuttsBackfill = { href: string; missingCount: number };

const PuttsBackfillCtaContext = createContext<PuttsBackfill | null>(null);

/**
 * Supplies the «Før putter»-CTA to the leaderboard chrome (#1290 del B).
 * Mounted ONLY by the authed `/leaderboard` page, and only when the viewer is a
 * non-withdrawn participant of a finished game who has recorded putts on some —
 * but not all — of their played holes (the behavioural gate from del A: at least
 * one putt recorded means they opted into putt-keeping for the round). A player
 * who never recorded a putt is never nagged; the public `/spectate/[token]`
 * route, the demo and the drilldown never mount the provider, so the CTA cannot
 * leak there — the same provider-absence trick as `MyScorecardCta` (#1289).
 */
export function PuttsBackfillCtaProvider({
  href,
  missingCount,
  children,
}: {
  href: string;
  missingCount: number;
  children: ReactNode;
}) {
  return (
    <PuttsBackfillCtaContext.Provider value={{ href, missingCount }}>
      {children}
    </PuttsBackfillCtaContext.Provider>
  );
}

/**
 * «Putte-statistikken venter på N hull» card with a «Før putter» pill, shown in
 * the leaderboard footer area. Renders nothing without a provider above.
 */
export function PuttsBackfillCta() {
  const ctx = useContext(PuttsBackfillCtaContext);
  const t = useTranslations('leaderboard.puttsBackfill');
  if (!ctx) return null;
  return (
    <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-2 text-center">
      <p className="font-sans text-sm text-muted">
        {t('waiting', { count: ctx.missingCount })}
      </p>
      <LinkButton href={ctx.href} variant="secondary" data-testid="putts-backfill-button">
        {t('cta')}
      </LinkButton>
    </div>
  );
}
