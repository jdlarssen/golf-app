/**
 * Lag-tildeling etter publisering (#1669) — tvillingen til `flightScope.ts`.
 *
 * Bakgrunn: åpen solo-påmelding (`registration_type = 'solo'`) inn i et
 * lag-format (best ball, scramble-familien, shamble, patsome, par-stableford)
 * gir `game_players.team_number = null`. Scoring-computene hopper stille over
 * spillere uten lag (`bestBall.ts`, `stableford.ts`, `texasScramble.ts`,
 * `shamble.ts`, `patsome.ts`) — resultatet er en tom tavle uten feilmelding.
 *
 * Denne modulen er den ene sannhetskilden for «hvem mangler lag, og hvilket
 * lag bør de få»: admin-UI-et (Lag-seksjonen), lag-actionene og start-vakta i
 * `startScheduledGame` leser alle herfra, så UI og guard ikke kan divergere
 * (AGENTS.md felle 4).
 *
 * DB-kontrakt: CHECK `game_players_team_flight_consistency` (0030/0095) sier at
 * `team_number NOT NULL` impliserer `flight_number NOT NULL`. Derfor setter
 * forslaget alltid en flight sammen med laget — samme konvensjon som
 * lag-påmeldingen i `signup/[shortId]/teamActions.ts`.
 */

import { isSoloFormat, type GameMode } from '@/lib/scoring/modes/types';
import { isMatchplayMode } from './matchplaySides';
import { allowedTeamSizes, splitIntoTeams } from './teamFormatLimits';

/**
 * Fallback når `mode_config.team_size` mangler: 1 (solo). Alle lag-formater
 * bærer alltid `team_size` i configen (`lib/scoring/modes/types.ts`); det
 * eneste tilfellet uten feltet er stableford-familiens solo-runder, og alle
 * andre lesere i appen (game-home, leaderboard, start-vakta) leser det som
 * solo. Én regel, ett hjem (#1669 evaluator F3).
 */
export const DEFAULT_TEAM_SIZE = 1;

/**
 * Minimal spiller-rad slik lag-kalkulatorene trenger den. Holdes løs fra
 * Supabase-raden — kallsteder mapper ned.
 */
export type TeamPlayer = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  withdrawn_at: string | null;
};

/** Ett forslag: hvilket lag (og hvilken flight) spilleren skal ha. */
export type TeamAssignment = {
  user_id: string;
  team_number: number;
  flight_number: number;
};

/** Returnerer bare aktive (ikke-trukkede) spillere. */
function activePlayers<T extends Pick<TeamPlayer, 'withdrawn_at'>>(
  players: readonly T[],
): T[] {
  return players.filter((p) => p.withdrawn_at == null);
}

/**
 * True når formatet krever at hver spiller har et `team_number`.
 *
 * Avledet strukturelt av de to eksisterende klassifiserings-helperne framfor en
 * ny format-enumering som kan drifte fra dem:
 *   • `isSoloFormat` — flate deltakere (pott-formatene, solo slagspill,
 *     solo-stableford). Wolf/Round Robin bruker `team_number` som rotasjons-slot
 *     og trekkes ved start, ikke som lag.
 *   • `isMatchplayMode` — sidene eies av `incomplete_sides`-vakta, som stiller
 *     strengere krav (eksakt `team_size` per side) enn denne modulen.
 *
 * Det som blir igjen er nettopp lag-formatene: best ball, texas/ambrose/florida
 * scramble, shamble, patsome og par-stableford.
 */
export function modeRequiresTeamNumber(mode: GameMode, teamSize: number): boolean {
  return !isSoloFormat(mode, teamSize) && !isMatchplayMode(mode);
}

/**
 * Leser lagstørrelsen fra `mode_config.team_size` (sannhetskilden — se
 * `lib/scoring/modes/types.ts`), med fallback til {@link DEFAULT_TEAM_SIZE} når
 * feltet mangler eller er ugyldig (eldre rader, delvis config).
 */
export function expectedTeamSize(
  modeConfig: { team_size?: number } | null | undefined,
): number {
  const size = modeConfig?.team_size;
  if (typeof size === 'number' && Number.isInteger(size) && size >= 1) {
    return size;
  }
  return DEFAULT_TEAM_SIZE;
}

/**
 * Returnerer aktive spillere uten `team_number`. Brukes av start-vakta og
 * Lag-seksjonen for å vise hvem som mangler lag.
 */
export function unassignedTeamPlayers(players: TeamPlayer[]): TeamPlayer[] {
  return activePlayers(players).filter((p) => p.team_number == null);
}

