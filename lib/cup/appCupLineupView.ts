import type { CupTeamNumber } from './captainRoles';
import type { CupSessionFormat } from './cupTemplates';
import type { LineupSlotRow } from './lineupValidation';

/**
 * Wire-typene for kaptein-uttaket i appen (#2752). Ruta er `GET /api/cup/{id}/lineup`,
 * og den svarer bare arrangøren og kapteinene.
 *
 * `slots: null` betyr «ikke synlig for deg», aldri «tomt». Hemmeligheten står i
 * `loadCupLineupBoardFor`, og viewet er bygd av det den slapp gjennom.
 */

export type AppCupLineupPlayer = {
  userId: string;
  displayName: string;
  hcpIndex: number;
};

export type AppCupLineupTeam = {
  teamNumber: CupTeamNumber;
  submittedAt: string | null;
  slots: LineupSlotRow[] | null;
};

export type AppCupLineupSession = {
  id: string;
  sessionIndex: number;
  format: CupSessionFormat;
  slotCount: number;
  revealedAt: string | null;
  teams: [AppCupLineupTeam, AppCupLineupTeam];
};

export type AppCupLineupView = {
  role: 'organizer' | 'captain';
  /** Kapteinens lag. `null` for arrangøren, som kan skrive begge. */
  myTeam: CupTeamNumber | null;
  cupName: string;
  cupStatus: 'draft' | 'active' | 'finished';
  team1Name: string;
  team2Name: string;
  bothCaptains: boolean;
  /** Vektede cuper har ikke noe «først til X», og får ikke spørsmålet om planlagt antall. */
  hasDefaultWeights: boolean;
  plannedMatchCount: number | null;
  pointsToWin: number | null;
  matchCount: number;
  pendingSlotCount: number;
  squads: { team1: AppCupLineupPlayer[]; team2: AppCupLineupPlayer[]; unassigned: AppCupLineupPlayer[] };
  sessions: AppCupLineupSession[];
};

/** Veien inn fra cup-rommet. Arrangøren ser antall økter, kapteinen at laget skal settes. */
export type AppCupLineupDoor = { kind: 'organizer'; sessionCount: number } | { kind: 'captain' };

/**
 * Det cup-rommet viser om uttaket. Det ligger i `GET /api/cup/{id}`, som alle med tilgang
 * til cupen leser, så det sier bare format og antall i det som alt er avdekket.
 */
export type AppCupLineupSummary = {
  door: AppCupLineupDoor | null;
  revealed: { format: CupSessionFormat; slotCount: number } | null;
};
