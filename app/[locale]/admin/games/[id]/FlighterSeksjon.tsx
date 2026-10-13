import { getTranslations } from 'next-intl/server';
import { flightBuckets, type FlightPlayer } from '@/lib/games/flightScope';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { SmartLink } from '@/components/ui/SmartLink';

/**
 * The «Startlista» row on the game page and in the desk's «Oppsett» (#2289).
 *
 * The flights are moved on their own page, `/admin/games/[id]/startlista`;
 * this row says how they stand («12 spillere · 3 flighter», and in amber how
 * many still lack a flight, since the round cannot start before everyone has
 * one) and opens it. The caller decides when it shows
 * (`eligibleForFlightAssignment`, scheduled or active).
 */
export async function FlighterSeksjon({
  gameId,
  players,
}: {
  gameId: string;
  players: FlightPlayer[];
}) {
  const t = await getTranslations('admin.game.flights');
  // Withdrawn players are out, as on the Startlista.
  const { assigned, unassigned } = flightBuckets(players);
  const activeCount =
    unassigned.length + [...assigned.values()].reduce((n, members) => n + members.length, 0);

  return (
    <section className="mt-1.5">
      <MiniRibbon>{t('sectionLabel')}</MiniRibbon>
      <SmartLink
        href={`/admin/games/${gameId}/startlista`}
        data-testid="startlista-link"
        className="flex min-h-[44px] items-center justify-between gap-3.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 transition-colors hover:bg-primary-soft"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <span className="font-sans text-[12.5px] font-medium text-text">
          {t('summary', { players: activeCount, flights: assigned.size })}
        </span>
        <span className="flex items-center gap-2">
          {unassigned.length > 0 && (
            <span className="font-sans text-[12.5px] font-semibold text-warning-text">
              {t('unassignedShort', { count: unassigned.length })}
            </span>
          )}
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      </SmartLink>
    </section>
  );
}
