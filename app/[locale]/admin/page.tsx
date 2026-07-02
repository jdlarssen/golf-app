import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { ClubStamp } from '@/components/ui/ClubStamp';
import { PullQuote } from '@/components/ui/PullQuote';
import { Skeleton } from '@/components/ui/Skeleton';
import { firstName } from '@/lib/firstName';
import { formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import { osloIsoWeek, osloTimeOfDayBucket } from '@/lib/format/osloCalendar';
import type { AppLocale } from '@/i18n/routing';
import { getRole, TIME_OF_DAY_KEY } from './_dashboardContext';
import { TilesGrid, TilesSkeleton } from './TilesGrid';
import { PlayerKlubbhus } from './PlayerKlubbhus';
import { ActivityLedger, LedgerSkeleton } from './ActivityLedger';
import { ActionItemsStripe } from './ActionItemsStripe';
import { KeyMetricsCard } from './KeyMetricsCard';

// Page — shell. Each data-bearing section sits behind a Suspense boundary
// so the shell paints immediately and each section streams in as its query
// wave resolves. Top-level er async kun for å hente userId til
// NotificationBell-mountingen i TopBar — vi går via getAdminContext() så
// header-lookup-en cachet og deles med Suspense-bodies under.
export default async function KlubbhusetPage() {
  // Klubbhuset (#392): the universal room. We branch on role BEFORE touching any
  // admin-scoped query, so a regular player (or trusted creator) never loads the
  // tile counts or activity ledger — they get a minimal player view instead.
  // Admins fall through to the full Sekretariat dashboard below, unchanged.
  const role = await getRole();
  if (!role.isAdmin) return <PlayerKlubbhus role={role} />;

  const t = await getTranslations('admin.dashboard');
  const tNav = await getTranslations('admin.nav');
  const locale = await getLocale();

  // #646: derive date, ISO week and time-of-day from Oslo wall-clock, not the
  // server-local (UTC on Vercel) getters that showed yesterday's date and the
  // wrong greeting just past midnight Norwegian time.
  const now = new Date();
  const week = osloIsoWeek(now);
  const dateLine = t('dateLine', {
    date: formatShortOsloDayMonthLocale(now, locale as AppLocale),
    week,
  });
  const timeOfDay = TIME_OF_DAY_KEY[osloTimeOfDayBucket(now)];
  const timeOfDayWord = t(timeOfDay);

  return (
    <AdminShell>
      {/* Bell dropped: the persistent bottom-nav «Innboks»-tab now covers
          notifications inside the room (#392). */}
      <TopBar backHref="/" kicker={tNav('klubbhus')} />

      <Suspense
        fallback={
          <GreetingSkeleton
            dateLine={dateLine}
            saksbehandlerLabel={t('saksbehandlerLabel')}
          />
        }
      >
        <GreetingCard
          dateLine={dateLine}
          timeOfDayWord={timeOfDayWord}
          firstNameValue={firstName(role.name)}
        />
      </Suspense>

      {/* «Krever handling»-stripe (#864): egen Suspense-grense, rendrer
          ingenting på rolige dager (begge tellinger 0). */}
      <Suspense fallback={null}>
        <ActionItemsStripe />
      </Suspense>

      <Suspense fallback={<TilesSkeleton />}>
        <TilesGrid />
      </Suspense>

      {/* «Nøkkeltall»-kort (#1010): epicens suksessmål. Egen Suspense-grense;
          rendrer ingenting hvis RPC-en feiler. */}
      <Suspense fallback={null}>
        <KeyMetricsCard />
      </Suspense>

      <p className="mt-6 mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('sectionLabel')}
      </p>
      <Suspense fallback={<LedgerSkeleton />}>
        <ActivityLedger />
      </Suspense>

      <PullQuote className="mt-6">{t('pullQuote')}</PullQuote>
    </AdminShell>
  );
}

// ─── Greeting card ───────────────────────────────────────────────────────

async function GreetingCard({
  dateLine,
  timeOfDayWord,
  firstNameValue,
}: {
  dateLine: string;
  timeOfDayWord: string;
  firstNameValue: string | null;
}) {
  // Name is resolved once by the page's cached getRole() and passed in — the
  // greeting no longer pays its own users round-trip.
  const t = await getTranslations('admin.dashboard');

  return (
    <section
      className="relative mb-4 overflow-hidden rounded-2xl border px-5 py-[18px]"
      style={{
        background:
          'linear-gradient(180deg, var(--admin-salutation-top) 0%, var(--admin-salutation-bottom) 100%)',
        borderColor: 'var(--admin-salutation-border)',
      }}
    >
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('saksbehandlerLabel')}
      </p>
      <h1 className="mt-1 font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
        {firstNameValue
          ? t('greetingHeading', { timeOfDay: timeOfDayWord, name: firstNameValue })
          : t('greetingHeadingNoName', { timeOfDay: timeOfDayWord })}
      </h1>
      <p className="mt-1.5 font-sans text-xs tabular-nums text-muted">
        {dateLine}
      </p>
      <ClubStamp className="absolute right-[14px] top-[14px]" />
    </section>
  );
}

function GreetingSkeleton({
  dateLine,
  saksbehandlerLabel,
}: {
  dateLine: string;
  saksbehandlerLabel: string;
}) {
  return (
    <section
      className="relative mb-4 overflow-hidden rounded-2xl border px-5 py-[18px]"
      style={{
        background:
          'linear-gradient(180deg, var(--admin-salutation-top) 0%, var(--admin-salutation-bottom) 100%)',
        borderColor: 'var(--admin-salutation-border)',
      }}
    >
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {saksbehandlerLabel}
      </p>
      <Skeleton className="mt-1 h-7 w-3/5" />
      <p className="mt-1.5 font-sans text-xs tabular-nums text-muted">
        {dateLine}
      </p>
      <ClubStamp className="absolute right-[14px] top-[14px]" />
    </section>
  );
}
