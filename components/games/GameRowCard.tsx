import type { ReactNode } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { Card } from '@/components/ui/Card';

/**
 * Shared row-card primitive for Home's link cards (#885). «Pågår nå», «Mine
 * spill» and {@link FinishedGameCard} all rendered the exact same Card+p-5
 * frame — a serif title, a stack of muted meta lines, and a trailing node —
 * copy-pasted three times, free to drift apart. This locks the density,
 * shadow, focus-ring, outer flex layout and title typography in one place
 * (and strengthens FinishedGameCard's anti-drift goal #571).
 *
 * `trailing` is the FULL right-hand node — each caller composes its own (a
 * status pill + arrow, a state label + arrow, or a result badge / 🏆). It is
 * placed as a direct child of the flex row, NOT wrapped, so each caller keeps
 * its own alignment (FinishedGameCard's badge stays items-start, not centered).
 *
 * Server-safe (no 'use client'): SmartLink is a client component, but rendering
 * one from a server component is fine; Card is server-safe.
 */
export function GameRowCard({
  href,
  highlighted = false,
  linkClassName,
  title,
  meta,
  trailing,
}: {
  href: string;
  /** Gold frame (border-accent) for the core-loop «continue» card (#878/#363). */
  highlighted?: boolean;
  /** Extra classes appended to the link, for caller-specific affordances. */
  linkClassName?: string;
  /** Localized game name. */
  title: ReactNode;
  /** Stack of {@link GameRowMetaLine}s (course, tee-off, team/flight, …). */
  meta?: ReactNode;
  /** The entire right-hand node — pill+arrow, state label+arrow, or badge. */
  trailing?: ReactNode;
}) {
  return (
    <SmartLink
      href={href}
      className={`block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40${
        linkClassName ? ` ${linkClassName}` : ''
      }`}
    >
      <Card
        className={`min-h-[44px] transition-colors p-5 ${
          highlighted ? 'border-accent' : 'hover:border-primary/30'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="block font-serif text-lg font-medium tracking-tight text-text truncate">
              {title}
            </span>
            {meta}
          </div>
          {trailing}
        </div>
      </Card>
    </SmartLink>
  );
}

/**
 * One muted meta line under a {@link GameRowCard} title. Locks the
 * `text-xs text-muted mt-1 truncate` typography; `tabular` adds tabular-nums
 * so date/time lines align digit-to-digit.
 */
export function GameRowMetaLine({
  children,
  tabular = false,
}: {
  children: ReactNode;
  tabular?: boolean;
}) {
  return (
    <span
      className={`block text-xs text-muted mt-1 truncate${
        tabular ? ' tabular-nums' : ''
      }`}
    >
      {children}
    </span>
  );
}
