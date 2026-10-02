import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { inviteEmailToGameCore } from '@/lib/games/inviteToGame';

/**
 * Send the wizard's e-mail invitations once a game is published (#2321).
 *
 * The organiser types the addresses on step 4; they live in the wizard's state
 * until the game exists, because `inviteEmailToGameCore` needs a saved game.
 * Each address runs through the same core as «Inviter på e-post» on the game's
 * page: a known account goes straight onto the roster, an unknown address gets
 * an `invitations` row and a mail.
 *
 * Best-effort, like the publish notifications: one failed address never stops
 * the publish. A refusal (`ok: false`) and a rejected promise both count as a
 * failure, and the caller shows the «invites_failed» banner. Never throws.
 *
 * **Authz lies with the caller** (the core's file header): both callers have
 * gated before this — `createGameInternal` because the logged-in user has just
 * inserted the game with `created_by` = themselves, `updateGameInternal` with
 * `requireAdminOrCreator`. `client` and `viewer` are the action's own
 * `getServerClient()`, never the service client: as `viewer` it would see
 * every account and put each registered address straight on the roster.
 */
export async function sendPublishInvites(params: {
  client: SupabaseClient<Database>;
  viewer: SupabaseClient<Database>;
  gameId: string;
  inviterUserId: string;
  inviterName: string | null;
  isAdmin: boolean;
  emails: readonly string[];
}): Promise<{ failed: number }> {
  const { emails, ...rest } = params;
  if (emails.length === 0) return { failed: 0 };

  const results = await Promise.allSettled(
    emails.map((rawEmail) => inviteEmailToGameCore({ ...rest, rawEmail })),
  );

  let failed = 0;
  for (const result of results) {
    if (result.status === 'rejected') {
      failed += 1;
      // No address in the log: the reason is enough to find the failure.
      console.error('[sendPublishInvites] invite threw', {
        gameId: params.gameId,
        error: result.reason,
      });
    } else if (!result.value.ok) {
      failed += 1;
      console.error('[sendPublishInvites] invite refused', {
        gameId: params.gameId,
        reason: result.value.reason,
      });
    }
  }
  return { failed };
}
