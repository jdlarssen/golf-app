// «Hvem sitt utslag» (#2580): lagene utslagsflatene i appen leser, i samme
// form og rekkefølge som webbens `buildTeeShotTeams` (holePagePlayers.ts).
// Hullsiden, scorekortet, godkjenningen og avslutt-skjermen henter alle laget
// herfra, så navnene, rekkefølgen og tellingen er like på hver flate. Regelen
// selv (status, lås, levering) er den delte lib/games/teeShots.ts.
import type { GameMode } from '../../../../lib/scoring/modes/types';
import {
  readMinTeeShots,
  teeShotDeliveryAdvice,
  teeShotStatus,
  type TeeShotDeliveryAdvice,
  type TeeShotStatus,
  type TeeShotStatusInput,
} from '../../../../lib/games/teeShots';
import { sortByTeeShotName, teeShotNames } from '../../../../lib/games/teeShotNames';
import type { BundleGame, BundlePlayer } from '../data/gameBundle';
import { teeShotOrganizerLines, teeShotsT, type NameOf } from './teeShotsCopy';

/** Plassholderen `displayName` bruker når en spiller mangler navn. */
const UNKNOWN_PLAYER = 'Ukjent spiller';

export interface TeeShotMember {
  userId: string;
  /** Kallenavn, ellers fornavn (fullt navn når to på laget deler fornavn). */
  name: string;
  submittedAt: string | null;
  withdrawnAt: string | null;
}

export interface TeeShotTeam {
  teamNumber: number;
  /** Hele laget i utslagsrekkefølgen, trukne medregnet. */
  members: TeeShotMember[];
}

/** Minimum per spiller, eller null når spillet ikke har innstillingen. */
export function teeShotMinimum(game: Pick<BundleGame, 'gameMode' | 'modeConfig'>): number | null {
  return readMinTeeShots(game.gameMode as GameMode, game.modeConfig);
}

function asNameRow(player: BundlePlayer) {
  return { user_id: player.userId, users: { name: player.name, nickname: player.nickname }, player };
}

/** Laget med nummeret, sortert som på nettet (`sortByTeeShotName`). */
export function teeShotTeam(players: readonly BundlePlayer[], teamNumber: number): TeeShotTeam {
  const rows = sortByTeeShotName(
    players.filter((p) => p.teamNumber === teamNumber).map(asNameRow),
    UNKNOWN_PLAYER,
  );
  const names = teeShotNames(rows, UNKNOWN_PLAYER);
  return {
    teamNumber,
    members: rows.map(({ player }) => ({
      userId: player.userId,
      name: names.get(player.userId) ?? UNKNOWN_PLAYER,
      submittedAt: player.submittedAt,
      withdrawnAt: player.withdrawnAt,
    })),
  };
}

/** Ett lag per lagnummer i `teamNumbers` (dubletter og null hoppes over), i stigende rekkefølge. */
export function teeShotTeams(
  players: readonly BundlePlayer[],
  teamNumbers: Iterable<number | null>,
): TeeShotTeam[] {
  const unique = [...new Set([...teamNumbers].filter((n): n is number => n != null))].sort((a, b) => a - b);
  return unique.map((teamNumber) => teeShotTeam(players, teamNumber));
}

/** Navnet en knapp, en linje eller en boks setter inn for en spiller på laget. */
export function teeShotNameOf(team: TeeShotTeam): NameOf {
  const byId = new Map(team.members.map((m) => [m.userId, m.name]));
  return (userId) => byId.get(userId) ?? UNKNOWN_PLAYER;
}

/** Valgene laget har gjort, som regelen leser dem. */
export interface TeeShotRowLike {
  teamNumber: number;
  holeNumber: number;
  teeShotBy: string | null;
}

/** Hvor laget står: regelens input (aktive medlemmer i lagrekkefølgen) og status. */
export function teamTeeShotState(
  team: TeeShotTeam,
  minimum: number,
  rows: readonly TeeShotRowLike[],
): { input: TeeShotStatusInput; status: TeeShotStatus } {
  const input: TeeShotStatusInput = {
    minimum,
    memberIds: team.members.filter((m) => !m.withdrawnAt).map((m) => m.userId),
    picks: rows
      .filter((r) => r.teamNumber === team.teamNumber)
      .map((r) => ({ holeNumber: r.holeNumber, teeShotBy: r.teeShotBy })),
  };
  return { input, status: teeShotStatus(input) };
}

/**
 * Laget som stopper leveringen, som webbens `loadTeeShotBox` (submit/page.tsx):
 * det første laget blant kortene som skal leveres (`deliveringIds`, i den
 * rekkefølgen) som mangler utslag. Null når alle lagene har nok, eller når
 * ingen kort skal leveres.
 */
export function teeShotDeliveryLock(args: {
  players: readonly BundlePlayer[];
  minimum: number;
  rows: readonly TeeShotRowLike[];
  deliveringIds: readonly string[];
}): { team: TeeShotTeam; status: TeeShotStatus; advice: TeeShotDeliveryAdvice } | null {
  const { players, minimum, rows, deliveringIds } = args;
  // Kortenes rekkefølge, ikke lagnummerets: mitt eget lag først.
  const ordered = [
    ...new Set(
      deliveringIds
        .map((id) => players.find((p) => p.userId === id)?.teamNumber)
        .filter((n): n is number => n != null),
    ),
  ];
  for (const teamNumber of ordered) {
    const team = teeShotTeam(players, teamNumber);
    const { status } = teamTeeShotState(team, minimum, rows);
    if (status.canDeliver) continue;
    const advice = teeShotDeliveryAdvice(status);
    return advice ? { team, status, advice } : null;
  }
  return null;
}

/**
 * Arrangørens linjer (#2580, punkt 19): «Per har 2 av 4 utslag» for hver
 * spiller under minimum, lag for lag, med «Lag N · » foran når spillet har
 * flere lag. Som webbens `TeeShotOrganizerNotice`. Tom liste når ingen mangler.
 */
export function teeShotOrganizerNotice(
  players: readonly BundlePlayer[],
  minimum: number,
  rows: readonly TeeShotRowLike[],
): string[] {
  const teams = teeShotTeams(players, players.map((p) => p.teamNumber));
  const showTeam = teams.length > 1;
  return teams.flatMap((team) => {
    const { status } = teamTeeShotState(team, minimum, rows);
    if (status.canDeliver) return [];
    return teeShotOrganizerLines(status, teeShotNameOf(team)).map((text) =>
      showTeam ? `${teeShotsT('teamLabel', { team: team.teamNumber })} · ${text}` : text,
    );
  });
}
