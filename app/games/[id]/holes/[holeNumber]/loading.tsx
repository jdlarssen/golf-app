import { Skeleton, SkeletonCircle } from '@/components/ui/Skeleton';

// Instant loading state for the hole-entry screen. After #539 moved the
// game-home loading boundary into the (home) route group, this file is the
// first loading boundary on the holes path — without it, deep-links and
// prefetched SPA navigations would have no immediate feedback at all.
//
// Mirrors the hole page's vertical rhythm: header row, hole strip, hero
// (big hole number + par), then the score-entry area. Same full-screen
// wrapper as the real page so nothing shifts when content commits.
export default function HoleLoading() {
  return (
    <div
      className="min-h-screen bg-bg flex flex-col"
      style={{ paddingTop: 54, paddingBottom: 34 }}
    >
      <div className="flex items-center justify-between gap-3 px-[18px] pb-3">
        <Skeleton className="h-5 w-4" />
        <Skeleton className="h-4 w-36" />
        <SkeletonCircle className="w-5 h-5" />
      </div>

      <div className="flex gap-1.5 px-[18px] pb-4 overflow-hidden">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton
            key={i}
            className="h-8 w-8 shrink-0 rounded-lg"
            delay={i * 30}
          />
        ))}
      </div>

      <div className="flex items-end justify-between px-[22px] pb-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-14 w-16 rounded-xl" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>

      <div className="px-[18px] space-y-3">
        <Skeleton className="h-40 w-full rounded-2xl" delay={120} />
        <Skeleton className="h-12 w-full rounded-full" delay={210} />
      </div>
    </div>
  );
}
