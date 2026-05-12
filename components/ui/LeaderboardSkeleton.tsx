import { Skeleton, SkeletonCircle } from './Skeleton';

/**
 * Loading state for the Leaderboard screen — mirrors the State #4 (full
 * reveal) layout: champagne-rimmed 1st-place podium on top of three compact
 * rows. The actual route can render any of three views (state3 pre-round,
 * state3.5 front-9, state4 full); we predict state4 since it's the most
 * common destination once games go active.
 *
 * The 1st-place podium keeps its champagne hairline as a real gradient (not
 * a skeleton shape) so the winner-row reads as "revealed" before the data
 * lands — that's the moment of the leaderboard, it shouldn't be hidden.
 *
 * Rows 2/3/4 stagger at 90/180/270ms.
 */
export function LeaderboardSkeleton() {
  return (
    <div className="max-w-md mx-auto pt-8 pb-24">
      <header className="px-5 pb-3.5 flex items-center gap-2.5">
        <span className="text-lg text-muted leading-none">‹</span>
        <span className="text-[10px] font-semibold tracking-[0.20em] uppercase text-muted">
          Leaderboard
        </span>
        <div className="flex-1" />
        <SkeletonCircle className="w-6 h-6" />
      </header>

      <section className="px-5 pb-3.5">
        <Skeleton className="w-[100px] h-2.5 mb-3.5" />
        <Skeleton className="w-[180px] h-6 rounded-md mb-2.5" />
        <Skeleton className="w-[140px] h-3" />
      </section>

      <PodiumSkeleton />

      <div className="mx-3.5">
        <CompactRowSkeleton delay={90} />
        <CompactRowSkeleton delay={180} />
        <CompactRowSkeleton delay={270} />
      </div>
    </div>
  );
}

function PodiumSkeleton() {
  return (
    <div
      className="mx-3.5 mb-3.5 relative bg-surface border border-border rounded-[20px] p-[24px_22px_22px] overflow-hidden"
      style={{ boxShadow: '0 2px 8px rgba(26,46,31,0.06)' }}
    >
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(201,169,97,0.35) 40%, rgba(201,169,97,0.35) 60%, transparent 100%)',
        }}
      />
      <div className="flex items-center gap-[18px] mb-[18px]">
        <Skeleton className="w-14 h-14 rounded-[14px]" />
        <div className="flex-1 flex flex-col gap-2.5">
          <Skeleton className="w-[70%] h-[19px] rounded-md" />
          <Skeleton className="w-1/2 h-3" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <Skeleton className="w-[60px] h-[26px] rounded-md" />
          <Skeleton className="w-10 h-[11px]" />
        </div>
      </div>
      <div
        className="flex items-center gap-2.5 pt-3.5 border-t"
        style={{ borderTopColor: 'var(--row-divider-warm)' }}
      >
        <Skeleton className="w-[90px] h-[11px]" />
        <Skeleton className="ml-auto w-[60px] h-[22px] rounded-full" />
      </div>
    </div>
  );
}

function CompactRowSkeleton({ delay }: { delay: number }) {
  return (
    <div className="mb-2.5 bg-surface border border-border rounded-[14px] p-[14px_16px] flex items-center gap-3.5">
      <Skeleton delay={delay} className="w-[22px] h-[18px]" />
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton delay={delay} className="w-[70%] h-[15px] rounded-[5px]" />
        <Skeleton delay={delay} className="w-[45%] h-2.5" />
      </div>
      <Skeleton delay={delay} className="w-[50px] h-[22px] rounded-md" />
      <Skeleton delay={delay} className="w-[38px] h-[11px]" />
    </div>
  );
}
