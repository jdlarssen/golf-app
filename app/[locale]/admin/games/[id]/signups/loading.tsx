import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { Skeleton, SkeletonCircle } from '@/components/ui/Skeleton';

// Route skeleton for the signups page (#2288). Without it, `admin/loading.tsx`
// would paint Klubbhuset's shape on --admin-bg and the colour would change
// when the page comes (the jump #2493 removed): this page is on --bg.
// The shape follows the page: the arrow and the kicker, the game's name, the
// capacity line, and two cards.
export default async function SignupsLoading() {
  const t = await getTranslations('admin.game.signups');
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
            {t('heading')}
          </span>
          <span className="w-11" />
        </div>
        <div className="relative px-5 pt-1 font-serif text-[28px] font-medium">
          <span className="invisible">&nbsp;</span>
          <Skeleton className="absolute left-5 top-1/2 mt-0.5 h-6 w-1/2 -translate-y-1/2" />
        </div>
      </div>

      <div aria-hidden>
        <Skeleton className="mt-[10px] h-4 w-3/5" delay={90} />
        <Skeleton className="mt-1.5 h-2 w-full rounded-full" delay={180} />
        <div className="-mx-1 mt-[38px] flex flex-col gap-[10px]">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-[10px] rounded-2xl border border-border bg-surface px-3.5 py-3"
            >
              <div className="flex items-center gap-3">
                <SkeletonCircle className="size-[38px]" delay={270 + i * 90} />
                <div className="flex grow flex-col gap-1.5">
                  <Skeleton className="h-4 w-2/5" delay={270 + i * 90} />
                  <Skeleton className="h-3 w-3/5" delay={270 + i * 90} />
                </div>
              </div>
              <Skeleton className="h-11 w-full rounded-full" delay={360 + i * 90} />
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
