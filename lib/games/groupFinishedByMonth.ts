import { formatMonthLongLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import type { FinishedGame } from './getFinishedGamesForUser';

export type FinishedMonthGroup = {
  /** Stable identity/sort key, e.g. '2026-06' or 'no-date'. */
  key: string;
  /** Display label, e.g. «juni 2026» or «Uten dato». */
  label: string;
  games: FinishedGame[];
};

/**
 * Buckets finished games into month groups for the /spill-arkiv page (#571).
 *
 * - Input is assumed already sorted newest-first (`byEndedAtDesc`); groups come
 *   out in first-seen order, so newest month first and games within a month
 *   keep their incoming order.
 * - `ended_at: null` games collect in a trailing «Uten dato»-bucket (they sort
 *   last via `byEndedAtDesc`, so first-seen order puts the bucket at the end).
 * - Month key/label use LOCAL date getters to match `formatMonthLongLocale` and
 *   the card's `formatShortDateLocale` (same local-TZ convention).
 * - Labels are locale-aware (#60): the month heading via `formatMonthLongLocale`
 *   and the dateless bucket via the caller-supplied `noDateLabel` (translated at
 *   the call-site, so this stays pure).
 */
export function groupFinishedByMonth(
  games: FinishedGame[],
  locale: AppLocale,
  noDateLabel: string,
): FinishedMonthGroup[] {
  const groups: FinishedMonthGroup[] = [];
  const byKey = new Map<string, FinishedMonthGroup>();

  for (const game of games) {
    let key: string;
    let label: string;
    if (game.ended_at) {
      const d = new Date(game.ended_at);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      label = formatMonthLongLocale(d, locale);
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
    group.games.push(game);
  }

  return groups;
}
