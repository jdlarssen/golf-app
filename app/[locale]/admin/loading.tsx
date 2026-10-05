import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { getRole } from './_dashboardContext';
import { LoadingTone } from './LoadingTone';
import { DenseTileListSkeleton } from './TilesGrid';
import { NewRoundCardSkeleton } from './PlayerKlubbhusViews';

// Route-loading skeleton for /admin and every page under it without its own
// loading.tsx. Its layout follows the player room (#2493), which most people
// see: the tab's TopBar without an arrow, the greeting as one heading line
// with no card, the «Lag en ny runde» card as a block, and `DenseTileList`
// rows below.
//
// Its page colour is the one the page will have (owner's answer 05.10): the
// player's room on the app's background, everything else on Klubbhuset's
// linen. The role is already known here (the admin layout above awaits it),
// and `getRole()` is request-cached, so the page reuses this lookup instead
// of making its own.
export default async function AdminLoading() {
  const [tNav, role] = await Promise.all([getTranslations('admin.nav'), getRole()]);
  return (
    <LoadingTone isPlayer={!role.isAdmin}>
      <AdminShell tone="none">
        <TopBar kicker={tNav('klubbhus')} />

        <SkeletonLine
          className="pt-1.5 font-serif text-[28px] font-medium leading-[normal]"
          barClassName="h-6 w-2/5"
        />

        <NewRoundCardSkeleton />

        <div className="mt-[18px]">
          <DenseTileListSkeleton rows={3} />
        </div>
      </AdminShell>
    </LoadingTone>
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
