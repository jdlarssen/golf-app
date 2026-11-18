'use client';

import { nameInitials } from '@/lib/names/initials';

/**
 * A player on step 4's team cards (#2456), drawn as `Nyttspill-forslag-lag-tapp`:
 * a 44 px row with the initials in a 28 px disc and the first name. A tap picks
 * the player (`aria-pressed`); with someone else picked, a tap on a player on a
 * team swaps the two, and `swapLabel` names that for screen readers.
 */
export function PlayerTile({
  name,
  fullName,
  pressed,
  swapLabel,
  onPress,
  inline = false,
}: {
  name: string;
  fullName: string;
  pressed: boolean;
  /** «Bytt Marte Lien med Jonas Berg»: set when a tap swaps instead of picks. */
  swapLabel?: string;
  onPress: () => void;
  /** In «Uten lag» the tiles wrap side by side instead of filling the card's width. */
  inline?: boolean;
}) {
  // The picked disc is white with forest initials, and the page's dark with
  // sage initials at night, as `Nyttspill-forslag-lag-tapp` draws it.
  const disc = pressed ? 'bg-white text-primary dark:bg-bg' : 'bg-surface text-muted';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={swapLabel ?? fullName}
      onClick={onPress}
      className={`flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl px-2.5 text-left font-sans text-sm font-semibold leading-[normal] ${
        inline ? '' : 'w-full'
      } ${pressed ? 'bg-primary text-white dark:text-bg' : 'bg-surface-2 text-text'}`}
    >
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] ${disc}`}
      >
        {nameInitials(fullName)}
      </span>
      <span aria-hidden className="min-w-0 truncate">
        {name}
      </span>
    </button>
  );
}
