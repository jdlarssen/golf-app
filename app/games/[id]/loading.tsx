import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

// Shown while the game-landing route's pre-Suspense gating queries run
// (auth, game row, my game_players row, optional auto-start fallback).
// Matches the active-state shell so nothing jumps when the real page commits.
export default function GameLoading() {
  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-40" />
        <span className="w-12" aria-hidden />
      </div>

      <div className="mb-4">
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>

      <div className="space-y-4">
        <Card>
          <Skeleton className="mb-2 h-2.5 w-10" />
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="mt-1.5 h-3 w-4/5" />
        </Card>

        <Card>
          <Skeleton className="mb-2 h-2.5 w-14" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" delay={0} />
            <Skeleton className="h-3 w-full" delay={60} />
            <Skeleton className="h-3 w-full" delay={120} />
          </div>
        </Card>

        <Skeleton className="h-12 w-full rounded-full" delay={180} />
        <Skeleton className="h-14 w-full rounded-2xl" delay={240} />
      </div>
    </AppShell>
  );
}
