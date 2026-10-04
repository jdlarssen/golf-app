import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { isStructuralBlockReason } from '@/lib/notifications/autoStartBlocked';
import { readStartBlock } from './startScheduledGameCore';
import type { StartBlock } from './startBlockReason';

/**
 * #2204: why the organiser's scheduled round would not start right now, read
 * without starting it. Only what the organiser can fix counts (a structural
 * reason). Service role, like E1 and the spectate-token read: the caller has
 * settled that the viewer is the creator, and the roster under RLS is not
 * guaranteed whole for an organiser (the #366 trap). Under RLS an organiser
 * who does not play gets `users = null` in the roster's `hcp_index` embed, and
 * the `tee_missing_rating` guard then skips every row without a word.
 *
 * One home (#2269): the game home page and «Rundene dine»
 * (`./getArrangedRounds.ts`, `/admin/games`) both read it here.
 */
export async function readCreatorStartBlock(gameId: string): Promise<StartBlock | null> {
  const block = await readStartBlock(getAdminClient(), gameId);
  return block && isStructuralBlockReason(block.reason) ? block : null;
}
