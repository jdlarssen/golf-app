// native/app/src/lib/teamPageModel.ts
// #2840 del 3: lagsiden i appen, som regler uten tekst. Ren og I/O-fri (Type A).
//
// Tegningen v3.1, «3. Lagsiden», er fasiten:
//  - Oppstillingen: kapteinen først med merket, så medspillerne, så de ledige
//    plassene stiplet. Den som venter på svar eller har takket nei, står blek.
//  - En ledig plass er en plass ingen rad holder. En som har takket nei, holder ingen
//    plass hos serveren (`addTeamMemberCore`), men har sin egen rad med «Bytt med en
//    venn». Ledige plasser er derfor `teamSize − 1 − medspillere`, der alle radene teller.
//  - «2 av 3 har svart ja»: de som er med på laget nå (kapteinen og de som ikke har
//    takket nei), og av dem de som har sagt ja. Kapteinen har meldt på laget og teller
//    som et ja.
//  - «•••» står for den som har sagt ja eller ikke har svart. «Send på nytt» bare for
//    den som ikke har svart, «Gi kapteinsrollen» bare for den som har sagt ja og ikke er
//    gjest (0228), og «Fjern fra laget» for begge.
import type {
  AppTeamPageMember,
  AppTeamPageTeam,
  TeamRequestStatus,
} from '../../../../lib/games/appRoundInviteView';

export type MemberState = 'approved' | 'pending' | 'declined';

/** `rejected` (sa nei) og `withdrawn` (trakk seg) er begge «Takket nei». */
export function memberState(status: TeamRequestStatus): MemberState {
  if (status === 'approved') return 'approved';
  if (status === 'pending') return 'pending';
  return 'declined';
}

const RANK: Record<MemberState, number> = { approved: 0, pending: 1, declined: 2 };

/** Medspillerne i rekkefølgen tegningen har: ja, venter, nei. Ellers som serveren sendte dem. */
export function orderedMembers(members: readonly AppTeamPageMember[]): AppTeamPageMember[] {
  return members
    .map((member, index) => ({ member, index }))
    .sort((a, b) => RANK[memberState(a.member.status)] - RANK[memberState(b.member.status)] || a.index - b.index)
    .map(({ member }) => member);
}

/** Plassene ingen rad holder. 0 når formatet ikke har en lagstørrelse. */
export function freeSlotCount(team: Pick<AppTeamPageTeam, 'game' | 'members'>): number {
  const size = team.game.teamSize;
  if (size === null) return 0;
  return Math.max(0, size - 1 - team.members.length);
}

/** «2 av 3 har svart ja»: av dem som er med på laget nå, hvor mange som har sagt ja. */
export function answeredYes(team: Pick<AppTeamPageTeam, 'captain' | 'members'>): { yes: number; of: number } {
  const captainIn = team.captain !== null && memberState(team.captain.status) !== 'declined' ? 1 : 0;
  const active = team.members.filter((m) => memberState(m.status) !== 'declined');
  return {
    yes: captainIn + active.filter((m) => m.status === 'approved').length,
    of: captainIn + active.length,
  };
}

export type MenuAction = 'resend' | 'transfer' | 'remove';

/** Det «•••» har for akkurat denne medspilleren. Tom: ingen «•••». */
export function menuActions(member: Pick<AppTeamPageMember, 'status' | 'isGuest'>): MenuAction[] {
  switch (memberState(member.status)) {
    case 'pending':
      return ['resend', 'remove'];
    case 'approved':
      return member.isGuest ? ['remove'] : ['transfer', 'remove'];
    case 'declined':
      return [];
  }
}

export type LineupEntry =
  | { kind: 'person'; key: string; userId: string; name: string | null; isYou: boolean; captain: boolean; faded: boolean }
  | { kind: 'free'; key: string };

/**
 * Oppstillingen: kapteinen, medspillerne (du blant dem når du ikke er kapteinen) og de
 * ledige plassene. `faded` er den som venter på svar eller har takket nei.
 */
export function teamLineup(team: AppTeamPageTeam): LineupEntry[] {
  const entries: LineupEntry[] = [];
  if (team.captain) {
    entries.push({
      kind: 'person',
      key: team.captain.requestId,
      userId: team.captain.userId,
      name: team.captain.displayName,
      isYou: team.kind === 'captain' || team.captain.requestId === team.myRowId,
      captain: true,
      faded: false,
    });
  }
  for (const member of orderedMembers(team.members)) {
    entries.push({
      kind: 'person',
      key: member.requestId,
      userId: member.userId,
      name: member.displayName,
      isYou: member.requestId === team.myRowId,
      captain: false,
      faded: member.status !== 'approved',
    });
  }
  for (let i = 0; i < freeSlotCount(team); i++) entries.push({ kind: 'free', key: `free-${i}` });
  return entries;
}

/** Kan kapteinen endre laget nå? Ikke når arrangøren har stengt påmeldingen. */
export function canEditTeam(team: Pick<AppTeamPageTeam, 'kind' | 'game'>): boolean {
  return team.kind === 'captain' && !team.game.signupsClosed;
}
