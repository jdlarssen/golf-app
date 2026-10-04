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

/**
 * The slice of next-intl's `admin.game.errors` translator this file needs. The
 * parameters are `never` so the catalog-typed translator fits without a cast
 * at every call site; the key comes from `startErrorMessageArgs` and is
 * checked with `has` before use, as on the two pages.
 */
export type StartErrorTranslator = {
  (key: never, values: never): string;
  has(key: never): boolean;
};

/**
 * The `admin.game.errors` sentence for a start block read without starting
 * (#2204): the Sekretariat's start card and the organiser's notice on the game
 * page say exactly what a refused «Start runden nå» would say. Same rule as
 * the `?error=` banners, via `startErrorMessageArgs`.
 *
 * Synchronous, and `list` comes resolved: the e-post list for `pending_players`
 * is only built behind `requireAdmin` (`pendingPlayerList`), and the game page
 * passes ''. `undefined` when the catalog has no sentence for the key.
 */
export function startBlockMessage(
  block: { reason: string; rotationMode?: string; rotationActiveCount?: number },
  list: string,
  tErrors: StartErrorTranslator,
): string | undefined {
  const args = startErrorMessageArgs({
    code: block.reason,
    mode: block.rotationMode,
    count: String(block.rotationActiveCount ?? 0),
  });
  const key = args.key as never;
  if (!tErrors.has(key)) return undefined;
  return tErrors(key, { ...args.values, list } as never);
}
