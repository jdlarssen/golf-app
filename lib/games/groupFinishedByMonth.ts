import { formatMonthLongNb } from '@/lib/format/date';
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
 * - Month key/label use LOCAL date getters to match `formatMonthLongNb` and the
 *   card's `formatShortDateLocale` (same local-TZ convention).
 */
export function groupFinishedByMonth(
  games: FinishedGame[],
): FinishedMonthGroup[] {
  const groups: FinishedMonthGroup[] = [];
  const byKey = new Map<string, FinishedMonthGroup>();

  for (const game of games) {
    let key: string;
    let label: string;
    if (game.ended_at) {
      const d = new Date(game.ended_at);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      label = formatMonthLongNb(d);
    } else {
      key = 'no-date';
      label = 'Uten dato';
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
