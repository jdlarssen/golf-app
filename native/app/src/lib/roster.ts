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
import { rotationSlotRange } from '../../../../lib/games/assignRotationSlots';
import {
  canApproveScorecardFor,
  isSingleFlightGame,
  pendingApprovalsFor,
  type FlightPlayer,
} from '../../../../lib/games/flightScope';
import { isMatchplayMode } from '../../../../lib/games/matchplaySides';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { wolfLinearHolesForSlot } from '../../../../lib/wolf/wolfLinearHolesForSlot';
import type { BundlePlayer } from '../data/gameBundle';
import { wolfRotationPlayers } from './wolfHole';

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

/**
 * Skal appen bekrefte deltakelsen min nå? (#463, N6b #1855)
 *
 * Webbens modell er «besøk = bekreftelse»: åpner du spillsiden, regnes du som
 * påmeldt, og `maybeAutoConfirmParticipation` setter `accepted_at`. Appen gjør
 * det samme når spill-hjem åpnes, uten noe eget UI — arrangøren ser bare at
 * merket dukker opp i rosteret.
 *
 * To gater, begge webbens:
 *  - Jeg må stå på rosteret, og `accepted_at` må fortsatt være tom. En rad som
 *    alt er bekreftet skal ikke få et nytt tidsstempel hver gang skjermen åpnes.
 *  - Et `draft` er arrangørens kladd. Ingen er invitert ennå, så det finnes
 *    ingenting å bekrefte.
 */
export function shouldConfirmParticipation(
  me: { acceptedAt: string | null } | undefined,
  gameStatus: string,
): boolean {
  if (!me || me.acceptedAt != null) return false;
  return gameStatus !== 'draft';
}

/** «3, 7, 11 og 15» — norsk oppramsing, komma hele veien og «og» før den siste. */
function joinWithOg(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} og ${items[items.length - 1]}`;
}

/**
 * Merkelappene som står til høyre for navnet i rosteret (#1874).
 *
 * Den ene grenen som er verdt å forklare er rotasjons-formatene (wolf og round
 * robin, se `rotationSlotRange`). Der er `team_number` = `flight_number` en
 * PLASS I ROTASJONEN, trukket ved start — ikke et lag, og ikke en ball.
 * «Flight 3 · Lag 3» leste eieren som «dere går hver for dere», og det er
 * motsatt av sant: wolf er alltid én gruppe.
 *
 *  - **Wolf:** plassen sier hvilke hull du er Wolf på, så det er det den sier.
 *    Bare den faste delen av rotasjonen — trailing-hullene avgjøres av
 *    stillingen og annonseres av `WolfChoiceCard` når runden er der.
 *  - **Round robin:** ingen merkelapp. Rekkefølgen er rent kosmetisk for
 *    poengene, og nettsiden viser heller ingenting. Paritet, ikke utelatelse.
 *  - **Matchplay (#1880):** `team_number` er en side i duellen, så det står
 *    «Side N» — og ingen Flight, for en duell er alltid flight 1. En side
 *    utenfor {1, 2} er utdatert data og får ingen merkelapp.
 *  - **Alt annet:** Flight og Lag som før.
 *
 * ⚠️ **n telles av `wolfRotationPlayers`, ikke av «aktive spillere».** Webbens
 * `computeWolfContext` tar ALLE med `team_number` satt — trukne også — og n
 * styrer både rotasjonslengden og lone/blind-potten. Teller vi annerledes her,
 * sier rosteret ett sett hull og `WolfChoiceCard` et annet på samme runde.
 * Derfor tar funksjonen hele rosteret og teller selv: da finnes det ingen
 * kallsteder som kan telle feil.
 */
export function rosterMarks(
  player: BundlePlayer,
  gameMode: GameMode,
  players: readonly BundlePlayer[],
): string[] {
  const marks: string[] = [];

  if (isMatchplayMode(gameMode)) {
    if (player.teamNumber === 1 || player.teamNumber === 2) {
      marks.push(`Side ${player.teamNumber}`);
    }
  } else if (rotationSlotRange(gameMode) === null) {
    if (player.flightNumber != null) marks.push(`Flight ${player.flightNumber}`);
    if (player.teamNumber != null) marks.push(`Lag ${player.teamNumber}`);
  } else if (gameMode === 'wolf' && player.teamNumber != null) {
    // Tom liste = plassen gir ikke noe svar (rotasjonen er ikke trukket ennå,
    // raden er utdatert, eller spillertallet er utenfor wolf). Da står raden
    // uten merkelapp heller enn med en gjetning.
    const holes = wolfLinearHolesForSlot(
      player.teamNumber,
      wolfRotationPlayers(players).length,
    );
    if (holes.length > 0) {
      marks.push(`Wolf på hull ${joinWithOg(holes.map(String))}`);
    }
  }

  if (player.withdrawnAt) marks.push('Trukket');
  else if (player.approvedAt) marks.push('Godkjent');
  else if (player.submittedAt) marks.push('Levert');

  return marks;
}
