import { remainingPartnerName } from './cupSoloPartner';
import {
  isPlayOnChoicePending,
  readWithdrawalPlayOn,
  resolveCupMatchWithdrawal,
  type CupMatchWithdrawal,
} from './cupWithdrawalOutcome';

export type CupWaitingRoomWithdrawalInput = {
  /** `games.tournament_id`. `null` = not a cup match, so nothing is derived. */
  tournamentId: string | null;
  gameMode: string;
  scheduledTeeOffAt: string | null;
  /**
   * Raw `games.mode_config`. The waiting room passes `gwp.game.mode_config`:
   * a refetched `game` row carries no `mode_config`, and reading it there
   * would show «valg venter» after the organiser already chose.
   */
  modeConfig: unknown;
  /** Raw `game_players` rows, in roster order. Names are joined in this order. */
  players: readonly {
    user_id: string;
    team_number: number;
    withdrawn_at: string | null;
  }[];
  /** The cup's `tournaments` row, or `null` when the lookup found nothing. */
  cup: { status: string; team_1_name: string; team_2_name: string } | null;
  /** Display name for a player, fallback included. */
  nameOf: (userId: string) => string;
  /** Called only when the winning side's team name is missing or blank. */
  teamFallback: (side: 1 | 2) => string;
};

export type CupWaitingRoomWithdrawalState = {
  /** The rule outcome, or `null` when the match is still to be played. */
  decision: CupMatchWithdrawal | null;
  /** The withdrawn players' names joined with «/», or `''`. */
  decidedNames: string;
  /** The partner left to play alone while the choice is pending, or `null`. */
  pendingPartner: string | null;
  /** The team awarded a walkover, or `''`. Also set while the choice is pending. */
  winnerTeam: string;
};

/**
 * The cup withdrawal state of a scheduled match's waiting room (#1814, #1967).
 *
 * Moved out of `GameHomePage` unchanged (#2040). Only the waiting room reads
 * it. The cup page, `CupManagement` and `CupMatchList` keep their own display
 * guards, which differ from this one (decision source, where the cup status
 * is read, name fallback), so they are not wired to it.
 *
 * No `t()` here: the caller owns both fallbacks. Always returns an object; a
 * non-cup game gets `decision: null` and empty fields.
 */
export function cupWaitingRoomWithdrawalState({
  tournamentId,
  gameMode,
  scheduledTeeOffAt,
  modeConfig,
  players,
  cup,
  nameOf,
  teamFallback,
}: CupWaitingRoomWithdrawalInput): CupWaitingRoomWithdrawalState {
  // #1814: cup-kampen kan alt være avgjort fordi noen trakk seg. Samme
  // regelmodul som `startScheduledGameCore` nettopp avslo starten med, så
  // banneret og virkeligheten kan ikke si to forskjellige ting.
  const cupRuleInput = tournamentId
    ? {
        status: 'scheduled' as const,
        gameMode,
        scheduledTeeOffAt,
        playOn: readWithdrawalPlayOn(modeConfig),
        players: players
          .filter((p) => p.team_number === 1 || p.team_number === 2)
          .map((p) => ({
            userId: p.user_id,
            side: p.team_number as 1 | 2,
            withdrawnAt: p.withdrawn_at,
          })),
      }
    : null;
  const cupWithdrawalDecision = cupRuleInput
    ? resolveCupMatchWithdrawal(cupRuleInput)
    : null;
  const decidedNames = cupWithdrawalDecision
    ? cupWithdrawalDecision.withdrawnUserIds.map(nameOf).join('/')
    : '';
  // #1967: the organiser has not made the play-on choice yet, so the rule
  // outcome above is not final. Same rule home as the cup page
  // (`isPlayOnChoicePending`) and the same gate as the organiser banner: the
  // cup is under way and a partner is left to play alone. When both sides
  // withdrew the choice is never pending, so the decided banner stays (#2032).
  const cupPlayOnPendingPartner =
    cupRuleInput &&
    cupWithdrawalDecision &&
    cup?.status === 'active' &&
    isPlayOnChoicePending(cupRuleInput, modeConfig)
      ? remainingPartnerName(
          {
            withdrawal: cupWithdrawalDecision,
            team1UserIds: cupRuleInput.players
              .filter((p) => p.side === 1)
              .map((p) => p.userId),
            team2UserIds: cupRuleInput.players
              .filter((p) => p.side === 2)
              .map((p) => p.userId),
          },
          nameOf,
        )
      : null;
  const decidedWinnerTeam =
    cupWithdrawalDecision?.outcome === 'walkover' && tournamentId
      ? (() => {
          const side = cupWithdrawalDecision.winnerSide === 1 ? 1 : 2;
          const name = side === 1 ? cup?.team_1_name : cup?.team_2_name;
          // Slår oppslaget feil, eller står lagnavnet tomt, endte setningen
          // på «… så walkover til .». «Lag 1»/«Lag 2» sier i det minste
          // hvilken side som får kampen.
          return name?.trim() || teamFallback(side);
        })()
      : '';

  return {
    decision: cupWithdrawalDecision,
    decidedNames,
    pendingPartner: cupPlayOnPendingPartner,
    winnerTeam: decidedWinnerTeam,
  };
}
