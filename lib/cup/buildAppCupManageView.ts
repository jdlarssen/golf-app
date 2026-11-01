import { preferredName } from './computeCupPlayerPoints';
import type { AppCupManageMatch, AppCupManageView, AppCupSwapCandidates } from './appCupManageView';
import { cupMatchStatusKey, cupMatchStatusValues } from './cupMatchStatusLabel';
import { remainingPartnerName } from './cupSoloPartner';
import { isNotStartedCupMatch } from './cupWithdrawalOutcome';
import type { CupSnapshot } from './getCupSnapshot';

type Match = CupSnapshot['leaderboard']['matches'][number];

function hasWithdrawal(match: Match): boolean {
  return match.withdrawal != null || match.soloPlayOn != null;
}

/** Scheduled with no withdrawal: a withdrawal frees no seat (E6). */
export function matchCanSwap(match: Match): boolean {
  return match.status === 'scheduled' && !hasWithdrawal(match);
}

function nameLookup(snapshot: CupSnapshot, unknownLabel: string) {
  const names = new Map(
    [...snapshot.roster.team1, ...snapshot.roster.team2].map((player) => [
      player.userId,
      preferredName(player, unknownLabel),
    ]),
  );
  return (id: string) => names.get(id) ?? unknownLabel;
}

/**
 * The organiser's room (#2752), what the web's `CupManagement` and `CupMatchList`
 * show: who can be withdrawn or brought back, the matches that have not started,
 * and the play-on choice. A pure function of the snapshot, so a test reads the
 * same rules the screen gets. The gate is in the route.
 */
export function buildAppCupManageView(
  snapshot: CupSnapshot,
  opts: { unknownLabel: string },
): AppCupManageView {
  const { tournament, leaderboard, roster } = snapshot;
  const nameOf = nameLookup(snapshot, opts.unknownLabel);
  const active = tournament.status === 'active';

  // Withdrawn players stay in the matches' user ids, so a withdrawn player with a
  // match that has not started keeps the undo link (#1814).
  const notStarted = leaderboard.matches.filter((match) => isNotStartedCupMatch(match.status));
  const withMatch = new Set(
    notStarted.flatMap((match) => [...(match.team1UserIds ?? []), ...(match.team2UserIds ?? [])]),
  );
  const rosterRow = (team: 1 | 2) => (player: (typeof roster.team1)[number]) => ({
    userId: player.userId,
    name: preferredName(player, opts.unknownLabel),
    team,
    withdrawn: player.withdrawn === true,
    canAct: active && withMatch.has(player.userId),
  });

  const matches = notStarted.map((match): AppCupManageMatch => {
    const partnerName =
      match.soloPlayOn?.partnerName ?? remainingPartnerName(match, nameOf);
    const showChoice =
      active &&
      match.status === 'scheduled' &&
      match.gameMode === 'fourball_matchplay' &&
      hasWithdrawal(match) &&
      partnerName !== null;
    const values = cupMatchStatusValues(match, {
      nameOf,
      team1Name: tournament.team_1_name,
      team2Name: tournament.team_2_name,
    });
    const statusKey = cupMatchStatusKey({
      status: match.status,
      allScorecardsSubmitted: match.allScorecardsSubmitted ?? false,
      withdrawal: match.withdrawal,
    });
    return {
      gameId: match.gameId,
      label: match.matchLabel,
      side1: match.team1PlayerName,
      side2: match.team2PlayerName,
      status: match.playOnChoicePending === true && showChoice ? 'playOnPending' : statusKey,
      withdrawnName: values.name,
      walkoverTeam: values.team,
      canSwap: matchCanSwap(match),
      choice: showChoice
        ? {
            partnerName: partnerName as string,
            pending: match.playOnChoicePending === true,
            playOn: match.soloPlayOn != null,
          }
        : null,
    };
  });

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    team1Name: tournament.team_1_name,
    team2Name: tournament.team_2_name,
    players: [...roster.team1.map(rosterRow(1)), ...roster.team2.map(rosterRow(2))],
    matches,
  };
}

/**
 * Who can be swapped in one match, as `swapOptionsFor` on the web. The bundle (a
 * host and its derived matches, #1441 D3) comes from the snapshot: the organiser
 * can swap from any card in it, and a reserve may not stand in any match of it.
 * `null` when the match is not in this cup. The server's guard table
 * (`validateMatchSwap`) is still what decides, this is only the list.
 */
export function buildAppCupSwapCandidates(
  snapshot: CupSnapshot,
  args: {
    gameId: string;
    candidates: readonly { id: string; displayName: string; pending?: boolean }[];
    unknownLabel: string;
  },
): AppCupSwapCandidates | null {
  const { tournament, leaderboard } = snapshot;
  const match = leaderboard.matches.find((candidate) => candidate.gameId === args.gameId);
  if (!match) return null;
  const nameOf = nameLookup(snapshot, args.unknownLabel);

  const root = match.sourceGameId ?? match.gameId;
  const bundle = leaderboard.matches.filter((other) => (other.sourceGameId ?? other.gameId) === root);
  const team1 = new Set(bundle.flatMap((other) => other.team1UserIds ?? []));
  const inBundle = [
    ...new Set(
      bundle.flatMap((other) => [...(other.team1UserIds ?? []), ...(other.team2UserIds ?? [])]),
    ),
  ];

  return {
    gameId: match.gameId,
    label: match.matchLabel,
    side1: match.team1PlayerName,
    side2: match.team2PlayerName,
    canSwap: bundle.every(matchCanSwap),
    bundled: bundle.length > 1,
    out: inBundle.map((userId) => ({
      userId,
      name: nameOf(userId),
      teamName: team1.has(userId) ? tournament.team_1_name : tournament.team_2_name,
    })),
    in: args.candidates
      .filter((candidate) => !candidate.pending && !inBundle.includes(candidate.id))
      .map((candidate) => ({ userId: candidate.id, name: candidate.displayName }))
      .sort((a, b) => a.name.localeCompare(b.name, 'no')),
  };
}
