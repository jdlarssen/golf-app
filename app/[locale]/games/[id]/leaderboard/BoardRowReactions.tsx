'use client';

import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { ReactionEmoji } from '@/lib/games/reactions/palette';
import { useReactionsContext } from './ReactionsProvider';

/** How many given reactions the plate shows, most given first. */
const SHOWN_REACTIONS = 3;

/** The reactions a player has been given, most given first, at most three. */
function topReactions(
  counts: Partial<Record<ReactionEmoji, number>>,
): [ReactionEmoji, number][] {
  return (Object.entries(counts) as [ReactionEmoji, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHOWN_REACTIONS);
}

/**
 * The SPILLER plate on the live board (#2253): the name line, the dots line and
 * the reactions the player has been given.
 *
 * Tapping it opens the reaction row under the board row — when reactions can be
 * given here. Without a `ReactionsProvider` (spectate, embed) or with an inert
 * one (`disabled`: an organizer who does not play, a non-participant) the plate
 * is a plain `div` that still shows the counts, never a button that does
 * nothing — or, on the live link (#2286), a link that follows the player.
 */
export function BoardPlayerPlate({
  userId,
  label,
  follow,
  expanded,
  onToggle,
  controls,
  className,
  top,
  bottom,
}: {
  userId: string;
  /** Accessible name of the button: «Reaksjoner til {navn}». */
  label: string;
  /** The live link (#2286): without reactions, the plate follows the player. */
  follow?: { href: string; label: string };
  expanded: boolean;
  onToggle: () => void;
  /** Id of the reaction row the button opens. */
  controls: string;
  className: string;
  /** Name, «DU» and the movement arrow. */
  top: ReactNode;
  /** The dots for the last five holes. */
  bottom: ReactNode;
}) {
  const ctx = useReactionsContext();
  const given = ctx ? topReactions(ctx.getRow(userId).counts) : [];

  const content = (
    <>
      <span className="flex min-w-0 items-center justify-between gap-2">{top}</span>
      <span className="mt-1.5 flex items-center justify-between gap-2">
        {bottom}
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
    </>
  );

  if (!ctx || ctx.disabled) {
    if (follow) {
      return (
        <Link
          href={follow.href}
          replace
          aria-label={follow.label}
          data-testid="board-follow-link"
          className={`flex min-h-11 flex-col justify-center ${className}`}
        >
          {content}
        </Link>
      );
    }
    return <div className={`flex min-h-11 flex-col justify-center ${className}`}>{content}</div>;
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      onClick={onToggle}
      className={`flex min-h-11 w-full flex-col justify-center text-left ${className}`}
    >
      {content}
    </button>
  );
}
