'use client';

import { useId, useState, type ReactNode } from 'react';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { topReactions } from '@/lib/games/reactions/aggregate';
import { NASSAU_SECTION_KEYS, type NassauSectionKey } from '@/lib/leaderboard/nassauBoard';
import { useReactionsContext } from './ReactionsProvider';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

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
                  data-testid="nassau-card-you"
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

/**
 * One row of the open match's list (#2327): place, name, holes played and
 * the number, in the artboard's columns. As on the live board (#2253), the
 * row itself opens the reaction row under it, and the reactions a player has
 * been given show as small counts by the name — so a row keeps its height
 * until someone opens it. Without a `ReactionsProvider` (spectate, embed) or
 * with an inert one (an organizer who does not play) the row is a plain `div`
 * that still shows the counts.
 */
export function NassauListRow({
  userId,
  place,
  name,
  holes,
  score,
  tone,
  first,
  winner,
  viewer,
  staggerIndex,
  reactionsLabel,
}: {
  userId: string;
  /** The medal or the place number, already rendered. */
  place: ReactNode;
  name: string;
  holes: string;
  score: string;
  /** Background for the winner's or the viewer's row. */
  tone: string;
  first: boolean;
  winner: boolean;
  viewer: boolean;
  staggerIndex: number;
  /** «Reaksjoner til {navn}», read after the row on the button. */
  reactionsLabel: string;
}) {
  const ctx = useReactionsContext();
  const [open, setOpen] = useState(false);
  const panelId = `${useId()}-reactions`;
  const given = ctx ? topReactions(ctx.getRow(userId).counts) : [];
  const interactive = ctx !== null && !ctx.disabled;

  // The divider sits inside the row's box, so a row is 44 px with it, as on the artboard.
  const grid = `grid w-full grid-cols-[28px_minmax(0,1fr)_60px_44px] items-center gap-2 px-3.5 py-2.5 text-left leading-[normal] ${
    first ? '' : 'border-t border-row-divider-warm'
  } ${tone}`;
  const cells = (
    <>
      {place}
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[15px] font-semibold text-text">{name}</span>
        {given.length > 0 && (
          <span aria-hidden className="flex shrink-0 gap-1.5 text-[11px] leading-none tabular-nums">
            {given.map(([emoji, n]) => (
              <span key={emoji} className="inline-flex items-center gap-0.5">
                {emoji}
                <span className="text-muted">{n}</span>
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="text-right text-xs leading-[normal] text-muted">{holes}</span>
      <span className="score-num text-right text-[18px] text-text">{score}</span>
    </>
  );

  return (
    <li
      className="list-none reveal-up"
      style={{ animationDelay: `${60 + staggerIndex * 70}ms` }}
      data-testid={`nassau-row-${userId}`}
      data-winner={winner ? 'true' : undefined}
      data-viewer={viewer ? 'true' : undefined}
    >
      {interactive ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={`min-h-11 ${grid}`}
        >
          {cells}
          <span className="sr-only">{reactionsLabel}</span>
        </button>
      ) : (
        <div className={grid}>{cells}</div>
      )}
      {open && (
        <div id={panelId} className="px-3.5 pb-2">
          <RowReactionsForPlayer targetUserId={userId} />
        </div>
      )}
    </li>
  );
}
