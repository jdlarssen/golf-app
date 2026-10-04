/**
 * Why a scheduled game cannot start, and which reasons are worth telling
 * anyone about (#2204). One home for the reason-union and its two sets: the
 * start (`startBlockReason`), the cron sweep's «auto-start blokkert»-varsel
 * (`lib/notifications/autoStartBlocked.ts`), the inbox card
 * (`lib/notifications/cardContent.ts`), the game pages and the app.
 *
 * Imports nothing on purpose. `cardContent.ts` runs in the inbox's client
 * bundle, and the app imports this file by path; pulling in the guards
 * (`startBlockReason.ts`) here would drag the whole guard graph along.
 */

/**
 * Something the organiser has to fix before the round can start. The cron
 * sweep sends `auto_start_blocked` for these (#502), and the game pages say
 * which one it is.
 */
export type StructuralBlockReason =
  | 'tee_missing'
  | 'no_players'
  | 'incomplete_sides'
  | 'unassigned_teams'
  | 'unassigned_flights'
  // #969 / #2071: a fixed-count format has too few or too many players.
  | 'rotation_player_count'
  | 'pending_players'
  | 'tee_missing_rating';

/**
 * The match is not meant to start, and there is nothing to fix.
 * - `decided_by_withdrawal` (#1814): a cup match the withdrawal rule already
 *   decided (halved / walkover). The organiser registered the withdrawal.
 * - `cup_finished` (#2214): the match belongs to a cup the organiser finished.
 */
export type SilentBlockReason = 'decided_by_withdrawal' | 'cup_finished';

export type StartBlockReason = StructuralBlockReason | SilentBlockReason;

// A Record, not a list: a new reason fails tsc here until it is classified.
const BLOCK_REASON_KIND: Record<StartBlockReason, 'structural' | 'silent'> = {
  tee_missing: 'structural',
  no_players: 'structural',
  incomplete_sides: 'structural',
  unassigned_teams: 'structural',
  unassigned_flights: 'structural',
  rotation_player_count: 'structural',
  pending_players: 'structural',
  tee_missing_rating: 'structural',
  decided_by_withdrawal: 'silent',
  cup_finished: 'silent',
};

const reasonsOfKind = (kind: 'structural' | 'silent'): ReadonlySet<string> =>
  new Set(
    (Object.keys(BLOCK_REASON_KIND) as StartBlockReason[]).filter(
      (r) => BLOCK_REASON_KIND[r] === kind,
    ),
  );

export const STRUCTURAL_BLOCK_REASONS: ReadonlySet<string> = reasonsOfKind('structural');

export const SILENT_BLOCK_REASONS: ReadonlySet<string> = reasonsOfKind('silent');
