/**
 * How long a person waits before asking to join a club again, after their
 * previous request was rejected, or after they left or were removed. The
 * owner's choice in the 2026-11-20 review: «Etter 7 dager». Within the wait,
 * nothing is stored and nobody is notified; the join page says from when the
 * person can ask again.
 *
 * This is the rule's one home: the join action enforces it and the join page
 * reads it to show the date.
 */
export const JOIN_REQUEST_COOLDOWN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the person may ask again, or `null` when they may ask now. `closedAt`
 * is when the previous request or membership ended (ISO timestamp); `null`
 * means there is nothing to wait for.
 */
export function joinRequestWaitUntil(
  closedAt: string | null,
  now: Date = new Date(),
): Date | null {
  if (!closedAt) return null;
  const closed = new Date(closedAt).getTime();
  if (Number.isNaN(closed)) return null;
  const allowedFrom = new Date(closed + JOIN_REQUEST_COOLDOWN_DAYS * DAY_MS);
  return now.getTime() < allowedFrom.getTime() ? allowedFrom : null;
}
