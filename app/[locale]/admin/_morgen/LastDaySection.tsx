import { getTranslations } from 'next-intl/server';
import { SectionError } from '@/components/ui/SectionError';
import { getActivityEntries, type ActivityEntry } from '@/lib/admin/activityLedger';
import { lastDayEntries } from '@/lib/admin/morningReport';
import { getAdminContext } from '../_dashboardContext';
import { ActivityLedgerList } from '../ActivityLedger';
import { MorningSection } from './parts';

/**
 * «Siste døgn» (#2345): the three newest events of the last 24 hours as one
 * sentence each, with the Oslo time or «i går». Plain lines, as drawn. Under
 * them, «Siste 14 dager» opens the event list the dashboard had (owner's
 * answer: kept), where the rows link on.
 */
export async function LastDaySection() {
  // The request's cookies are read first: with cacheComponents, `new Date()`
  // must come after request data.
  await getAdminContext();
  const t = await getTranslations('admin.dashboard.morning');
  const tLedger = await getTranslations('admin.dashboard');
  const entries = await getActivityEntries();
  if (!entries) {
    return (
      <MorningSection id="morning-last-day" heading={t('lastDayHeading')} headingClassName="mb-1.5">
        <div className="-mx-1">
          <SectionError testId="morning-last-day-error" />
        </div>
      </MorningSection>
    );
  }

  const lines = lastDayEntries(entries, new Date());

  const who = (e: ActivityEntry) => e.who ?? tLedger('ledgerUnknown');
  const ref = (e: ActivityEntry) =>
    e.ref ?? (e.kind === 'acceptedInvite' ? tLedger('ledgerClubInvite') : tLedger('ledgerGameFallback'));

  return (
    <MorningSection id="morning-last-day" heading={t('lastDayHeading')} headingClassName="mb-1.5">
      {lines.length === 0 ? (
        <p className="text-[13px] text-muted">{t('lastDayEmpty')}</p>
      ) : (
        <ul data-testid="morning-last-day" className="flex flex-col gap-1.5 text-[13px] leading-[1.35]">
          {lines.map(({ entry, stamp }) => (
            <li key={`${entry.ts}-${entry.kind}`} className="flex gap-2.5">
              <span className="w-12 shrink-0 tabular-nums text-muted">
                {stamp.kind === 'time' ? stamp.time : t('lastDayYesterday')}
              </span>
              <span>{t('lastDayEvent', { kind: entry.kind, who: who(entry), ref: ref(entry) })}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="group mt-1">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-primary [&::-webkit-details-marker]:hidden">
          {t('last14Days')}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="-mx-1 mt-1">
          <ActivityLedgerList rows={entries} />
        </div>
      </details>
    </MorningSection>
  );
}
