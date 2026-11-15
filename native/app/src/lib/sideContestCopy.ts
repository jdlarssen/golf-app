// #2283: tekstene til sidekonkurransen på hullet, raden og arket
// (`Sidekonk-kortet`, `Sidekonk-gir` og `Sidekonk-hullet` på designlerretet,
// godkjent 15.11). Tegningene er fasit; tekst ingen tegning dekker, følger
// kontrakten.
//
// I en cup står «kampen» der et vanlig spill sier «flighten»: kampen er
// flighten (`side_claim_flight_key` gir 0 i en kamp med høyst fire spillere).
import {
  CLAIM_DISTANCE_MAX_M,
  CLAIM_DISTANCE_MIN_M,
  girQuestionForPar,
  type HoleContest,
  type HoleContestCategory,
  type SideContestCategory,
} from '../../../../lib/games/sideContest';
import type { SideClaimFailure } from '../data/sideClaims';
import { cupPoints } from './cupCopy';

export const SIDE_CONTEST_TEXT = {
  report: 'Meld inn',
  gameKicker: 'Sidekonkurranse',
  cupKicker: 'Sidepoeng',
  rowOffline: 'Uten nett. Meld inn senere.',
  rowFetchFailed: 'Fikk ikke hentet. Prøver igjen.',
  sheetOffline: 'Du er uten nett. Kom tilbake til dette hullet og meld inn når du har dekning.',
  distanceLabel: 'Hvor nær?',
  metre: 'm',
  metreField: 'Meter',
  shorter: '0,5 meter kortere',
  longer: '0,5 meter lengre',
  done: 'Ferdig',
  close: 'Lukk',
  you: 'Deg',
  oneBall: 'Laget spiller én ball, så det teller én gang.',
} as const;

const TITLE: Record<HoleContestCategory, string> = {
  closest_to_pin: 'Nærmest pinnen',
  longest_drive: 'Lengste drive',
  gir: 'GIR',
};

const NONE: Record<HoleContestCategory, string> = {
  closest_to_pin: 'Ingen på green',
  longest_drive: 'Ingen på fairway',
  gir: 'Ingen traff greenen',
};

/** «Nærmest pinnen», «Lengste drive», «GIR». */
export function contestTitle(category: HoleContestCategory): string {
  return TITLE[category];
}

/** Siste linje i arket: «Ingen på green», «Ingen på fairway», «Ingen traff greenen». */
export function noneLabel(category: HoleContestCategory): string {
  return NONE[category];
}

/** «flighten» i et vanlig spill, «kampen» i cup. */
function group(contest: HoleContest): string {
  return contest.source === 'cup' ? 'kampen' : 'flighten';
}

/** Underteksten i raden før noe er meldt inn: «Sidekonkurranse», «+2 p til laget», «+1,5 p per GIR». */
export function contestPointsLine(contest: HoleContest): string {
  if (contest.source === 'game') return SIDE_CONTEST_TEXT.gameKicker;
  if (contest.category === 'gir') return `+${cupPoints(contest.points)} p per GIR`;
  return `+${cupPoints(contest.points)} p til laget`;
}

/** Kickeren i arket: «Sidekonkurranse · hull 7», «Sidepoeng · hull 3 · +2 p til laget». */
export function sheetKicker(contest: HoleContest, holeNumber: number): string {
  if (contest.source === 'game') return `${SIDE_CONTEST_TEXT.gameKicker} · hull ${holeNumber}`;
  return `${SIDE_CONTEST_TEXT.cupKicker} · hull ${holeNumber} · ${contestPointsLine(contest)}`;
}

/** Spørsmålet over lista for nærmest pinnen og lengste drive. */
export function sideQuestion(contest: HoleContest & { category: SideContestCategory }): string {
  return contest.category === 'closest_to_pin'
    ? `Hvem i ${group(contest)} lå nærmest på green etter utslaget?`
    : `Hvem i ${group(contest)} slo lengst ut på fairway?`;
}

const GIR_QUESTION = {
  afterTeeShot: 'Hvem var på greenen etter utslaget?',
  onTwo: 'Hvem var på greenen på to slag?',
  onThree: 'Hvem var på greenen på tre slag?',
  onFour: 'Hvem var på greenen på fire slag?',
} as const;

/** GIR-spørsmålet følger hullets par: på greenen på par − 2 slag. */
export function girQuestion(par: number): string {
  return `${GIR_QUESTION[girQuestionForPar(par)]} Trykk på alle som traff.`;
}