/**
 * True når spillet ikke kan starte fordi minst én aktiv spiller mangler lag.
 *
 * Solo-formater og matchplay returnerer alltid false — de har ingen lag å
 * mangle, eller en egen vakt som er strengere.
 */
export function needsTeamAssignment(
  mode: GameMode,
  teamSize: number,
  players: TeamPlayer[],
): boolean {
  if (!modeRequiresTeamNumber(mode, teamSize)) return false;
  return unassignedTeamPlayers(players).length > 0;
}

/**
 * Champagne's «N beste» from a raw `mode_config` (#2569), or `undefined`
 * outside shamble. Read defensively, like `expectedTeamSize`.
 */
export function readShambleCount(modeConfig: unknown): number | undefined {
  const count = (modeConfig as { shamble_count?: unknown } | null)?.shamble_count;
  return typeof count === 'number' && Number.isInteger(count) ? count : undefined;
}

/** Aktive spillere per lagnummer. Lag uten aktive spillere er ikke med. */
export function activeTeamCounts(players: readonly TeamPlayer[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const p of activePlayers(players)) {
    if (p.team_number == null) continue;
    counts.set(p.team_number, (counts.get(p.team_number) ?? 0) + 1);
  }
  return counts;
}

/**
 * Hvordan ett lag med `count` aktive står mot regelen (#2569): fullt, kort
 * men lovlig (spiller med én mindre, handicapet regnes for dem som er igjen),
 * eller utenfor (`allowedTeamSizes`), og da stopper startvakta runden.
 * «Fjern spiller» og Lag-seksjonen leser herfra. Kalles for lag-formatene.
 */
export type TeamSizeStatus = 'full' | 'short' | 'outside';

export function teamSizeStatus(
  mode: GameMode,
  teamSize: number,
  count: number,
  shambleCount?: number,
): TeamSizeStatus {
  if (count === teamSize) return 'full';
  return allowedTeamSizes(mode, teamSize, shambleCount).has(count) ? 'short' : 'outside';
}

/**
 * Lagene med en aktiv størrelse regelen ikke tillater (#2569), stigende. Et
 * lag kan ha `team_size` eller én færre der formatet har den størrelsen
 * (`allowedTeamSizes`): et par med én igjen etter et forfall, eller et lag på
 * 2 i et 4-mannsspill, stopper start. Startvakta (`uneven_teams`) og
 * Lag-seksjonen leser herfra. Formater uten lag gir tom liste; et lag på 3/3/3
 * à 4 er lovlig her (alle lag får samme prosent av snittet).
 */
export function unevenTeamNumbers(
  mode: GameMode,
  teamSize: number,
  players: readonly TeamPlayer[],
  shambleCount?: number,
): number[] {
  if (!modeRequiresTeamNumber(mode, teamSize)) return [];
  return [...activeTeamCounts(players)]
    .filter(([, count]) => teamSizeStatus(mode, teamSize, count, shambleCount) === 'outside')
    .map(([team]) => team)
    .sort((a, b) => a - b);
}

/**
 * Foreslår lag for de aktive spillerne som mangler lag — og bare dem.
 *
 * Bevisst konservativ: spillere som allerede har et lag (typisk fra
 * lag-påmelding) røres aldri, så en admin som trykker «Foreslå laginndeling»
 * ikke river opp par folk har meldt seg på sammen som.
 *
 * Fordelingen tar i tur:
 *   1. laveste eksisterende lag som har plass (< `teamSize` aktive), deretter
 *   2. laveste ledige lagnummer, som så fylles opp før neste opprettes.
 *
 * #2569: plassen per lag følger regelen. Går de aktive opp i lag der noen er
 * én kortere (`splitIntoTeams` med `allowedTeamSizes`), får bare så mange lag
 * som delingen har fulle plasser lov å bli fulle; resten fylles til én under.
 * 10 à 4 blir 4/3/3, ikke 4/4/2, som startvakta ville nektet. Et lag som alt er
 * fullt, bruker en av de fulle plassene. Går antallet ikke opp, fylles lagene
 * som før.
 *
 * Rekkefølgen på `players` er fordelingsrekkefølgen — kallsteder sorterer på
 * `accepted_at ASC` (påmeldingsrekkefølge), som `flightScope.suggestFlightSplit`.
 *
 * `flight_number` settes med {@link flightForTeam} etter hvert tildelt lag, så
 * forslaget følger samme regel som et manuelt lagbytte: i best ball får nummer
 * to i paret partnerens flight, i de andre lag-formatene er flighten laget.
 * CHECK-en krever at flighten er satt så snart laget er det.
 */
