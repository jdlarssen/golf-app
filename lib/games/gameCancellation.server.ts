import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { cancellationRecipients, type CancellationRosterRow } from './gameCancellation';

export type CancellationRecipient = CancellationRosterRow & { locale: string | null };

type RosterRow = {
  user_id: string;
  withdrawn_at: string | null;
  users: { name: string | null; is_guest: boolean; deleted_at: string | null; locale: string | null } | null;
};

/**
 * #2481: the players who get the cancellation notice for `gameId`, in the
 * page's order (`cancellationRecipients`). Both delete pages show them, and
 * `deleteGame` reads them again itself before it deletes (the cascade takes
 * `game_players` with it) and never trusts the form.
 *
 * Service role: an organiser who does not play sees no one else's `users`
 * row («users select own or shared games» needs a shared game). Every caller
 * is gated on `requireAdminOrCreator` first. Throws on a read error, so a
 * failed read never looks like «no one to tell».
 */
export async function loadCancellationRecipients(
  gameId: string,
  actorId: string,
): Promise<CancellationRecipient[]> {
  const { data, error } = await getAdminClient()
    .from('game_players')
    .select('user_id, withdrawn_at, users!game_players_user_id_fkey(name, is_guest, deleted_at, locale)')
    .eq('game_id', gameId)
    .returns<RosterRow[]>();
  if (error) throw error;

  return cancellationRecipients(
    (data ?? []).map((r) => ({
      userId: r.user_id,
      name: r.users?.name ?? null,
      // A row without its user is no one we can reach.
      isGuest: r.users?.is_guest ?? true,
      deletedAt: r.users?.deleted_at ?? null,
      withdrawnAt: r.withdrawn_at,
      locale: r.users?.locale ?? null,
    })),
    actorId,
  );
}
