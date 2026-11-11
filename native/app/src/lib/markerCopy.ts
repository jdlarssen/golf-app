// #2661: tekstene for markøren i en simulatorliga. Ordlyden er webbens
// (`game.submit.marker`, `liga.marker`, `liga.player.markerQueue` i
// `messages/no.json`), og `markerCopy.test.ts` holder dem like tegn for tegn.
// Samme arbeidsdeling som de andre `*Copy.ts`: skjermen viser, teksten bor her.

export const MARKER_TEXT = {
  /** Velgeren over lever-knappen (`game.submit.marker`). */
  legend: 'Markør',
  hint: 'Velg hvem i ligaen som skal godkjenne kortet. Markøren får beskjed, og runden teller når kortet er godkjent.',
  none: 'Ingen andre i ligaen kan godkjenne kortet ennå. Be arrangøren legge til flere spillere.',
  unknownPlayer: 'Ukjent spiller',
  /** Søket i velgeren (#2675, `game.submit.marker`). */
  searchLabel: 'Søk etter markør',
  searchPlaceholder: 'Søk etter spiller',
  noMatch: 'Ingen spillere med det navnet.',
  showFewer: 'Vis færre',
  /** Markørens skjerm (`liga.marker`). */
  screenTitle: 'Markør',
  loading: 'Henter kortet …',
  /** Bare i appen: lesingen fra serveren feilet (eller kortet er ikke ditt). */
  loadFailed: 'Fikk ikke hentet kortet.',
  retry: 'Prøv igjen',
  intro: 'Se over slagene. Godkjenner du kortet, teller runden i tabellen. Stemmer noe ikke, sender du det tilbake med en kort grunn.',
  organizerNoMarker: 'Du godkjenner som arrangør.',
  /** Under kortet når det er godkjent (`liga.marker.state.approved`). */
  approved: 'Kortet er godkjent.',
  rejected: 'Kortet er sendt tilbake. Spilleren får beskjed med grunnen.',
  notDelivered: 'Kortet er ikke levert. Spilleren retter det og sender det inn igjen.',
  withdrawn: 'Spilleren har trukket seg fra runden.',
  closed: 'Runden er avsluttet.',
  /** Ligasiden (`liga.player.markerQueue`). */
  queueHeading: 'Venter på deg som markør',
  organizerQueueHeading: 'Venter på markøren',
  review: 'Se over',
} as const;

/** «Kortet til Anders» (`liga.marker.heading`). */
export function markerCardHeading(name: string | null): string {
  return `Kortet til ${name ?? MARKER_TEXT.unknownPlayer}`;
}

/** «Runde 3 i Vinterligaen» (`liga.marker.subtitle`). */
export function markerCardSubtitle(roundLabel: string, leagueName: string): string {
  return `${roundLabel} i ${leagueName}`;
}

/** «Du godkjenner som arrangør, i stedet for markøren (Mia).» (`liga.marker.organizerNote`). */
export function organizerNote(markerName: string | null): string {
  return markerName
    ? `Du godkjenner som arrangør, i stedet for markøren (${markerName}).`
    : MARKER_TEXT.organizerNoMarker;
}

/** «Venter på godkjenning fra Mia» (`liga.player.awaitingMarker`). */
export function awaitingMarkerLine(name: string): string {
  return `Venter på godkjenning fra ${name}`;
}

/** «venter på Mia» på arrangørens rad (`liga.player.markerQueue.waitsFor`). */
export function waitsForLine(name: string): string {
  return `venter på ${name}`;
}

/**
 * #2814: linja over lever-knappen når jeg har ført kortene til flighten i en
 * simulatorliga (`game.submit.marker.handOver` / `handOverMany`). `names` er
 * ferdig oppramset («Berit og Arne»).
 */
export function handOverLine(names: string, count: number): string {
  return count === 1
    ? `Du er markør for ${names}. ${names} får kortet sitt og sender det inn selv.`
    : `Du er markør for ${names}. De får kortene sine og sender dem inn selv.`;
}

/** #2814: knappen når mitt kort er levert og bare overleveringen står igjen (`game.submit.flight.handOverButton`). */
export function handOverButton(names: string, count: number): string {
  return count === 1 ? `Send kortet til ${names}` : `Send kortene til ${names}`;
}

/** #2814: i stedet for velgeren når en flightkamerat har ført kortet mitt (`game.submit.marker.markedBy`). */
export function markedByLine(name: string | null): string {
  const who = name ?? MARKER_TEXT.unknownPlayer;
  return `${who} er markøren din. Sender du inn uten å endre noe, er kortet godkjent. Endrer du noe, godkjenner ${who} endringen.`;
}

/** #2814: i stedet for velgeren når markøren sendte kortet tilbake (`game.submit.marker.returnedBy`). */
export function returnedByLine(name: string | null): string {
  const who = name ?? MARKER_TEXT.unknownPlayer;
  return `${who} sendte kortet tilbake. Rett det og send det til ${who} igjen. Er dere uenige, kan arrangøren godkjenne kortet i stedet.`;
}

/** #2814: kortet ble åpnet igjen eller ikke levert, og markøren står (`game.submit.marker.assignedTo`). */
export function assignedToLine(name: string | null): string {
  return `Kortet går til ${name ?? MARKER_TEXT.unknownPlayer} når du sender det inn.`;
}
