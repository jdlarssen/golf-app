// #2577: hvilken av de fire tavlene godkjenningen viser (designlerretet, rad 68
// «Godkjenningen i appen»).
//
// Skjermen tegner ingen egne regler for hvem som kan godkjenne. Kortene som
// venter, er den delte `pendingApprovals` (#2220-porten), og kortene jeg kunne
// godkjent, er den delte `canApproveScorecardFor`. Det som bor her, er bare
// sorteringen oppå dem:
//
//  - `pending`: kortene som venter på meg (tavle 1).
//  - `allApproved`: alt jeg kan godkjenne er levert og godkjent av meg (tavle 3).
//  - `notDelivered`: ingenting venter, men en makker har ikke levert (tavle 4).
//  - `empty`: alt annet, også et avsluttet spill og en runde uten godkjenning.
//
// Et kort jeg leverte for en annen, er ikke mitt å godkjenne (#2200), og står
// derfor ingen steder her, heller ikke mens det venter på en annen i flighten.
import { scoreOwnerForHole } from '../../../../lib/games/scoreOwner';
import { teamScoreOwnerId } from '../../../../lib/games/teamCaptain';
import { deliveryCoversWholeTeam } from '../../../../lib/games/teamDelivery';
import { canApproveScorecardFor } from '../../../../lib/games/flightScope';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { BundleGame } from '../data/gameBundle';
import { displayName, formatNameList, shortDisplayName } from './display';
import { findInRoster, pendingApprovals, type RosterEntry } from './roster';

export type ApproveGame = Pick<BundleGame, 'gameMode' | 'status' | 'requirePeerApproval'>;

export type ApproveScreenState =
  | { kind: 'pending'; pending: RosterEntry[] }
  | { kind: 'allApproved'; approvedByMe: RosterEntry[]; notifiedNames: string[] }
  | {
      kind: 'notDelivered';
      approvedByMe: RosterEntry[];
      notDelivered: RosterEntry[];
      notifiedNames: string[];
    }
  | { kind: 'empty' };

/**
 * Lagformatene der laget leverer ett kort (Texas scramble og slektningene). Ikke
 * Patsome (#2751): der deler laget hull 7–18, men hver spiller leverer sitt
 * eget kort, så hver spiller er sin egen rad.
 */
function teamDeliversOneCard(gameMode: string): boolean {
  return deliveryCoversWholeTeam(gameMode as GameMode);
}

/**
 * Slagene på kortet til `ownerId`, hull for hull. Hvem som eier raden, spørres
 * per hull (`scoreOwnerForHole`): i Patsome ligger hull 1–6 på spilleren selv og
 * hull 7–18 på lagets rad, og kortet er begge deler.
 */
export function cardScoresByHole(
  scores: readonly LocalScore[],
  roster: readonly RosterEntry[],
  gameMode: GameMode,
  ownerId: string,
): Map<number, LocalScore> {
  const teamNumber = findInRoster(roster, ownerId)?.player.teamNumber;
  const captainId =
    teamNumber == null
      ? null
      : teamScoreOwnerId(roster.filter((entry) => entry.player.teamNumber === teamNumber));
  const byHole = new Map<number, LocalScore>();
  for (const row of scores) {
    if (row.userId === scoreOwnerForHole(gameMode, row.holeNumber, ownerId, captainId)) {
      byHole.set(row.holeNumber, row);
    }
  }
  return byHole;
}

export function approveScreenState({
  roster,
  game,
  userId,
}: {
  roster: readonly RosterEntry[];
  game: ApproveGame;
  userId: string;
}): ApproveScreenState {
  const me = findInRoster(roster, userId);
  const pending = me ? pendingApprovals(roster, game, userId) : [];
  if (pending.length > 0) return { kind: 'pending', pending };
  if (!me || game.status !== 'active' || !game.requirePeerApproval) return { kind: 'empty' };

  const mine = roster.filter((entry) =>
    canApproveScorecardFor(
      [...roster],
      game.gameMode as GameMode,
      userId,
      entry.user_id,
      entry.submitted_by_user_id,
    ),
  );
  const approvedByMe = mine.filter(
    (entry) => entry.player.approvedByUserId === userId && entry.approved_at != null,
  );
  // Lagkortet er mitt kort (beslutning 5): det står under «Ditt kort», ikke
  // som en makker som ikke har levert.
  const myTeam = teamDeliversOneCard(game.gameMode) ? me.player.teamNumber : null;
  const notDelivered = mine.filter(
    (entry) =>
      entry.submitted_at == null && (myTeam == null || entry.player.teamNumber !== myTeam),
  );
  // En gjest har ingen app-økt og får verken push eller e-post (beslutning 6).
  const notifiedNames = approvedByMe
    .filter((entry) => !entry.player.isGuest)
    .map((entry) => shortDisplayName(entry.player));

  if (notDelivered.length > 0) {
    return { kind: 'notDelivered', approvedByMe, notDelivered, notifiedNames };
  }
  if (approvedByMe.length > 0) return { kind: 'allApproved', approvedByMe, notifiedNames };
  return { kind: 'empty' };
}

/**
 * En rad under «Du har godkjent» eller «Ikke levert ennå». `ownerId` er den
 * bruttoen leses fra; `clock` er det seneste godkjenningstidspunktet, eller
 * `null` når ingen er godkjent.
 */
export type ApproveRow = { key: string; name: string; clock: string | null; ownerId: string };

/**
 * Radene for en liste fra {@link approveScreenState}. I lagkort-formatene er
 * det én rad per lag: navnene satt sammen, og eieren er lagets rad-eier
 * (`teamScoreOwnerId`) regnet over HELE rosteret. Lagets slag ligger bare på
 * den raden, og rosteret kommer i tilfeldig rekkefølge fra bundelen, så lagets
 * første oppføring i lista kan være feil person.
 */
export function approveRows(
  list: readonly RosterEntry[],
  roster: readonly RosterEntry[],
  gameMode: string,
): ApproveRow[] {
  if (!teamDeliversOneCard(gameMode)) {
    return list.map((entry) => ({
      key: entry.user_id,
      name: displayName(entry.player),
      clock: entry.approved_at,
      ownerId: entry.user_id,
    }));
  }

  // Gruppene i rosterens rekkefølge: en spiller uten lag er sin egen gruppe.
  const groups: { teamNumber: number | null; members: RosterEntry[] }[] = [];
  for (const entry of list) {
    const teamNumber = entry.player.teamNumber;
    const group =
      teamNumber == null ? undefined : groups.find((g) => g.teamNumber === teamNumber);
    if (group) group.members.push(entry);
    else groups.push({ teamNumber, members: [entry] });
  }

  return groups.map(({ teamNumber, members }) => {
    if (teamNumber == null) {
      const [entry] = members as [RosterEntry];
      return {
        key: entry.user_id,
        name: displayName(entry.player),
        clock: entry.approved_at,
        ownerId: entry.user_id,
      };
    }
    const owner = teamScoreOwnerId(
      roster.filter((entry) => entry.player.teamNumber === teamNumber),
    );
    return {
      key: `team-${teamNumber}`,
      name: formatNameList(members.map((entry) => displayName(entry.player))),
      clock: latest(members.map((entry) => entry.approved_at)),
      ownerId: owner ?? members[0]!.user_id,
    };
  });
}

/** Det seneste tidspunktet, eller `null` når ingen er satt. */
function latest(times: readonly (string | null)[]): string | null {
  let best: string | null = null;
  for (const time of times) {
    if (time != null && (best == null || Date.parse(time) > Date.parse(best))) best = time;
  }
  return best;
}
