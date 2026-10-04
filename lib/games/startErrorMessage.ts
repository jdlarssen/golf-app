import { isStartCountMode } from '@/lib/games/startPlayerCount';
import type { StartScheduledGameFailure } from '@/lib/games/startScheduledGameCore';

type StartRefusal = StartScheduledGameFailure['reason'];

/**
 * Every reason the start can refuse with (#2202). Exhaustive and without a
 * default, like `REFUSAL_STATUS` in the app's start route: a new reason in
 * `startScheduledGameCore` fails tsc here, so the game page's banner list
 * (`START_REFUSAL_CODES`) cannot fall behind. No page keeps its own copy.
 */
const START_REFUSAL: Record<StartRefusal, true> = {
  not_found: true,
  not_scheduled: true,
  tee_missing: true,
  tee_missing_rating: true,
  no_players: true,
  pending_players: true,
  incomplete_sides: true,
  decided_by_withdrawal: true,
  cup_finished: true,
  unassigned_teams: true,
  unassigned_flights: true,
  rotation_player_count: true,
  db_players: true,
  db_game: true,
};

export const START_REFUSAL_CODES = Object.keys(START_REFUSAL) as StartRefusal[];

/**
 * The one home for «start refusal → message key and values» in
 * `admin.game.errors` (#2202, AGENTS.md trap 4). `rotation_player_count` with a
 * known format picks the format's sentence and carries the active count
 * (#969 / #2071); every other code is its own key. `count` takes the URL's text
 * and a plain number alike.
 *
 * If `key` is not in the catalog, the caller decides what to show: the game
 * page shows `unknown`, the Sekretariat shows no banner.
 */
export function startErrorMessageArgs({
  code,
  mode,
  count,
}: {
  code: string;
  mode?: string;
  count?: string | number;
}): { key: string; values: { count?: number } } {
  if (code === 'rotation_player_count' && mode !== undefined && isStartCountMode(mode)) {
    return { key: `rotation_player_count_${mode}`, values: { count: Number(count ?? 0) } };
  }
  return { key: code, values: {} };
}
