import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

// Shared between the route-level loading.tsx and the page's inner
// <Suspense> fallback so the table keeps one stable skeleton form across
// the whole wait (#539).
export function ScorecardTableSkeleton() {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex gap-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-8 ml-auto" />
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-10" />
      </div>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className="px-4 py-2.5 border-t border-border flex gap-2"
          style={{
            borderTop: i === 0 ? 'none' : undefined,
          }}
        >
          <Skeleton className="h-3.5 w-6" delay={i * 60} />
          <Skeleton className="h-3.5 w-6 ml-auto" delay={i * 60 + 20} />
          <Skeleton className="h-3.5 w-6" delay={i * 60 + 40} />
          <Skeleton className="h-3.5 w-8" delay={i * 60 + 60} />
          <Skeleton className="h-3.5 w-8" delay={i * 60 + 80} />
        </div>
      ))}
    </Card>
  );
}
