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
//
// #2200: det samme gjelder leveringen for flighten. Hvem jeg kan levere for, er
// den delte `flightDeliveryCandidates`; her er bare oversettelsen inn og
// setningene ut.
import { rotationSlotRange } from '../../../../lib/games/assignRotationSlots';
import {
  flightDeliveryCandidates,
  type DeliveryPlayer,
} from '../../../../lib/games/flightDelivery';
import {
  isSingleFlightGame,
  organizerApprovalRow,
  pendingApprovalsFor,
  type FlightPlayer,
} from '../../../../lib/games/flightScope';
import { isMatchplayMode } from '../../../../lib/games/matchplaySides';
import type { HoleSegment } from '../../../../lib/scoring/holeSegment';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { wolfLinearHolesForSlot } from '../../../../lib/wolf/wolfLinearHolesForSlot';
import type { LocalScore } from '../data/db';
import type { BundleGame, BundlePlayer } from '../data/gameBundle';
import { displayName } from './display';
import { wolfRotationPlayers } from './wolfHole';

/** En roster-rad i den formen de delte reglene leser, med spilleren vedlagt. */
export interface RosterEntry extends FlightPlayer {
  submitted_at: string | null;
  /** Hvem som leverte kortet (#2200). Den kan ikke også godkjenne det. */
  submitted_by_user_id: string | null;
  approved_at: string | null;
  player: BundlePlayer;
}

