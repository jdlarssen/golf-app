import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { Skeleton } from '@/components/ui/Skeleton';

const ROUND = { borderRadius: 9999 };

// Route skeleton for the Startlista (#2289), after the signups page's: on
// --bg like the page, so the colour does not change when it comes (#2493).
// The shape follows the page: the arrow and the kicker, the game's name with
// the count under it and «Foreslå inndeling» to the right, then three flight
// cards with chips. Round shapes set their radius inline: `.sk` sits after
// `rounded-full` in the utilities layer and would win.
export default async function StartlistaLoading() {
  const t = await getTranslations('admin.game.flights');
  return (
    <AdminShell tone="app">
      <div aria-hidden className="-mx-5 -mt-8 leading-[normal]">
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="flex size-11 items-center justify-center text-muted">
            <svg
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
          </span>
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('sectionLabel')}
          </span>
          <span className="w-11" />
        </div>
        <div className="flex items-end justify-between gap-3 px-5 pt-1">
          <div className="min-w-0 grow">
            <div className="relative font-serif text-[28px] font-medium">
              <span className="invisible">&nbsp;</span>
              <Skeleton className="absolute left-0 top-1/2 mt-0.5 h-6 w-3/4 -translate-y-1/2" />
            </div>
            <Skeleton className="mt-1 h-3 w-2/5" delay={90} />
          </div>
          <Skeleton className="h-11 w-[136px] shrink-0" style={ROUND} delay={90} />
        </div>
      </div>

      <div aria-hidden className="-mx-1 mt-3 flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-1/5" delay={180 + i * 90} />
              <Skeleton className="h-3 w-2/5" delay={180 + i * 90} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[0, 1, 2, 3].map((j) => (
                <Skeleton
                  key={j}
                  className="h-10 w-[104px]"
                  style={ROUND}
                  delay={270 + i * 90 + j * 30}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
