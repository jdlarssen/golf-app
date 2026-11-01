import type { AppCupMatch, AppCupMatchOutcome, AppCupMatchStatus, AppCupResults, AppCupView } from './appCupView';
import { computeCupMvp, computeCupUnderperformer } from './computeCupAwards';
import { isTeamMatchGameMode, type CupMatchSummary } from './computeCupLeaderboard';
import { computeCupPlayerPoints, preferredName } from './computeCupPlayerPoints';
import { cupMatchStatusKey, cupMatchStatusValues } from './cupMatchStatusLabel';
import { cupProgress } from './cupRoomRows';
import { remainingPartnerName } from './cupSoloPartner';
import type { CupSnapshot } from './getCupSnapshot';
import { buildSideAwardDetails } from './sideAwardDetails';

// The cup as the app reads it (#2752), built from the same snapshot the web's
// cup page and result page read. Pure: the route reads, this decides what may
// leave the server.
//
// The one rule that must not slip: until the cup is finished nothing here says
// who is ahead (#1468, the owner's answer again on 2026-11-01). `results` and
// every `outcome` stay `null`, and the raw leaderboard never goes on the wire.

/** `cup.manage.unknownPlayer`. The app is Norwegian only, so the route has no locale. */
export const APP_CUP_UNKNOWN_PLAYER = 'Ukjent spiller';

/** Order inside «mine» and «the rest»: what is going on now, comes first. */
const STATUS_ORDER: Record<AppCupMatchStatus, number> = {
  inProgress: 0,
  scorecardsSubmitted: 1,
  playOnPending: 2,
  notStarted: 3,
  decidedHalved: 4,
  decidedWalkover: 4,
  played: 5,
};

function matchOutcome(
  match: CupMatchSummary,
  teamNames: { team1: string; team2: string },
): AppCupMatchOutcome | null {
  if (match.status !== 'finished') return null;
  const side = match.result?.winnerSide;
  const teamFormat = isTeamMatchGameMode(match.gameMode);
  const winnerName =
    side === 1
      ? teamFormat
        ? teamNames.team1
        : match.team1PlayerName
      : side === 2
        ? teamFormat
          ? teamNames.team2
          : match.team2PlayerName
        : null;
  return {
    points1: match.pointsTeam1,
    points2: match.pointsTeam2,
    tied: side === 'tied',
    formatted: match.result?.formatted ?? null,
    winnerName,
  };
}

function buildResults(snapshot: CupSnapshot, unknownLabel: string): AppCupResults {
  const { tournament, leaderboard, roster, sideAwards, performanceInputs } = snapshot;
  const playerPoints = computeCupPlayerPoints({
    matches: leaderboard.matches,
    roster,
    sideAwards,
    unknownLabel,
  });
  return {
    winner: leaderboard.winner,
    winnerName:
      leaderboard.winner === 1
        ? tournament.team_1_name
        : leaderboard.winner === 2
          ? tournament.team_2_name
          : null,
    team1Points: leaderboard.team1Points,
    team2Points: leaderboard.team2Points,
    sideAwardPoints: sideAwards.length > 0 ? leaderboard.sideAwardPoints : null,
    mvp: computeCupMvp(playerPoints),
    underperformer: computeCupUnderperformer({ games: performanceInputs, roster, unknownLabel }),
    playerGroups: [
      { team: 1 as const, teamName: tournament.team_1_name, rows: playerPoints.team1 },
      { team: 2 as const, teamName: tournament.team_2_name, rows: playerPoints.team2 },
    ].filter((group) => group.rows.length > 0),
    sideAwards: buildSideAwardDetails({ sideAwards, roster, unknownLabel }),
  };
}

export function buildAppCupView(
  snapshot: CupSnapshot,
  opts: { userId: string; lineupPending: boolean; unknownLabel: string },
): AppCupView {
  const { tournament, leaderboard, roster } = snapshot;
  const { userId, unknownLabel } = opts;
  const finished = tournament.status === 'finished';
  const teamNames = { team1: tournament.team_1_name, team2: tournament.team_2_name };

  const names = new Map(
    [...roster.team1, ...roster.team2].map((player) => [player.userId, preferredName(player, unknownLabel)]),
  );
  const nameOf = (id: string) => names.get(id) ?? unknownLabel;

  const matches = leaderboard.matches.map((match): AppCupMatch => {
    const statusKey = cupMatchStatusKey({
      status: match.status,
      allScorecardsSubmitted: match.allScorecardsSubmitted ?? false,
      withdrawal: match.withdrawal,
    });
    const values = cupMatchStatusValues(match, {
      nameOf,
      team1Name: tournament.team_1_name,
      team2Name: tournament.team_2_name,
    });
    // Same gate as the web's card: the rule outcome is not final until the
    // organiser has answered, so the card says «Valg venter», not «Halvert».
    const playOnPending =
      match.playOnChoicePending === true &&
      tournament.status === 'active' &&
      remainingPartnerName(match, nameOf) !== null;
    return {
      gameId: match.gameId,
      label: match.matchLabel,
      side1: match.team1PlayerName,
      side2: match.team2PlayerName,
      status: playOnPending ? 'playOnPending' : statusKey,
      withdrawnName: values.name,
      walkoverTeam: values.team,
      soloPartnerName: match.soloPlayOn?.partnerName ?? null,
      mine: [...(match.team1UserIds ?? []), ...(match.team2UserIds ?? [])].includes(userId),
      outcome: finished ? matchOutcome(match, teamNames) : null,
    };
  });
  // `sort` is stable, so matches with the same rank keep the cup's own order.
  matches.sort(
    (a, b) => Number(b.mine) - Number(a.mine) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    team1Name: tournament.team_1_name,
    team2Name: tournament.team_2_name,
    pointsToWin: tournament.points_to_win,
    progress: cupProgress(leaderboard),
    lineupPending: opts.lineupPending,
    matches,
    results: finished ? buildResults(snapshot, unknownLabel) : null,
  };
}
