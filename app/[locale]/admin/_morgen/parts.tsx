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

/** The white card the rows sit in, 16 px from the screen edge as drawn. */
export function RowCard({ children }: { children: ReactNode }) {
  // data-focus-inset: the rows are full-bleed, so `overflow-hidden` would clip
  // an outline with a positive offset (#1402).
  return (
    <ul
      data-focus-inset
      className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface"
    >
      {children}
    </ul>
  );
}

/**
 * One row: the name on top, a 12 px line under it, an optional lead (the
 * dot) and trail (arrow, «Live», a clock). The space between the two lines
 * keeps them apart in the link's accessible name.
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
          <span className="block text-[15px] font-semibold">{name}</span>
          {line != null && (
            <>
              {' '}
              <span className="block text-xs text-muted">{line}</span>
            </>
          )}
        </span>
        {trail}
      </SmartLink>
    </li>
  );
}

/** The row's arrow, as drawn: a plain «→» in the primary green. */
export function RowArrow() {
  return (
    <span aria-hidden className="shrink-0 text-primary">
      →
    </span>
  );
}