export function suggestTeamSplit(
  mode: GameMode,
  players: TeamPlayer[],
  teamSize: number,
  shambleCount?: number,
): TeamAssignment[] {
  const size =
    Number.isInteger(teamSize) && teamSize >= 1 ? teamSize : DEFAULT_TEAM_SIZE;
  const active = activePlayers(players);
  const split = splitIntoTeams(active.length, size, allowedTeamSizes(mode, size, shambleCount));

  // Belegg per lag, kun aktive spillere — trukkede holder ikke av en plass.
  const counts = new Map<number, number>();
  for (const p of active) {
    if (p.team_number != null) {
      counts.set(p.team_number, (counts.get(p.team_number) ?? 0) + 1);
    }
  }

  // #2569: how many teams may still be full. Without a split every team may.
  let fullLeft = split
    ? split.filter((s) => s === size).length -
      [...counts.values()].filter((c) => c >= size).length
    : Infinity;
  const capacity = (team: number): number =>
    (counts.get(team) ?? 0) >= size || fullLeft > 0 ? size : size - 1;

  // The roster as it stands after each assignment, so the next player in the
  // same team sees their partner.
  const roster: TeamPlayer[] = players.map((p) => ({ ...p }));
  const assignments: TeamAssignment[] = [];
  for (const p of active) {
    if (p.team_number != null) continue;
    const team = nextTeamWithSpace(counts, capacity);
    counts.set(team, (counts.get(team) ?? 0) + 1);
    if (counts.get(team) === size) fullLeft--;
    const flight = flightForTeam(mode, roster, p.user_id, team);
    const row = roster.find((r) => r.user_id === p.user_id);
    if (row) {
      row.team_number = team;
      row.flight_number = flight;
    }
    assignments.push({ user_id: p.user_id, team_number: team, flight_number: flight });
  }
  return assignments;
}

/**
 * The flight a player gets when joining or switching to `targetTeam` (#2290).
 * In the team formats the flight follows the team and is never carried over
 * from the player's old flight:
 *
 *   • `best_ball`: a flight groups whole pairs. The player gets the flight of
 *     an active teammate in `targetTeam`, so the pair stays together. With no
 *     teammate the player keeps their own flight, or gets the team number when
 *     they have none.
 *   • Every other format: `targetTeam`, as the validators in `gamePayload.ts`
 *     set it.
 *
 * Shared by the web Lag section, «Foreslå laginndeling» and the app.
 */
export function flightForTeam(
  mode: GameMode,
  players: TeamPlayer[],
  userId: string,
  targetTeam: number,
): number {
  if (mode !== 'best_ball') return targetTeam;
  const teammate = activePlayers(players).find(
    (p) =>
      p.user_id !== userId && p.team_number === targetTeam && p.flight_number != null,
  );
  if (teammate?.flight_number != null) return teammate.flight_number;
  return players.find((p) => p.user_id === userId)?.flight_number ?? targetTeam;
}

/**
 * Laveste lagnummer som har ledig plass (under `capacity(team)`): først blant
 * lagene som finnes, ellers det laveste tallet som ikke er tatt i bruk ennå.
 */
function nextTeamWithSpace(
  counts: Map<number, number>,
  capacity: (team: number) => number,
): number {
  const existing = Array.from(counts.keys()).sort((a, b) => a - b);
  for (const team of existing) {
    if ((counts.get(team) ?? 0) < capacity(team)) return team;
  }
  let team = 1;
  while (counts.has(team)) team++;
  return team;
}

/**
 * Grupperer aktive spillere i en Map keyed på `team_number`, pluss en
 * `unassigned`-liste. Trukkede ekskluderes. Speiler `flightBuckets`.
 *
 * Generisk: radene kommer ut med alle feltene kallstedet sendte inn.
 * Brukes av Lag-seksjonen og Lag-/Sider-kortet på admin-siden, og av
 * sideturneringens lag-gruppering.
 */
export function teamBuckets<
  T extends Pick<TeamPlayer, 'team_number' | 'withdrawn_at'>,
>(players: readonly T[]): {
  assigned: Map<number, T[]>;
  unassigned: T[];
} {
  const assigned = new Map<number, T[]>();
  const unassigned: T[] = [];

  for (const p of activePlayers(players)) {
    if (p.team_number == null) {
      unassigned.push(p);
    } else {
      const bucket = assigned.get(p.team_number) ?? [];
      bucket.push(p);
      assigned.set(p.team_number, bucket);
    }
  }

  return { assigned, unassigned };
}
