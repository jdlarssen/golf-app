// #2750: flightvelgeren i appen, som ren logikk. Raden under billetten og arket
// den åpner (`components/game/FlightPicker.tsx`) tegner det denne fila svarer.
//
// Reglene er nettets: hvem som får velge er `eligibleForFlightAssignment`, og
// hvilke flighter som tilbys er `offeredFlightNumbers`, begge importert. Serveren
// avgjør uansett (`lib/games/joinFlight.ts`), så dette er bare hva skjermen viser.
//
// Teksten bor her. Det nettsiden også sier, er låst tegn for tegn mot
// `messages/no.json` i testen. Resten står på tegningen (Forslag 2, eierens valg
// 01.11).
import {
  MAX_FLIGHT_SIZE,
  eligibleForFlightAssignment,
  flightBuckets,
} from '../../../../lib/games/flightScope';
import { offeredFlightNumbers } from '../../../../lib/games/startlist';
import { expectedTeamSize } from '../../../../lib/games/teamScope';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer, GameBundle } from '../data/gameBundle';
import type { JoinFlightFailure, JoinFlightResult } from '../data/joinFlight';
import { formatNameList, shortDisplayName } from './display';
import type { TicketStub } from './gameTicket';
import { toRoster } from './roster';
import { OFFLINE_NOTE } from './rosterCopy';
import { WEB_LINK_TEXT } from './webLink';

export const FLIGHT_PICKER_TEXT = {
  titlePick: 'Velg flight',
  titleSwitch: 'Bytt flight',
  rowNoFlight: 'Du er ikke plassert i en flight ennå.',
  rowInFlight: (flight: number) => `Du står i flight ${flight}.`,
  /** Webbens `game.waitingRoom.notInFlight`. */
  notInFlight: 'Du er ikke plassert i en flight ennå. Trykk på en flight for å bli med.',
  hintSwitch: 'Trykk på en annen flight for å bytte.',
  /** Webbens `game.waitingRoom.flightLabel`. */
  flightLabel: (flight: number) => `Flight ${flight}`,
  sectionMine: 'Din flight',
  sectionOpen: 'Ledige plasser',
  sectionFull: 'Fulle flighter',
  emptyFlight: 'Ingen ennå',
  you: 'Du',
  join: 'Bli med',
  switchHere: 'Bytt hit',
  /** Webbens `game.waitingRoom.flightYours`. */
  yours: 'Din',
  /** Webbens `game.waitingRoom.flightFull`. */
  full: 'Full',
  close: 'Lukk',
} as const;

/** Én flight i arket, ferdig til å tegnes. */
export type PickerFlight = {
  number: number;
  label: string;
  /** «Du, Marte og Jonas», eller «Ingen ennå». */
  names: string;
  /** Navnene står dempet i en tom og en full flight, også min egen, som på tegningen. */
  namesMuted: boolean;
  count: string;
  status: string;
  mine: boolean;
  /** Full, og ikke min. Min egen flight er «Din» også når den er full. */
  full: boolean;
  /** Min egen og fulle flighter kan ikke trykkes. */
  disabled: boolean;
  a11y: string;
};

export type PickerSection = {
  key: 'mine' | 'open' | 'full';
  title: string;
  flights: PickerFlight[];
};

export type FlightPickerModel = {
  myFlight: number | null;
  title: string;
  rowSub: string;
  hint: string;
  sections: PickerSection[];
};

/**
 * Om raden skal stå. Stubben er `scheduled` bare for en aktiv spiller i et
 * planlagt spill i et format appen fører, så den dekker trukket, stengt format,
 * utkast og arrangøren som ikke spiller. Resten er webbens `showFlightPicker`:
 * jeg har ikke lag, og flighten er en fri gruppering i et spill med mer enn fire
 * aktive.
 *
 * Tee-off teller ikke. En runde som sitter fast fordi noen mangler flight, er
 * fortsatt `scheduled` (#2204), og da er velgeren det som kan løse det.
 */
export function flightPickerVisible(
  bundle: Pick<GameBundle, 'game' | 'players'>,
  userId: string,
  stubKind: TicketStub['kind'],
): boolean {
  if (stubKind !== 'scheduled') return false;
  const me = bundle.players.find((player) => player.userId === userId);
  if (!me || me.teamNumber != null) return false;
  return eligibleForFlightAssignment(
    bundle.game.gameMode as GameMode,
    expectedTeamSize(bundle.game.modeConfig as { team_size?: number } | null),
    toRoster(bundle.players),
  );
}

/** «Du» først, så de andre i rosterens rekkefølge, som navnelista på billetten. */
function memberNames(members: readonly BundlePlayer[], userId: string): string {
  if (members.length === 0) return FLIGHT_PICKER_TEXT.emptyFlight;
  const others = members.filter((player) => player.userId !== userId).map(shortDisplayName);
  const mine = members.some((player) => player.userId === userId);
  return formatNameList(mine ? [FLIGHT_PICKER_TEXT.you, ...others] : others);
}

