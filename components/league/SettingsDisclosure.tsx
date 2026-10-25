import type { ReactNode } from 'react';

/**
 * The round settings of a simulator league, folded to one line (#2638, the
 * owner 25.10: «det er jo det minst interessante når man har satt det opp en
 * gang»). A native <details>, so it opens without JavaScript and keeps its
 * state across a re-render. The line is ≥44 px and carries «Endret denne
 * runden» when the round has overrides, so a change is seen without opening.
 *
 * Closed by default on the league page and in admin; the round start opens
 * it, because the player sets up the simulator there.
 */
export function SettingsDisclosure({
  summary,
  changedLabel,
  defaultOpen = false,
  testId,
  children,
}: {
  summary: string;
  /** Shown on the closed line when the round has overrides; null hides it. */
  changedLabel: string | null;
  defaultOpen?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <details className="group/settings" open={defaultOpen} data-testid={testId}>
      <summary
        data-testid={`${testId}-summary`}
        className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
      >
        <span className="font-sans text-[13px] leading-[19.5px] font-medium text-text">{summary}</span>
        {changedLabel && (
          <span
            data-testid={`${testId}-changed`}
            className="inline-block whitespace-nowrap rounded-full bg-accent/15 px-2 py-0.5 font-sans text-[10px] leading-[15px] font-semibold uppercase tracking-[0.14em] text-accent-text"
          >
            {changedLabel}
          </span>
        )}
        <svg
          className="ml-auto shrink-0 text-muted transition-transform group-open/settings:rotate-180 motion-reduce:transition-none"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 5.5l4 4 4-4" />
        </svg>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
