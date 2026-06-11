/**
 * Én-flight-regelen og flight-inndeling for solo-formater (#543).
 *
 * Kjerne-regel (eier-beslutning 2026-06-11):
 *   Et spill er «én flight» (alle ser og fører for hverandre) når antall
 *   AKTIVE (ikke-trukkede) spillere ≤ 4, ELLER formatet er wolf. Wolf er
 *   alltid én gruppe uansett spillertall (3–5 er vanlig).
 *
 * Flight-inndeling er bare relevant for spill med > 4 aktive spillere der
 * formatet er flight-løst by design (solo-buildere setter flight = null).
 * Matchplay-familien og lag-formater har flight = side/lag, styrt av
 * validatorene i gamePayload.ts — disse formatene rører aldri denne modulen.
 *
 * Erstatter den null-only-grenen i 0088 (coscore_flightless_small_games):
 * RLS-hjelperne `can_score_for` og `same_flight_or_solo` oppdateres i
 * migrasjon 0094 til å tillate på tvers av sider/lag ved ≤4 aktive ELLER wolf.
 */

import type { GameMode } from '@/lib/scoring/modes/types';

/** Maks antall spillere per fysisk flight på banen. */
export const MAX_FLIGHT_SIZE = 4;

/**
 * Minimal spiller-rad slik flight-scope-kalkulatorer trenger den.
 * Holdes løs fra Supabase `game_players`-raden — kallsteder mapper ned.
 */
export type FlightPlayer = {
  user_id: string;
  flight_number: number | null;
  withdrawn_at: string | null;
};

/** Returnerer bare aktive (ikke-trukkede) spillere. */
function activePlayers(players: FlightPlayer[]): FlightPlayer[] {
  return players.filter((p) => p.withdrawn_at == null);
}

/**
 * True når spillet er én fysisk flight — alle aktive spillere er i samme
 * gruppe. Gjelder ALLE formater ved ≤4 aktive spillere, pluss wolf
 * uavhengig av spillertall (3–5 er vanlig, alltid én gruppe).
 *
 * Trukkede spillere (withdrawn_at != null) teller aldri mot kapasiteten
 * (presedens: 0088/#544).
 */
export function isSingleFlightGame(
  gameMode: GameMode,
  players: FlightPlayer[],
): boolean {
  if (gameMode === 'wolf') return true;
  return activePlayers(players).length <= MAX_FLIGHT_SIZE;
}

/**
 * True når spillet trenger flight-inndeling — dvs. at det IKKE er én-flight
 * og minst én aktiv spiller mangler flight_number.
 *
 * Strukturell regel uten format-enumering: matchplay er eksakt 2/4 spillere
 * (aldri > 4), og lag-formater har alltid flight satt av validatorene —
 * disse treffes derfor aldri av `needsFlightAssignment`.
 *
 * Brukes i start-vakta i `startScheduledGame` og i admin-UI for å vise
 * Flighter-seksjonen.
 */
export function needsFlightAssignment(
  gameMode: GameMode,
  players: FlightPlayer[],
): boolean {
  if (isSingleFlightGame(gameMode, players)) return false;
  return activePlayers(players).some((p) => p.flight_number == null);
}

/**
 * Returnerer aktive spillere uten flight_number.
 * Brukes i start-vakta for å vise hvem som mangler inndeling.
 */
export function unassignedActivePlayers(players: FlightPlayer[]): FlightPlayer[] {
  return activePlayers(players).filter((p) => p.flight_number == null);
}

/**
 * Foreslår flight-inndeling for alle aktive spillere i grupper av
 * MAX_FLIGHT_SIZE i rekkefølge (array-rekkefølge = påmeldingsrekkefølge —
 * kallsteder sorterer på `created_at ASC` om det er tilgjengelig).
 *
 * ERSTATTER hele assignment-kartet: admin trykker «Foreslå inndeling» og
 * alle aktive spillere tildeles flight 1, 2, 3 … stigende. Trukkede
 * spillere hoppes over og inkluderes ikke i forslaget.
 *
 * Returnerer `{ user_id, flight_number }` per spiller (bare aktive).
 */
export function suggestFlightSplit(
  players: FlightPlayer[],
): { user_id: string; flight_number: number }[] {
  const active = activePlayers(players);
  return active.map((p, i) => ({
    user_id: p.user_id,
    flight_number: Math.floor(i / MAX_FLIGHT_SIZE) + 1,
  }));
}

/**
 * Grupperer aktive spillere i en Map keyed på flight_number, pluss en
 * `unassigned`-liste for spillere uten flight. Trukkede ekskluderes.
 *
 * Brukes av admin-UI (Flighter-seksjon) og venteroms-velgeren.
 */
export function flightBuckets(players: FlightPlayer[]): {
  assigned: Map<number, FlightPlayer[]>;
  unassigned: FlightPlayer[];
} {
  const assigned = new Map<number, FlightPlayer[]>();
  const unassigned: FlightPlayer[] = [];

  for (const p of activePlayers(players)) {
    if (p.flight_number == null) {
      unassigned.push(p);
    } else {
      const bucket = assigned.get(p.flight_number) ?? [];
      bucket.push(p);
      assigned.set(p.flight_number, bucket);
    }
  }

  return { assigned, unassigned };
}
