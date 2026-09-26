'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useRovingFocus } from '@/hooks/useRovingFocus';

type Tab = 'stats' | 'rounds';

const TABS: readonly Tab[] = ['stats', 'rounds'];

type Props = {
  statsContent: ReactNode;
  roundsContent: ReactNode;
};

/**
 * To-fane-bytter for «Min historikk» (#940). Begge innholdene produseres av
 * server-siden og sendes inn som noder, så komponenten er rent presentasjonell
 * — samme mønster som `LeaderboardTabs`.
 *
 * «Statistikk» (default) huser formkurven + per-bane-panelet, og blir den
 * voksende personlige stats-huben. «Runder» huser den kronologiske rundelista,
 * så man slipper å scrolle gjennom alle tidligere kamper for å se tallene sine.
 */
export function HistorikkTabs({ statsContent, roundsContent }: Props) {
  const [active, setActive] = useState<Tab>('stats');
  const t = useTranslations('profile.historikk');
  // Tablist keyboard pattern: one tab stop, arrow keys switch tab; each tab
  // points at the panel and the panel is named by the active tab.
  const baseId = useId();
  const tabId = (tab: Tab) => `${baseId}-tab-${tab}`;
  const panelId = `${baseId}-panel`;
  const rovingProps = useRovingFocus(TABS, active, setActive);

  return (
    <div className="space-y-4">
      <div
        className="flex border-b border-border"
        role="tablist"
        aria-label={t('tabsAriaLabel')}
      >
        <button
          {...rovingProps(0)}
          type="button"
          role="tab"
          id={tabId('stats')}
          aria-controls={panelId}
          aria-selected={active === 'stats'}
          onClick={() => setActive('stats')}
          className={`flex-1 py-3 min-h-[44px] font-serif text-base transition-colors ${
            active === 'stats'
              ? 'border-b-2 border-primary text-text'
              : 'text-muted hover:text-text'
          }`}
        >
          {t('tabStats')}
        </button>
        <button
          {...rovingProps(1)}
          type="button"
          role="tab"
          id={tabId('rounds')}
          aria-controls={panelId}
          aria-selected={active === 'rounds'}
          onClick={() => setActive('rounds')}
          className={`flex-1 py-3 min-h-[44px] font-serif text-base transition-colors ${
            active === 'rounds'
              ? 'border-b-2 border-primary text-text'
              : 'text-muted hover:text-text'
          }`}
        >
          {t('tabRounds')}
        </button>
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(active)}>
        {active === 'stats' ? statsContent : roundsContent}
      </div>
    </div>
  );
}
