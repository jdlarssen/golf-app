import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

type MemberRow = { user_id: string };
type MemberUserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  profile_completed_at: string | null;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
};

/**
 * Klubbmedlemmene i ÉN bestemt klubb som picker-kilde (#480 Fase 1, klubb-liga).
 *
 * Skiller seg fra `getClubMemberPlayerOptions(userId)` ved at den er scopet til
 * en oppgitt `clubId` framfor kallerens egne klubber — en global admin som ikke
 * selv er medlem av målklubben skal likevel kunne hente klubbens medlemmer ved
 * opprettelse av en klubb-liga. Speiler ellers samme mønster: admin-client,
 * e-post-fri (#435), best-effort → tom liste ved feil.
 */
export async function getClubMemberOptionsForClub(
  clubId: string,
): Promise<PlayerOption[]> {
  const admin = getAdminClient();

  const { data: members, error: membersErr } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', clubId)
    .returns<MemberRow[]>();
  if (membersErr || !members) {
    if (membersErr)
      console.error('[getClubMemberOptionsForClub] member lookup failed', membersErr);
    return [];
  }
  const memberUserIds = members.map((m) => m.user_id);
  if (memberUserIds.length === 0) return [];

  const { data: users, error: usersErr } = await admin
    .from('users')
    .select('id, name, nickname, hcp_index, profile_completed_at, gender, level')
    .in('id', memberUserIds)
    .returns<MemberUserRow[]>();
  if (usersErr || !users) {
    if (usersErr)
      console.error('[getClubMemberOptionsForClub] user lookup failed', usersErr);
    return [];
  }

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
    pending: u.profile_completed_at === null,
    gender: u.gender,
    level: u.level,
  }));
}
