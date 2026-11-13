import type { ReactNode } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';

// Shared pieces of the morning report (#2345), drawn as on the artboard
// «Forslag: morgenrapporten»: a sentence-case heading over a white card of
// rows, where each row is one link carrying its whole sentence.

/** A titled section: `<section aria-labelledby>` with an `<h2>`. */
export function MorningSection({
  id,
  heading,
  children,
  headingClassName = 'mb-2',
}: {
  id: string;
  heading: string;
  children: ReactNode;
  headingClassName?: string;
}) {
  return (
    <section aria-labelledby={id} className="mt-4">
      <h2 id={id} className={`font-sans text-xs font-semibold text-muted ${headingClassName}`}>
        {heading}
      </h2>
      {children}
    </section>
  );
}

/**
 * The white card the rows sit in, 16 px from the screen edge as drawn. `more`
 * goes at the card's foot (a `MoreRows`).
 */
export function RowCard({ children, more }: { children: ReactNode; more?: ReactNode }) {
  // data-focus-inset: the rows are full-bleed, so `overflow-hidden` would clip
  // an outline with a positive offset (#1402).
  return (
    <div
      data-focus-inset
      className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <ul>{children}</ul>
      {more}
    </div>
  );
}

/**
 * The rows past the first few, behind a native `<details>` at the card's foot,
 * as «Vis n til» on the club page (#2864). No animation (#2345).
 */
export function MoreRows({
  showLabel,
  hideLabel,
  count,
  testId,
  children,
}: {
  showLabel: string;
  hideLabel: string;
  count: number;
  testId: string;
  children: ReactNode;
}) {
  return (
    <details data-testid={testId} data-count={count} className="group border-t border-row-divider-warm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 text-[13px] font-semibold leading-[normal] text-primary [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{showLabel}</span>
        <span className="hidden group-open:inline">{hideLabel}</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4 shrink-0 group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <ul className="border-t border-row-divider-warm">{children}</ul>
    </details>
  );
}

/**
 * One row: the name on top, a 12 px line under it, an optional lead (the
 * dot) and trail (arrow, «Live», a clock). The space between the two lines
 * keeps them apart in the link's accessible name. Both lines use the normal
 * line height the artboard draws with, so a row is 56 px as drawn.
 */
export function MorningRow({
  href,
  name,
  line,
  lead,
  trail,
  minHeight,
  testId,
}: {
  href: string;
  name: ReactNode;
  line?: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  minHeight: 'min-h-[56px]' | 'min-h-[52px]';
  testId?: string;
}) {
  return (
    <li className="border-b border-row-divider-warm last:border-b-0">
      <SmartLink
        href={href}
        data-testid={testId}
        className={`flex ${minHeight} items-center gap-3 px-3.5 py-2.5 text-text transition-colors hover:bg-bg/50`}
      >
        {lead}
        <span className="min-w-0 flex-grow">
          <span className="block text-[15px] font-semibold leading-[normal]">{name}</span>
          {line != null && (
            <>
              {' '}
              <span className="block text-xs leading-[normal] text-muted">{line}</span>
            </>
          )}
        </span>
        {trail}
      </SmartLink>
    </li>
  );
}

/**
 * The row's arrow, as drawn: a plain «→» in the primary green. The app's
 * Inter subsets (latin, latin-ext) have no U+2192, so the glyph comes from
 * `system-ui` as on the artboard (`Inter, system-ui`), not the next
 * fallback in the app's stack.
 */
export function RowArrow() {
  return (
    <span aria-hidden className="shrink-0 font-[system-ui] text-primary">
      →
    </span>
  );
}
