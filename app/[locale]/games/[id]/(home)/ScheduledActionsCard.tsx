import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import type { MyBroughtGuest } from '@/lib/games/broughtGuests';

/**
 * The list card under «Du er påmeldt» before the start (#2607, screens 1 and
 * 4 of the «Ta med en gjest» drawing): «Ta med en gjest ›» first, then «Legg i
 * kalenderen ›» and «Vis på kart ›». The owner's answer 31.10: build the list
 * card from the drawing, at its measure (16 px from the screen edge), and move
 * calendar and map here from the course card so they are not in two places.
 *
 * `guestRow` is set only when `bringGuestBlock` lets the player bring a guest;
 * with a guest, the row says who and where the guest stands. A player without
 * the row (invited directly, or a round without sign-up) gets the same card
 * with calendar and map. No rows, no card.
 */
export async function ScheduledActionsCard({
  gameId,
  guestRow,
  calendarHref,
  mapHref,
}: {
  gameId: string;
  guestRow: { guest: MyBroughtGuest | null } | null;
  /** The .ics route; null without a tee-off time. */
  calendarHref: string | null;
  /** A maps search for the course; null without a course name. */
  mapHref: string | null;
}) {
  if (!guestRow && !calendarHref && !mapHref) return null;
  const t = await getTranslations('game.bringGuest');
  const tHome = await getTranslations('game.home');
  const guest = guestRow?.guest ?? null;
  const guestLabel =
    guest && guest.name
      ? t(guest.status === 'approved' ? 'rowGuestIn' : 'rowGuestPending', { name: guest.name })
      : t('rowCta');
  return (
    <div
      data-testid="scheduled-actions"
      className="-mx-1 mb-4 overflow-hidden rounded-2xl border border-border bg-surface"
    >
      {guestRow && (
        <SmartLink href={`/games/${gameId}/ta-med-gjest`} data-testid="bring-guest-row" className={ROW}>
          <RowContent label={guestLabel} />
        </SmartLink>
      )}
      {/* #945: a plain <a> to the .ics route (not next/link), so the
          Content-Disposition opens iOS's «Legg til i kalender» sheet instead
          of a client-side navigation. */}
      {calendarHref && (
        <a href={calendarHref} data-testid="calendar-row" className={ROW}>
          <RowContent label={tHome('addToCalendar')} />
        </a>
      )}
      {mapHref && (
        <a href={mapHref} target="_blank" rel="noopener noreferrer" data-testid="map-row" className={ROW}>
          <RowContent label={tHome('viewOnMap')} />
        </a>
      )}
    </div>
  );
}

/** The drawing's row: 52 px, 15 px / 600, a chevron, the divider inside the height (#2493). */
const ROW =
  'flex min-h-[52px] items-center gap-3 border-b border-row-divider-warm px-3.5 py-2.5 text-text transition-colors last:border-b-0 hover:bg-primary-soft';

function RowContent({ label }: { label: ReactNode }) {
  return (
    <>
      <span className="min-w-0 grow font-sans text-[15px] font-semibold leading-[normal]">{label}</span>
      <span aria-hidden className="text-lg leading-none text-muted">
        ›
      </span>
    </>
  );
}
