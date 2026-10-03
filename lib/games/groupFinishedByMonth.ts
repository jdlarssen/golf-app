import { formatMonthLongLocale } from '@/lib/i18n/format';
import { osloParts } from '@/lib/format/teeOff';
import type { AppLocale } from '@/i18n/routing';

export type FinishedMonthGroup<T> = {
  /** Stable identity/sort key, e.g. '2026-06' or 'no-date'. */
  key: string;
  /** Display label, e.g. «juni 2026» or «Uten dato». */
  label: string;
  games: T[];
};

/**
 * Buckets dated finished items into month groups for the /spill-arkiv page
 * (#571). Generic over anything carrying `ended_at` — plain finished games or
 * the #1449 cup-day entries — so a merged cup day groups by its month like any
 * other item.
 *
 * - Input is assumed already sorted newest-first (`byEndedAtDesc`); groups come
 *   out in first-seen order, so newest month first and items within a month
 *   keep their incoming order.
 * - `ended_at: null` items collect in a trailing «Uten dato»-bucket (they sort
 *   last via `byEndedAtDesc`, so first-seen order puts the bucket at the end).
 * - Month key and heading follow the Oslo month, like the card's
 *   `formatShortOsloDayMonthLocale`: a round that ends just after midnight Oslo
 *   lands in the new month, also on a UTC server (#2339).
 * - Labels are locale-aware (#60): the month heading via `formatMonthLongLocale`
 *   and the dateless bucket via the caller-supplied `noDateLabel` (translated at
 *   the call-site, so this stays pure).
 */
export function groupFinishedByMonth<T extends { ended_at: string | null }>(
  items: T[],
  locale: AppLocale,
  noDateLabel: string,
): FinishedMonthGroup<T>[] {
  const groups: FinishedMonthGroup<T>[] = [];
  const byKey = new Map<string, FinishedMonthGroup<T>>();

  for (const item of items) {
    let key: string;
    let label: string;
    if (item.ended_at) {
      const { year, month } = osloParts(new Date(item.ended_at));
      key = `${year}-${String(month + 1).padStart(2, '0')}`;
      // Mid-month at noon UTC is the same month in every timezone, so the
      // host-TZ heading helper can't drift to the neighbouring month.
      label = formatMonthLongLocale(new Date(Date.UTC(year, month, 15, 12)), locale);
    } else {
      key = 'no-date';
      label = noDateLabel;
    }

    let group = byKey.get(key);
    if (!group) {
      group = { key, label, games: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.games.push(item);
  }

  return groups;
}
