/**
 * #2570: a guest (`users.is_guest`) cannot log in, and the organiser's pages
 * have no score entry, so a round where every chosen player is a guest has
 * nobody who can enter scores. This is the rule's one home: the wizard's
 * publish gate and «Klar?» row (`useGameFormState`, `readyChecklist`) and the
 * publish actions (`createGameInternal`, `updateGameInternal`) all read it.
 *
 * - `none`: no players chosen, at least one player with an account, or an
 *   e-mail invitation (the invited person gets an account).
 * - `warn`: only guests, but others can still sign up themselves
 *   (`rosterOptional`, see `rosterOptionalAtPublish`): open signup, approval,
 *   or a club tournament with individual signup.
 * - `block`: only guests and nobody else can join. Publishing is refused.
 *
 * Pure, no server imports: the client and the server actions both import it.
 */
export type GuestOnlyVerdict = 'none' | 'warn' | 'block';

export function guestOnlyRoster({
  playerIds,
  guestIds,
  inviteEmailCount,
  rosterOptional,
}: {
  playerIds: readonly string[];
  guestIds: ReadonlySet<string>;
  inviteEmailCount: number;
  rosterOptional: boolean;
}): GuestOnlyVerdict {
  if (playerIds.length === 0 || inviteEmailCount > 0) return 'none';
  if (!playerIds.every((id) => guestIds.has(id))) return 'none';
  return rosterOptional ? 'warn' : 'block';
}
