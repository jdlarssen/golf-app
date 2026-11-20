/**
 * Which open invitations a login takes (0252).
 *
 * «Legg til venn på e-post» writes one game-less invitation for every address,
 * also when the address already has an account. That person gets a friend
 * request to answer, and the invitation is only the sender's receipt: a login
 * leaves it alone, so it neither turns into a friendship nor shows the sender
 * that the address has an account. It runs out on its own.
 *
 * A game-less invitation that is older than the account is the ordinary case:
 * the person joined after being invited, and the login takes it.
 *
 * Pure, so the rule can be tested without the login around it.
 */
export function isReceiptForExistingAccount(
  invitation: { game_id: string | null; created_at: string },
  accountCreatedAt: string | null,
): boolean {
  if (invitation.game_id !== null) return false;
  if (!accountCreatedAt) return false;
  return Date.parse(accountCreatedAt) < Date.parse(invitation.created_at);
}

/** The open invitations a login takes, given the account they belong to. */
export function withoutReceiptsForExistingAccount<
  T extends { game_id: string | null; created_at: string },
>(invitations: T[], account: { created_at: string } | null | undefined): T[] {
  const accountCreatedAt = account?.created_at ?? null;
  return invitations.filter((inv) => !isReceiptForExistingAccount(inv, accountCreatedAt));
}
