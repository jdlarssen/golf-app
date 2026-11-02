/**
 * What the app's organiser and withdrawal screens read (#2752): the wire shapes
 * of `GET /api/cup/[id]/manage`, `/withdrawal` and `/matches/[gameId]/swap-candidates`.
 * The server builds them, and the app never derives an outcome itself.
 *
 * Types only, importing nothing that is not pure: the native app imports this
 * file by relative path.
 */
import type { AppCupMatchStatus, AppCupStatus } from './appCupView';

/** A fourball where a partner can play on alone. `pending`: nobody has answered. */
export type AppCupPlayOnChoice = {
  partnerName: string;
  pending: boolean;
  playOn: boolean;
};

export type AppCupManagePlayer = {
  userId: string;
  name: string;
  team: 1 | 2;
  withdrawn: boolean;
  /** Has a match that has not started, in a running cup: the link means something. */
  canAct: boolean;
};

export type AppCupManageMatch = {
  gameId: string;
  label: string | null;
  side1: string;
  side2: string;
  status: AppCupMatchStatus;
  withdrawnName: string;
  walkoverTeam: string;
  /** Nothing in the bundle stops a swap (`swapBlock`). */
  canSwap: boolean;
  choice: AppCupPlayOnChoice | null;
};

/** One side award to register. A winner per slot, or a count per team for GIR. */
export type AppCupSideAward =
  | {
      id: string;
      kind: 'ctp' | 'ld';
      holeNumber: number;
      points: number;
      slot: number;
      slotCount: number;
      winnerUserId: string | null;
      noWinner: boolean;
    }
  | {
      id: string;
      kind: 'gir';
      holeNumber: number;
      points: number;
      maxPerTeam: number;
      team1Count: number | null;
      team2Count: number | null;
    };

/** A match the organiser can finish now: an active host. Derived ones follow it. */
export type AppCupFinishMatch = {
  gameId: string;
  label: string | null;
  side1: string;
  side2: string;
  /** Someone has not delivered, so finishing it takes «Avslutt likevel». */
  blocksFinish: boolean;
};

export type AppCupManageView = {
  id: string;
  name: string;
  status: AppCupStatus;
  team1Name: string;
  team2Name: string;
  players: AppCupManagePlayer[];
  /** The matches that have not started, in the cup's order. */
  matches: AppCupManageMatch[];
  sideAwards: AppCupSideAward[];
  /** What stands between the cup and its finish. */
  finish: {
    progress: { played: number; total: number };
    missingAwards: { kind: 'ctp' | 'ld' | 'gir'; holeNumber: number }[];
    activeMatches: AppCupFinishMatch[];
  };
};

export type AppCupWithdrawalOutcome =
  | { kind: 'halved' }
  | { kind: 'walkover'; teamName: string }
  | { kind: 'playOn'; partnerName: string };

export type AppCupWithdrawalMatch = {
  gameId: string;
  label: string | null;
  /** «man. 2. nov», formatted on the server as on the web. `null` without a tee time. */
  when: string | null;
  outcome: AppCupWithdrawalOutcome;
  /** Fourball with a partner left: the form asks about this match. */
  canPlayOn: boolean;
  playOn: boolean;
  partnerName: string | null;
};

/** One confirmation screen: the player's own, the organiser's, or the undo. */
export type AppCupWithdrawalView = {
  cup: {
    id: string;
    name: string;
    status: AppCupStatus;
    team1Name: string;
    team2Name: string;
  };
  player: { userId: string; name: string; isSelf: boolean };
  /** Already withdrawn: the organiser's screen turns into the undo. */
  alreadyWithdrawn: boolean;
  /** What a withdrawal writes. */
  matches: AppCupWithdrawalMatch[];
  /** Started or finished: a withdrawal never touches them. */
  untouched: { gameId: string; label: string | null }[];
};

export type AppCupSwapOption = { userId: string; name: string; teamName?: string };

export type AppCupSwapCandidates = {
  gameId: string;
  label: string | null;
  side1: string;
  side2: string;
  /** Why the bundle cannot be swapped, in the guard's own code. `null`: it can. */
  blocked: 'already_started' | 'match_has_withdrawal' | null;
  /** A split day: the swap applies to every match in the bundle. */
  bundled: boolean;
  out: AppCupSwapOption[];
  in: AppCupSwapOption[];
};
