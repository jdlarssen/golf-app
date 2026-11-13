'use client';

import { useId, useState, type ReactNode } from 'react';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { NASSAU_SECTION_KEYS, type NassauSectionKey } from '@/lib/leaderboard/nassauBoard';

/** One card's finished text: the server builds it, so this stays presentational. */
export interface NassauCardView {
  kicker: string;
  status: string;
  /** «Avgjort» is set in the success colour. */
  decided: boolean;
  /** The medal or ring before the leader's name, already rendered (or none). */
  leaderMark: ReactNode;
  /** The leader's short name, «Delt ledelse», «Delt» or «Ingen vinner»; `null` while waiting. */
  leaderName: string | null;
  /** What the leader's row leads with («33», «−2»). */
  score: string | null;
  /** The viewer's line, or `null` for a spectator or a match not started. */
  viewer: {
    text: string;
    /** The same line as a sentence, read instead of the dotted text. */
    sr: string;
    /** Leading or won: set in the primary colour. */
    strong: boolean;
  } | null;
}

/**
 * Nassau's three matches as three cards side by side (#2327). The cards are a
 * tablist: the selected card's list shows under them, one tab stop, and the
 * arrow keys move between the matches (`useRovingFocus`, as LeaderboardTabs).
 * The choice is local state, so it survives the realtime `router.refresh()`.
 */
export function NassauSectionTabs({
  cards,
  defaultSection,
  panels,
  tablistLabel,
  aside,
  hint,
}: {
  cards: Record<NassauSectionKey, NassauCardView>;
  defaultSection: NassauSectionKey;
  panels: Record<NassauSectionKey, ReactNode>;
  tablistLabel: string;
  /** Rendered between the cards and the list (the sweep line). */
  aside?: ReactNode;
  /** The line under the list. */
  hint: string;
}) {
  const [active, setActive] = useState<NassauSectionKey>(defaultSection);
  const baseId = useId();
  const tabId = (key: NassauSectionKey) => `${baseId}-tab-${key}`;
  const panelId = `${baseId}-panel`;
  const rovingProps = useRovingFocus(NASSAU_SECTION_KEYS, active, setActive);

  return (
    <div data-testid="nassau-sections" className="leading-[normal]">
      <div role="tablist" aria-label={tablistLabel} className="mt-3.5 grid grid-cols-3 gap-2">
        {NASSAU_SECTION_KEYS.map((key, i) => {
          const card = cards[key];
          const selected = key === active;
          return (
            <button
              key={key}
              {...rovingProps(i)}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-controls={panelId}
              aria-selected={selected}
              data-testid={`nassau-card-${key}`}
              onClick={() => setActive(key)}
              className={`flex min-w-0 flex-col gap-1.5 rounded-2xl border p-2.5 text-left text-text ${
                selected
                  ? 'border-success/30 bg-primary-soft dark:border-primary'
                  : 'border-border bg-surface'
              }`}
            >
              <span className="text-xs leading-[normal] font-semibold text-muted">{card.kicker}</span>
              <span
                className={`text-[11px] font-semibold ${card.decided ? 'text-success-text' : 'text-muted'}`}
              >
                {card.status}
              </span>
              {card.leaderName !== null && (
                <span className="flex min-w-0 items-center gap-1.5">
                  {card.leaderMark}
                  <span className="truncate text-sm leading-[normal] font-semibold">{card.leaderName}</span>
                </span>
              )}
              {card.score !== null && (
                <span className="score-num text-[22px] font-semibold">{card.score}</span>
              )}
              {card.viewer && (
                <span
                  className={`border-t pt-1.5 text-[11px] ${
                    selected ? 'border-success/30 dark:border-primary/40' : 'border-row-divider-warm'
                  } ${card.viewer.strong ? 'font-semibold text-primary' : 'text-muted'}`}
                >
                  <span aria-hidden>{card.viewer.text}</span>
                  <span className="sr-only">{card.viewer.sr}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {aside}

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(active)}>
        {panels[active]}
      </div>

      <p className="px-1 pt-2.5 text-[13px] font-semibold text-primary">{hint}</p>
    </div>
  );
}
