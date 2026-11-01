import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { afterLogin } from '@/lib/auth/afterLogin';
import { isInviteToken } from '@/lib/auth/getInviteLoginContext';
import { isRosterLocked } from '@/lib/games/status';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * The invitation link in the app (#2748), for someone who is logged in. The mail
 * opens the app, and opening is accepting, as logging in with the link is on the
 * web. The rules for what an invitation gives live in `afterLogin`, the same steps
 * a login runs. This decides whether to run them, and reads what came of it.
 *
 * `email` and `userId` must come from the caller's verified token. An invitation to
 * another address tells the caller nothing about the round.
 *
 * `afterLogin` runs only for this invitation while it is open, on someone not on
 * the list, and never for a team invitation. It stays open on purpose until the
 * captain's flow on the web takes it, and every `afterLogin` would notify again
 * (`notify` has no dedupe). A consumed invitation is a no-op there. So a second tap
 * on the link writes nothing and notifies nobody.
 *
 * Returns `null` for a token that doesn't exist. A read error throws: it is not «no
 * such invitation» (#1863).
 */
export type OpenInvitationResult =
  | { status: 'in_game'; gameId: string }
  | { status: 'started' | 'no_game' | 'other_account' };

type InvitationRow = {
  email: string;
  game_id: string | null;
  accepted_at: string | null;
  expires_at: string;
};

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function isOnRoster(gameId: string, userId: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`openInvitation: roster read failed: ${error.message}`);
  return data !== null;
}

export async function openInvitation(
  client: SupabaseClient<Database>,
  { token, userId, email }: { token: string; userId: string; email: string },
): Promise<OpenInvitationResult | null> {
  if (!isInviteToken(token)) return null;

  const admin = getAdminClient();
  const { data: invitation, error } = await admin
    .from('invitations')
    .select('email, game_id, accepted_at, expires_at')
    .eq('token', token)
    .maybeSingle<InvitationRow>();
  if (error) throw new Error(`openInvitation: invitation read failed: ${error.message}`);
  if (!invitation) return null;
  if (!sameAddress(invitation.email, email)) return { status: 'other_account' };

  const open = invitation.accepted_at === null && Date.parse(invitation.expires_at) > Date.now();
  const gameId = invitation.game_id;
  if (!gameId) {
    if (open) await afterLogin(client, { userId, email });
    return { status: 'no_game' };
  }

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('status, registration_type')
    .eq('id', gameId)
    .maybeSingle<{ status: string; registration_type: string }>();
  if (gameError) throw new Error(`openInvitation: game read failed: ${gameError.message}`);

  // Same test as `afterLogin`: `both` counts as a team game there.
  const teamScoped = game?.registration_type === 'team' || game?.registration_type === 'both';
  let onRoster = await isOnRoster(gameId, userId);
  if (open && !teamScoped && !onRoster) {
    await afterLogin(client, { userId, email });
    onRoster = await isOnRoster(gameId, userId);
  }

  // A draft is hidden from everyone but the organiser, also with a roster spot (#2445).
  if (!game || game.status === 'draft') return { status: 'no_game' };
  if (onRoster) return { status: 'in_game', gameId };
  return isRosterLocked(game.status) ? { status: 'started' } : { status: 'no_game' };
}
