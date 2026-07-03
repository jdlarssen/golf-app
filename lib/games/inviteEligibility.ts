import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { getFriendConnectionIds } from '@/lib/friends/getFriendConnectionIds';
import { getCoPlayerIds } from '@/lib/users/getCoPlayerIds';

/**
 * Bruker-ider en IKKE-admin oppretter har lov til å legge til på et spill-roster
 * fra detalj-/arrangør-invite-flyten (#906, speiler #464-veiviserens scope).
 *
 *     eligible = venne-connections (akseptert + pending, begge retninger)
 *              ∪ co-players (delt minst ett spill)
 *              ∪ klubbmedlemmer av spillets group (når `groupId` er satt)
 *
 * Oppretteren selv er ikke i settet — call-siten tillater alltid `=== inviterUserId`
 * eksplisitt før denne kalles. Settet er **unionen** av alt de legitime invite-UI-ene
 * tilbyr (`getTeamCandidates` = venner ∪ co-players; #464-veiviseren = venner / klubb),
 * så server-guarden aldri avviser en kandidat en scopet picker viste (AGENTS.md felle #4
 * — alle lag enige).
 *
 * Global admin (Sekretariatet) kaller aldri hit — kurator-modellen unntar admin, samme
 * som disposable-email-guarden (#422). Authz-beslutningen er derfor `!ctx.isAdmin`-gatet
 * på call-siten.
 *
 * Best-effort: hver komponent-read returnerer `[]` ved feil (admin-client, users-RLS-
 * bypass). En transient feil **krymper** settet, så guarden feiler safe (avviser,
 * oppretteren kan prøve igjen) i stedet for fail-open.
 */
export async function getInviteEligibleIds(
  creatorUserId: string,
  groupId: string | null,
): Promise<Set<string>> {
  const [friendIds, coPlayerIds, clubMemberIds] = await Promise.all([
    getFriendConnectionIds(creatorUserId),
    getCoPlayerIds(creatorUserId),
    groupId ? getGroupMemberIds(groupId) : Promise.resolve<string[]>([]),
  ]);
  const union = [...new Set([...friendIds, ...coPlayerIds, ...clubMemberIds])];
  if (union.length === 0) return new Set();

  // #1012: anonymiserte kontoer er aldri kvalifiserte. Venne-/klubb-bena tømmes
  // av anonymize_user(), men co-player-benet leser game_players — som bevares
  // ved anonymisering. Uten dette kunne en creator poste en slettet brukers id
  // direkte (pickerne viser dem aldri). Best-effort samme vei som komponent-
  // reads: feiler oppslaget krymper settet til tomt (fail-safe, avviser).
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id')
    .in('id', union)
    .is('deleted_at', null)
    .returns<{ id: string }[]>();
  if (error || !data) {
    if (error) {
      console.error('[getInviteEligibleIds] deleted-filter lookup failed', error);
    }
    return new Set();
  }
  return new Set(data.map((r) => r.id));
}

/**
 * Medlems-ider i én bestemt klubb. Admin-client fordi users-/group_members-RLS
 * ellers skjuler med-medlemmer oppretteren aldri har delt et spill med — uten dette
 * ville legitime klubbmedlemmer falle ut av kvalifiserings-settet. Best-effort.
 */
async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .returns<{ user_id: string }[]>();
  if (error || !data) {
    if (error) {
      console.error('[getInviteEligibleIds] group member lookup failed', error);
    }
    return [];
  }
  return data.map((r) => r.user_id);
}
