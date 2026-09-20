import { AppShell } from '@/components/ui/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Rute-skjelett for Kavalkaden (#2129, felle 5). Første åpning venter på
 * språkmodellen, så dette er den skjermen spilleren faktisk ser en liten stund
 * julaften morgen — ikke en teoretisk tilstand. Silhuetten er topplinja,
 * overskriften, fane-raden og kortet som ligger i skinna, i den rekkefølgen
 * siden bygger dem.
 */
export default function KavalkadeLoading() {
  return (
    <AppShell>
      <div className="sticky top-0 z-30 -mx-5 -mt-8 mb-4 flex items-center gap-3 bg-bg/90 px-5 pb-2 pt-5">
        <Skeleton className="h-4 w-16" />
      </div>

      <Skeleton className="h-7 w-40" delay={30} />

      <div className="mt-4 flex gap-2 border-b border-border pb-3">
        <Skeleton className="h-5 flex-1" delay={60} />
        <Skeleton className="h-5 flex-1" delay={90} />
      </div>

      <div className="mt-4 flex gap-4 overflow-hidden">
        <Skeleton className="h-64 w-[88%] shrink-0 rounded-2xl" delay={120} />
        <Skeleton className="h-64 w-[88%] shrink-0 rounded-2xl" delay={180} />
      </div>
    </AppShell>
  );
}
