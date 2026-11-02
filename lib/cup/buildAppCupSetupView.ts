import type {
  AppCupCandidate,
  AppCupEnrolled,
  AppCupParticipantsView,
  AppCupSetupPlan,
  AppCupSetupView,
} from './appCupSetupView';
import type { AppCupStatus } from './appCupView';
import { normalizeCustomSessions } from './planValidation';
import { groupSideAwardRows, type GroupableSideAwardRow } from './sideAwardRows';

type CupRow = {
  id: string;
  name: string;
  status: string;
  team_1_name: string;
  team_2_name: string;
};

type PlanRow = {
  course_id: string | null;
  tee_box_id: string | null;
  scheduled_tee_off_at: string | null;
  preset_id: string | null;
  custom_sessions: unknown;
  strategy: string | null;
  best_ball_allowance_pct: number | null;
};

/** The same prefill as the web's form (`CupPlanSetup.tsx`). */
function toPlan(row: PlanRow): AppCupSetupPlan {
  const presetId = row.preset_id ?? 'klassisk';
  return {
    courseId: row.course_id,
    teeBoxId: row.tee_box_id,
    teeOffAt: row.scheduled_tee_off_at,
    presetId,
    customSessions: presetId === 'tilpasset' ? normalizeCustomSessions(row.custom_sessions) : null,
    strategy: row.strategy === 'random' ? 'random' : 'handicap',
    bestBallAllowancePct: row.best_ball_allowance_pct,
  };
}

export function buildAppCupSetupView(
  cup: CupRow,
  plan: PlanRow | null,
  sideAwardRows: readonly GroupableSideAwardRow[],
): AppCupSetupView {
  return {
    id: cup.id,
    name: cup.name,
    status: cup.status as AppCupStatus,
    team1Name: cup.team_1_name,
    team2Name: cup.team_2_name,
    plan: plan ? toPlan(plan) : null,
    sideAwards: groupSideAwardRows([...sideAwardRows]),
  };
}

export function buildAppCupParticipantsView(args: {
  cup: CupRow & { short_id: string };
  cap: number | null;
  participants: readonly AppCupEnrolled[];
  candidates: readonly AppCupCandidate[];
}): AppCupParticipantsView {
  const { cup, cap, participants, candidates } = args;
  const taken = new Set(participants.map((player) => player.userId));
  return {
    id: cup.id,
    name: cup.name,
    status: cup.status as AppCupStatus,
    team1Name: cup.team_1_name,
    team2Name: cup.team_2_name,
    shortId: cup.short_id,
    cap,
    participants: [...participants],
    candidates: candidates.filter((candidate) => !taken.has(candidate.userId)),
  };
}
