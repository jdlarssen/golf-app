import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { formatWeekdayDayMonthOsloLocale } from '@/lib/i18n/format';
import { osloIsoWeek } from '@/lib/format/osloCalendar';
import type { AppLocale } from '@/i18n/routing';
import { getRole } from './_dashboardContext';
import { PlayerKlubbhus } from './PlayerKlubbhus';
import { GettingStartedSection } from './_morgen/GettingStartedSection';
import { WeekCard } from './_morgen/WeekCard';
import { NeedsYouSection } from './_morgen/NeedsYouSection';
import { TodaySection } from './_morgen/TodaySection';
import { LastDaySection } from './_morgen/LastDaySection';
import { DoorGrid } from './_morgen/DoorGrid';
import { MorningSkeleton, WeekCardSkeleton } from './_morgen/MorningSkeleton';

// Page — shell. Each data-bearing section sits behind a Suspense boundary
// so the shell paints immediately and each section streams in as its query
// wave resolves.
export default async function KlubbhusetPage() {
  // Klubbhuset (#392): the universal room. We branch on role BEFORE touching any
  // admin-scoped query, so a regular player (or trusted creator) never loads the
  // admin counts or activity ledger — they get the player view instead.
  const role = await getRole();
  if (!role.isAdmin) return <PlayerKlubbhus role={role} />;

  const t = await getTranslations('admin.dashboard.morning');
  const locale = await getLocale();

  // The Sekretariat's morning report (#2345). No top bar, as drawn: the
  // header is the small heading with the Oslo week (#646: Oslo wall-clock,
  // not the UTC server's getters) and the date as the page's h1. No greeting
  // as the title and no uppercase kicker (#2728).
  const now = new Date();

  return (
    <AdminShell>
      <header className="-mt-3.5">
        <p className="font-sans text-xs font-semibold text-accent-text">
          {t('kicker', { week: osloIsoWeek(now) })}
        </p>
        <h1 className="mt-1.5 font-serif text-[28px] font-medium leading-[normal] text-text">
          {formatWeekdayDayMonthOsloLocale(now, locale as AppLocale)}
        </h1>
      </header>

      <Suspense fallback={null}>
        <GettingStartedSection />
      </Suspense>
      <Suspense fallback={<WeekCardSkeleton />}>
        <WeekCard />
      </Suspense>
      <Suspense fallback={null}>
        <NeedsYouSection />
      </Suspense>
      <Suspense fallback={<MorningSkeleton rows={2} />}>
        <TodaySection />
      </Suspense>
      <Suspense fallback={<MorningSkeleton rows={3} plain />}>
        <LastDaySection />
      </Suspense>

      <DoorGrid />
    </AdminShell>
  );
}
