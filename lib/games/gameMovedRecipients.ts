// Who hears that a scheduled round has moved (#2480). Pure, so the «Flytt
// runden» page's name line and the send in `notifyGameMoved` use the same
// rule and the page never promises anything else than what goes out.

export type GameMovedRosterRow = { user_id: string; withdrawn_at: string | null };

/**
 * The players on the roster (not withdrawn, not guests) other than the one who
 * moved the round, in roster order. When someone else than the organiser moves
 * it (an admin), the organiser is told too, also when they do not play: else
 * they would not know their own round has a new time.
 *
 * `excludeIds` is for «Rediger»: players added in the same save get their
 * `invite` and never had an old time to be told about.
 */
export function gameMovedRecipients(input: {
  roster: readonly GameMovedRosterRow[];
  guestIds: ReadonlySet<string>;
  actorUserId: string;
  createdBy: string | null;
  excludeIds?: ReadonlySet<string>;
}): string[] {
  const { roster, guestIds, actorUserId, createdBy, excludeIds } = input;
  const told = (id: string) => id !== actorUserId && !guestIds.has(id) && !excludeIds?.has(id);

  const recipients = new Set<string>();
  for (const r of roster) {
    if (r.withdrawn_at == null && told(r.user_id)) recipients.add(r.user_id);
  }
  if (createdBy != null && told(createdBy)) recipients.add(createdBy);
  return [...recipients];
}
