import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Skeleton } from '@/components/ui/Skeleton';

// Shown while AdminLayout's auth gate runs (~100–200 ms). The page itself
// renders synchronously with internal Suspense boundaries, so this is the
// only blocking step that's visible to the user during navigation into
// /admin. Matches the admin chrome so there's no shell-shift when the real
// page commits.
export default function AdminLoading() {
  return (
    <AdminShell>
      <div className="-mt-3 mb-4 flex items-center justify-between">
        <BackLink href="/">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <Skeleton className="mb-4 h-[88px] rounded-2xl" />

      <div className="mb-2 grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            className="min-h-[108px] rounded-2xl"
            delay={i * 90}
          />
        ))}
      </div>

      <Skeleton className="mt-6 mb-1.5 ml-1 h-2.5 w-32" />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[42px_1fr] items-baseline gap-2.5 px-3.5 py-2.5"
            style={{
              borderTop:
                i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
            }}
          >
            <Skeleton className="h-3 w-9" delay={i * 90} />
            <div>
              <Skeleton className="h-3.5 w-4/5" delay={i * 90 + 30} />
              <Skeleton className="mt-1.5 h-2.5 w-2/5" delay={i * 90 + 60} />
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
