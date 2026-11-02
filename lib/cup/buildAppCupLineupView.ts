import type { CupLineupRole, CupParticipantRole } from './captainRoles';
import type {
  AppCupLineupSummary,
  AppCupLineupView,
} from './appCupLineupView';
import type { CupSessionFormat } from './cupTemplates';
import type { CupLineupBoard } from './lineupData';

const CUP_STATUSES: readonly AppCupLineupView['cupStatus'][] = ['draft', 'active', 'finished'];

/**
 * Tavla slik appen får den. `null` for den som ikke har noe der. Rollene på deltakerlista
 * blir ikke med: appen trenger bare å vite om begge lag har kaptein.
 */
export function buildAppCupLineupView(board: CupLineupBoard): AppCupLineupView | null {
  const { role } = board.access;
  if (role.kind === 'none') return null;
  const hasCaptain = (team: 1 | 2) =>
    board.access.participants.some((p) => p.isCaptain && p.teamNumber === team);
  return {
    role: role.kind,
    myTeam: role.kind === 'captain' ? role.teamNumber : null,
    cupName: board.cupName,
    cupStatus: CUP_STATUSES.find((status) => status === board.cupStatus) ?? 'draft',
    team1Name: board.teamNames[1],
    team2Name: board.teamNames[2],
    bothCaptains: hasCaptain(1) && hasCaptain(2),
    hasDefaultWeights: board.hasDefaultWeights,
    plannedMatchCount: board.plannedMatchCount,
    pointsToWin: board.pointsToWin,
    matchCount: board.matchCount,
    pendingSlotCount: board.pendingSlotCount,
    squads: { team1: board.squads[1], team2: board.squads[2], unassigned: board.squads.unassigned },
    sessions: board.sessions.map((session) => ({
      id: session.id,
      sessionIndex: session.sessionIndex,
      format: session.format,
      slotCount: session.slotCount,
      revealedAt: session.revealedAt,
      teams: [
        { teamNumber: 1, submittedAt: session.teams[0].submittedAt, slots: session.teams[0].slots },
        { teamNumber: 2, submittedAt: session.teams[1].submittedAt, slots: session.teams[1].slots },
      ],
    })),
  };
}

/**
 * Det cup-rommet viser om uttaket, samme regler som `CupLineupDoor` og `CupLineupSpotlight`
 * på nettet. Radene har ingen plasser: de leses ikke for rommet i det hele tatt.
 */
export function appCupLineupSummary(input: {
  role: CupLineupRole;
  participants: CupParticipantRole[];
  sessions: { format: string; slot_count: number; revealed_at: string | null }[];
  finished: boolean;
}): AppCupLineupSummary {
  const { role, participants, sessions, finished } = input;
  const revealed = sessions.filter((s) => s.revealed_at !== null);
  const latest = revealed[revealed.length - 1];
  const hasPending = sessions.some((s) => s.revealed_at === null);
  const hasCaptain = participants.some((p) => p.isCaptain);

  let door: AppCupLineupSummary['door'] = null;
  if (!finished && role.kind === 'organizer' && (hasCaptain || hasPending)) {
    door = { kind: 'organizer', sessionCount: sessions.length };
  } else if (!finished && role.kind === 'captain' && hasPending) {
    door = { kind: 'captain' };
  }

  return {
    door,
    revealed: latest ? { format: latest.format as CupSessionFormat, slotCount: latest.slot_count } : null,
  };
}
