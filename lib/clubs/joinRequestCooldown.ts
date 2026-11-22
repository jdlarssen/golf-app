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
  status: string;
  decided_at: string | null;
  created_at: string;
};

/**
 * When the previous request or membership ended. `decided_at` marks a
 * rejection, and a leave or removal (`stampMembershipClosed`). A requester's
 * own withdrawal cannot set it (the guard trigger in 0107 keeps the decision
 * columns away from the requester's client), so a withdrawn row without it
 * counts from its `created_at`, which the reopen sets: the 7 days then run
 * from the last request, and withdraw-and-ask-again cannot loop.
 */
function closedAtOf(row: JoinRequestClose): string | null {
  if (row.decided_at) return row.decided_at;
  if (row.status === 'withdrawn') return row.created_at;
  return null;
}

/**
 * When the person may ask again, or `null` when they may ask now (no row, a
 * pending row is handled by the caller, or the wait is over).
 */
export function joinRequestWaitUntil(
  row: JoinRequestClose | null,
  now: Date = new Date(),
): Date | null {
  if (!row) return null;
  const closedAt = closedAtOf(row);
  if (!closedAt) return null;
  const closed = new Date(closedAt).getTime();
  if (Number.isNaN(closed)) return null;
  const allowedFrom = new Date(closed + JOIN_REQUEST_COOLDOWN_DAYS * DAY_MS);
  return now.getTime() < allowedFrom.getTime() ? allowedFrom : null;
}
