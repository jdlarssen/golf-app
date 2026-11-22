/**
 * How long a person waits before asking to join a club again, after their
 * previous request was rejected or withdrawn, or after they left or were
 * removed. The owner's choice in the 2026-11-20 review: «Etter 7 dager».
 * Within the wait, nothing is stored and nobody is notified; the join page
 * says from when the person can ask again.
 *
 * This is the rule's one home: the join action enforces it and the join page
 * reads it to show the date.
 */
export const JOIN_REQUEST_COOLDOWN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The person's join-request row, as far as the wait needs it. */
export type JoinRequestClose = {
  decided_at: string | null;
};

/**
 * When the person may ask again, or `null` when they may ask now (no row, no
 * close time, or the wait is over). A pending row is the caller's to handle.
 */
export function joinRequestWaitUntil(
  row: JoinRequestClose | null,
  now: Date = new Date(),
): Date | null {
  // decided_at marks every close: a rejection (decide_join_request), a leave
  // or a removal (`stampMembershipClosed`), and the requester's own
  // withdrawal (stamped by the guard trigger, migration 0255, which also
  // keeps created_at out of the requester's hands). A row without it (a
  // withdrawal from before 0255) has nothing to wait for.
  if (!row?.decided_at) return null;
  const closed = new Date(row.decided_at).getTime();
  if (Number.isNaN(closed)) return null;
  const allowedFrom = new Date(closed + JOIN_REQUEST_COOLDOWN_DAYS * DAY_MS);
  return now.getTime() < allowedFrom.getTime() ? allowedFrom : null;
}
