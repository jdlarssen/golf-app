'use client';

import type { ReactNode } from 'react';
import { useBackNavigation } from '@/lib/nav/useBackNavigation';
import { SmartLink } from './SmartLink';

/**
 * Universal back-arrow link — single chevron glyph, drawn in a 32×32 box
 * that hits 44×44 via `.tap-extend` (#2240), consistently rendered top-left
 * across every page. Children are used
 * only as the `aria-label` so callers can still pass meaningful text
 * for screen readers (e.g. "Tilbake til hjem", "Hjem") without it
 * showing visually. Falls back to "Tilbake" if no string was passed.
 *
 * Visual style follows the leaderboard's back arrow — Jørgen's chosen
 * reference for app-wide consistency — except for the box: the leaderboard
 * headers grew the box itself to 44px in `LeaderboardBackLink` (#1747), while
 * this one keeps the 32px box and extends only the hit area, so no header
 * row moves.
 *
 * A click goes where you came from when the browser's history has somewhere to
 * go (#2746, `lib/nav/backTarget.ts`). `href` is the fallback for a cold start,
 * a notification or a shared link, and the target of a long press.
 */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children?: ReactNode;
}) {
  const label = typeof children === 'string' ? children : 'Tilbake';
  const onClick = useBackNavigation();
  return (
    <SmartLink
      href={href}
      onClick={onClick}
      aria-label={label}
      className="tap-extend -ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
    >
      ‹
    </SmartLink>
  );
}
