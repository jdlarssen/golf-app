import type { DeleteCheckOutcome } from '@/lib/users/deleteAccount';

/**
 * What the admin player page shows in its danger zone: the «Slett spiller»
 * link, or the reason it is not there.
 *
 * The rule itself has one home, `getDeleteBlockReason` — the same answer the
 * delete page and the delete action act on. Before the 2026-11-20 audit the
 * detail page had its own rule («has played → no link»), so an admin could
 * never reach the delete flow for a player with history, though the flow
 * anonymises such players. This maps the shared answer to a message key in
 * `admin.players.profile`; `null` is the only outcome that shows the link.
 */
export type DeleteBlockMessageKey =
  | 'deleteBlockSelf'
  | 'deleteBlockAdmin'
  | 'errors.target_active'
  | 'errors.target_sole_club_owner'
  | 'deleteBlockCheckFailed';

export function deleteBlockMessageKey(
  isSelf: boolean,
  outcome: DeleteCheckOutcome,
): DeleteBlockMessageKey | null {
  if (isSelf) return 'deleteBlockSelf';
  switch (outcome) {
    case null:
      return null;
    case 'admin_account':
      return 'deleteBlockAdmin';
    case 'active_engagements':
      return 'errors.target_active';
    case 'sole_club_owner':
      return 'errors.target_sole_club_owner';
    case 'check_failed':
      return 'deleteBlockCheckFailed';
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled delete check outcome: ${String(unhandled)}`);
    }
  }
}
