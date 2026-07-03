'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LinkButton } from '@/components/ui/Button';

const RevansjeCtaContext = createContext<string | null>(null);

/**
 * Supplies the «Revansje?» prefill-href to the leaderboard chrome (#1020).
 * Mounted ONLY by the authed `/leaderboard` page, and only when the viewer
 * is a participant on a finished, standalone game (not cup/liga). The public
 * `/spectate/[token]` route and the holes drilldown never mount it, so the
 * CTA cannot leak to those surfaces — same provider-absence trick as
 * `ReactionsProvider`/`RowReactionsForPlayer` (#943).
 */
export function RevansjeCtaProvider({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <RevansjeCtaContext.Provider value={href}>
      {children}
    </RevansjeCtaContext.Provider>
  );
}

/**
 * «Revansje?» pill in the leaderboard footer area, right after «Del resultat».
 * Renders nothing without a provider above — format-view unit tests (rendered
 * without one) stay unchanged. Pure navigation into the prefilled create
 * wizard; all authz/validation happens server-side in the `?fra=` loader.
 */
export function RevansjeCta() {
  const href = useContext(RevansjeCtaContext);
  const t = useTranslations('leaderboard.common');
  if (!href) return null;
  return (
    <div className="flex justify-center px-6 pb-6 pt-2">
      <LinkButton href={href} variant="secondary" data-testid="revansje-button">
        {t('revansjeButton')}
      </LinkButton>
    </div>
  );
}
