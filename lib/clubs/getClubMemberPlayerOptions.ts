import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { isClubExpired } from '@/lib/clubs/clubStatus';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

type MyClubRow = {
  group_id: string;
  groups: { valid_until: string | null } | { valid_until: string | null }[] | null;
};
type MemberRow = { group_id: string; user_id: string };
type MemberUserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  profile_completed_at: string | null;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
};

export type ClubMemberOptions = {
  /** clubId → medlemmenes user-ids (for picker-filtrering per valgt klubb). */
  memberIdsByClub: Record<string, string[]>;
  /** Medlemmenes `PlayerOption`-rader, e-post-frie, til roster-merge. */
  options: PlayerOption[];
};

const EMPTY: ClubMemberOptions = { memberIdsByClub: {}, options: [] };

/**
 * Klubbmedlemmene i brukerens ikke-utløpte klubber, som picker-kilde for
 * klubb-intent i opprett-veiviseren (#464). Speiler `getFriendPlayerOptions`:
 * admin-client (users-RLS skjuler med-medlemmer du aldri har delt spill med),
 * ingen e-post (#435), best-effort → tomt ved feil.
 *
 * Returnerer både `memberIdsByClub` (til `selectablePlayers`-filtrering) og
 * `options` (slik non-admin-rosteren kan merges, ellers ville medlemmer som
 * ikke er co-players forsvinne fra lista).
 */
export async function getClubMemberPlayerOptions(
  userId: string,
): Promise<ClubMemberOptions> {
  const admin = getAdminClient();

  // 1. Brukerens ikke-utløpte klubber (en frossen klubb tilbyr ikke nye spill).
  const { data: myClubs, error: clubsErr } = await admin
    .from('group_members')
    .select('group_id, groups(valid_until)')
    .eq('user_id', userId)
    .returns<MyClubRow[]>();
  if (clubsErr || !myClubs) {
    if (clubsErr)
      console.error('[getClubMemberPlayerOptions] club lookup failed', clubsErr);
    return EMPTY;
  }
  const clubIds = myClubs
    .filter((r) => {
      const g = Array.isArray(r.groups) ? r.groups[0] ?? null : r.groups;
      return g !== null && !isClubExpired(g.valid_until);
    })
    .map((r) => r.group_id);
  if (clubIds.length === 0) return EMPTY;

  // 2. Alle medlemmer i de klubbene.
  const { data: members, error: membersErr } = await admin
    .from('group_members')
    .select('group_id, user_id')
    .in('group_id', clubIds)
    .returns<MemberRow[]>();
  if (membersErr || !members) {
    if (membersErr)
      console.error('[getClubMemberPlayerOptions] member lookup failed', membersErr);
    return EMPTY;
  }
  const memberIdsByClub: Record<string, string[]> = {};
  const memberUserIds = new Set<string>();
  for (const m of members) {
    (memberIdsByClub[m.group_id] ??= []).push(m.user_id);
    memberUserIds.add(m.user_id);
  }
  if (memberUserIds.size === 0) return { memberIdsByClub, options: [] };

  // 3. Medlemmenes spiller-felt (e-post-fri, #435).
  const { data: users, error: usersErr } = await admin
    .from('users')
    .select('id, name, nickname, hcp_index, profile_completed_at, gender, level')
    .in('id', [...memberUserIds])
    .returns<MemberUserRow[]>();
  if (usersErr || !users) {
    if (usersErr)
      console.error('[getClubMemberPlayerOptions] user lookup failed', usersErr);
    return { memberIdsByClub, options: [] };
  }
  const options: PlayerOption[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
    pending: u.profile_completed_at === null,
    gender: u.gender,
    level: u.level,
  }));

  return { memberIdsByClub, options };
}
