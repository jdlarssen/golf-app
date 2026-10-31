import { formatOsloDateTimeLocal } from './gamePayload';

// «Hvor og når?» (#2448): the tee-off quick picks. Pure, so the server can
// hand the form one «now» and the client draws the same days (the hydration
// trap in defaultTeeOff.ts).

/** The clock times on the second row. */
export const QUICK_PICK_TIMES = ['08:00', '09:00', '10:00'] as const;

export type TeeOffQuickPicks = {
  /** Today and tomorrow, Oslo «YYYY-MM-DD». Empty for a malformed «now». */
  days: string[];
  times: readonly string[];
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Oslo's wall clock at `now` as «YYYY-MM-DDTHH:mm»: the form's `teeOffNow`. */
export function teeOffNowLocal(now: Date): string {
  return formatOsloDateTimeLocal(now.toISOString());
}

/**
 * The days for `now` («YYYY-MM-DDTHH:mm», Oslo): today and tomorrow. #2463
 * took the Saturday pick out: the row is «Nå · I dag · I morgen · Annen dag»
 * (`Nyttspill-forslag-spill-na`), and #2438's Saturday default shows as
 * «Annen dag» with its date unless it is today or tomorrow. Days count on the
 * calendar (`Date.UTC` over the date), so neither the host zone nor a clock
 * change can shift one.
 */
export function teeOffQuickPicks(now: string): TeeOffQuickPicks {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(now);
  if (!m) return { days: [], times: QUICK_PICK_TIMES };
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const dayAt = (offset: number) => {
    const d = new Date(Date.UTC(year, month, day + offset));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  return { days: [dayAt(0), dayAt(1)], times: QUICK_PICK_TIMES };
}
