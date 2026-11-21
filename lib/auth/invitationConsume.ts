import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Which open invitations a login and a code request touch (0252).
 *
 * «Legg til venn på e-post» writes one game-less invitation for every address,
 * also when the address already has an account. That person gets a friend
 * request to answer, and the invitation is only the sender's receipt: it must
 * stay exactly as it was written, so it neither turns into a friendship nor
 * shows the sender that the address has an account. It runs out on its own.
 *
 * Such a row carries a mark in `invitation_receipts`. The mark is set by
 * `friend_request_by_email` in the database and by nothing else, and only the
 * service role reads it. Nothing a signed-in client can write (a row, a
 * timestamp) decides this.
 */

/** Drops the marked rows. Pure, so the rule can be tested without the reads. */
export function withoutReceipts<T extends { id: string }>(
  invitations: T[],
  receiptIds: ReadonlySet<string>,
): T[] {
  return invitations.filter((inv) => !receiptIds.has(inv.id));
}

/**
 * The invitations a login or a code request may touch: every game invitation,
 * and the game-less ones without a receipt mark. `admin` is the service
 * client.
 *
 * Fails closed: when the marks cannot be read, no game-less invitation is
 * returned. They stay open and untouched, and the next login tries again.
 */
export async function withoutReceiptInvitations<T extends { id: string; game_id: string | null }>(
  admin: SupabaseClient<Database>,
  invitations: T[],
  logPrefix: string,
): Promise<T[]> {
  const gameLessIds = invitations.filter((inv) => inv.game_id === null).map((inv) => inv.id);
  if (gameLessIds.length === 0) return invitations;

  const { data, error } = await admin
    .from('invitation_receipts')
    .select('invitation_id')
    .in('invitation_id', gameLessIds)
    .returns<{ invitation_id: string }[]>();
  if (error || !data) {
    console.error(`[${logPrefix}] receipt marks lookup failed`, error);
    return invitations.filter((inv) => inv.game_id !== null);
  }
  return withoutReceipts(invitations, new Set(data.map((row) => row.invitation_id)));
}
