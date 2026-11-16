import { useTranslations } from 'next-intl';
import { capacityState, type GameSeats } from '@/lib/games/seatCapacity';

/**
 * #2482: the seats over the signup form, as the «Plasser og frist» artboard
 * draws the player's view: a bar, «12 av 16 plasser» and, on a full round,
 * «Fullt», with «· 2 på venteliste» when the round has a waiting list. The
 * numbers are the seat claim's own (`readSeatFacts`). The held count is shown
 * as it is, also when the organiser added players past the cap (U3).
 */
export function SeatsLine({ seats }: { seats: Extract<GameSeats, { kind: 'capped' }> }) {
  const t = useTranslations('signup');
  const { fillRatio, tone } = capacityState(seats);
  const fullText =
    tone !== 'full'
      ? null
      : seats.waitlist !== undefined
        ? t('seatsFullWaitlist', { count: seats.waitlist })
        : t('seatsFull');
  return (
    <div className="flex flex-col gap-2" data-testid="signup-seats">
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-meter-track">
        <div
          className="h-1.5 rounded-full bg-primary"
          style={{ width: `${Math.round(fillRatio * 100)}%` }}
        />
      </div>
      <div className="flex justify-between gap-3 font-sans text-xs tabular-nums text-muted">
        <span>{t('seatsLine', { held: seats.held, cap: seats.cap })}</span>
        {fullText && <span data-testid="signup-seats-full">{fullText}</span>}
      </div>
    </div>
  );
}
