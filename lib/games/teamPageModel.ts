import type {
  AppTeamPageMember,
  AppTeamPagePerson,
  TeamRequestStatus,
} from '@/lib/games/appRoundInviteView';

/**
 * The team page's rules without words (#2840 del 5), for the web's
 * `/signup/[shortId]/team`. Pure (Type A).
 *
 * The drawing v3.1, «3. Lagsiden», is the spec. The rules have one home here:
 * the app's `native/app/src/lib/teamPageModel.ts` re-exports them and wraps
 * the two that take the whole team:
 *  - A free seat is a seat no row holds. A teammate who said no holds no seat
 *    in `addTeamMemberCore`, but keeps a row with «Bytt med en venn», so the
 *    free seats are `teamSize − 1 − rows`.
 *  - «2 av 3 har svart ja»: of those on the team now (the captain and everyone
 *    who has not said no), how many said yes. The captain counts as a yes.
 *  - «•••» is for a teammate who said yes or has not answered: «Send på nytt»
 *    only before an answer, «Gi kapteinsrollen» only after a yes and never for
 *    a guest (0228), «Fjern fra laget» for both.
 */

export type MemberState = 'approved' | 'pending' | 'declined';

/** `rejected` (said no) and `withdrawn` (left) both read «Takket nei». */
export function memberState(status: TeamRequestStatus): MemberState {
  if (status === 'approved') return 'approved';
  if (status === 'pending') return 'pending';
  return 'declined';
}

const RANK: Record<MemberState, number> = { approved: 0, pending: 1, declined: 2 };

/** Yes first, then waiting, then no; otherwise as the server sent them. */
export function orderedMembers<M extends Pick<AppTeamPageMember, 'status'>>(
  members: readonly M[],
): M[] {
  return members
    .map((member, index) => ({ member, index }))
    .sort(
      (a, b) =>
        RANK[memberState(a.member.status)] - RANK[memberState(b.member.status)] ||
        a.index - b.index,
    )
    .map(({ member }) => member);
}

/** Seats no row holds. 0 when the format has no team size. */
export function freeSlotCount(teamSize: number | null, memberRows: number): number {
  if (teamSize === null) return 0;
  return Math.max(0, teamSize - 1 - memberRows);
}

/** «2 av 3 har svart ja»: of those on the team now, how many said yes. */
export function answeredYes(
  captain: Pick<AppTeamPagePerson, 'status'> | null,
  members: readonly Pick<AppTeamPageMember, 'status'>[],
): { yes: number; of: number } {
  const captainIn = captain !== null && memberState(captain.status) !== 'declined' ? 1 : 0;
  const active = members.filter((m) => memberState(m.status) !== 'declined');
  return {
    yes: captainIn + active.filter((m) => m.status === 'approved').length,
    of: captainIn + active.length,
  };
}

export type MenuAction = 'resend' | 'transfer' | 'remove';

/** What «•••» holds for this teammate. Empty: no «•••». */
export function menuActions(
  member: Pick<AppTeamPageMember, 'status' | 'isGuest'>,
): MenuAction[] {
  switch (memberState(member.status)) {
    case 'pending':
      return ['resend', 'remove'];
    case 'approved':
      return member.isGuest ? ['remove'] : ['transfer', 'remove'];
    case 'declined':
      return [];
  }
}

/**
 * You have a team page in the round (#2840): you are the captain, or a teammate
 * who has not said no. The web's signup page links to it («Gå til laget»), and
 * the app's «Se laget» reads the same rule (`hasTeamPage` in the round view).
 */
export function hasTeamPage(
  row: { status: TeamRequestStatus; is_team_captain: boolean; team_request_id: string | null } | null,
): boolean {
  if (!row || (row.status !== 'pending' && row.status !== 'approved')) return false;
  return row.is_team_captain || row.team_request_id != null;
}
