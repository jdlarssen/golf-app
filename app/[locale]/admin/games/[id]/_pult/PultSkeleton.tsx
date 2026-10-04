import { Skeleton } from '@/components/ui/Skeleton';

/**
 * What the desk shows while its data loads (#2268). The first element is a
 * full-bleed green block the height of `PultHeader` (174 px at 390 with a
 * one-line name, measured on staging), then the tab track and
 * two card shapes, so nothing jumps when the content streams in.
 */
export function PultSkeleton() {
  return (
    <div data-testid="pult-skeleton" aria-busy="true">
      <div className="-mx-5 -mt-8 h-[174px] bg-surface-strong" />
      <div className="-mx-1">
        <Skeleton className="mt-3 h-12 rounded-full" />
        {[0, 1].map((i) => (
          <div key={i}>
            <Skeleton className="mt-4 mb-2 ml-1 h-2.5 w-20" delay={i * 90} />
            <div className="space-y-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
              <Skeleton className="h-4 w-48" delay={i * 90 + 30} />
              <Skeleton className="h-3 w-28" delay={i * 90 + 60} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