export function toRoster(players: readonly BundlePlayer[]): RosterEntry[] {
  return players.map((player) => ({
    user_id: player.userId,
    flight_number: player.flightNumber,
    withdrawn_at: player.withdrawnAt,
    submitted_at: player.submittedAt,
    submitted_by_user_id: player.submittedByUserId,
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

/**
 * Kortene jeg kan godkjenne nå.
 *
 * Gaten er webbens `PendingApprovalsBanner.tsx:29` (#2220): lista finnes bare
 * når runden krever godkjenning (`requirePeerApproval`) OG pågår. Uten den ba
 * appen makkerne godkjenne i vanlige runder, der RLS (0106) lar dem sende
 * kortet tilbake, og i avsluttede, der skrivingen svarer «ikke aktivt».
 *
 * Hvem som kan attestere hvem er den delte `pendingApprovalsFor`, uendret.
 * Gaten er et spørsmål om spillet, ikke om attestanten, og står derfor her.
 */
export function pendingApprovals(
  roster: readonly RosterEntry[],
  game: Pick<BundleGame, 'gameMode' | 'status' | 'requirePeerApproval'>,
  approverUserId: string,
): RosterEntry[] {
  if (!game.requirePeerApproval || game.status !== 'active') return [];
  return pendingApprovalsFor([...roster], game.gameMode as GameMode, approverUserId);
}

/**
 * Arrangørens eget kort i ventelista (#2213, #2200): kan en medspiller godkjenne
 * det, eller ingen? Regelen er den delte `organizerApprovalRow`, som webbens
 * avslutt-side bruker. Arrangøren er `games.created_by` og aldri admin i appen,
 * så egen rad gir aldri `can_approve`.
 *
 * Ingen kan godkjenne kortet når eneste mulige makker leverte det (den som
 * leverte, godkjenner ikke) eller de andre er trukket. Da er veien ut å åpne
 * kortet igjen og avslutte likevel.
 */
export function ownCardApproval(
  roster: readonly RosterEntry[],
  gameMode: GameMode,
  organiserUserId: string,
): 'own_card_needs_peer' | 'own_card_no_peer' {
  const row = organizerApprovalRow(
    [...roster],
    gameMode,
    { userId: organiserUserId, isAdmin: false },
    organiserUserId,
  );
  return row === 'own_card_no_peer' ? 'own_card_no_peer' : 'own_card_needs_peer';
}

/**
 * Kortene jeg kan levere sammen med mitt eget (#2200), i roster-rekkefølge.
 * Tom liste når det ikke er noen.
 *
 * Regelen er den delte `flightDeliveryCandidates`, og serveren spør den samme
 * regelen igjen før den leverer. Her er bare oversettelsen: bundelens camelCase
 * og de lokale slagene inn, bundel-spillerne ut, så skjermen har navn og
 * gjeste-flagg å vise.
 *
 * Slagene er de lokale radene slik de ligger i SQLite, med `entered_by`. Det er
 * dem spilleren ser, og kø-vakta på scorekortet holder knappen igjen til de er
 * framme på serveren.
 */
export function flightDeliveryFor(
  bundle: {
    game: Pick<BundleGame, 'gameMode' | 'holeSegment' | 'sourceGameId'>;
    players: readonly BundlePlayer[];
  },
  scores: readonly LocalScore[],
  actorId: string,
): BundlePlayer[] {
  const players: DeliveryPlayer[] = bundle.players.map((player) => ({
    user_id: player.userId,
    flight_number: player.flightNumber,
    withdrawn_at: player.withdrawnAt,
    team_number: player.teamNumber,
    submitted_at: player.submittedAt,
    is_guest: player.isGuest,
  }));
  const ids = new Set(
    flightDeliveryCandidates(actorId, {
      players,
      scores: scores.map((score) => ({
        user_id: score.userId,
        hole_number: score.holeNumber,
        strokes: score.strokes,
        entered_by: score.enteredBy,
      })),
      game: {
        game_mode: bundle.game.gameMode as GameMode,
        hole_segment: bundle.game.holeSegment as HoleSegment,
        source_game_id: bundle.game.sourceGameId,
      },
    }),
  );
  return bundle.players.filter((player) => ids.has(player.userId));
}

/** «Ola», «Ola og Kari», «Ola, Kari og Per» — navnene slik rosteret viser dem. */
function namesOf(players: readonly BundlePlayer[]): string {
  return joinWithOg(players.map(displayName));
}

/**
 * Setningene over lever-knappen når jeg kan levere for makkerne (#2200).
 *
 * Første linje nevner alle kortene. Resten sier hvorfor: jeg har ført hullene
 * til de vanlige spillerne, og en gjest kan ikke levere selv. Uten gjester
 * holder det med «Du har ført alle hullene.»
 */
export function flightDeliveryLines(candidates: readonly BundlePlayer[]): string[] {
  const guests = candidates.filter((player) => player.isGuest);
  const others = candidates.filter((player) => !player.isGuest);
  const lines = [
    candidates.length === 1
      ? `Lever også kortet til ${namesOf(candidates)}.`
      : `Lever også kortene til ${namesOf(candidates)}.`,
  ];
  if (guests.length === 0) {
    lines.push('Du har ført alle hullene.');
    return lines;
  }
  if (others.length > 0) {
    lines.push(`Du har ført alle hullene til ${namesOf(others)}.`);
  }
  lines.push(
    guests.length === 1
      ? `${namesOf(guests)} er gjest og kan ikke levere selv.`
      : `${namesOf(guests)} er gjester og kan ikke levere selv.`,
  );
  return lines;
}

/**
 * Knappen på spillhjemmet når mitt eget kort er levert og makkerkort står
 * igjen (#2200), som nettsidens `game.home.ctaDeliverFlight`. `null` = ingen.
 */
export function flightCtaLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? 'Lever kortet du har ført' : `Lever kortene du har ført (${count})`;
}

/** Lever-knappen når makkerne leveres med: mitt kort pluss deres. */
export function flightDeliveryButton(candidates: readonly BundlePlayer[]): string {
  return `Lever ${candidates.length + 1} kort ✓`;
}

/** Knappen når mitt eget kort alt er levert, og bare makkernes står igjen. */
export function deliverForButton(candidates: readonly BundlePlayer[]): string {
  return `Lever for ${namesOf(candidates)} ✓`;
}

/**
 * Beskjeden når serveren leverte færre makkerkort enn knappen lovet (#2200),
 * eller `null` når alle gikk. Ruta spør leveringsregelen selv over slagene på
 * serveren, og de kan være nyere enn telefonens: en makker har levert, eller
 * noen har ført et hull. Da skal ikke skjermen late som alt gikk.
 */
export function partialDeliveryNotice(delivered: number, asked: number): string | null {
  if (delivered >= asked) return null;
  if (asked === 1) {
    return 'Makkerkortet ble ikke levert. Noen kan ha levert det eller ført et hull på det i mellomtiden.';
  }
  if (delivered === 0) {
    return `Ingen av de ${asked} makkerkortene ble levert. Noen kan ha levert dem eller ført hull på dem i mellomtiden.`;
  }
  return `${delivered} av ${asked} makkerkort ble levert. Noen kan ha levert de andre eller ført hull på dem i mellomtiden.`;
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
  const status = rosterStatus(player, players);
  return [...rosterPlacementMarks(player, gameMode, players), ...(status ? [status] : [])];
}

/**
 * Plassen i spillet — alt i `rosterMarks` unntatt statusen. Egen funksjon fordi
 * raden tegner statusen for seg, med hake (#1879).
 */
export function rosterPlacementMarks(
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

  return marks;
}

/**
 * Kortets tilstand som data, eller `null` før noe er levert. Trukket vinner,
 * så Godkjent, så Levert.
 *
 * Skjermene som tegner noe ut fra tilstanden (haken i rosteret), spør denne og
 * ikke etiketten. Etiketten har navn i seg (#2200), så en sammenligning mot
 * «Levert» ville mistet haken på et kort en makker leverte.
 */
export type RosterStatusKind = 'withdrawn' | 'approved' | 'submitted';

export function rosterStatusKind(player: BundlePlayer): RosterStatusKind | null {
  if (player.withdrawnAt) return 'withdrawn';
  if (player.approvedAt) return 'approved';
  if (player.submittedAt) return 'submitted';
  return null;
}

export type RosterStatus = 'Trukket' | 'Godkjent' | 'Levert' | `Levert av ${string}`;

/**
 * «Levert», eller «Levert av Ola» når en annen leverte kortet (#2200). Delt av
 * rosteret og avslutt-skjermen, så arrangøren ser det samme begge steder.
 * Står leverandøren ikke i rosteret, eller er ukjent, står det bare «Levert».
 */
export function submittedLabel(
  player: BundlePlayer,
  players: readonly BundlePlayer[],
): 'Levert' | `Levert av ${string}` {
  const by = player.submittedByUserId;
  if (by == null || by === player.userId) return 'Levert';
  const deliverer = players.find((other) => other.userId === by);
  return deliverer ? `Levert av ${displayName(deliverer)}` : 'Levert';
}

/**
 * Etiketten for {@link rosterStatusKind}.
 *
 * #2200: har en annen enn spilleren levert kortet, står det «Levert av Ola».
 * Navnet hentes fra rosteret; står leverandøren ikke der, eller er ukjent,
 * står det bare «Levert».
 */
export function rosterStatus(
  player: BundlePlayer,
  players: readonly BundlePlayer[],
): RosterStatus | null {
  switch (rosterStatusKind(player)) {
    case 'withdrawn':
      return 'Trukket';
    case 'approved':
      return 'Godkjent';
    case 'submitted':
      return submittedLabel(player, players);
    case null:
      return null;
  }
}
