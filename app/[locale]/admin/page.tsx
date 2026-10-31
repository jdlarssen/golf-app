import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { ClubStamp } from '@/components/ui/ClubStamp';
import { PullQuote } from '@/components/ui/PullQuote';
import { formatWeekdayDayMonthOsloLocale } from '@/lib/i18n/format';
import { osloIsoWeek } from '@/lib/format/osloCalendar';
import type { AppLocale } from '@/i18n/routing';
import { getRole } from './_dashboardContext';
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

  // #646: derive the date and ISO week from Oslo wall-clock, not the
  // server-local (UTC on Vercel) getters that showed yesterday's date just past
  // midnight Norwegian time. The date is the card's title; the week sits
  // beneath it.
  const now = new Date();
  const dateTitle = formatWeekdayDayMonthOsloLocale(now, locale as AppLocale);
  const weekLine = t('weekLine', { week: osloIsoWeek(now) });

  return (
    <AdminShell>
      {/* Bell dropped: the persistent bottom-nav «Innboks»-tab now covers
          notifications inside the room (#392). */}
      <TopBar kicker={tNav('klubbhus')} />

      <DateCard
        dateTitle={dateTitle}
        weekLine={weekLine}
        saksbehandlerLabel={t('saksbehandlerLabel')}
      />

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

      <p className="mt-6 mb-1.5 px-1 font-sans text-xs font-semibold text-muted">
        {t('sectionLabel')}
      </p>
      <Suspense fallback={<LedgerSkeleton />}>
        <ActivityLedger />
      </Suspense>

      <PullQuote className="mt-6">{t('pullQuote')}</PullQuote>
    </AdminShell>
  );
}

// ─── Date card ───────────────────────────────────────────────────────────

// The title is today's date, so the card needs no data and no Suspense
// boundary: it paints with the shell.
function DateCard({
  dateTitle,
  weekLine,
  saksbehandlerLabel,
}: {
  dateTitle: string;
  weekLine: string;
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
      <p className="font-sans text-xs font-semibold text-muted">
        {saksbehandlerLabel}
      </p>
      <h1 className="mt-1 font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
        {dateTitle}
      </h1>
      <p className="mt-1.5 font-sans text-xs tabular-nums text-muted">
        {weekLine}
      </p>
      <ClubStamp className="absolute right-[14px] top-[14px]" />
    </section>
  );
}
