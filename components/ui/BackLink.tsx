import type { ReactNode } from 'react';
import { SmartLink } from './SmartLink';

/**
 * Universal back-arrow link — single chevron glyph, 32×32 tap target,
 * consistently rendered top-left across every page. Children are used
 * only as the `aria-label` so callers can still pass meaningful text
 * for screen readers (e.g. "Tilbake til hjem", "← Hjem") without it
 * showing visually. Falls back to "Tilbake" if no string was passed.
 *
 * Visual style mirrors the leaderboard's State4 back arrow — Jørgen's
 * chosen reference for app-wide consistency.
 */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children?: ReactNode;
}) {
  const label = typeof children === 'string' ? children : 'Tilbake';
  return (
    <SmartLink
      href={href}
      aria-label={label}
      className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
    >
      ‹
    </SmartLink>
  );
}
