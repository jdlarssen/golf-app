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
function activePlayers(players: TeamPlayer[]): TeamPlayer[] {
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
 * Rekkefølgen på `players` er fordelingsrekkefølgen — kallsteder sorterer på
 * `accepted_at ASC` (påmeldingsrekkefølge), som `flightScope.suggestFlightSplit`.
 *
 * `flight_number` beholdes hvis spilleren allerede har en; ellers settes den lik
 * lagnummeret. CHECK-en krever at den er satt så snart laget er det.
 */
export function suggestTeamSplit(
  players: TeamPlayer[],
  teamSize: number,
): TeamAssignment[] {
  const size =
    Number.isInteger(teamSize) && teamSize >= 1 ? teamSize : DEFAULT_TEAM_SIZE;
  const active = activePlayers(players);

  // Belegg per lag, kun aktive spillere — trukkede holder ikke av en plass.
  const counts = new Map<number, number>();
  for (const p of active) {
    if (p.team_number != null) {
      counts.set(p.team_number, (counts.get(p.team_number) ?? 0) + 1);
    }
  }

  const assignments: TeamAssignment[] = [];
  for (const p of active) {
    if (p.team_number != null) continue;
    const team = nextTeamWithSpace(counts, size);
    counts.set(team, (counts.get(team) ?? 0) + 1);
    assignments.push({
      user_id: p.user_id,
      team_number: team,
      flight_number: p.flight_number ?? team,
    });
  }
  return assignments;
}

/**
 * Laveste lagnummer som har ledig plass: først blant lagene som finnes, ellers
 * det laveste tallet som ikke er tatt i bruk ennå.
 */
function nextTeamWithSpace(counts: Map<number, number>, size: number): number {
  const existing = Array.from(counts.keys()).sort((a, b) => a - b);
  for (const team of existing) {
    if ((counts.get(team) ?? 0) < size) return team;
  }
  let team = 1;
  while (counts.has(team)) team++;
  return team;
}

/**
 * Grupperer aktive spillere i en Map keyed på `team_number`, pluss en
 * `unassigned`-liste. Trukkede ekskluderes. Speiler `flightBuckets`.
 */
export function teamBuckets(players: TeamPlayer[]): {
  assigned: Map<number, TeamPlayer[]>;
  unassigned: TeamPlayer[];
} {
  const assigned = new Map<number, TeamPlayer[]>();
  const unassigned: TeamPlayer[] = [];

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
