import { osloParts } from '@/lib/format/teeOff';
import { formatOsloDateTimeLocal, parseOsloDateTimeLocal } from './gamePayload';

// «Flytt runden» (#2480): the quick choices for a new day and time, and the
// one way a chosen day + time becomes an instant. Pure, so the page and the
// action agree.

export type MoveGameChoices = {
  /** The round's Oslo day, «YYYY-MM-DD». */
  currentDay: string;
  /** The round's Oslo clock time, «HH:mm». */
  currentTime: string;
  /** The round's day, the day after, the same weekday a week later. */
  days: [string, string, string];
  /** An hour before, the round's time, an hour after. */
  times: [string, string, string];
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The quick choices for a round that tees off at `teeOffIso`. Days count on
 * the Oslo calendar (`Date.UTC` over the Oslo date, as in
 * `osloWeekendDateKeys`), so neither the host zone nor a clock change can shift
 * a day. Times are wall-clock and wrap past midnight.
 */
export function moveGameChoices(teeOffIso: string): MoveGameChoices {
  const { year, month, day, hour, minute } = osloParts(new Date(teeOffIso));
  const dayAt = (offset: number) => {
    const d = new Date(Date.UTC(year, month, day + offset));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const timeAt = (offset: number) => `${pad((hour + offset + 24) % 24)}:${pad(minute)}`;
  return {
    currentDay: dayAt(0),
    currentTime: timeAt(0),
    days: [dayAt(0), dayAt(1), dayAt(7)],
    times: [timeAt(-1), timeAt(0), timeAt(1)],
  };
}

/**
 * The instant for a chosen Oslo day («YYYY-MM-DD») and time («HH:mm»), or
 * `null` when either is not a real day or time. A date the calendar does not
 * have (30 February) is refused rather than rolled into March: the instant,
 * formatted back in Oslo, must give the same day and time.
 */
export function movedTeeOffIso(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const local = `${day}T${time}`;
  try {
    const iso = parseOsloDateTimeLocal(local);
    return formatOsloDateTimeLocal(iso) === local ? iso : null;
  } catch {
    return null;
  }
}
