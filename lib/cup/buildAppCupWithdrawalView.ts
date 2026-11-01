import { formatTeeOffDateLocale } from '@/lib/i18n/format';
import type {
  AppCupWithdrawalMatch,
  AppCupWithdrawalOutcome,
  AppCupWithdrawalView,
} from './appCupManageView';
import type { CupWithdrawalContext, CupWithdrawalMatchView } from './cupWithdrawalContext';

function outcomeOf(
  match: CupWithdrawalMatchView,
  teamNames: { team1: string; team2: string },
): AppCupWithdrawalOutcome {
  if (!match.outcome) return { kind: 'playOn', partnerName: match.partnerName ?? '' };
  if (match.outcome.outcome === 'halved') return { kind: 'halved' };
  return {
    kind: 'walkover',
    teamName: match.outcome.winnerSide === 1 ? teamNames.team1 : teamNames.team2,
  };
}

/**
 * The confirmation screens' data (#2752): what `loadCupWithdrawalContext` reads,
 * the same rule module the write uses, so the preview and the action can never
 * say two different things. The date is formatted here: Hermes has no Oslo.
 */
export function buildAppCupWithdrawalView(
  context: CupWithdrawalContext,
  opts: { isSelf: boolean },
): AppCupWithdrawalView {
  const { tournament, player, pending, untouched } = context;
  const teamNames = { team1: tournament.team_1_name, team2: tournament.team_2_name };
  const matches = pending
    .filter((match) => !match.alreadyWithdrawn)
    .map(
      (match): AppCupWithdrawalMatch => ({
        gameId: match.gameId,
        label: match.matchLabel,
        when: match.scheduledTeeOffAt
          ? formatTeeOffDateLocale(new Date(match.scheduledTeeOffAt), 'no')
          : null,
        outcome: outcomeOf(match, teamNames),
        canPlayOn: match.canPlayOn,
        playOn: match.playOn,
        partnerName: match.partnerName,
      }),
    );
  return {
    cup: {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      team1Name: tournament.team_1_name,
      team2Name: tournament.team_2_name,
    },
    player: { userId: player.userId, name: player.name, isSelf: opts.isSelf },
    alreadyWithdrawn: pending.some((match) => match.alreadyWithdrawn),
    matches,
    untouched: untouched.map((match) => ({ gameId: match.gameId, label: match.matchLabel })),
  };
}
