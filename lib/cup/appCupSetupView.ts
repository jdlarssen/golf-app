import type { AppCupStatus } from './appCupView';
import type { CupSessionFormat } from './cupTemplates';
import type { CupJoinDecision } from './joinValidation';
import type { SideAwardConfigInput } from './sideAwardRows';

/**
 * What the app gets to set up a cup and to join one (#2752). The rules and the writes
 * are on the server (`setupCore.ts`, `sideAwardCore.ts`, `cupJoinCore.ts`), the same
 * ones the web uses. Only types, so the app can read this with a relative path.
 */

export type AppCupSetupPlan = {
  courseId: string | null;
  teeBoxId: string | null;
  /** UTC. `null`: the organiser starts the rounds by hand. */
  teeOffAt: string | null;
  presetId: string;
  /** Only for a draft set up on the web with its own sessions, sent back as is. */
  customSessions: CupSessionFormat[] | null;
  strategy: 'handicap' | 'random';
  bestBallAllowancePct: number | null;
};

export type AppCupSetupView = {
  id: string;
  name: string;
  status: AppCupStatus;
  team1Name: string;
  team2Name: string;
  plan: AppCupSetupPlan | null;
  /** One row per kind and hole, as the web's form has them. */
  sideAwards: SideAwardConfigInput[];
};

export type AppCupParticipant = { userId: string; name: string; hcpIndex: number };

/** On the list, with the team and captain the organiser has set. */
export type AppCupEnrolled = AppCupParticipant & { teamNumber: 1 | 2 | null; isCaptain: boolean };

/** `pending`: a friend without a finished profile, shown but not selectable. */
export type AppCupCandidate = AppCupParticipant & { pending: boolean };

export type AppCupParticipantsView = {
  id: string;
  name: string;
  status: AppCupStatus;
  team1Name: string;
  team2Name: string;
  /** Builds the link to share. */
  shortId: string;
  /** `null`: a club cup or a global admin, with no cap. */
  cap: number | null;
  participants: AppCupEnrolled[];
  /** Empty once the cup has started: the list is locked then. */
  candidates: AppCupCandidate[];
};

export type AppCupJoinView = {
  decision: CupJoinDecision;
  cup: { id: string; name: string; team1Name: string; team2Name: string };
  courseName: string | null;
  /** Oslo time, from the server: Hermes has no time zones. */
  when: { date: string; time: string } | null;
  /** The player cap in «full». */
  cap: number;
  /** Only when the answer is `not_member`. */
  club: { name: string; shortId: string } | null;
  /** The same rule as the cup's page: a club cup is closed to outsiders. */
  canOpenCup: boolean;
};

export type CupSetupCreateBody = {
  name: string;
  team1Name: string;
  team2Name: string;
  /** Empty: the database's 1 and 0.5 apply. */
  winPoints: string;
  tiePoints: string;
};

export type CupSetupPlanBody = {
  courseId: string;
  teeBoxId: string;
  teeOffAt: string | null;
  presetId: string;
  customSessions: CupSessionFormat[] | null;
  strategy: 'handicap' | 'random';
  bestBallAllowancePct: number | null;
};
