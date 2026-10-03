import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { DenseTileListSkeleton } from './TilesGrid';

// Route-loading skeleton for /admin and every page under it without its own
// loading.tsx. It renders before the role is known: `getRole()` runs in the
// page, below this boundary, and the page then branches to the admin
// Sekretariat or the player room. So the skeleton is role-neutral (#2488):
// the tab's TopBar without an arrow, a greeting card with the same shell as
// both rooms' greetings, and three `DenseTileList` rows, the shape both rooms
// use first below the greeting. Below the greeting the real page may shift.
export default async function AdminLoading() {
  const tNav = await getTranslations('admin.nav');
  return (
    <AdminShell>
      <TopBar kicker={tNav('klubbhus')} />

      <section
        className="relative mb-4 overflow-hidden rounded-2xl border px-5 py-[18px]"
        style={{
          background:
            'linear-gradient(180deg, var(--admin-salutation-top) 0%, var(--admin-salutation-bottom) 100%)',
          borderColor: 'var(--admin-salutation-border)',
        }}
      >
        <SkeletonLine
          className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em]"
          barClassName="h-2 w-24"
        />
        <SkeletonLine
          className="mt-1 font-serif text-[22px] font-medium leading-snug"
          barClassName="h-5 w-3/5"
          delay={60}
        />
        <SkeletonLine
          className="mt-1.5 font-sans text-xs"
          barClassName="h-2.5 w-2/5"
          delay={120}
        />
      </section>

      <DenseTileListSkeleton rows={3} />
    </AdminShell>
  );
}

/**
 * One skeleton bar in a line box of the real text's typography: the
 * invisible text gives the line its real height, so the card is exactly as
 * tall as the greeting it stands in for.
 */
function SkeletonLine({
  className,
  barClassName,
  delay = 0,
}: {
  className: string;
  barClassName: string;
  delay?: number;
}) {
  return (
    <div aria-hidden className={`relative ${className}`}>
      <span className="invisible">&nbsp;</span>
      <Skeleton
        className={`absolute left-0 top-1/2 -translate-y-1/2 ${barClassName}`}
        delay={delay}
      />
    </div>
  );
}
