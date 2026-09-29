// #2255: all tekst på startbilletten — spillets side i appen.
//
// Samme mønster som `homeCopy.ts`: appen har ingen i18n ennå, så teksten bor
// her som en håndkopi. Det som også står på nettsidens spillside
// (`game.home.*`), låses tegn for tegn mot `messages/no.json` i
// `ticketCopy.test.ts`. Plassen i en avsluttet runde er `finishedResultText`
// i `homeCopy.ts`, og statusmerket er de delte `STATUS_LABELS`.

export const TICKET_TEXT = {
  // Feltene på billetten. Stilen setter dem i versaler.
  start: 'Start',
  /** Webbens `game.home.flightValueLabel`. */
  flight: 'Flight',
  /** Webbens `game.home.teamLabel`. */
  team: 'Lag',
  /** Webbens `game.home.sideLabel` (#1880: en side i duellen, ikke et lag). */
  side: 'Side',
  players: 'Spillere',
  strokes: 'Dine slag',
  /** Verdien når tallet ikke finnes eller er skjult (reveal). */
  noValue: '—',
  /** Det samme for skjermleseren, som ellers leser streken høyt. */
  noValueSpoken: 'ikke vist',
  /** Webbens `game.home.registered` («DU ER PÅMELDT»), i setningsform. */
  registered: 'Du er påmeldt',
  /** Webbens `game.home.viewOnMap`. */
  viewOnMap: 'Vis på kart',
  mapFailed: 'Fikk ikke åpnet kartet.',
  /** Webbens `game.home.ctaStartRound`. */
  startRound: 'Start runden →',
  /** Webbens `game.home.ctaReviewAndSubmit`. */
  reviewAndSubmit: 'Gjennomgå og lever →',
  /** Webbens `game.home.draftBanner`. */
  draft: 'Utkast — admin planlegger fortsatt. Detaljer kan endre seg.',
  finishedNoResult: 'Runden er avsluttet.',
  notPlayer: 'Du står ikke oppført som spiller her.',
  submittedPending: 'Kortet er levert. Nå venter det på en makker.',
  submittedApproved: 'Kortet er levert og godkjent.',
  tilesLabel: 'Runden',
  tileBoard: 'Tavla',
  tileScorecard: 'Scorekort',
  tileRules: 'Regler',
  roster: 'Spillere',
} as const;

/** «Du har spilt 7 av 18 hull». */
export function playedLine(played: number, total: number): string {
  return `Du har spilt ${played} av ${total} hull`;
}

/** Webbens `game.home.teeInfo`: «Tee: Gul». */
export function teePart(teeName: string): string {
  return `Tee: ${teeName}`;
}

/** «85 % handicap», med hardt mellomrom så tallet og tegnet står sammen. */
export function allowancePart(pct: number): string {
  return `${pct} % handicap`;
}

/** Verdien i FLIGHT-feltet: «2 av 3». */
export function flightOf(flight: number, flights: number): string {
  return `${flight} av ${flights}`;
}

/** Ett felt for skjermleseren: etikett og verdi i én setning. */
export function fieldA11y(label: string, value: string): string {
  return `${label}: ${value}`;
}

/** Avatarraden for skjermleseren: «Flighten din: Du, Marte og Jonas». */
export function rosterA11y(inFlight: boolean, names: string): string {
  return `${inFlight ? 'Flighten din' : 'Med i runden'}: ${names}`;
}

/** Overskriften over formatforklaringen: «Regler: Stableford». */
export function rulesHeading(format: string): string {
  return `Regler: ${format}`;
}

export function approveButton(count: number): string {
  return `Godkjenn (${count})`;
}
