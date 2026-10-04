'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import type { PultTab } from '@/lib/games/organizerDesk';

const TABS: readonly PultTab[] = ['live', 'players', 'setup'];

const LABEL_KEYS = {
  live: 'tabLive',
  players: 'tabPlayers',
  setup: 'tabSetup',
} as const;

/**
 * «Live», «Spillere» and «Oppsett» on the organiser's desk (#2268). The tab
 * is client state, not the URL, so switching is instant on a poor signal.
 *
 * All three panels arrive rendered from the server and stay mounted; the
 * inactive ones are `hidden`. That keeps `#leverte-scorekort` in the DOM for
 * the anchor jump, and the client state in the team and flight editors
 * survives a tab switch.
 *
 * The parent keys this on the redirect's codes, so a new redirect opens on
 * the tab `pultInitialTab` picks for it.
 */
export function PultTabs({
  initialTab,
  live,
  players,
  setup,
}: {
  initialTab: PultTab;
  live: ReactNode;
  players: ReactNode;
  setup: ReactNode;
}) {
  const t = useTranslations('admin.game.pult');
  const [active, setActive] = useState<PultTab>(initialTab);
  // Tablist keyboard pattern (as `HistorikkTabs`): one tab stop, the arrow
  // keys switch tab, each tab points at its panel.
  const baseId = useId();
  const tabId = (tab: PultTab) => `${baseId}-tab-${tab}`;
  const panelId = (tab: PultTab) => `${baseId}-panel-${tab}`;
  const rovingProps = useRovingFocus(TABS, active, setActive);
  const panels: Record<PultTab, ReactNode> = { live, players, setup };

  return (
    <>
      <div
        role="tablist"
        aria-label={t('tabsLabel')}
        className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-meter-track p-1"
      >
        {TABS.map((tab, i) => (
          <button
            {...rovingProps(i)}
            key={tab}
            type="button"
            role="tab"
            id={tabId(tab)}
            aria-controls={panelId(tab)}
            aria-selected={active === tab}
            data-testid={`pult-tab-${tab}`}
            onClick={() => setActive(tab)}
            // Drawn 40 px as the artboard; `.tap-extend` grows the hit area
            // into the track's 4 px padding, to 44 px.
            className={`tap-extend h-10 rounded-full text-[13px] leading-[normal] font-semibold [--tap-extend:-2px_0] ${
              active === tab
                ? 'bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-muted hover:text-text'
            }`}
          >
            {t(LABEL_KEYS[tab])}
          </button>
        ))}
      </div>
      {TABS.map((tab) => (
        <div
          key={tab}
          role="tabpanel"
          id={panelId(tab)}
          aria-labelledby={tabId(tab)}
          hidden={active !== tab}
          data-testid={`pult-panel-${tab}`}
        >
          {panels[tab]}
        </div>
      ))}
    </>
  );
}
