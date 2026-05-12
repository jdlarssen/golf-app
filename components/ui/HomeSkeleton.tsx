import { Skeleton, SkeletonCircle } from './Skeleton';

/**
 * Loading state for the Hjem screen — mirrors the list layout (active games +
 * admin grid) since that's the case returning users land on after magic-link
 * login. Empty-state users see a brief content swap; that path is rare.
 *
 * Stagger pattern: 0 → 90 → 180 → 270ms across the four card-equivalent
 * surfaces (two active-game cards, two admin tiles). Within each card, every
 * shape shares the card's delay so the shimmer phase reads as one row.
 */
export function HomeSkeleton() {
  return (
    <div className="max-w-md mx-auto pt-8 pb-24">
      <header className="px-5 pb-3.5 flex items-center gap-2.5">
        <span className="text-[10px] font-semibold tracking-[0.20em] uppercase text-muted">
          Tørny
        </span>
        <div className="flex-1" />
        <SkeletonCircle className="w-[30px] h-[30px]" />
      </header>

      <section className="px-5 pb-[18px]">
        <Skeleton className="w-[86px] h-2.5 mb-3.5" />
        <Skeleton className="w-[200px] h-[26px] mb-2 rounded-[7px]" />
        <Skeleton className="w-[130px] h-[13px]" />
      </section>

      <BrassRibbonSkeleton />

      <section className="px-3.5 flex flex-col gap-3">
        <ActiveGameCardSkeleton delay={0} />
        <ActiveGameCardSkeleton delay={90} />
      </section>

      <section className="px-3.5 mt-[18px] grid grid-cols-2 gap-2.5">
        <AdminTileSkeleton delay={180} />
        <AdminTileSkeleton delay={270} />
      </section>
    </div>
  );
}

function BrassRibbonSkeleton() {
  return (
    <div className="mx-5 mb-3.5 flex items-center gap-3.5">
      <BrassRibbonLine />
      <Skeleton className="h-[11px]" style={{ width: 80 }} />
      <BrassRibbonLine />
    </div>
  );
}

function BrassRibbonLine() {
  return (
    <div className="flex-1 relative h-1.5">
      <div
        className="absolute inset-x-0 top-px h-px opacity-60"
        style={{ background: 'var(--brass-line-top)' }}
      />
      <div
        className="absolute inset-x-0 top-[5px] h-px opacity-60"
        style={{ background: 'var(--brass-line-bottom)' }}
      />
    </div>
  );
}

function ActiveGameCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      className="bg-surface border border-border rounded-2xl p-[18px_18px_20px] flex flex-col gap-3"
      style={{
        boxShadow:
          '0 1px 2px rgba(26,46,31,0.04), 0 2px 8px rgba(26,46,31,0.04)',
      }}
    >
      <div className="flex items-center gap-3">
        <Skeleton delay={delay} className="w-[38px] h-[38px] rounded-[10px]" />
        <div className="flex-1 flex flex-col gap-[7px]">
          <Skeleton delay={delay} className="w-3/5 h-4 rounded-[5px]" />
          <Skeleton delay={delay} className="w-2/5 h-[11px]" />
        </div>
        <Skeleton delay={delay} className="w-3.5 h-3.5 rounded" />
      </div>
      <div
        className="flex items-center gap-2.5 pt-2.5 border-t"
        style={{ borderTopColor: 'var(--row-divider-warm)' }}
      >
        <Skeleton delay={delay} className="w-[70px] h-2.5" />
        <Skeleton delay={delay} className="w-[50px] h-2.5" />
        <Skeleton
          delay={delay}
          className="ml-auto w-[64px] h-[22px] rounded-full"
        />
      </div>
    </div>
  );
}

function AdminTileSkeleton({ delay }: { delay: number }) {
  return (
    <div className="bg-surface border border-border rounded-[14px] p-3.5 h-[92px] flex flex-col justify-between">
      <Skeleton delay={delay} className="w-8 h-8 rounded-[9px]" />
      <Skeleton delay={delay} className="w-[70%] h-[13px] rounded-[5px]" />
    </div>
  );
}
