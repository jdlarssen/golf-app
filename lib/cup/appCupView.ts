/**
 * The cup as the app reads it (#2752): the wire shapes of `GET /api/cup` and
 * `GET /api/cup/[id]`. The server builds them (`buildAppCupView.ts`); the app
 * only renders them and never computes points or a winner itself.
 *
 * Types only, importing nothing that is not pure: the native app imports this
 * file by relative path.
 *
 * **Nothing about the result before the cup is finished.** The owner's rule
 * from #1468: the cup page shows the matches without results, and the result
 * comes when the organiser ends the cup. `results` and every match's `outcome`
 * are `null` until then, so a player reading the response learns no more than
 * the screen shows.
 */
import type { CupMvpAward, CupUnderperformerAward } from './computeCupAwards';
import type { CupPlayerPointsRow } from './computeCupPlayerPoints';
import type { CupMatchStatusKey } from './cupMatchStatusLabel';
import type { CupSideAwardHoleGroup } from './sideAwardDetails';

export type AppCupStatus = 'draft' | 'active' | 'finished';

/** «X av N kamper spilt» (`cupProgress`). */
export type AppCupProgress = { played: number; total: number };

/** One cup on the app's Home («Cupene dine»). */
export type AppCupSummary = {
  id: string;
  name: string;
  status: Extract<AppCupStatus, 'draft' | 'active'>;
  /** `null` when the cup could not be read, as in the Klubbhus room. */
  progress: AppCupProgress | null;
};

export type AppCupListResponse = { cups: AppCupSummary[] };

export type AppCupMatchStatus = CupMatchStatusKey | 'playOnPending';

/** A match's result. Only on a finished match in a finished cup. */
export type AppCupMatchOutcome = {
  points1: number;
  points2: number;
  tied: boolean;
  /** «3&2». `null` when no result was computed. */
  formatted: string | null;
  /** The side's name: the team in team formats, the player in singles. */
  winnerName: string | null;
};

export type AppCupMatch = {
  gameId: string;
  /** «Greensome 1». `null` falls back to the app's own word for a match. */
  label: string | null;
  side1: string;
  side2: string;
  status: AppCupMatchStatus;
  /** Who withdrew, for «Halvert: Kari trakk seg». Empty otherwise. */
  withdrawnName: string;
  /** The team that got a walkover. Empty otherwise. */
  walkoverTeam: string;
  /** The partner playing on alone, or `null`. */
  soloPartnerName: string | null;
  /** The caller plays this match. Their own come first in the room. */
  mine: boolean;
  /**
   * RLS lets the caller read this game, so the app can open it: a player their
   * own once it is out of draft, the creator and a global admin all of them
   * (#1542). The answer comes from RLS itself, not from a copy of the rule.
   */
  canOpen: boolean;
  outcome: AppCupMatchOutcome | null;
};

export type AppCupPlayerGroup = {
  team: 1 | 2;
  teamName: string;
  rows: CupPlayerPointsRow[];
};

/** The result page (`/cup/[id]/resultater`). `null` until the cup is finished. */
export type AppCupResults = {
  winner: 1 | 2 | null;
  winnerName: string | null;
  team1Points: number;
  team2Points: number;
  /** `null` for a cup without side awards. */
  sideAwardPoints: { team1: number; team2: number } | null;
  mvp: CupMvpAward | null;
  underperformer: CupUnderperformerAward | null;
  playerGroups: AppCupPlayerGroup[];
  sideAwards: CupSideAwardHoleGroup[];
};

export type AppCupView = {
  id: string;
  name: string;
  status: AppCupStatus;
  team1Name: string;
  team2Name: string;
  /** `null` until the cup starts. */
  pointsToWin: number | null;
  progress: AppCupProgress;
  /** Line-up sessions are open: «Kapteinene setter opp lagene». */
  lineupPending: boolean;
  /** Mine first, then by status. */
  matches: AppCupMatch[];
  /** The caller runs this cup: the room has «Styr cupen». */
  canManage: boolean;
  /** The caller has a match left to withdraw from: «Trekk meg fra cupen». */
  canWithdrawSelf: boolean;
  /** The caller has withdrawn from the cup. */
  selfWithdrawn: boolean;
  results: AppCupResults | null;
};
