import type { ReactNode } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';

/**
 * The signups page's top (#2288, artboard «Forslag: påmeldingene»): a 44 px
 * back arrow, the «PÅMELDINGER» kicker as the page's h1, and the game's name.
 * Full bleed like `PultHeader` (`-mx-5 -mt-8` cancels `AdminShell`'s
 * padding), so it must be the first element on the page. Not `TopBar`: the
 * drawing has a 20 px chevron in a 44 × 44 button.
 *
 * The Startlista (#2289, artboard «Forslag: startlista») uses the same top
 * with a 13 px `subtitle` under the name and an `action` on the right,
 * bottom-aligned. `headingId` lets a client component focus the h1 after a
 * redirect. The signups page passes none of them and renders as before.
 */
export function SignupsHeader({
  backHref,
  backLabel,
  title,
  gameName,
  subtitle,
  action,
  headingId,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  gameName: string;
  subtitle?: string;
  action?: ReactNode;
  headingId?: string;
}) {
  return (
    <header className="-mx-5 -mt-8 leading-[normal]">
      <div className="flex items-center justify-between px-2 pt-2">
        <SmartLink
          href={backHref}
          aria-label={backLabel}
          className="flex size-11 items-center justify-center text-text"
        >
          <svg
            aria-hidden
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </SmartLink>
        <h1
          id={headingId}
          tabIndex={headingId ? -1 : undefined}
          className="font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-muted"
        >
          {title}
        </h1>
        <span aria-hidden className="w-11" />
      </div>
      {subtitle === undefined && action === undefined ? (
        <div className="px-5 pt-1">
          <p className="font-serif text-[28px] font-medium leading-[normal] text-text">{gameName}</p>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3 px-5 pt-1">
          <div className="min-w-0">
            <p className="font-serif text-[28px] font-medium leading-[normal] text-text">{gameName}</p>
            {subtitle !== undefined && (
              <p className="text-[13px] leading-[normal] text-muted">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
    </header>
  );
}
