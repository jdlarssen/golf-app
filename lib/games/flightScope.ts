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
 * migrasjon 0095 til å tillate på tvers av sider/lag ved ≤4 aktive ELLER wolf.
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
 * kallsteder sorterer på `accepted_at ASC`).
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
 * Returnerer bruker-id-ene som kan attestere et scorekort for `userId` i
 * dette spillet. Brukes av `approve/actions.ts` (autorisasjons-gate) og
 * `submit/actions.ts` (peer-varsel-loop) slik at logikken ikke dupliseres.
 *
 * Regler:
 *   • Én-flight-spill (≤4 aktive ELLER wolf): alle andre aktive spillere er
 *     attestanter — de er i samme fysiske gruppe.
 *   • Spill med assigned flights (>4, solo-inndeling): kun spillere med
 *     samme flight_number (eksisterende oppførsel).
 *   • Spillere uten flight_number i et ikke-én-flight-spill (legacy- eller
 *     delvis-inndelte spill): ingen attestanter.
 *   • Trukkede spillere ekskluderes alltid (de er ikke på banen).
 *   • `userId` selv ekskluderes alltid.
 */
export function peersForApproval(
  players: FlightPlayer[],
  gameMode: GameMode,
  userId: string,
): string[] {
  return activePlayers(players)
    .filter((p) => canApproveScorecardFor(players, gameMode, p.user_id, userId))
    .map((p) => p.user_id);
}

/**
 * True når `approverUserId` kan attestere `ownerUserId`s scorekort i dette
 * spillet. TS-tvillingen til SQL-funksjonen `can_score_for` (migrasjon 0095) —
 * hold dem i synk: RLS er den ekte porten, dette er UI-/action-speilet.
 *
 * Krever at BEGGE er aktive (`can_score_for` krever `withdrawn_at is null` på
 * begge sider). Én-flight-spill (≤4 aktive eller wolf) → på tvers av
 * sider/lag; ellers samme tildelte flight.
 *
 * Dette er det ene hjemmet for attestant-regelen: `peersForApproval`
 * (varsling + authz) og `pendingApprovalsFor` (alle tellere og lister) er
 * derivert herfra, så flatene ikke kan divergere (AGENTS.md trap 4).
 */
export function canApproveScorecardFor(
  players: FlightPlayer[],
  gameMode: GameMode,
  approverUserId: string,
  ownerUserId: string,
): boolean {
  // Ingen selv-godkjenning (speiler trigger-vakta i 0103).
  if (approverUserId === ownerUserId) return false;
  const approver = players.find((p) => p.user_id === approverUserId);
  const owner = players.find((p) => p.user_id === ownerUserId);
  if (!approver || !owner) return false;
  if (approver.withdrawn_at != null || owner.withdrawn_at != null) return false;
  if (isSingleFlightGame(gameMode, players)) return true;
  return (
    approver.flight_number != null &&
    approver.flight_number === owner.flight_number
  );
}

/**
 * Scorekortene `approverUserId` faktisk kan godkjenne nå: levert, ikke
 * godkjent ennå, og innenfor attestant-regelen. Delt av /approve-siden,
 * spill-hjem-banneret og hjem-kortene så teller og liste aldri kan si ulike
 * ting.
 */
export function pendingApprovalsFor<
  T extends FlightPlayer & {
    submitted_at: string | null;
    approved_at: string | null;
  },
>(players: T[], gameMode: GameMode, approverUserId: string): T[] {
  return players.filter(
    (p) =>
      p.submitted_at != null &&
      p.approved_at == null &&
      canApproveScorecardFor(players, gameMode, approverUserId, p.user_id),
  );
}

/**
 * True når spillet er et kandidat for flight-inndeling via admin-UI og
 * venteroms-velgeren. Betingelser:
 *   1. Solo-format (ikke lag, ikke matchplay) med team_size = 1.
 *   2. Ikke wolf (wolf = alltid én gruppe, håndteres av isSingleFlightGame).
 *   3. Status scheduled ELLER active (inndeling kan justeres på banen).
 *   4. Aktive spillere > 4 (ellers er vi én-flight og trenger ingen inndeling).
 *
 * Brukes av admin-siden, venterommet og actions for at UI og guards deler
 * én sannhetskilde.
 */
export function eligibleForFlightAssignment(
  gameMode: GameMode,
  players: FlightPlayer[],
): boolean {
  // Wolf er alltid én gruppe — ingen inndeling
  if (gameMode === 'wolf') return false;
  // Vi gater bare på >4 aktive, ikke på solo-format: lag/matchplay-formater
  // er alltid ≤4 aktive i praksis (begge sider + begge lag = maks 8 best-ball,
  // men matchplay ≤4, lag ≤4 per flight satt av validatoren).
  // isSingleFlightGame vil returnere true for dem og blokkerer.
  return !isSingleFlightGame(gameMode, players);
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