/** Hvem lagret sist: «deg» eller fornavnet. `null` når det ikke er kjent. */
export type SavedBy = { me: true } | { me: false; name: string | null };

function savedByText(savedBy: SavedBy): string {
  if (savedBy.me) return 'Lagret av deg.';
  return savedBy.name ? `Lagret av ${savedBy.name}.` : 'Lagret.';
}

/**
 * Linja over «Ferdig». Før noe er lagret: hvem svaret deles med. Etter: hvem
 * som lagret, og at alle kan endre. Uten nett kan ingen endre nå, så da står
 * bare hvem som lagret.
 */
export function sideStatus(
  contest: HoleContest,
  savedBy: SavedBy | null,
  offline: boolean,
): string {
  const who = group(contest);
  if (!savedBy) {
    const shared = contest.source === 'cup' ? 'Svaret deles med kampen.' : 'Svaret deles med hele flighten.';
    return `${shared} Arrangøren kårer vinneren til slutt.`;
  }
  if (offline) return savedByText(savedBy);
  return `${savedByText(savedBy)} Alle i ${who} kan endre.`;
}

/** Samme linje for GIR. Foursomes-familien spiller én ball per side. */
export function girStatus(
  maxPerTeam: number,
  oneBallPerSide: boolean,
  savedBy: SavedBy | null,
  offline: boolean,
): string {
  const rule = oneBallPerSide ? SIDE_CONTEST_TEXT.oneBall : `Hvert lag får poeng for høyst ${maxPerTeam}.`;
  if (!savedBy) return `Svaret deles med kampen. ${rule}`;
  if (offline) return savedByText(savedBy);
  return `${savedByText(savedBy)} ${rule}`;
}

/** Avstanden med norsk komma og én desimal: «2,5», «11,5». */
export function formatDistance(distanceM: number): string {
  return distanceM.toFixed(1).replace('.', ',');
}

/** Svaret i raden: «Marte · 2,5 m», «Deg», «Ingen på green». */
export function sideAnswer(
  category: SideContestCategory,
  winnerName: string | null,
  distanceM: number | null,
): string {
  if (winnerName == null) return NONE[category];
  if (distanceM == null) return winnerName;
  return `${winnerName} · ${formatDistance(distanceM)} ${SIDE_CONTEST_TEXT.metre}`;
}

/** Svaret i GIR-raden: «2 av 4 traff», eller «Ingen traff greenen» når alle bommet. */
export function girAnswer(hits: number, balls: number, allMissed: boolean): string {
  if (allMissed) return NONE.gir;
  return `${hits} av ${balls} traff`;
}

/** Steget på − og +. */
export const DISTANCE_STEP_M = 0.5;

/**
 * Avstanden etter et trykk på − eller +, eller `null` når trykket ville gått
 * utenfor 0,1–99,9 m. Fra tomt felt gir + første steget (0,5 m).
 */
export function stepDistance(current: number | null, direction: -1 | 1): number | null {
  if (current == null) return direction === 1 ? DISTANCE_STEP_M : null;
  const next = Math.round((current + direction * DISTANCE_STEP_M) * 10) / 10;
  if (next < CLAIM_DISTANCE_MIN_M || next > CLAIM_DISTANCE_MAX_M) return null;
  return next;
}

/**
 * Hva spilleren får vite når en innmelding ikke ble lagret. Valget hopper
 * tilbake, og teksten står i arket.
 */
export function describeSideClaimFailure(failure: SideClaimFailure, contest: HoleContest): string {
  switch (failure) {
    case 'not_authenticated':
      return 'Du er ikke logget inn lenger. Logg inn på nytt.';
    case 'not_active':
      return 'Runden er avsluttet. Nå kan ingenting registreres mer.';
    case 'not_player':
      return `Du er ikke med i ${group(contest)} lenger, så svaret ble ikke lagret.`;
    case 'wrong_flight':
      return `Spilleren er ikke med i ${group(contest)} din lenger, så svaret ble ikke lagret.`;
    case 'no_slot':
      return 'Hullet har ikke sidekonkurranse lenger, så svaret ble ikke lagret.';
    case 'bad_distance':
      return 'Avstanden må være mellom 0,1 og 99,9 meter.';
    case 'db_error':
      return 'Fikk ikke lagret. Sjekk nettet og prøv igjen.';
  }
}
