import { formatOsloDateTimeLocal } from './gamePayload';

// «Hvor og når?» (#2448): the tee-off quick picks. Pure, so the server can
// hand the form one «now» and the client draws the same days (the hydration
// trap in defaultTeeOff.ts).

/** The clock times on the second row. */
export const QUICK_PICK_TIMES = ['08:00', '09:00', '10:00'] as const;

export type TeeOffQuickPicks = {
  /** Today, tomorrow and the first Saturday after tomorrow, Oslo «YYYY-MM-DD». Empty for a malformed «now». */
  days: string[];
  times: readonly string[];
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Oslo's wall clock at `now` as «YYYY-MM-DDTHH:mm»: the form's `teeOffNow`. */
export function teeOffNowLocal(now: Date): string {
  return formatOsloDateTimeLocal(now.toISOString());
}

/**
 * The days for `now` («YYYY-MM-DDTHH:mm», Oslo). The third day is the first
 * Saturday after tomorrow, so a Friday offers the Saturday a week on: tomorrow
 * already is Saturday. Days count on the calendar (`Date.UTC` over the date),
 * so neither the host zone nor a clock change can shift one.
 */
export function teeOffQuickPicks(now: string): TeeOffQuickPicks {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(now);
  if (!m) return { days: [], times: QUICK_PICK_TIMES };
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const dayAt = (offset: number) => {
    const d = new Date(Date.UTC(year, month, day + offset));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const tomorrowWeekday = new Date(Date.UTC(year, month, day + 1)).getUTCDay();
  // Saturday = 6. From tomorrow, the days to the next Saturday after it (1–7).
  const toSaturday = ((6 - tomorrowWeekday + 7) % 7) || 7;
  return { days: [dayAt(0), dayAt(1), dayAt(1 + toSaturday)], times: QUICK_PICK_TIMES };
}
