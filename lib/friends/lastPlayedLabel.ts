import { osloDateKey } from '@/lib/format/osloCalendar';
import type { AppLocale } from '@/i18n/routing';
import {
  formatShortOsloDateWithYearLocale,
  formatShortOsloDayMonthLocale,
  intlLocaleTag,
} from '@/lib/i18n/format';

/** The words the caller's catalog gives (`friends.lastPlayed*`). */
export type LastPlayedText = {
  today: string;
  yesterday: string;
  /** «sist lørdag» from the weekday's name. */
  weekday: (weekday: string) => string;
};

/** Day number of an Oslo date key, for whole-day arithmetic free of DST. */
function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * When you last played together (#2267), as the artboard writes it: «i dag»,
 * «i går», «sist lørdag» within the week, else «14. sep» (with the year when
 * it is not this year). Oslo days, because the server runs in UTC.
 *
 * The app has its own copy in `native/app/src/lib/friendsCopy.ts` on the
 * device's local time, since Hermes has no time zones.
 */
export function lastPlayedLabel(
  iso: string,
  now: Date,
  locale: AppLocale,
  text: LastPlayedText,
): string {
  const date = new Date(iso);
  const dateKey = osloDateKey(date);
  const nowKey = osloDateKey(now);
  const days = dayNumber(nowKey) - dayNumber(dateKey);
  if (days === 0) return text.today;
  if (days === 1) return text.yesterday;
  if (days > 1 && days < 7) {
    const weekday = new Intl.DateTimeFormat(intlLocaleTag(locale), {
      timeZone: 'Europe/Oslo',
      weekday: 'long',
    }).format(date);
    return text.weekday(weekday);
  }
  return dateKey.slice(0, 4) === nowKey.slice(0, 4)
    ? formatShortOsloDayMonthLocale(date, locale)
    : formatShortOsloDateWithYearLocale(date, locale);
}
