import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { TerminRow } from '@/components/games/TerminRow';
import { Skeleton } from '@/components/ui/Skeleton';
import type { GameSocialProof } from '@/lib/games/socialProof';
import type { ClubRoundEntry } from '@/lib/games/terminliste';

/** Rows shown before «Vis {n} til». */
const VISIBLE = 5;

/**
 * «Neste runder i klubben» on /klubber/[id] (#2326, artboard «Forslag:
 * klubbens side»): the club's rounds in one white card, the first five
 * visible and the rest behind a native `<details>` at the card's foot.
 * Presentation only; `getClubRounds` decides the rows.
 *
 * The page leaves the section out when the club has expired. Expects a
 * full-width parent (AppShell `flush`): the heading sits 20 px in, the card
 * 16 px.
 */
export function ClubRoundsSection({
  entries,
  socialProof,
}: {
  entries: readonly ClubRoundEntry[];
  socialProof: Record<string, GameSocialProof>;
}) {
  const t = useTranslations('klubb.room');
  const headingId = useId();
  const shown = entries.slice(0, VISIBLE);
  const rest = entries.slice(VISIBLE);

  const row = (entry: ClubRoundEntry) => (
    <TerminRow
      key={entry.id}
      entry={entry}
      variant="player"
      lead="date"
      mine={entry.mine}
      socialProof={socialProof[entry.id]}
    />
  );

  return (
    <section aria-labelledby={headingId} data-testid="club-rounds">
      <RoundsHeading id={headingId}>{t('roundsHeading')}</RoundsHeading>
      {entries.length === 0 ? (
        <p className="mx-5 text-sm text-muted" data-testid="club-rounds-empty">
          {t('roundsEmpty')}
        </p>
      ) : (
        <div
          data-focus-inset
          className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface"
        >
          <ul className="list-none divide-y divide-row-divider-warm p-0">{shown.map(row)}</ul>
          {rest.length > 0 && (
            <details className="group border-t border-row-divider-warm">
              <summary
                className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 text-[13px] font-semibold leading-[normal] text-primary [&::-webkit-details-marker]:hidden"
              >
                <span className="group-open:hidden">{t('roundsMore', { count: rest.length })}</span>
                <span className="hidden group-open:inline">{t('roundsFewer')}</span>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <ul className="list-none divide-y divide-row-divider-warm border-t border-row-divider-warm p-0">
                {rest.map(row)}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function RoundsHeading({ id, children }: { id?: string; children: string }) {
  return (
    <h2 id={id} className="px-5 pt-4 pb-2 text-xs font-semibold leading-[normal] text-muted">
      {children}
    </h2>
  );
}

/** The section while it loads, in its own measures. */
export function ClubRoundsSkeleton() {
  const t = useTranslations('klubb.room');
  return (
    <div aria-hidden data-testid="club-rounds-skeleton">
      <RoundsHeading>{t('roundsHeading')}</RoundsHeading>
      <div className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-[14px] py-2.5 ${i === 0 ? 'border-b border-row-divider-warm' : ''}`}
          >
            <Skeleton className="h-10 w-11" />
            <div className="grow space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
