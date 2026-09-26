'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useRovingFocus } from '@/hooks/useRovingFocus';

type Tab = 'main' | 'side';

const TABS: readonly Tab[] = ['main', 'side'];

type Props = {
  mainContent: ReactNode;
  sideContent: ReactNode;
};

/**
 * Two-tab switcher for the leaderboard route. Rendered only when the game is
 * finished AND `side_tournament_enabled` is true — both contents are produced
 * by the server page and passed in as nodes so this component stays purely
 * presentational.
 *
 * The "Hovedturnering" tab houses the existing best-ball-netto leaderboard;
 * "Sideturnering" houses the parallel point-competition view. Default active
 * tab is "Hovedturnering" — the dramatic main reveal is what users see first.
 */
export function LeaderboardTabs({ mainContent, sideContent }: Props) {
  const [active, setActive] = useState<Tab>('main');
  const t = useTranslations('leaderboard.tabs');
  // Tablist keyboard pattern: one tab stop, arrow keys switch tab; each tab
  // points at the panel and the panel is named by the active tab.
  const baseId = useId();
  const tabId = (tab: Tab) => `${baseId}-tab-${tab}`;
  const panelId = `${baseId}-panel`;
  const rovingProps = useRovingFocus(TABS, active, setActive);

  return (
    <div className="space-y-4">
      <div className="flex border-b border-border" role="tablist" aria-label={t('tablistAriaLabel')}>
        <button
          {...rovingProps(0)}
          type="button"
          role="tab"
          id={tabId('main')}
          aria-controls={panelId}
          aria-selected={active === 'main'}
          onClick={() => setActive('main')}
          className={`flex-1 py-3 min-h-[44px] font-serif text-base transition-colors ${
            active === 'main'
              ? 'border-b-2 border-primary text-text'
              : 'text-muted hover:text-text'
          }`}
        >
          {t('main')}
        </button>
        <button
          {...rovingProps(1)}
          type="button"
          role="tab"
          id={tabId('side')}
          aria-controls={panelId}
          aria-selected={active === 'side'}
          onClick={() => setActive('side')}
          className={`flex-1 py-3 min-h-[44px] font-serif text-base transition-colors ${
            active === 'side'
              ? 'border-b-2 border-primary text-text'
              : 'text-muted hover:text-text'
          }`}
        >
          {t('side')}
        </button>
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(active)}>
        {active === 'main' ? mainContent : sideContent}
      </div>
    </div>
  );
}
