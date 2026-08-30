// Native N3 (#1825): rosteret slik de DELTE reglene vil ha det.
//
// `gameBundle` gir camelCase (delt kontrakt med resten av appen), mens
// `lib/games/flightScope.ts` jobber på `game_players`-radens snake_case. I
// stedet for å speile flight- og attestant-reglene her — de er RLS-tvillinger
// (`can_score_for`, 0095/0106) og skal ha ETT hjem — oversetter vi rosteret én
// gang og lar de delte funksjonene svare.
//
// `player` bæres med gjennom oversettelsen, så en spiller som kommer ut av
// `pendingApprovalsFor` fortsatt har navn, lag og banehandicap å vise.
import {
  canApproveScorecardFor,
  isSingleFlightGame,
  pendingApprovalsFor,
  type FlightPlayer,
} from '../../../../lib/games/flightScope';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer } from '../data/gameBundle';

/** En roster-rad i den formen de delte reglene leser, med spilleren vedlagt. */
export interface RosterEntry extends FlightPlayer {
  submitted_at: string | null;
  approved_at: string | null;
  player: BundlePlayer;
}

export function toRoster(players: readonly BundlePlayer[]): RosterEntry[] {
  return players.map((player) => ({
    user_id: player.userId,
    flight_number: player.flightNumber,
    withdrawn_at: player.withdrawnAt,
    submitted_at: player.submittedAt,
    approved_at: player.approvedAt,
    player,
  }));
}

export function findInRoster(
  roster: readonly RosterEntry[],
  userId: string,
): RosterEntry | undefined {
  return roster.find((entry) => entry.user_id === userId);
}

/**
 * Hvem som vises som kort på hull-siden — speil av webbens `resolveFlight`
 * (`holes/[holeNumber]/holePagePlayers.ts`).
 *
 * Regelen selv er delt (`isSingleFlightGame`): ≤4 aktive spillere eller wolf
 * betyr én fysisk gruppe, og da ser alle alle. Ellers er det spillere med
 * samme `flight_number` — bortsett fra når jeg selv ikke har en flight, der
 * webben viser hele rosteret (arven fra flight-løse spill). Trukkede spillere
 * er aldri med: de står ikke på banen.
 */
export function resolveFlight(
  roster: readonly RosterEntry[],
  gameMode: GameMode,
  me: RosterEntry,
): RosterEntry[] {
  const active = roster.filter((entry) => entry.withdrawn_at == null);
  if (isSingleFlightGame(gameMode, [...roster]) || me.flight_number == null) {
    return active;
  }
  return active.filter((entry) => entry.flight_number === me.flight_number);
}

/** Kortene jeg kan godkjenne nå. Ren gjenbruk av den delte regelen. */
export function pendingApprovals(
  roster: readonly RosterEntry[],
  gameMode: GameMode,
  approverUserId: string,
): RosterEntry[] {
  return pendingApprovalsFor([...roster], gameMode, approverUserId);
}

/** Kan jeg attestere dette kortet? Delt regel — RLS (0106) er den ekte porten. */
export function canApprove(
  roster: readonly RosterEntry[],
  gameMode: GameMode,
  approverUserId: string,
  ownerUserId: string,
): boolean {
  return canApproveScorecardFor(
    [...roster],
    gameMode,
    approverUserId,
    ownerUserId,
  );
}
