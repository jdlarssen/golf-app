import { getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import type { MyBroughtGuest } from '@/lib/games/broughtGuests';

/**
 * «Ta med en gjest ›» on the game page before the start (#2607, fase 2;
 * screens 1 and 4 of the drawing). The caller renders it only when
 * `bringGuestBlock` lets the player bring a guest. With a guest, the row says
 * who and where the guest stands; the tap opens the same page («Gjesten din»).
 *
 * The drawing puts the row first in a list card over «Legg i kalenderen» and
 * «Vis på kart» (the «Overgang» design). That list card is not built on the
 * web: calendar and map are buttons in the course card. So the row is its own
 * one-row card in the same row style (15 px / 600, chevron, 52 px), with no
 * divider below it since nothing follows.
 */
export async function BringGuestRow({
  gameId,
  guest,
}: {
  gameId: string;
  guest: MyBroughtGuest | null;
}) {
  const t = await getTranslations('game.bringGuest');
  const label =
    guest && guest.name
      ? t(guest.status === 'approved' ? 'rowGuestIn' : 'rowGuestPending', { name: guest.name })
      : t('rowCta');
  return (
    <div className="mx-4 mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
      <SmartLink
        href={`/games/${gameId}/ta-med-gjest`}
        data-testid="bring-guest-row"
        className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5 text-text transition-colors hover:bg-primary-soft"
      >
        <span className="min-w-0 grow font-sans text-[15px] font-semibold leading-[normal]">{label}</span>
        <span aria-hidden className="text-lg leading-none text-muted">
          ›
        </span>
      </SmartLink>
    </div>
  );
}