/** Raden og arket for denne spilleren, fra siste henting av spillet. */
export function buildFlightPicker(
  bundle: Pick<GameBundle, 'players'>,
  userId: string,
): FlightPickerModel {
  const roster = toRoster(bundle.players);
  const { assigned, unassigned } = flightBuckets(roster);
  const activeCount =
    unassigned.length + [...assigned.values()].reduce((sum, members) => sum + members.length, 0);
  const myFlight =
    bundle.players.find((player) => player.userId === userId)?.flightNumber ?? null;
  const action = myFlight == null ? FLIGHT_PICKER_TEXT.join : FLIGHT_PICKER_TEXT.switchHere;

  const flights = offeredFlightNumbers(activeCount, assigned.keys()).map((number): PickerFlight => {
    const members = (assigned.get(number) ?? []).map((entry) => entry.player);
    const mine = number === myFlight;
    const filled = members.length >= MAX_FLIGHT_SIZE;
    const full = !mine && filled;
    const names = memberNames(members, userId);
    const status = mine ? FLIGHT_PICKER_TEXT.yours : full ? FLIGHT_PICKER_TEXT.full : action;
    const label = FLIGHT_PICKER_TEXT.flightLabel(number);
    return {
      number,
      label,
      names,
      namesMuted: members.length === 0 || filled,
      count: `${members.length}/${MAX_FLIGHT_SIZE}`,
      status,
      mine,
      full,
      disabled: mine || full,
      a11y: `${label}, ${members.length} av ${MAX_FLIGHT_SIZE}, ${names}. ${status}`,
    };
  });

  const sections: PickerSection[] = [
    { key: 'mine' as const, title: FLIGHT_PICKER_TEXT.sectionMine, flights: flights.filter((f) => f.mine) },
    {
      key: 'open' as const,
      title: FLIGHT_PICKER_TEXT.sectionOpen,
      flights: flights.filter((f) => !f.mine && !f.full),
    },
    { key: 'full' as const, title: FLIGHT_PICKER_TEXT.sectionFull, flights: flights.filter((f) => f.full) },
  ].filter((section) => section.flights.length > 0);

  return {
    myFlight,
    title: myFlight == null ? FLIGHT_PICKER_TEXT.titlePick : FLIGHT_PICKER_TEXT.titleSwitch,
    rowSub: myFlight == null ? FLIGHT_PICKER_TEXT.rowNoFlight : FLIGHT_PICKER_TEXT.rowInFlight(myFlight),
    hint: myFlight == null ? FLIGHT_PICKER_TEXT.notInFlight : FLIGHT_PICKER_TEXT.hintSwitch,
    sections,
  };
}

/**
 * Fra kode til setning. Ordene er webbens (`game.waitingRoom.errors.*`) der
 * webben har dem. Ingen `default`: en ny kode feller `tsc`.
 */
export function describeJoinFlightFailure(reason: JoinFlightFailure): string {
  switch (reason) {
    case 'flight_full':
      return 'Den flighten ble nettopp full. Velg en annen.';
    case 'bad_flight':
      return 'Den flighten finnes ikke lenger. Velg en annen.';
    case 'not_member':
      return 'Du er ikke deltaker i dette spillet.';
    case 'game_not_scheduled':
      return 'Spillet er ikke lenger i planleggingsfasen.';
    case 'flight_bound_to_team':
      return 'Laget ditt er flighten din — den kan ikke byttes.';
    case 'flight_failed':
      return 'Noe gikk galt. Prøv igjen.';
    case 'offline':
    case 'network':
      return OFFLINE_NOTE;
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return 'Logg inn på nytt og prøv igjen.';
  }
}

/**
 * Hva arket gjør med svaret.
 *
 * Ved `ok` og når runden har startet lukkes arket, og bundelen viser resten. Ved
 * andre svar blir arket stående med feilen, og lista hentes på nytt, så den viser
 * det som faktisk gjelder. Også etter `network`: kallet kan ha nådd fram selv om
 * svaret ikke kom tilbake. Uten nett hentes ingenting. Det ville bare latt
 * spilleren vente på en henting som ikke kan lykkes.
 */
export function joinFlightOutcome(result: JoinFlightResult): {
  close: boolean;
  refetch: boolean;
  notice: string | null;
} {
  if (result.ok || result.reason === 'game_not_scheduled') {
    return { close: true, refetch: true, notice: null };
  }
  return {
    close: false,
    refetch: result.reason !== 'offline',
    notice: describeJoinFlightFailure(result.reason),
  };
}
