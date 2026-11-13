import { Skeleton } from '@/components/ui/Skeleton';

// Skeletons in the morning report's shapes (#2345): the green week card, and
// a heading over a card of rows (or over plain lines, as «Siste døgn»).

export function WeekCardSkeleton() {
  // Radius inline: `.sk` sets its own and beats a utility class (#2288).
  return <Skeleton className="-mx-1 mt-3.5 h-[176px]" style={{ borderRadius: 18 }} />;
}

export function MorningSkeleton({ rows, plain = false }: { rows: number; plain?: boolean }) {
  return (
    <div aria-hidden className="mt-4">
      <Skeleton className="mb-2 h-3 w-16" />
      {plain ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-4/5" delay={i * 90} />
          ))}
        </div>
      ) : (
        <div className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[52px] flex-col justify-center gap-1.5 border-b border-row-divider-warm px-3.5 py-2.5 last:border-b-0"
            >
              <Skeleton className="h-4 w-28" delay={i * 90} />
              <Skeleton className="h-3 w-36" delay={i * 90 + 30} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
