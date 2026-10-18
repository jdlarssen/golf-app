/**
 * #2570: a guest (`users.is_guest`) cannot log in, and the organiser's pages
 * have no score entry, so a round where every chosen player is a guest has
 * nobody who can enter scores. The owner's choice (C, 18.10): «Man bør jo kun
 * melde på gjester hvis man selv også er meldt på» — such a round stops,
 * whatever the signup mode. This is the rule's one home: the wizard's
 * publish gate and «Klar?» row (`useGameFormState`, `readyChecklist`) and the
 * publish actions (`createGameInternal`, `updateGameInternal`) all read it.
 *
 * - `none`: no players chosen, at least one player with an account, or an
 *   e-mail invitation (the invited person gets an account).
 * - `block`: every chosen player is a guest. Publishing is refused.
 *
 * Pure, no server imports: the client and the server actions both import it.
 */
export type GuestOnlyVerdict = 'none' | 'block';

export function guestOnlyRoster({
  playerIds,
  guestIds,
  inviteEmailCount,
}: {
  playerIds: readonly string[];
  guestIds: ReadonlySet<string>;
  inviteEmailCount: number;
}): GuestOnlyVerdict {
  if (playerIds.length === 0 || inviteEmailCount > 0) return 'none';
  return playerIds.every((id) => guestIds.has(id)) ? 'block' : 'none';
}
