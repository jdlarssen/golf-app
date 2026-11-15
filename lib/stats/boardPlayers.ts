/**
 * Who stands on Tørny's boards (the Toppliste's three tabs, the «Sjeldne slag» card,
 * Æreslista and the club's honour board): one rule, one home.
 *
 * - A guest (shadow user) never does (#1009).
 * - A deleted account never does (#2894): `anonymize_user` renames it «Slettet bruker» and
 *   drops its `notification_preferences` row, so an earlier «no» to «Del sjeldne slag med
 *   alle» is gone and the boards would show «Slettet B.» for good.
 *
 * The reads select {@link BOARD_USER_COLUMNS} on the `users` join and ask this.
 */
export const BOARD_USER_COLUMNS = 'is_guest, deleted_at' as const;

export type BoardUser = { is_guest: boolean; deleted_at: string | null };

export function leftOffTheBoards(user: BoardUser | null | undefined): boolean {
  return user?.is_guest === true || user?.deleted_at != null;
}
