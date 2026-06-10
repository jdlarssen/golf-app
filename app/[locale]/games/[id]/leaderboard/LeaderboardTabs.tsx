'use client';

import { useState, type ReactNode } from 'react';

type Tab = 'main' | 'side';

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

  return (
    <div className="space-y-4">
      <div className="flex border-b border-border" role="tablist" aria-label="Leaderboard-fane">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'main'}
          onClick={() => setActive('main')}
          className={`flex-1 py-3 min-h-[44px] font-serif text-base transition-colors ${
            active === 'main'
              ? 'border-b-2 border-primary text-text'
              : 'text-muted hover:text-text'
          }`}
        >
          Hovedturnering
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'side'}
          onClick={() => setActive('side')}
          className={`flex-1 py-3 min-h-[44px] font-serif text-base transition-colors ${
            active === 'side'
              ? 'border-b-2 border-primary text-text'
              : 'text-muted hover:text-text'
          }`}
        >
          Sideturnering
        </button>
      </div>

      <div role="tabpanel">
        {active === 'main' ? mainContent : sideContent}
      </div>
    </div>
  );
}
