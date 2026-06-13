import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { getFriendConnectionIds } from './getFriendConnectionIds';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

type FriendUserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  profile_completed_at: string | null;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
};

/**
 * Venne-relasjonene til en bruker som `PlayerOption`-rader for kompis-hurtig-
 * legg-til i opprett-veiviseren (#369). Inkluderer både aksepterte venner og
 * folk du har en pending venneforespørsel med (begge retninger), så de kan
 * velges i et spill før forespørselen er besvart. Admin-client fordi users-RLS
 * skjuler relasjoner du aldri har delt et spill med for en vanlig bruker — uten
 * dette ville de ikke vært i veiviserens spiller-liste. Ingen e-post (samme
 * personvern som #435).
 *
 * Best-effort: ved feil returneres tom liste.
 */
export async function getFriendPlayerOptions(
  userId: string,
): Promise<PlayerOption[]> {
  const connectionIds = await getFriendConnectionIds(userId);
  if (connectionIds.length === 0) return [];

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, name, nickname, hcp_index, profile_completed_at, gender, level')
    .in('id', connectionIds)
    .returns<FriendUserRow[]>();
  if (error || !data) {
    if (error) console.error('[getFriendPlayerOptions] lookup failed', error);
    return [];
  }

  return data.map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
    pending: u.profile_completed_at === null,
    gender: u.gender,
    level: u.level,
  }));
}
