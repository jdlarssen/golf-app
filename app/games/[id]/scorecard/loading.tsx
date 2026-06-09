import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScorecardTableSkeleton } from './TableSkeleton';

// Instant loading state for the scorecard screen. After #539 moved the
// game-home loading boundary into the (home) route group, this file is the
// first loading boundary on the scorecard path. Mirrors the page's own
// chrome (TopBar + tee-box card) and reuses the exact table skeleton the
// page's inner <Suspense> shows, so the wait is one stable form throughout.
export default function ScorecardLoading() {
  return (
    <AppShell showVersion={false}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-40" />
        <span className="w-12" aria-hidden />
      </div>

      <div className="space-y-4">
        <Card className="px-4 py-3">
          <Skeleton className="mb-2 h-2.5 w-20" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="mt-1.5 h-2.5 w-28" />
        </Card>

        <ScorecardTableSkeleton />
      </div>
    </AppShell>
  );
}
