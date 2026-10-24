import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { displayNameForOthers } from '@/lib/users/displayName';
import { getFriendIds } from './getFriendIds';

/** Hvem lenka tilhører, sett fra den som åpner den. */
export type FriendLinkRelation = 'self' | 'already_friends' | 'connectable';

export type FriendLinkView = {
  /** Eierens visningsnavn: navn (med kallenavn), ellers maskert adresse (#2271). */
  name: string;
  relation: FriendLinkRelation;
};

type Owner = { id: string; name: string | null; nickname: string | null; email: string };

/**
 * «Legg til meg»-lenka sett fra den innloggede som åpner den (#369, #2627):
 * ett hjem for nettsidens landingsside og appens `GET /api/friends/link/[code]`.
 *
 * Koden slås opp med admin-klienten: `users.friend_code` er ikke lesbar med
 * brukerens egen sesjon (#2207). Bare visningsnavnet og forholdet går videre,
 * aldri id-en eller adressen, og navnet er maskert på serveren (#2271), fordi
 * alle med lenka ser det. Anonymiserte kontoer finnes ikke her (#1012).
 *
 * `null` når koden er ukjent. Kaster ved en feil i oppslaget, så en feil aldri
 * ser ut som «ukjent kode».
 */
export async function friendLinkView(
  viewerId: string,
  code: string,
): Promise<FriendLinkView | null> {
  const admin = getAdminClient();
  const { data: owner, error } = await admin
    .from('users')
    .select('id, name, nickname, email')
    .eq('friend_code', code)
    .is('deleted_at', null)
    .maybeSingle<Owner>();
  if (error) throw error;
  if (!owner) return null;

  const name = displayNameForOthers(owner) ?? '';
  if (owner.id === viewerId) return { name, relation: 'self' };
  const friendIds = await getFriendIds(viewerId);
  return { name, relation: friendIds.includes(owner.id) ? 'already_friends' : 'connectable' };
}
